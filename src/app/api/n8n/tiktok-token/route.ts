import { NextResponse, type NextRequest } from "next/server";
import { apiError, checkApiKey } from "@/lib/api";
import { getTikTokAccessToken } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/** GET /api/n8n/tiktok-token — n8n récupère un jeton TikTok valide juste avant de publier. */
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req); if (denied) return denied;
  try {
    return NextResponse.json(await getTikTokAccessToken(), { headers: { "cache-control": "no-store" } });
  } catch (e) { return apiError(e, 409); }
}
