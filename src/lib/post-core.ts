import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/format";
import { callN8n } from "@/lib/n8n";
import { NETWORK_INFO, blockReason, isNetwork, type MediaType, type Network } from "@/lib/networks";

export const BUCKET = "reseaux-medias";

export type PostInput = {
  body: string;
  mediaUrl: string | null;
  mediaType: MediaType;
  /** ISO ; null = tout de suite */
  scheduledAt: string | null;
  targets: { network: string; title?: string | null; text: string }[];
};

export type PostResult =
  | { ok: true; id: string; scheduled: boolean; networks: Network[]; note?: string }
  | { ok: false; error: string };

/** Chemin du fichier dans le bucket, déduit de son lien public. */
export function mediaPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0]) : null;
}

/** Réveille n8n. `quand` = date programmée : n8n attend jusque-là. Son filet de sécurité rattrape un oubli. */
export async function wakeN8n(postId: string, quand?: string): Promise<string | undefined> {
  const res = await callN8n("publish", { action: "publier", post_id: postId, quand: quand ?? new Date().toISOString() });
  if (res.ok) return undefined;
  return res.configured
    ? `n8n n'a pas répondu (${res.error}) : la publication partira au prochain passage de sécurité (2 h max).`
    : "Webhook de publication non configuré (N8N_PUBLISH_WEBHOOK_URL) : la publication partira au prochain passage de sécurité de n8n (2 h max).";
}

/** Réseaux présents dans le code mais pas encore activés dans la base (pas de ligne dans social_accounts). */
export async function notReadyNetworks(supabase: SupabaseClient, nets: Network[]): Promise<Network[]> {
  if (nets.length === 0) return [];
  const { data, error } = await supabase.from("social_accounts").select("network").in("network", nets);
  if (error) throw error;
  const have = new Set((data ?? []).map((r: { network: string }) => r.network));
  return nets.filter((n) => !have.has(n));
}

export function notReadyMessage(nets: Network[]): string {
  return `${nets.map((n) => NETWORK_INFO[n].label).join(", ")} : pas encore activé dans la base de données (mise à jour à lancer quand Rudy le décide). Propose sans ce réseau.`;
}

/** Crée le post et une ligne `a_publier` par réseau. C'est le SEUL chemin qui déclenche une publication. */
export async function createPostCore(supabase: SupabaseClient, input: PostInput): Promise<PostResult> {
  try {
    const body = String(input.body ?? "").trim();
    const mediaType = input.mediaType;
    const mediaUrl = mediaType && input.mediaUrl ? input.mediaUrl : null;
    if (!body) return { ok: false, error: "Le texte est vide." };
    if (mediaUrl && !mediaPathFromUrl(mediaUrl)) return { ok: false, error: "Lien du média invalide (il doit venir du Studio)." };

    const seen = new Set<Network>();
    const targets: { network: Network; title: string | null; text: string }[] = [];
    for (const t of input.targets ?? []) {
      if (!isNetwork(t.network) || seen.has(t.network)) continue;
      seen.add(t.network);
      const info = NETWORK_INFO[t.network];
      const block = blockReason(t.network, mediaType);
      if (block) return { ok: false, error: block };
      const text = String(t.text ?? "").trim();
      const title = t.network === "youtube" ? String(t.title ?? "").trim() : "";
      if (!text && t.network !== "youtube") return { ok: false, error: `Texte vide pour ${info.label}.` };
      if (text.length > info.max) return { ok: false, error: `${info.label} : ${text.length} caractères, maximum ${info.max}.` };
      if (t.network === "youtube" && !title) return { ok: false, error: "YouTube : il faut un titre." };
      if (info.titleMax && title.length > info.titleMax) return { ok: false, error: `${info.label} : titre trop long (max ${info.titleMax}).` };
      targets.push({ network: t.network, title: title || null, text: text || title });
    }
    if (targets.length === 0) return { ok: false, error: "Aucun réseau choisi." };
    const missing = await notReadyNetworks(supabase, targets.map((t) => t.network));
    if (missing.length) return { ok: false, error: notReadyMessage(missing) };

    const now = new Date();
    let when = now;
    if (input.scheduledAt) {
      when = new Date(input.scheduledAt);
      if (Number.isNaN(when.getTime())) return { ok: false, error: "Date de programmation invalide." };
      if (when.getTime() < now.getTime() - 60_000) return { ok: false, error: "La date de programmation est déjà passée." };
    }
    const scheduled_at = when.toISOString();

    const { data: post, error } = await supabase.from("social_posts").insert({
      body, media_url: mediaUrl, media_path: mediaUrl ? mediaPathFromUrl(mediaUrl) : null, media_type: mediaUrl ? mediaType : null, scheduled_at,
    }).select("id").single();
    if (error) throw error;

    const { error: tErr } = await supabase.from("social_targets").insert(
      targets.map((t) => ({ ...t, post_id: post.id, status: "a_publier", scheduled_at })),
    );
    if (tErr) { await supabase.from("social_posts").delete().eq("id", post.id); throw tErr; }

    const note = await wakeN8n(post.id, input.scheduledAt ? scheduled_at : undefined);
    return { ok: true, id: post.id, scheduled: !!input.scheduledAt, networks: targets.map((t) => t.network), note };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
