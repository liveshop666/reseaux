import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { errorMessage } from "@/lib/format";

/**
 * Vérifie la clé envoyée par n8n (header `x-api-key` ou `Authorization: Bearer`).
 * Même principe que le CRM. Astuce : mets la même valeur que CRM_API_KEY pour
 * réutiliser l'identifiant n8n « CRM x-api-key ».
 */
export function checkApiKey(req: NextRequest): NextResponse | null {
  const expected = process.env.STUDIO_API_KEY;
  if (!expected) return NextResponse.json({ error: "STUDIO_API_KEY non configurée" }, { status: 500 });
  const given = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Clé API invalide" }, { status: 401 });
  }
  return null;
}

export function apiError(e: unknown, status = 400) {
  return NextResponse.json({ error: errorMessage(e) }, { status });
}

export function appUrl(req?: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  return req ? req.nextUrl.origin : "http://localhost:3000";
}
