import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelTarget, retryTarget } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { Empty, PageHeader, Pill, SetupNotice, TargetStatusPill, isMissingTable } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NETWORK_INFO, isNetwork } from "@/lib/networks";
import { createClient } from "@/lib/supabase/server";
import type { Account, Post, Target } from "@/lib/types";

type Row = Target & { social_posts: Pick<Post, "media_url" | "media_type" | "body"> | null };

export default async function Reseau({ params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  if (!isNetwork(network)) notFound();
  const info = NETWORK_INFO[network];
  const supabase = await createClient();

  const [{ data, error }, { data: acc }] = await Promise.all([
    supabase.from("social_targets").select("*, social_posts(media_url, media_type, body)").eq("network", network).order("scheduled_at", { ascending: false }).limit(60),
    supabase.from("social_accounts").select("*").eq("network", network).maybeSingle(),
  ]);
  if (isMissingTable(error)) return <SetupNotice title={info.label} />;
  const rows = (data ?? []) as unknown as Row[];
  const a = acc as Account | null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={<span className="text-warm">{info.label}</span>} subtitle="Ce que l'assistant a publié (ou prépare) pour ce réseau."
        action={<Link href="/" className="btn-primary">💬 Demander à l&apos;assistant</Link>} />

      <div className="card mb-4 p-3 text-xs text-muted">
        {a?.last_error
          ? <span className="text-rose-600 dark:text-rose-400">Dernière erreur : {a.last_error} ({fmtDateTime(a.last_error_at)})</span>
          : a?.enabled ? <>Compte branché{a.last_ok_at ? ` · dernière publication ${fmtRelative(a.last_ok_at)}` : " · pas encore de publication"}</>
          : <>Compte pas encore branché : <Link href="/comptes" className="text-accent underline">voir comment</Link></>}
        <p className="mt-1">⚠️ {info.limit}</p>
      </div>

      <div className="card divide-y divide-border">
        {rows.length === 0 && <Empty>Rien pour {info.label} pour l&apos;instant. Demande à l&apos;assistant d&apos;y publier.</Empty>}
        {rows.map((t) => {
          const p = t.social_posts;
          return (
            <article key={t.id} className="flex gap-3 p-4">
              {p?.media_url && (p.media_type === "image"
                ? <Image src={p.media_url} alt="" width={72} height={72} unoptimized className="size-[72px] shrink-0 rounded-lg object-cover" />
                : <video src={p.media_url} className="size-[72px] shrink-0 rounded-lg object-cover" muted playsInline />)}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <TargetStatusPill status={t.status} />
                  {t.is_private && <Pill title="App pas encore validée par le réseau">🔒 privé</Pill>}
                  <span title={fmtDateTime(t.scheduled_at)}>{t.status === "a_publier" ? `prévu ${fmtDateTime(t.scheduled_at)}` : fmtRelative(t.published_at ?? t.scheduled_at)}</span>
                </div>
                {t.title && <p className="mt-1 text-sm font-semibold">{t.title}</p>}
                <p className="mt-1 line-clamp-4 text-sm whitespace-pre-wrap">{t.text}</p>
                {t.error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{t.error}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs">Voir la publication ↗</a>}
                  {(t.status === "erreur" || t.status === "annule") && <ActionButton action={retryTarget.bind(null, t.id)} label="↻ Relancer" confirmText={`Republier sur ${info.label} maintenant ?`} />}
                  {t.status === "a_publier" && <ActionButton action={cancelTarget.bind(null, t.id)} label="Annuler" />}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
