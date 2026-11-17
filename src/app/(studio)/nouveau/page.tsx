import { Composer } from "@/components/Composer";
import { PageHeader, SetupNotice, isMissingTable } from "@/components/ui";
import { NETWORKS, NETWORK_INFO, type Network } from "@/lib/networks";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";

export default async function Nouveau() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("social_accounts").select("*");
  if (isMissingTable(error)) return <SetupNotice title="Nouveau post" />;
  const accounts = (data ?? []) as Account[];

  // réseaux cochés par défaut : ceux que j'ai branchés
  const defaults = accounts.filter((a) => a.enabled).map((a) => a.network);
  const names = Object.fromEntries(NETWORKS.map((n) => {
    const a = accounts.find((x) => x.network === n);
    const fallback = n === "linkedin" && a?.linkedin_mode === "personne" ? "Moi" : n === "instagram" || n === "tiktok" ? "solvelab" : "SolveLab";
    return [n, a?.handle || fallback];
  })) as Record<Network, string>;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={<>Nouveau <span className="text-warm">post</span></>}
        subtitle={`J'écris, je coche, l'IA adapte, je vérifie l'aperçu. Rien ne part avant mon clic. Réseaux : ${NETWORKS.map((n) => NETWORK_INFO[n].label).join(", ")}.`} />
      <Composer defaults={defaults} names={names} />
    </div>
  );
}
