import { NextResponse, type NextRequest } from "next/server";
import { apiError, checkApiKey } from "@/lib/api";
import { NETWORK_INFO, type Network } from "@/lib/networks";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Au-delà, une publication restée « en cours » est considérée comme perdue. */
const STALE_MINUTES = 30;

/**
 * GET /api/n8n/due?limit=10 — n8n vient chercher ce qu'il doit publier MAINTENANT.
 * Chaque ligne renvoyée passe en « en_cours » : elle ne sera jamais donnée deux fois.
 * Rien n'est renvoyé si je n'ai pas cliqué sur « Publier » ou si la date n'est pas arrivée.
 *
 * Réponse : { items: [{ target_id, post_id, network, title, text, media_url, media_type,
 *                       send_media, linkedin_mode }] }
 */
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req); if (denied) return denied;
  try {
    const db = createAdminClient();
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 10, 1), 25);
    const now = new Date();

    // 1. publications bloquées « en cours » depuis trop longtemps → erreur (je peux relancer)
    await db.from("social_targets")
      .update({ status: "erreur", error: `Pas de réponse de n8n après ${STALE_MINUTES} min` })
      .eq("status", "en_cours")
      .lt("claimed_at", new Date(now.getTime() - STALE_MINUTES * 60_000).toISOString());

    // 2. ce qui est dû
    const { data: due, error } = await db.from("social_targets")
      .select("id").eq("status", "a_publier").lte("scheduled_at", now.toISOString())
      .order("scheduled_at").limit(limit);
    if (error) throw error;
    if (!due?.length) return NextResponse.json({ items: [] });

    // 3. on « réserve » ces lignes (seules celles encore à publier)
    const { data: claimed, error: cErr } = await db.from("social_targets")
      .update({ status: "en_cours", claimed_at: now.toISOString(), error: null })
      .in("id", due.map((d) => d.id)).eq("status", "a_publier")
      .select("id, post_id, network, title, text, social_posts(media_url, media_type)");
    if (cErr) throw cErr;

    const { data: li } = await db.from("social_accounts").select("linkedin_mode").eq("network", "linkedin").maybeSingle();

    const items = (claimed ?? []).map((t) => {
      const post = (Array.isArray(t.social_posts) ? t.social_posts[0] : t.social_posts) as { media_url: string | null; media_type: "image" | "video" | null } | null;
      const network = t.network as Network;
      const mediaType = post?.media_type ?? null;
      const accepts = NETWORK_INFO[network].accepts;
      const sendMedia = !!post?.media_url && (mediaType === "image" ? accepts.image : mediaType === "video" ? accepts.video : false);
      return {
        target_id: t.id, post_id: t.post_id, network, title: t.title, text: t.text,
        media_url: post?.media_url ?? null, media_type: mediaType,
        send_media: sendMedia,                      // false = ce réseau publie le texte seul
        linkedin_mode: li?.linkedin_mode ?? "personne",
      };
    });
    return NextResponse.json({ items });
  } catch (e) { return apiError(e, 500); }
}
