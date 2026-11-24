import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { INSTAGRAM_SCOPES, instagramConfigured } from "@/lib/instagram";

/** Bouton « Connecter Instagram » : envoie vers la page d'autorisation Instagram. */
export async function GET(req: NextRequest) {
  try { await requireUser(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  if (!instagramConfigured()) return NextResponse.redirect(new URL("/comptes?instagram=config", req.url));

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!.trim());
  url.searchParams.set("redirect_uri", `${appUrl(req)}/api/oauth/instagram/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("instagram_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth/instagram", maxAge: 600 });
  return res;
}
