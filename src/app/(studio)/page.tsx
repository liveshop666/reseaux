import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChatClient, type Row } from "@/components/ChatClient";
import { SetupNotice, isMissingTable } from "@/components/ui";
import { NETWORKS, type Network } from "@/lib/networks";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";

export default async function Studio({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  if (sp.c === "new") redirect(`/?c=${randomUUID()}`);

  let conversationId = sp.c && /^[0-9a-f-]{36}$/i.test(sp.c) ? sp.c : "";
  if (!conversationId) {
    const last = (await cookies()).get("studio_conv")?.value ?? "";
    if (/^[0-9a-f-]{36}$/i.test(last)) redirect(`/?c=${last}`);
    const { data, error } = await supabase.from("social_messages").select("conversation_id").order("created_at", { ascending: false }).limit(1);
    if (isMissingTable(error)) return <SetupNotice title="Studio" />;
    conversationId = data?.[0]?.conversation_id ?? randomUUID();
    redirect(`/?c=${conversationId}`);
  }

  const [{ data: msgs, error }, { data: accs }] = await Promise.all([
    supabase.from("social_messages").select("id, role, content").eq("conversation_id", conversationId).order("created_at").order("id"),
    supabase.from("social_accounts").select("*"),
  ]);
  if (isMissingTable(error)) return <SetupNotice title="Studio" />;

  const accounts = (accs ?? []) as Account[];
  const names = Object.fromEntries(NETWORKS.map((n) => {
    const a = accounts.find((x) => x.network === n);
    const fallback = n === "linkedin" && a?.linkedin_mode === "personne" ? "Moi" : n === "tiktok" ? "solvelab" : "SolveLab";
    return [n, a?.handle || fallback];
  })) as Record<Network, string>;

  return <ChatClient key={conversationId} conversationId={conversationId} initial={(msgs ?? []) as Row[]} names={names} />;
}
