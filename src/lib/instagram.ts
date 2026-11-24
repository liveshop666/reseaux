import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Connexion directe à Instagram (API Instagram avec connexion Instagram, gratuite) :
 * l'appli garde le jeton longue durée (60 jours) dans `social_tokens` et le prolonge toute seule.
 * n8n récupère un jeton valide avec GET /api/n8n/instagram-token.
 * Variables Vercel : INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET (onglet Instagram de l'app Meta).
 */
export const INSTAGRAM_SCOPES = "instagram_business_basic,instagram_business_content_publish";

export function instagramConfigured() {
  return !!(process.env.INSTAGRAM_APP_ID?.trim() && process.env.INSTAGRAM_APP_SECRET?.trim());
}

type Tok = { access_token?: string; expires_in?: number; user_id?: string | number; error?: unknown; error_message?: string };

async function call(url: string, init?: RequestInit): Promise<Tok> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000), ...init });
  const json = (await res.json().catch(() => ({}))) as Tok & { error?: { message?: string } | string };
  if (!res.ok || !json.access_token) {
    const e = json.error;
    const msg = json.error_message || (typeof e === "string" ? e : e?.message) || `réponse ${res.status}`;
    throw new Error(`Instagram : ${msg}`);
  }
  return json;
}

async function save(t: Tok, userId: string | null) {
  const now = Date.now();
  const { error } = await createAdminClient().from("social_tokens").upsert({
    network: "instagram",
    access_token: t.access_token,
    refresh_token: null,
    expires_at: t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : null,
    refresh_expires_at: t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : null,
    open_id: userId,
    scope: INSTAGRAM_SCOPES,
    updated_at: new Date(now).toISOString(),
  });
  if (error) throw error;
}

/** Code reçu après autorisation → jeton court → jeton longue durée (60 jours). */
export async function exchangeInstagramCode(code: string, redirectUri: string) {
  const short = await call("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!.trim(),
      client_secret: process.env.INSTAGRAM_APP_SECRET!.trim(),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const long = await call(`https://graph.instagram.com/access_token?${new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: process.env.INSTAGRAM_APP_SECRET!.trim(),
    access_token: short.access_token!,
  })}`);
  await save(long, short.user_id != null ? String(short.user_id) : null);
}

/** Jeton valide (prolongé de 60 jours s'il expire dans moins de 7 jours). */
export async function getInstagramAccessToken(): Promise<{ access_token: string; user_id: string | null; expires_at: string | null }> {
  const { data } = await createAdminClient().from("social_tokens").select("*").eq("network", "instagram").maybeSingle();
  if (!data) throw new Error("Instagram n'est pas connecté : page « Comptes » → « Connecter Instagram ».");
  const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (exp && exp < Date.now()) throw new Error("Jeton Instagram expiré : reconnecte Instagram (page Comptes).");
  if (exp - Date.now() > 7 * 24 * 3600_000) return { access_token: data.access_token, user_id: data.open_id, expires_at: data.expires_at };
  try {
    const fresh = await call(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: data.access_token })}`);
    await save(fresh, data.open_id);
    return { access_token: fresh.access_token!, user_id: data.open_id, expires_at: new Date(Date.now() + (fresh.expires_in ?? 0) * 1000).toISOString() };
  } catch {
    return { access_token: data.access_token, user_id: data.open_id, expires_at: data.expires_at };
  }
}

/** Pour la page Comptes (sans jamais exposer le jeton). */
export async function instagramStatus(): Promise<{ connected: boolean; until: string | null }> {
  try {
    const { data } = await createAdminClient().from("social_tokens").select("expires_at").eq("network", "instagram").maybeSingle();
    return { connected: !!data, until: data?.expires_at ?? null };
  } catch {
    return { connected: false, until: null };
  }
}
