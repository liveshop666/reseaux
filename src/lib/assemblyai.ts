import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TOOLS, runTool, systemPrompt } from "@/lib/assistant";

/**
 * Moteur « passerelle LLM » d'AssemblyAI (format type OpenAI chat-completions), utilisé quand ASSEMBLYAI_API_KEY est présente.
 * Modèle par défaut : Claude Sonnet 5.5 (changeable avec ASSEMBLYAI_MODEL, sans préfixe « anthropic/ »).
 * L'historique reste enregistré au format « blocs » (text / tool_use / tool_result) : l'écran ne change pas.
 * La passerelle n'accepte que du texte : les photos sont transmises par leur lien.
 */

export const AAI_MODEL = process.env.ASSEMBLYAI_MODEL || "claude-sonnet-5-5";
/** Ordre d'essai (sans préfixe de fabricant). ASSEMBLYAI_MODEL passe en premier. */
const AAI_MODELS = [...new Set([AAI_MODEL, "claude-sonnet-5-5", "claude-haiku-5-5", "gemini-3.8-flash", "gemini-2.5-flash", "gpt-5-mini", "gemini-2.5-flash-lite", "gpt-5-nano", "deepseek-v4.1-flash", "gpt-oss-120b", "qwen3-next-80b-a3b", "kimi-k3", "glm-5.3-flash", "gemma-4-31b", "gpt-oss-20b", "nemotron-3-super-120b-a12b"])];
let workingModel: string | null = null;
const URL = process.env.ASSEMBLYAI_LLM_URL || "https://llm-gateway.assemblyai.com/v1/chat/completions";
const MAX_TURNS = 8;

type Block = Record<string, unknown> & { type: string };
type Row = { role: "user" | "assistant"; content: unknown };
type Send = (o: Record<string, unknown>) => void;
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const blocks = (c: unknown): Block[] =>
  typeof c === "string" ? [{ type: "text", text: c }] : Array.isArray(c) ? (c as Block[]) : [];

function toMessages(rows: Row[]): ChatMessage[] {
  const date = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" });
  const out: ChatMessage[] = [{ role: "system", content: systemPrompt() + `\n\nNous sommes le ${date} (Paris).` }];
  for (const r of rows) {
    const bs = blocks(r.content);
    if (r.role === "assistant") {
      const text = bs.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n").trim();
      const calls: ToolCall[] = bs.filter((b) => b.type === "tool_use").map((b) => ({
        id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) },
      }));
      if (!text && !calls.length) continue;
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of bs) {
        if (b.type === "tool_result") {
          const c = b.content;
          const content = typeof c === "string" ? c : JSON.stringify(c);
          out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: b.is_error ? `ERREUR : ${content}` : content });
        }
      }
      const text = bs.map((b) =>
        b.type === "text" ? String(b.text ?? "")
          : b.type === "image" ? `[Photo jointe : ${String((b.source as { url?: string } | undefined)?.url ?? "")}]`
          : "",
      ).filter(Boolean).join("\n").trim();
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

const TOOL_DEFS = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

function parseArgs(s: string): Record<string, unknown> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

