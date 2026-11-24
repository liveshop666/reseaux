import { Brand } from "@/components/Brand";
import { Nav } from "@/components/Nav";
import { RefreshButton } from "@/components/RefreshButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listConversations } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ count: scheduled }, { count: errors }, conversations] = await Promise.all([
    supabase.from("social_targets").select("id", { count: "exact", head: true }).eq("status", "a_publier"),
    supabase.from("social_targets").select("id", { count: "exact", head: true }).eq("status", "erreur"),
    listConversations(supabase),
  ]);
  return (
    <div className="flex min-h-dvh">
      <Nav scheduled={scheduled ?? 0} errors={errors ?? 0} conversations={conversations} />
      <main className="min-w-0 flex-1 px-4 pt-4 pb-24 md:px-8 md:pb-10">
        <div className="mb-2 flex items-center justify-between md:justify-end"><span className="md:hidden"><Brand size={34} /></span><span className="flex gap-2"><ThemeToggle /><RefreshButton /></span></div>
        {children}
      </main>
    </div>
  );
}
