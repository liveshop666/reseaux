import Link from "next/link";
import { Empty, NetworkPill, PageHeader, PostStatusPill, SetupNotice, Stat, TargetStatusPill, isMissingTable } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NETWORKS, NETWORK_INFO } from "@/lib/networks";
import { postStatus } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";
import type { Post, Target } from "@/lib/types";

export default async function Accueil() {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const since = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [targetsRes, upcomingRes, recentRes] = await Promise.all([
    supabase.from("social_targets").select("network, status, published_at, scheduled_at").gte("scheduled_at", since),
    supabase.from("social_posts").select("*, social_targets(*)").gt("scheduled_at", now.toISOString()).order("scheduled_at").limit(5),
    supabase.from("social_posts").select("*, social_targets(*)").lte("scheduled_at", now.toISOString()).order("scheduled_at", { ascending: false }).limit(6),
  ]);
  if (isMissingTable(targetsRes.error)) return <SetupNotice title="Accueil" />;

  const targets = (targetsRes.data ?? []) as Pick<Target, "network" | "status" | "published_at" | "scheduled_at">[];
  const upcoming = ((upcomingRes.data ?? []) as Post[]).filter((p) => (p.social_targets ?? []).some((t) => t.status === "a_publier"));
  const recent = (recentRes.data ?? []) as Post[];

  const publishedMonth = targets.filter((t) => t.status === "publie" && t.published_at && t.published_at >= monthStart);
  const scheduled = targets.filter((t) => t.status === "a_publier").length;
  const errors = targets.filter((t) => t.status === "erreur").length;
  const done30 = targets.filter((t) => t.status === "publie" || t.status === "erreur");
  const rate = done30.length ? Math.round((done30.filter((t) => t.status === "publie").length / done30.length) * 100) : null;
  const perNetwork = NETWORKS.map((n) => ({
    n,
    ok: publishedMonth.filter((t) => t.network === n).length,
    ko: targets.filter((t) => t.network === n && t.status === "erreur").length,
  }));
  const maxOk = Math.max(1, ...perNetwork.map((x) => x.ok));
  const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(now);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={<>Mes <span className="text-warm">réseaux</span></>} subtitle="J'écris une fois, l'IA adapte, rien ne part sans mon clic."
        action={<Link href="/nouveau" className="btn-primary">✍️ Nouveau post</Link>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Publiés en ${monthName}`} value={publishedMonth.length} hint="tous réseaux confondus" />
        <Stat label="Programmés" value={scheduled} hint="en attente de leur date" />
        <Stat label="En erreur" value={errors} hint={errors ? "à relancer dans l'historique" : "rien à signaler"} />
        <Stat label="Réussite (30 jours)" value={rate === null ? "—" : `${rate} %`} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-head text-xl font-extrabold uppercase">Par réseau · {monthName}</h2>
          <ul className="space-y-3">
            {perNetwork.map(({ n, ok, ko }) => (
              <li key={n}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{NETWORK_INFO[n].label}</span>
                  <span className="tabular-nums text-muted">{ok} publié{ok > 1 ? "s" : ""}{ko > 0 && <span className="ml-2 text-rose-500">· {ko} erreur{ko > 1 ? "s" : ""}</span>}</span>
                </div>
                <div className="h-2 rounded-full bg-soft-2">
                  <div className="h-2 rounded-full bg-chart-bar" style={{ width: `${(ok / maxOk) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="px-4 pt-4 font-head text-xl font-extrabold uppercase">⏰ À venir</h2>
          {upcoming.length === 0 ? <Empty>Rien de programmé.</Empty> : (
            <ul className="divide-y divide-border">
              {upcoming.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{fmtDateTime(p.scheduled_at)} · {fmtRelative(p.scheduled_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{p.body}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{(p.social_targets ?? []).filter((t) => t.status === "a_publier").map((t) => <NetworkPill key={t.id} network={t.network} />)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-6">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-head text-xl font-extrabold uppercase">Dernières publications</h2>
          <Link href="/historique" className="text-sm text-accent">Tout voir →</Link>
        </div>
        {recent.length === 0 ? <Empty>Aucune publication pour l&apos;instant. <Link href="/nouveau" className="text-accent">Écris ton premier post</Link>.</Empty> : (
          <ul className="divide-y divide-border">
            {recent.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <PostStatusPill status={postStatus(p.social_targets ?? [], p.scheduled_at)} />
                  <span>{fmtRelative(p.scheduled_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{p.body}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(p.social_targets ?? []).map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1">
                      {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="text-xs text-accent underline">{NETWORK_INFO[t.network].label} ↗</a> : <span className="text-xs">{NETWORK_INFO[t.network].label}</span>}
                      <TargetStatusPill status={t.status} />
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
