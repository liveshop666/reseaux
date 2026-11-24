import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exchangeInstagramCode, instagramConfigured } from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";

/** Retour d'Instagram après autorisation : on échange le code contre un jeton longue durée. */
export async function GET(req: NextRequest) {
  try { await requireUser(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/comptes?instagram=${q}`, req.url));
    res.cookies.delete({ name: "instagram_state", path: "/api/oauth/instagram" });
    return res;
  };
  if (!instagramConfigured()) return back("config");

  const p = req.nextUrl.searchParams;
  const state = p.get("state");
  if (!state || state !== req.cookies.get("instagram_state")?.value) return back("etat");
  if (p.get("error") || !p.get("code")) return back("refus");

  try {
    // Instagram ajoute parfois « #_ » à la fin du code
    await exchangeInstagramCode(p.get("code")!.replace(/#_$/, ""), `${appUrl(req)}/api/oauth/instagram/callback`);
    await createAdminClient().from("social_accounts")
      .upsert({ network: "instagram", enabled: true, last_error: null, last_error_at: null, updated_at: new Date().toISOString() });
    return back("ok");
  } catch (e) {
    console.error("Instagram OAuth", e);
    return back("erreur");
  }
}
