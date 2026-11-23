import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TOOLS, runTool, systemPrompt } from "@/lib/assistant";

/**
 * Moteur Gemini (Google AI Studio) pour l'assistant du Studio, utilisé quand GEMINI_API_KEY est présente.
 * L'historique reste enregistré au format « blocs » (text / tool_use / tool_result) : l'écran ne change pas.
 * Appels REST directs (pas de dépendance en plus).
 */

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TURNS = 8;

type Block = Record<string, unknown> & { type: string };
type Row = { role: "user" | "assistant"; content: unknown };
type GeminiPart = Record<string, unknown>;
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type Send = (o: Record<string, unknown>) => void;

const blocks = (c: unknown): Block[] =>
  typeof c === "string" ? [{ type: "text", text: c }] : Array.isArray(c) ? (c as Block[]) : [];

/** Schéma JSON des outils → format accepté par Gemini (sans additionalProperties). */
function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) if (k !== "additionalProperties") out[k] = clean(v);
  return out;
}

function functionDeclarations() {
  return TOOLS.map((t) => {
    const props = (t.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
    return Object.keys(props).length
      ? { name: t.name, description: t.description, parameters: clean(t.input_schema) }
      : { name: t.name, description: t.description };
  });
}

/** Photos du DERNIER message utilisateur envoyées en données ; les anciennes restent des liens (plus léger). */
async function imagePart(url: string): Promise<GeminiPart | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) return null;
    return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

async function toContents(rows: Row[]): Promise<GeminiContent[]> {
  const names = new Map<string, string>(); // tool_use_id → nom de l'outil
  for (const r of rows) for (const b of blocks(r.content)) if (b.type === "tool_use") names.set(String(b.id), String(b.name));

  let lastUser = -1;
  rows.forEach((r, i) => { if (r.role === "user" && blocks(r.content).some((b) => b.type === "text")) lastUser = i; });

  const out: GeminiContent[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const parts: GeminiPart[] = [];
    for (const b of blocks(r.content)) {
      const sig = typeof b.gemini_signature === "string" ? { thoughtSignature: b.gemini_signature } : {};
      if (b.type === "text" && String(b.text ?? "").trim()) parts.push({ text: String(b.text), ...sig });
      else if (b.type === "image") {
        const url = String((b.source as { url?: string } | undefined)?.url ?? "");
        const p = i === lastUser && url ? await imagePart(url) : null;
        parts.push(p ?? { text: `[Photo : ${url}]` });
      } else if (b.type === "tool_use") {
        parts.push({ functionCall: { name: String(b.name), args: (b.input as object) ?? {} }, ...sig });
      } else if (b.type === "tool_result") {
        const c = b.content;
        parts.push({ functionResponse: { name: names.get(String(b.tool_use_id)) ?? "outil", response: { resultat: typeof c === "string" ? c : JSON.stringify(c), erreur: !!b.is_error } } });
      }
      // blocs « thinking » de Claude : ignorés
    }
    if (!parts.length) continue;
    const role = r.role === "assistant" ? "model" : "user";
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.parts.push(...parts); // Gemini veut des tours alternés
    else out.push({ role, parts });
  }
  return out;
}

const newId = () => "gem_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

/** Un appel Gemini en flux : renvoie les blocs de la réponse (au format du Studio) et envoie le texte au fur et à mesure. */
async function streamOnce(contents: GeminiContent[], send: Send, noTools: boolean): Promise<{ blocks: Block[]; finish: string }> {
  const key = process.env.GEMINI_API_KEY!;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt() + `\n\nNous sommes le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" })} (Paris).` }] },
    contents,
    tools: [{ functionDeclarations: functionDeclarations() }],
    toolConfig: { functionCallingConfig: { mode: noTools ? "NONE" : "AUTO" } },
    generationConfig: { maxOutputTokens: 8192 },
  };
  const res = await fetch(`${API}/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    let m = t.slice(0, 300);
    try { m = JSON.parse(t).error?.message ?? m; } catch { /* texte brut */ }
    throw new Error(res.status === 400 && /API key/i.test(m) ? "Clé Gemini invalide : vérifie GEMINI_API_KEY dans Vercel."
      : res.status === 429 ? "Gemini : trop de demandes (quota gratuit), réessaie dans une minute."
      : `Erreur Gemini (${res.status}) : ${m}`);
  }

  const out: Block[] = [];
  let text = "";
  let textSig: string | undefined;
  let finish = "";
  const flushText = () => {
    if (text) out.push({ type: "text", text, ...(textSig ? { gemini_signature: textSig } : {}) });
    text = ""; textSig = undefined;
  };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      let chunk: { candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
      try { chunk = JSON.parse(line.slice(5)); } catch { continue; }
      if (chunk.promptFeedback?.blockReason) finish = "SAFETY";
      const cand = chunk.candidates?.[0];
      if (cand?.finishReason) finish = cand.finishReason;
      for (const p of cand?.content?.parts ?? []) {
        if (p.thought) continue; // résumé de réflexion : pas affiché
        const sig = typeof p.thoughtSignature === "string" ? p.thoughtSignature : undefined;
        if (typeof p.text === "string") {
          if (p.text) { text += p.text; send({ t: "text", d: p.text }); }
          if (sig) textSig = sig;
        } else if (p.functionCall) {
          flushText();
          const fc = p.functionCall as { name: string; args?: Record<string, unknown> };
          out.push({ type: "tool_use", id: newId(), name: fc.name, input: fc.args ?? {}, ...(sig ? { gemini_signature: sig } : {}) });
        }
      }
    }
  }
  flushText();
  return { blocks: out, finish };
}

/** Même boucle que la version Claude : réponse → outils → réponse… jusqu'à la fin du tour. */
export async function runGemini(
  ctx: { supabase: SupabaseClient; conversationId: string; lastUserAt: string; rows: Row[] },
  send: Send,
) {
  const { supabase, conversationId, lastUserAt } = ctx;
  const rows: Row[] = [...ctx.rows];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { blocks: msg, finish } = await streamOnce(await toContents(rows), send, false);
    if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") { send({ t: "error", m: "Gemini a refusé cette demande. Reformule-la autrement." }); break; }
    if (!msg.length) { send({ t: "error", m: "Gemini n'a rien répondu. Réessaie." }); break; }
    rows.push({ role: "assistant", content: msg });
    await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "assistant", content: msg });
    if (finish === "MAX_TOKENS") send({ t: "error", m: "Réponse trop longue, elle a été coupée. Demande-moi de continuer." });

    const uses = msg.filter((b) => b.type === "tool_use");
    if (!uses.length) break;

    const results: Block[] = [];
    let montage = false;
    for (const u of uses) {
      send({ t: "tool", name: u.name });
      const r = await runTool(String(u.name), u.input, { supabase, conversationId, lastUserAt });
      results.push({ type: "tool_result", tool_use_id: u.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
      if (r.montage) { montage = true; send({ t: "montage", spec: r.montage }); }
    }
    rows.push({ role: "user", content: results });
    await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "user", content: results });

    if (montage) {
      // le montage tourne dans le navigateur : une courte phrase d'annonce, sans outil
      const { blocks: m2 } = await streamOnce(await toContents(rows), send, true);
      if (m2.length) await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "assistant", content: m2 });
      break;
    }
  }
}
