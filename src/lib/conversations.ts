import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationItem = { id: string; title: string; at: string };

type Block = { type?: string; text?: string };

/** Titre lisible d'un message utilisateur (sans les liens des médias joints). */
function titleOf(content: unknown): string | null {
  const text = typeof content === "string" ? content
    : Array.isArray(content) ? (content as Block[]).find((b) => b?.type === "text")?.text ?? null : null;
  if (!text) return null;
  const clean = text.split("\n").filter((l) => !/jointe « .* » : https?:\/\//.test(l)).join(" ").replace(/\s+/g, " ").trim();
  if (clean) return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
  return /Vidéo jointe/.test(text) ? "🎬 Vidéo envoyée" : /Photo jointe/.test(text) ? "🖼️ Photo envoyée" : null;
}

/** Les conversations les plus récentes, avec pour titre le premier message écrit. */
export async function listConversations(supabase: SupabaseClient, limit = 40): Promise<ConversationItem[]> {
  const { data, error } = await supabase.from("social_messages").select("conversation_id, content, created_at")
    .eq("role", "user").order("created_at", { ascending: false }).limit(1000);
  if (error || !data) return [];
  const map = new Map<string, ConversationItem>();
  for (const m of data) {
    const id = m.conversation_id as string;
    const title = titleOf(m.content);
    const cur = map.get(id);
    if (!cur) map.set(id, { id, title: title ?? "Conversation", at: m.created_at as string });
    else if (title) cur.title = title; // lignes du plus récent au plus ancien : on garde le plus ancien texte
  }
  return [...map.values()].slice(0, limit);
}
