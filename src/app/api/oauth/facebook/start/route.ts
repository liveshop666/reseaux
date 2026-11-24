import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { FACEBOOK_SCOPES, appId, facebookConfigured } from "@/lib/facebook";

/** Bouton « Connecter Facebook » : envoie vers l'autorisation Facebook (choisir la Page Verdana). */
export async function GET(req: NextRequest) {
  try { await requireUser(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  if (!facebookConfigured()) return NextResponse.redirect(new URL("/comptes?facebook=config", req.url));

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://www.facebook.com/v23.0/dialog/oauth");
  url.searchParams.set("client_id", appId());
  url.searchParams.set("redirect_uri", `${appUrl(req)}/api/oauth/facebook/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  // configuration « Réseau Page Facebook » de l'app Meta (Facebook Login for Business)
  const config = process.env.FACEBOOK_CONFIG_ID?.trim() || "1810627070152248";
  if (config) url.searchParams.set("config_id", config);
  else url.searchParams.set("scope", FACEBOOK_SCOPES);

  const res = NextResponse.redirect(url);
  res.cookies.set("facebook_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth/facebook", maxAge: 600 });
  return res;
}
