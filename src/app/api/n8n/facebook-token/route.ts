import { NextResponse, type NextRequest } from "next/server";
import { apiError, checkApiKey } from "@/lib/api";
import { getFacebookPageToken } from "@/lib/facebook";

export const dynamic = "force-dynamic";

/** GET /api/n8n/facebook-token — n8n récupère un jeton Facebook valide juste avant de publier. */
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req); if (denied) return denied;
  try {
    return NextResponse.json(await getFacebookPageToken(), { headers: { "cache-control": "no-store" } });
  } catch (e) { return apiError(e, 409); }
}
