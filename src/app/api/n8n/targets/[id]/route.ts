import { NextResponse, type NextRequest } from "next/server";
import { apiError, checkApiKey } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/n8n/targets/:id — n8n donne le résultat d'une publication.
 * Body : { "status": "publie" | "erreur", "url": "https://…", "external_id": "…",
 *          "is_private": true, "error": "message lisible" }
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = checkApiKey(req); if (denied) return denied;
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    if (!["publie", "erreur"].includes(b.status)) {
      return NextResponse.json({ error: "status doit valoir « publie » ou « erreur »" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: b.status };
    if (b.status === "publie") {
      patch.published_at = now;
      patch.error = null;
      if (typeof b.url === "string" && /^https?:\/\//i.test(b.url)) patch.url = b.url.slice(0, 500);
      if (b.external_id != null && String(b.external_id)) patch.external_id = String(b.external_id).slice(0, 300);
      if (typeof b.is_private === "boolean") patch.is_private = b.is_private;
    } else {
      patch.error = String(b.error ?? "Erreur inconnue côté réseau").slice(0, 1000);
    }

    const db = createAdminClient();
    const { data, error } = await db.from("social_targets").update(patch).eq("id", id).select("id, network, status").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });

    // état du compte, visible dans « Comptes connectés »
    await db.from("social_accounts").update(
      b.status === "publie"
        ? { last_ok_at: now, last_error: null, last_error_at: null }
        : { last_error: patch.error, last_error_at: now },
    ).eq("network", data.network);

    return NextResponse.json({ target: data });
  } catch (e) { return apiError(e); }
}
