import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

/** GET /api/chat/history?c=<conversationId> — la conversation, pour rafraîchir l'écran. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await requireUser();
    const c = req.nextUrl.searchParams.get("c") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(c)) return NextResponse.json({ error: "Conversation invalide" }, { status: 400 });
    const { data, error } = await supabase.from("social_messages").select("id, role, content, created_at")
      .eq("conversation_id", c).order("created_at").order("id");
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: errorMessage(e) }, { status: 401 }); }
}
