import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MODEL, TOOLS, runTool, systemPrompt } from "@/lib/assistant";
import { requireUser } from "@/lib/auth";
import { errorMessage } from "@/lib/format";
import { mediaPathFromUrl } from "@/lib/post-core";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  conversationId: z.string().uuid(),
  text: z.string().max(20000),
  attachments: z.array(z.object({ url: z.string(), type: z.enum(["image", "video"]), name: z.string().max(200) })).max(12).default([]),
});

const MAX_TURNS = 8;

/**
 * POST /api/chat — un message de l'utilisateur → l'assistant répond en direct (flux NDJSON).
 * Événements : { t: "text", d } · { t: "tool", name } · { t: "montage", spec } · { t: "error", m } · { t: "done" }
 */
export async function POST(req: NextRequest) {
  let supabase;
  try { supabase = await requireUser(); } catch { return NextResponse.json({ error: "Reconnecte-toi." }, { status: 401 }); }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY n'est pas configurée dans Vercel (clé Claude, console.anthropic.com)." }, { status: 500 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message invalide." }, { status: 400 });
  const { conversationId, text, attachments } = parsed.data;
  if (!text.trim() && attachments.length === 0) return NextResponse.json({ error: "Message vide." }, { status: 400 });
  if (attachments.some((a) => !mediaPathFromUrl(a.url))) return NextResponse.json({ error: "Pièce jointe invalide." }, { status: 400 });

  // message de l'utilisateur : texte + photos (vues par l'IA) + liens des médias
  const userBlocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const a of attachments) {
    if (a.type === "image") userBlocks.push({ type: "image", source: { type: "url", url: a.url } });
  }
  const links = attachments.map((a) => `${a.type === "image" ? "Photo" : "Vidéo"} jointe « ${a.name} » : ${a.url}`).join("\n");
  userBlocks.push({ type: "text", text: [text.trim(), links].filter(Boolean).join("\n\n") });

  const { data: userRow, error: uErr } = await supabase.from("social_messages")
    .insert({ conversation_id: conversationId, role: "user", content: userBlocks }).select("created_at").single();
  if (uErr) return NextResponse.json({ error: errorMessage(uErr) }, { status: 500 });
  const lastUserAt: string = userRow.created_at;

  const { data: rows, error: hErr } = await supabase.from("social_messages")
    .select("role, content").eq("conversation_id", conversationId).order("created_at").order("id");
  if (hErr) return NextResponse.json({ error: errorMessage(hErr) }, { status: 500 });
  const messages: Anthropic.Beta.BetaMessageParam[] = (rows ?? []).map((r) => ({ role: r.role, content: r.content }));

  const client = new Anthropic();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* client parti */ } };
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const s = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: { effort: "medium" },
            system: [{ type: "text", text: systemPrompt() + `\n\nNous sommes le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" })} (Paris).`, cache_control: { type: "ephemeral" } }],
            tools: TOOLS as unknown as Anthropic.Beta.BetaToolUnion[],
            messages,
          });
          s.on("text", (d) => send({ t: "text", d }));
          const msg = await s.finalMessage();

          // on garde la réponse telle quelle (blocs de réflexion compris) : l'historique ne doit jamais être modifié
          messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
          await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "assistant", content: msg.content });

          if (msg.stop_reason === "refusal") { send({ t: "error", m: "L'IA a refusé cette demande. Reformule-la autrement." }); break; }
          if (msg.stop_reason === "max_tokens") { send({ t: "error", m: "Réponse trop longue, elle a été coupée. Demande-moi de continuer." }); }
          const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (msg.stop_reason !== "tool_use" || uses.length === 0) break;

          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          let montage = false;
          for (const u of uses) {
            send({ t: "tool", name: u.name });
            const r = await runTool(u.name, u.input, { supabase, conversationId, lastUserAt });
            results.push({ type: "tool_result", tool_use_id: u.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
            if (r.montage) { montage = true; send({ t: "montage", spec: r.montage }); }
          }
          messages.push({ role: "user", content: results });
          await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "user", content: results });
          if (montage) {
            // le montage tourne dans le navigateur : on laisse l'IA annoncer, puis le résultat reviendra dans un nouveau message
            const s2 = client.beta.messages.stream({
              model: MODEL, max_tokens: 1000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
              thinking: { type: "adaptive" }, output_config: { effort: "low" },
              system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
              tools: TOOLS as unknown as Anthropic.Beta.BetaToolUnion[], tool_choice: { type: "none" }, messages,
            });
            s2.on("text", (d) => send({ t: "text", d }));
            const m2 = await s2.finalMessage();
            await supabase.from("social_messages").insert({ conversation_id: conversationId, role: "assistant", content: m2.content });
            break;
          }
        }
      } catch (e) {
        const m = e instanceof Anthropic.AuthenticationError ? "Clé Claude invalide : vérifie ANTHROPIC_API_KEY dans Vercel."
          : e instanceof Anthropic.RateLimitError ? "Trop de demandes d'un coup, réessaie dans une minute."
          : e instanceof Anthropic.APIError ? `Erreur Claude (${e.status}) : ${e.message}`
          : errorMessage(e);
        send({ t: "error", m });
      } finally {
        send({ t: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
