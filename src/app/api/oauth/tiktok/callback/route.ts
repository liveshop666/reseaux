import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, tiktokConfigured } from "@/lib/tiktok";

/** Retour de TikTok après autorisation : on échange le code contre un jeton. */
export async function GET(req: NextRequest) {
  try { await requireUser(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/comptes?tiktok=${q}`, req.url));
    res.cookies.delete({ name: "tiktok_state", path: "/api/oauth/tiktok" });
    return res;
  };
  if (!tiktokConfigured()) return back("config");

  const p = req.nextUrl.searchParams;
  const state = p.get("state");
  if (!state || state !== req.cookies.get("tiktok_state")?.value) return back("etat");
  if (p.get("error") || !p.get("code")) return back("refus");

  try {
    await exchangeCode(p.get("code")!, `${appUrl(req)}/api/oauth/tiktok/callback`);
    await createAdminClient().from("social_accounts")
      .update({ enabled: true, last_error: null, last_error_at: null, updated_at: new Date().toISOString() })
      .eq("network", "tiktok");
    return back("ok");
  } catch (e) {
    console.error("TikTok OAuth", e);
    return back("erreur");
  }
}
