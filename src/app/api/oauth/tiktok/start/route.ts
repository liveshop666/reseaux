import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { TIKTOK_SCOPES, tiktokConfigured } from "@/lib/tiktok";

/** Bouton « Connecter TikTok » : envoie vers la page d'autorisation TikTok. */
export async function GET(req: NextRequest) {
  try { await requireUser(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  if (!tiktokConfigured()) return NextResponse.redirect(new URL("/comptes?tiktok=config", req.url));

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY!.trim());
  url.searchParams.set("scope", TIKTOK_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${appUrl(req)}/api/oauth/tiktok/callback`);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("tiktok_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth/tiktok", maxAge: 600 });
  return res;
}
