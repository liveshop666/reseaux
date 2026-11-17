"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adaptLocally, normalizeAdapted, parseMediaType, parseNetworks } from "@/lib/adapt";
import { requireUser } from "@/lib/auth";
import { errorMessage } from "@/lib/format";
import { callN8n } from "@/lib/n8n";
import { NETWORK_INFO, blockReason, isNetwork, type MediaType, type Network } from "@/lib/networks";
import type { AdaptedMap } from "@/lib/types";

const BUCKET = "reseaux-medias";

export async function signOut() {
  const supabase = await requireUser().catch(() => null);
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}

/* ------------------------------------------------------------------ */
/* IA : adapter le texte à chaque réseau (n8n + Gemini)                */
/* ------------------------------------------------------------------ */

export type AdaptResult = { ok: true; map: AdaptedMap; source: "ia" | "local"; note?: string } | { ok: false; error: string };

export async function adaptText(input: { body: string; networks: string[]; mediaType: string | null }): Promise<AdaptResult> {
  try {
    await requireUser();
    const body = String(input.body ?? "").trim();
    const networks = parseNetworks(input.networks);
    const mediaType = parseMediaType(input.mediaType);
    if (!body) return { ok: false, error: "Écris d'abord ton texte." };
    if (networks.length === 0) return { ok: false, error: "Coche au moins un réseau." };

    const res = await callN8n("adapt", {
      action: "adapter",
      texte: body,
      media: mediaType ?? "aucun",
      reseaux: networks.map((n) => ({ id: n, nom: NETWORK_INFO[n].label, max: NETWORK_INFO[n].max, titre_max: NETWORK_INFO[n].titleMax ?? null })),
    }, 60000);

    if (!res.ok) {
      return {
        ok: true, map: adaptLocally(body, networks), source: "local",
        note: res.configured ? `L'IA n'a pas répondu (${res.error}) : textes copiés tels quels, modifie-les si besoin.` : "IA pas encore branchée (N8N_ADAPT_WEBHOOK_URL) : textes copiés tels quels.",
      };
    }
    const { map, missing } = normalizeAdapted(res.data, body, networks);
    return {
      ok: true, map, source: "ia",
      note: missing.length ? `L'IA n'a rien proposé pour : ${missing.map((n) => NETWORK_INFO[n].label).join(", ")} (texte d'origine repris).` : undefined,
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/* ------------------------------------------------------------------ */
/* Publier / programmer                                                */
/* ------------------------------------------------------------------ */

export type CreatePostInput = {
  body: string;
  mediaUrl: string | null;
  mediaPath: string | null;
  mediaType: string | null;
  /** ISO ; null = tout de suite */
  scheduledAt: string | null;
  targets: { network: string; title?: string; text: string }[];
};

export async function createPost(input: CreatePostInput): Promise<{ ok: true; id: string; note?: string } | { ok: false; error: string }> {
  try {
    const supabase = await requireUser();
    const body = String(input.body ?? "").trim();
    const mediaType: MediaType = parseMediaType(input.mediaType);
    const mediaUrl = mediaType && typeof input.mediaUrl === "string" ? input.mediaUrl : null;
    if (!body) return { ok: false, error: "Le texte est vide." };
    if (mediaUrl && !mediaUrl.includes(`/storage/v1/object/public/${BUCKET}/`)) return { ok: false, error: "Lien du média invalide." };

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
      targets.push({ network: t.network, title: title || null, text });
    }
    if (targets.length === 0) return { ok: false, error: "Coche au moins un réseau." };

    const now = new Date();
    let when = now;
    if (input.scheduledAt) {
      when = new Date(input.scheduledAt);
      if (Number.isNaN(when.getTime())) return { ok: false, error: "Date de programmation invalide." };
      if (when.getTime() < now.getTime() - 60_000) return { ok: false, error: "La date de programmation est déjà passée." };
    }
    const scheduled_at = when.toISOString();

    const { data: post, error } = await supabase.from("social_posts").insert({
      body, media_url: mediaUrl, media_path: mediaUrl ? input.mediaPath : null, media_type: mediaType, scheduled_at,
    }).select("id").single();
    if (error) throw error;

    const { error: tErr } = await supabase.from("social_targets").insert(
      targets.map((t) => ({ ...t, post_id: post.id, status: "a_publier", scheduled_at })),
    );
    if (tErr) { await supabase.from("social_posts").delete().eq("id", post.id); throw tErr; }

    // tout de suite : n8n publie ; programmé : n8n attend l'heure prévue (une seule exécution)
    const note = await wakeN8n(post.id, input.scheduledAt ? scheduled_at : undefined);
    revalidatePath("/", "layout");
    return { ok: true, id: post.id, note };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Réveille le workflow de publication. `quand` (ISO) = date programmée : n8n attend jusque-là.
 * S'il ne répond pas, son filet de sécurité (toutes les 2 h, 7h-23h) rattrape la publication.
 */
async function wakeN8n(postId: string, quand?: string): Promise<string | undefined> {
  const res = await callN8n("publish", { action: "publier", post_id: postId, quand: quand ?? new Date().toISOString() });
  if (res.ok) return undefined;
  return res.configured
    ? `n8n n'a pas répondu (${res.error}) : la publication partira au prochain passage de sécurité (2 h max).`
    : "Webhook de publication non configuré (N8N_PUBLISH_WEBHOOK_URL) : la publication partira au prochain passage de sécurité de n8n (2 h max).";
}

/* ------------------------------------------------------------------ */
/* Historique                                                          */
/* ------------------------------------------------------------------ */

export async function retryTarget(id: string): Promise<{ error?: string }> {
  const supabase = await requireUser();
  const now = new Date().toISOString();
  const { data } = await supabase.from("social_targets")
    .update({ status: "a_publier", error: null, claimed_at: null, scheduled_at: now })
    .eq("id", id).in("status", ["erreur", "annule"]).select("post_id").maybeSingle();
  if (data) await wakeN8n(data.post_id);
  revalidatePath("/", "layout");
  return {};
}

export async function cancelTarget(id: string): Promise<{ error?: string }> {
  const supabase = await requireUser();
  await supabase.from("social_targets").update({ status: "annule" }).eq("id", id).eq("status", "a_publier");
  revalidatePath("/", "layout");
  return {};
}

/** Programmé → publier maintenant. */
export async function publishNow(postId: string): Promise<{ error?: string }> {
  const supabase = await requireUser();
  const now = new Date().toISOString();
  await supabase.from("social_posts").update({ scheduled_at: now }).eq("id", postId);
  await supabase.from("social_targets").update({ scheduled_at: now }).eq("post_id", postId).eq("status", "a_publier");
  await wakeN8n(postId);
  revalidatePath("/", "layout");
  return {};
}

export async function deletePost(postId: string): Promise<{ error?: string }> {
  const supabase = await requireUser();
  const { data: post } = await supabase.from("social_posts").select("media_path, social_targets(status)").eq("id", postId).maybeSingle();
  if (!post) return {};
  if ((post.social_targets ?? []).some((t: { status: string }) => t.status === "en_cours")) {
    return { error: "Publication en cours : attends la fin avant de supprimer." };
  }
  await supabase.from("social_posts").delete().eq("id", postId);
  // le média n'est plus utile (les réseaux ont déjà leur copie)
  if (post.media_path) await supabase.storage.from(BUCKET).remove([post.media_path]);
  revalidatePath("/", "layout");
  return {};
}

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

export async function updateAccount(formData: FormData) {
  const supabase = await requireUser();
  const network = String(formData.get("network"));
  if (!isNetwork(network)) return;
  const clean = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
  const profile = clean(formData.get("profile_url"));
  const patch: Record<string, unknown> = {
    enabled: formData.get("enabled") === "on",
    handle: clean(formData.get("handle")),
    profile_url: profile && /^https?:\/\//i.test(profile) ? profile : null,
    updated_at: new Date().toISOString(),
  };
  if (network === "linkedin") patch.linkedin_mode = formData.get("linkedin_mode") === "page" ? "page" : "personne";
  await supabase.from("social_accounts").update(patch).eq("network", network);
  revalidatePath("/comptes");
}

export async function clearAccountError(network: string) {
  const supabase = await requireUser();
  if (!isNetwork(network)) return;
  await supabase.from("social_accounts").update({ last_error: null, last_error_at: null }).eq("network", network);
  revalidatePath("/comptes");
}
