import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { connectFacebook, facebookConfigured } from "@/lib/facebook";
import { createAdminClient } from "@/lib/supabase/admin";

/** Retour de Facebook : on garde le jeton de la Page et on coche « Branché ». */
export async function GET(req: NextRequest) {
  try { await requireUser(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  const back = (q: string, msg?: string) => {
    const res = NextResponse.redirect(new URL(`/comptes?facebook=${encodeURIComponent(q)}${msg ? `&fbmsg=${encodeURIComponent(msg.slice(0, 300))}` : ""}`, req.url));
    res.cookies.delete({ name: "facebook_state", path: "/api/oauth/facebook" });
    return res;
  };
  if (!facebookConfigured()) return back("config");

  const p = req.nextUrl.searchParams;
  const state = p.get("state");
  if (!state || state !== req.cookies.get("facebook_state")?.value) return back("etat");
  if (p.get("error") || !p.get("code")) return back("refus");

  try {
    await connectFacebook(p.get("code")!, `${appUrl(req)}/api/oauth/facebook/callback`);
    await createAdminClient().from("social_accounts")
      .upsert({ network: "facebook", enabled: true, last_error: null, last_error_at: null, updated_at: new Date().toISOString() });
    return back("ok");
  } catch (e) {
    console.error("Facebook OAuth", e);
    // message d'erreur de Facebook (jamais de jeton dedans) pour comprendre sans les journaux
    return back("erreur", e instanceof Error ? e.message : String(e));
  }
}