/** Un appel à la passerelle (sans flux : la réponse arrive d'un coup). */
async function callOnce(messages: ChatMessage[], noTools: boolean): Promise<{ blocks: Block[]; finish: string }> {
  // Variantes de plus en plus simples si la passerelle refuse le format (400) :
  // 1) complète  2) sans tool_choice  3) consignes « système » mises dans le 1er message utilisateur
  const merged: ChatMessage[] = (() => {
    const [sys, ...rest] = messages;
    const i = rest.findIndex((m) => m.role === "user");
    if (sys?.role !== "system" || i < 0) return messages;
    const copy = [...rest];
    copy[i] = { role: "user", content: `# Consignes\n${sys.content}\n\n# Message\n${(copy[i] as { content: string }).content}` };
    return copy;
  })();
  // Modèles essayés dans l'ordre : si le compte n'a pas accès à l'un (offre gratuite), on passe au suivant.
  // Le premier qui marche est retenu pour les appels suivants.
  const models = workingModel ? [workingModel] : AAI_MODELS;
  let res: Response | undefined;
  let raw = "";
  modelLoop: for (const model of models) {
    const variants = [
      { model, messages, max_tokens: 8000, tools: TOOL_DEFS, tool_choice: noTools ? "none" : "auto" },
      { model, messages, max_tokens: 8000, ...(noTools ? {} : { tools: TOOL_DEFS }) },
      { model, messages: merged, max_tokens: 8000, ...(noTools ? {} : { tools: TOOL_DEFS }) },
    ];
    variantLoop: for (const body of variants) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
        res = await fetch(URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: process.env.ASSEMBLYAI_API_KEY!.trim() },
          body: JSON.stringify(body),
        });
        raw = await res.text();
        if (res.ok) { workingModel = model; break modelLoop; }
        if (res.status === 400 && /does not have access|not available|unknown model|model not found/i.test(raw)) continue modelLoop;
        if (res.status === 404) continue modelLoop;
        if (res.status === 400) continue variantLoop; // format refusé : variante suivante
        if (![500, 502, 503, 504].includes(res.status)) break modelLoop;
      }
    }
  }
  res = res!;
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* texte brut */ }
  if (!res.ok) {
    const details = (data.metadata as { errors?: unknown[] } | undefined)?.errors;
    const m = String((data.message as string) ?? (data.error as string) ?? raw.slice(0, 300))
      + (Array.isArray(details) && details.length ? ` — ${details.map(String).join(" ; ").slice(0, 400)}` : "");
    throw new Error(res.status === 401 || res.status === 403 ? "Clé AssemblyAI invalide : vérifie ASSEMBLYAI_API_KEY dans Vercel."
      : res.status === 429 ? "AssemblyAI : trop de demandes en une minute, réessaie dans un instant."
      : /credit|balance|insufficient/i.test(m) ? "AssemblyAI : plus de crédits sur le compte."
      : `Erreur AssemblyAI (${res.status}) : ${m}`);
  }

  // Les appels d'outils peuvent arriver dans plusieurs « choices » : on les lit tous
  const out: Block[] = [];
  let text = "";
  let finish = "";
  for (const ch of (data.choices as { message?: { content?: unknown; tool_calls?: ToolCall[] }; finish_reason?: string }[] | undefined) ?? []) {
    if (ch.finish_reason) finish = ch.finish_reason;
    const c = ch.message?.content;
    if (typeof c === "string") text += c;
    else if (Array.isArray(c)) text += c.map((p: { text?: string }) => p?.text ?? "").join("");
    for (const tc of ch.message?.tool_calls ?? []) {
      out.push({ type: "tool_use", id: tc.id || "aai_" + Math.random().toString(36).slice(2, 12), name: tc.function?.name, input: parseArgs(tc.function?.arguments) });
    }
  }
  if (text.trim()) out.unshift({ type: "text", text });
  return { blocks: out, finish };
}

/** Même boucle que les autres moteurs : réponse → outils → réponse… jusqu'à la fin du tour. */
export async function runAssemblyAI(
  ctx: { supabase: SupabaseClient; conversationId: string; lastUserAt: string; rows: Row[] },
  send: Send,
) {
  const { supabase, conversationId, lastUserAt } = ctx;
  const rows: Row[] = [...ctx.rows];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { blocks: msg, finish } = await callOnce(toMessages(rows), false);
    if (finish === "refusal" || finish === "content_filter") { send({ t: "error", m: "L'IA a refusé cette demande. Reformule-la autrement." }); break; }
    if (!msg.length) { send({ t: "error", m: "L'IA n'a rien répondu. Réessaie." }); break; }
    const txt = msg.find((b) => b.type === "text");
    if (txt) send({ t: "text", d: String(txt.text) });
    rows.push({ role: "assistant", content: msg });
    await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "assistant", content: msg });
    if (finish === "length" || finish === "max_tokens") send({ t: "error", m: "Réponse trop longue, elle a été coupée. Demande-moi de continuer." });

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
      const { blocks: m2 } = await callOnce(toMessages(rows), true);
      const t2 = m2.filter((b) => b.type === "text");
      if (t2.length) {
        send({ t: "text", d: String(t2[0].text) });
        await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "assistant", content: t2 });
      }
      break;
    }
  }
}
