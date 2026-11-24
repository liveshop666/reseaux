import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftPayload } from "@/lib/assistant";
import type { MediaType, Network } from "@/lib/networks";
import type { Post, Target, TargetStatus } from "@/lib/types";

/** Une carte d'une page réseau : soit une publication (validée), soit un brouillon (pas encore validé). */
export type Item = {
  key: string; // "p-<target id>" ou "b-<draft id>"
  kind: "target" | "draft";
  id: string;
  title: string;
  text: string;
  mediaUrl: string | null;
  mediaType: MediaType;
  at: string;
  status: TargetStatus | "brouillon";
  isPrivate: boolean;
  url: string | null;
  error: string | null;
  scheduledAt: string | null;
  conversationId: string | null;
};

type TargetRow = Target & { social_posts: Pick<Post, "media_url" | "media_type" | "body"> | null };
type DraftRow = { id: string; conversation_id: string; created_at: string; payload: DraftPayload };

const firstLine = (t: string) => {
  const l = t.split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  return l.length > 90 ? l.slice(0, 87) + "…" : l || "Sans texte";
};

function fromTarget(t: TargetRow): Item {
  const p = t.social_posts;
  return {
    key: `p-${t.id}`, kind: "target", id: t.id, title: t.title?.trim() || firstLine(t.text), text: t.text,
    mediaUrl: p?.media_url ?? null, mediaType: p?.media_type ?? null,
    at: t.published_at ?? t.scheduled_at, status: t.status, isPrivate: t.is_private,
    url: t.url, error: t.error, scheduledAt: t.scheduled_at, conversationId: null,
  };
}

function fromDraft(d: DraftRow, network: Network): Item | null {
  const r = d.payload?.reseaux?.find((x) => x.reseau === network);
  if (!r) return null;
  return {
    key: `b-${d.id}`, kind: "draft", id: d.id, title: r.titre?.trim() || firstLine(r.texte), text: r.texte,
    mediaUrl: d.payload.media_url, mediaType: d.payload.media_type ?? null,
    at: d.created_at, status: "brouillon", isPrivate: false, url: null, error: null, scheduledAt: null,
    conversationId: d.conversation_id,
  };
}

/** Brouillons + publications d'un réseau, du plus récent au plus ancien. */
export async function loadNetworkItems(supabase: SupabaseClient, network: Network) {
  const [t, d] = await Promise.all([
    supabase.from("social_targets").select("*, social_posts(media_url, media_type, body)").eq("network", network).order("scheduled_at", { ascending: false }).limit(60),
    supabase.from("social_drafts").select("id, conversation_id, created_at, payload").is("post_id", null).order("created_at", { ascending: false }).limit(60),
  ]);
  const items = [
    ...((d.data ?? []) as DraftRow[]).map((x) => fromDraft(x, network)).filter((x): x is Item => !!x),
    ...((t.data ?? []) as unknown as TargetRow[]).map(fromTarget),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { items, error: t.error };
}

/** Une seule carte, d'après sa clé ("p-…" ou "b-…"). */
export async function loadNetworkItem(supabase: SupabaseClient, network: Network, key: string): Promise<Item | null> {
  const m = /^([pb])-([0-9a-f-]{36})$/i.exec(key);
  if (!m) return null;
  if (m[1] === "p") {
    const { data } = await supabase.from("social_targets").select("*, social_posts(media_url, media_type, body)").eq("id", m[2]).eq("network", network).maybeSingle();
    return data ? fromTarget(data as unknown as TargetRow) : null;
  }
  const { data } = await supabase.from("social_drafts").select("id, conversation_id, created_at, payload").eq("id", m[2]).is("post_id", null).maybeSingle();
  return data ? fromDraft(data as DraftRow, network) : null;
}
