import "server-only";
import { TOOLS } from "@/lib/assistant";

/**
 * Cerveau gratuit : Gemini (clé gratuite sur aistudio.google.com).
 * Même rôle que Claude : l'historique est gardé au même format en base (blocs text / image / tool_use / tool_result),
 * et converti ici au format Gemini à chaque appel.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

export type Block = { type: string; [k: string]: unknown };
type Part = Record<string, unknown>;
type Content = { role: "user" | "model"; parts: Part[] };

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY?.trim();
}

/** Les schémas des outils sont écrits pour Claude : on retire ce que Gemini n'accepte pas. */
function cleanSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (s && typeof s === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (k === "additionalProperties" || k === "strict") continue;
      o[k] = cleanSchema(v);
    }
    return o;
  }
  return s;
}

export function geminiTools() {
  return [{
    functionDeclarations: TOOLS.map((t) => {
      const schema = cleanSchema(t.input_schema) as { properties?: Record<string, unknown> };
      const hasParams = schema.properties && Object.keys(schema.properties).length > 0;
      return { name: t.name, description: t.description, ...(hasParams ? { parameters: schema } : {}) };
    }),
  }];
}

async function toInline(url: string): Promise<Part | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return null; // photo trop lourde pour être envoyée en ligne
    return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
  } catch { return null; }
}

/** Historique (format du Studio) → format Gemini. Les 8 dernières photos sont envoyées, les anciennes sont citées. */
export async function toGeminiContents(history: { role: "user" | "assistant"; content: Block[] | string }[]): Promise<Content[]> {
  const names = new Map<string, string>();
  for (const m of history) if (m.role === "assistant" && Array.isArray(m.content)) {
    for (const b of m.content) if (b.type === "tool_use") names.set(String(b.id), String(b.name));
  }
  let imagesLeft = 8;
  const imageOrder: string[] = [];
  for (const m of history) if (Array.isArray(m.content)) for (const b of m.content) if (b.type === "image") imageOrder.push(String((b.source as { url?: string })?.url ?? ""));
  const keep = new Set(imageOrder.slice(-imagesLeft));

  const out: Content[] = [];
  const push = (role: "user" | "model", parts: Part[]) => {
    if (!parts.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else out.push({ role, parts });
  };

  for (const m of history) {
    const blocks: Block[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    const parts: Part[] = [];
    for (const b of blocks) {
      if (b.type === "text" && String(b.text).trim()) {
        parts.push({ text: String(b.text), ...(b.sig ? { thoughtSignature: b.sig } : {}) });
      } else if (b.type === "image") {
        const url = String((b.source as { url?: string })?.url ?? "");
        const inline = keep.has(url) ? await toInline(url) : null;
        parts.push(inline ?? { text: "[photo envoyée plus tôt]" });
      } else if (b.type === "tool_use" && m.role === "assistant") {
        parts.push({ functionCall: { name: String(b.name), args: (b.input as object) ?? {} }, ...(b.sig ? { thoughtSignature: b.sig } : {}) });
      } else if (b.type === "tool_result") {
        const c = b.content;
        parts.push({ functionResponse: { name: names.get(String(b.tool_use_id)) ?? "outil", response: { resultat: typeof c === "string" ? c : JSON.stringify(c), ...(b.is_error ? { erreur: true } : {}) } } });
      }
    }
    push(m.role === "assistant" ? "model" : "user", parts);
  }
  return out;
}

export type GeminiTurn = { blocks: Block[]; text: string; calls: { id: string; name: string; input: unknown }[]; finish: string };

export class GeminiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Un tour de conversation. Réessaie une fois si la limite gratuite par minute est atteinte. */
export async function callGemini(opts: { system: string; contents: Content[]; noTools?: boolean }): Promise<GeminiTurn> {
  const key = process.env.GEMINI_API_KEY!.trim();
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    tools: geminiTools(),
    toolConfig: { functionCallingConfig: { mode: opts.noTools ? "NONE" : "AUTO" } },
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
  };
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if ((res.status === 429 || res.status === 503) && attempt === 0) { await new Promise((r) => setTimeout(r, 8000)); continue; }
    break;
  }
  if (!res) throw new GeminiError("Pas de réponse de Gemini.", 0);
  const json = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };
  if (!res.ok) {
    const msg = res.status === 429 ? "Limite gratuite de Gemini atteinte (trop de messages à la minute ou dans la journée). Réessaie dans un instant."
      : res.status === 400 || res.status === 403 ? `Clé Gemini refusée ou demande invalide : ${json.error?.message ?? res.status}`
      : `Erreur Gemini (${res.status}) : ${json.error?.message ?? ""}`;
    throw new GeminiError(msg, res.status);
  }
  const cand = json.candidates?.[0];
  if (!cand?.content?.parts?.length) {
    const why = json.promptFeedback?.blockReason ?? cand?.finishReason ?? "réponse vide";
    throw new GeminiError(`Gemini n'a pas répondu (${why}). Reformule ta demande.`, 0);
  }

  const blocks: Block[] = [];
  const calls: GeminiTurn["calls"] = [];
  let text = "";
  for (const p of cand.content.parts) {
    const sig = typeof p.thoughtSignature === "string" ? p.thoughtSignature : undefined;
    if (p.thought === true) continue; // résumé de réflexion : non affiché
    if (typeof p.text === "string" && p.text) {
      blocks.push({ type: "text", text: p.text, ...(sig ? { sig } : {}) });
      text += p.text;
    } else if (p.functionCall) {
      const fc = p.functionCall as { name: string; args?: unknown };
      const id = "gm_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      blocks.push({ type: "tool_use", id, name: fc.name, input: fc.args ?? {}, ...(sig ? { sig } : {}) });
      calls.push({ id, name: fc.name, input: fc.args ?? {} });
    }
  }
  return { blocks, text, calls, finish: cand.finishReason ?? "STOP" };
}
