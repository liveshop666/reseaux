import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Pill, SetupNotice, TargetStatusPill, isMissingTable } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NETWORK_INFO, isNetwork } from "@/lib/networks";
import { loadNetworkItems, type Item } from "@/lib/network-items";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";

/** Vignette d'une carte : la photo, la vidéo (1re image) ou le début du texte. */
function Thumb({ item }: { item: Item }) {
  if (item.mediaUrl && item.mediaType === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.mediaUrl} alt="" loading="lazy" className="size-full object-cover" />;
  }
  if (item.mediaUrl && item.mediaType === "video") {
    return <video src={`${item.mediaUrl}#t=0.5`} className="size-full object-cover" muted playsInline preload="metadata" />;
  }
  return <p className="line-clamp-6 p-4 text-left text-xs whitespace-pre-wrap text-muted">{item.text}</p>;
}

export default async function Reseau({ params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  if (!isNetwork(network)) notFound();
  const info = NETWORK_INFO[network];
  const supabase = await createClient();

  const [res, { data: acc }] = await Promise.all([
    loadNetworkItems(supabase, network),
    supabase.from("social_accounts").select("*").eq("network", network).maybeSingle(),
  ]);
  if (isMissingTable(res.error)) return <SetupNotice title={info.label} />;
  const items = res.items;
  const a = acc as Account | null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={<span className="text-warm">{info.label}</span>} subtitle="Tout ce que l'assistant a préparé ou publié pour ce réseau. Clique sur une carte pour la voir en grand."
        action={<Link href="/" className="btn-primary">💬 Demander à l&apos;assistant</Link>} />

      <div className="card mb-4 p-3 text-xs text-muted">
        {a?.last_error
          ? <span className="text-rose-600 dark:text-rose-400">Dernière erreur : {a.last_error} ({fmtDateTime(a.last_error_at)})</span>
          : a?.enabled ? <>Compte branché{a.last_ok_at ? ` · dernière publication ${fmtRelative(a.last_ok_at)}` : " · pas encore de publication"}</>
          : <>Compte pas encore branché : <Link href="/comptes" className="text-accent underline">voir comment</Link></>}
        <p className="mt-1">⚠️ {info.limit}</p>
      </div>

      {items.length === 0
        ? <div className="card"><Empty>Rien pour {info.label} pour l&apos;instant. Envoie une photo ou une vidéo à l&apos;assistant et demande-lui d&apos;y publier.</Empty></div>
        : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <li key={it.key}>
                <Link href={`/reseau/${network}/${it.key}`}
                  className="group block overflow-hidden rounded-xl border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent">
                  <div className="relative aspect-video overflow-hidden bg-soft">
                    <Thumb item={it} />
                    {it.mediaType === "video" && <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 text-xs text-white">▶ vidéo</span>}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold">{it.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {it.kind === "draft" ? <Pill className="bg-amber-500/15 text-amber-700 dark:text-amber-300">✏️ Brouillon</Pill> : <TargetStatusPill status={it.status} />}
                      {it.isPrivate && <Pill title="App pas encore validée par le réseau">🔒 privé</Pill>}
                      <span>{fmtRelative(it.at)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
