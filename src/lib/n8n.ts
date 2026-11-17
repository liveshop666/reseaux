import "server-only";

/**
 * Appel du Studio vers n8n : réveille le workflow « Studio Réseaux — Publier » (nœud Webhook protégé par
 * x-api-key = STUDIO_API_KEY). Adresse : N8N_PUBLISH_WEBHOOK_URL.
 *
 * Si l'adresse manque, rien n'est perdu : le workflow passe aussi toutes les 2 heures (7h-23h)
 * chercher ce qui est à publier (GET /api/n8n/due).
 */
export async function callN8n(_kind: "publish", payload: Record<string, unknown>, timeoutMs = 15000) {
  const url = process.env.N8N_PUBLISH_WEBHOOK_URL?.trim();
  if (!url) return { ok: false as const, configured: false, error: "Adresse du webhook n8n non configurée" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.STUDIO_API_KEY ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false as const, configured: true, error: `n8n a répondu ${res.status}` };
    return { ok: true as const, configured: true };
  } catch (e) {
    return { ok: false as const, configured: true, error: e instanceof Error ? e.message : String(e) };
  }
}
