import "server-only";

/**
 * Appels du Studio vers n8n (nœuds « Webhook » protégés par x-api-key = STUDIO_API_KEY).
 *
 * - N8N_ADAPT_WEBHOOK_URL   : workflow « Studio 1 – Adapter le texte (Gemini) » — répond tout de suite
 * - N8N_PUBLISH_WEBHOOK_URL : workflow « Studio 2 – Publier » — réveille la publication
 *
 * Si l'adresse de publication manque, rien n'est perdu : le workflow 2 passe aussi
 * toutes les 2 heures (7h-23h) chercher ce qui est à publier (GET /api/n8n/due).
 */
export async function callN8n(kind: "adapt" | "publish", payload: Record<string, unknown>, timeoutMs = 15000) {
  const url = (kind === "adapt" ? process.env.N8N_ADAPT_WEBHOOK_URL : process.env.N8N_PUBLISH_WEBHOOK_URL)?.trim();
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
    const data: unknown = await res.json().catch(() => null);
    return { ok: true as const, configured: true, data };
  } catch (e) {
    return { ok: false as const, configured: true, error: e instanceof Error ? e.message : String(e) };
  }
}
