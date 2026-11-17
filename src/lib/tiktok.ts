import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Connexion directe à TikTok (gratuite) : l'appli garde le jeton dans `social_tokens`
 * (lisible seulement par le serveur) et le rafraîchit toute seule.
 * n8n récupère un jeton valide avec GET /api/n8n/tiktok-token.
 */
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_SCOPES = "user.info.basic,video.publish,video.upload";

export function tiktokConfigured() {
  return !!(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim());
}

type TokenResponse = {
  access_token?: string; expires_in?: number; refresh_token?: string; refresh_expires_in?: number;
  open_id?: string; scope?: string; error?: string; error_description?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!.trim(),
      client_secret: process.env.TIKTOK_CLIENT_SECRET!.trim(),
      ...params,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`TikTok : ${json.error_description || json.error || `réponse ${res.status}`}`);
  }
  return json;
}

async function save(t: TokenResponse) {
  const now = Date.now();
  const { error } = await createAdminClient().from("social_tokens").upsert({
    network: "tiktok",
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_at: t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : null,
    refresh_expires_at: t.refresh_expires_in ? new Date(now + t.refresh_expires_in * 1000).toISOString() : null,
    open_id: t.open_id ?? null,
    scope: t.scope ?? null,
    updated_at: new Date(now).toISOString(),
  });
  if (error) throw error;
}

export async function exchangeCode(code: string, redirectUri: string) {
  await save(await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri }));
}

/** Jeton valide (rafraîchi s'il expire dans moins de 10 minutes). */
export async function getTikTokAccessToken(): Promise<{ access_token: string; open_id: string | null; expires_at: string | null }> {
  const db = createAdminClient();
  const { data } = await db.from("social_tokens").select("*").eq("network", "tiktok").maybeSingle();
  if (!data) throw new Error("TikTok n'est pas connecté : page « Comptes connectés » → « Connecter TikTok ».");
  const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (exp - Date.now() > 10 * 60_000) return { access_token: data.access_token, open_id: data.open_id, expires_at: data.expires_at };
  if (!data.refresh_token) throw new Error("Jeton TikTok expiré : reconnecte TikTok.");
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await save(fresh);
  return { access_token: fresh.access_token!, open_id: fresh.open_id ?? data.open_id, expires_at: new Date(Date.now() + (fresh.expires_in ?? 0) * 1000).toISOString() };
}

/** Pour la page Comptes : connecté ? jusqu'à quand ? (sans jamais exposer le jeton) */
export async function tiktokStatus(): Promise<{ connected: boolean; refreshUntil: string | null }> {
  try {
    const { data } = await createAdminClient().from("social_tokens").select("refresh_expires_at").eq("network", "tiktok").maybeSingle();
    return { connected: !!data, refreshUntil: data?.refresh_expires_at ?? null };
  } catch {
    return { connected: false, refreshUntil: null };
  }
}
