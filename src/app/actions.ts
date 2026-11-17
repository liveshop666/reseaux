"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isNetwork } from "@/lib/networks";
import { BUCKET, wakeN8n } from "@/lib/post-core";

export async function signOut() {
  const supabase = await requireUser().catch(() => null);
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
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
