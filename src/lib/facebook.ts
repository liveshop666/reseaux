import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Connexion à la Page Facebook (Verdana) : bouton « Connecter Facebook » dans Comptes.
 * On échange le code contre un jeton utilisateur longue durée, puis on récupère le jeton
 * de la Page (il n'expire pas). Il est gardé dans `social_tokens` (lisible seulement par le serveur).
 * Variables Vercel : FACEBOOK_APP_SECRET (obligatoire), FACEBOOK_APP_ID (défaut : app Studio SolveLab),
 * FACEBOOK_CONFIG_ID (si la connexion « Facebook Login for Business » l'exige), FACEBOOK_PAGE_NAME (défaut Verdana).
 */
const GRAPH = "https://graph.facebook.com/v23.0";
export const FACEBOOK_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts";
export const appId = () => process.env.FACEBOOK_APP_ID?.trim() || "1511528217494216";
const secret = () => process.env.FACEBOOK_APP_SECRET?.trim() || "";
const pageName = () => (process.env.FACEBOOK_PAGE_NAME?.trim() || "Verdana").toLowerCase();

export function facebookConfigured() {
  return !!secret();
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || j.error) throw new Error(`Facebook : ${j.error?.message || `réponse ${res.status}`}`);
  return j;
}

/** Code → jeton utilisateur → jeton longue durée → jeton de la Page Verdana (sans expiration). */
export async function connectFacebook(code: string, redirectUri: string) {
  const q = (p: Record<string, string>) => new URLSearchParams(p).toString();
  const short = await get<{ access_token: string }>(`${GRAPH}/oauth/access_token?${q({ client_id: appId(), client_secret: secret(), redirect_uri: redirectUri, code })}`);
  const long = await get<{ access_token: string }>(`${GRAPH}/oauth/access_token?${q({ grant_type: "fb_exchange_token", client_id: appId(), client_secret: secret(), fb_exchange_token: short.access_token })}`);
  const pages = await get<{ data: { id: string; name: string; access_token: string }[] }>(`${GRAPH}/me/accounts?${q({ fields: "id,name,access_token", access_token: long.access_token })}`);
  const list = pages.data ?? [];
  const page = list.find((p) => p.name.toLowerCase() === pageName()) ?? (list.length === 1 ? list[0] : null);
  if (!page) throw new Error(`Facebook : Page « ${pageName()} » introuvable (Pages autorisées : ${list.map((p) => p.name).join(", ") || "aucune"}).`);
  const { error } = await createAdminClient().from("social_tokens").upsert({
    network: "facebook",
    access_token: page.access_token,
    refresh_token: null,
    expires_at: null,
    refresh_expires_at: null,
    open_id: page.id,
    scope: page.name,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return page.name;
}

/** Jeton de la Page pour n8n. */
export async function getFacebookPageToken(): Promise<{ access_token: string; page_id: string; page_name: string | null }> {
  const { data } = await createAdminClient().from("social_tokens").select("*").eq("network", "facebook").maybeSingle();
  if (!data) throw new Error("Facebook n'est pas connecté : page « Comptes » → « Connecter Facebook ».");
  return { access_token: data.access_token, page_id: data.open_id, page_name: data.scope ?? null };
}

/** Vérifie que la clé secrète va avec l'app (sans jamais l'afficher) : longueur + test auprès de Facebook. */
export async function facebookSecretCheck(): Promise<{ ok: boolean; length: number; error?: string }> {
  const s = secret();
  if (!s) return { ok: false, length: 0, error: "absente" };
  try {
    await get<{ access_token: string }>(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: appId(), client_secret: s, grant_type: "client_credentials" })}`);
    return { ok: true, length: s.length };
  } catch (e) {
    return { ok: false, length: s.length, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pour la page Comptes : vérifie en vrai le jeton (nom de la Page), sans l'exposer. */
export async function facebookCheck(): Promise<{ connected: boolean; name?: string; error?: string }> {
  try {
    const { data } = await createAdminClient().from("social_tokens").select("access_token, open_id").eq("network", "facebook").maybeSingle();
    if (!data) return { connected: false };
    const j = await get<{ name?: string }>(`${GRAPH}/${data.open_id}?${new URLSearchParams({ fields: "name", access_token: data.access_token })}`);
    return { connected: true, name: j.name };
  } catch (e) {
    return { connected: true, error: e instanceof Error ? e.message : String(e) };
  }
}
