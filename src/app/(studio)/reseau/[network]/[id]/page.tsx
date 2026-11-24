import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelTarget, retryTarget } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { DeleteItemButton } from "@/components/DeleteItemButton";
import { Pill, TargetStatusPill } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { NETWORK_INFO, isNetwork } from "@/lib/networks";
import { loadNetworkItem } from "@/lib/network-items";
import { createClient } from "@/lib/supabase/server";

/** Une publication (ou un brouillon) en grand : média, titre, texte complet, actions. */
export default async function Publication({ params }: { params: Promise<{ network: string; id: string }> }) {
  const { network, id } = await params;
  if (!isNetwork(network)) notFound();
  const info = NETWORK_INFO[network];
  const supabase = await createClient();
  const it = await loadNetworkItem(supabase, network, id);
  if (!it) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/reseau/${network}`} className="text-sm text-muted hover:text-text">← {info.label}</Link>

      <article className="card mt-3 overflow-hidden">
        {it.mediaUrl && (
          <div className="flex justify-center bg-black">
            {it.mediaType === "video"
              ? <video src={it.mediaUrl} controls playsInline className="max-h-[70vh] w-auto" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={it.mediaUrl} alt="" className="max-h-[70vh] w-auto object-contain" />}
          </div>
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {it.kind === "draft"
              ? <Pill className="bg-amber-500/15 text-amber-700 dark:text-amber-300">✏️ Brouillon · pas encore validé</Pill>
              : <TargetStatusPill status={it.status} />}
            {it.isPrivate && <Pill title="App pas encore validée par le réseau">🔒 privé</Pill>}
            <span>{it.kind === "draft" ? `préparé le ${fmtDateTime(it.at)}` : it.status === "a_publier" ? `prévu le ${fmtDateTime(it.scheduledAt)}` : fmtDateTime(it.at)}</span>
          </div>
          <h1 className="mt-3 text-xl font-bold">{it.title}</h1>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{it.text}</p>
          {it.error && <p className="mt-3 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{it.error}</p>}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="btn-primary">Voir sur {info.label} ↗</a>}
            {it.kind === "draft" && it.conversationId && <Link href={`/?c=${it.conversationId}`} className="btn-primary">💬 Valider dans la conversation</Link>}
            {it.kind === "target" && (it.status === "erreur" || it.status === "annule") && <ActionButton action={retryTarget.bind(null, it.id)} label="↻ Relancer" className="btn-ghost" confirmText={`Republier sur ${info.label} maintenant ?`} />}
            {it.kind === "target" && it.status === "a_publier" && <ActionButton action={cancelTarget.bind(null, it.id)} label="Annuler la programmation" className="btn-ghost" />}
            <DeleteItemButton kind={it.kind} id={it.id} network={network} label={info.label} />
          </div>
          {it.kind === "target" && it.status === "publie" && (
            <p className="mt-3 text-xs text-muted">« Supprimer du Studio » retire seulement la fiche d&apos;ici : la publication reste en ligne sur {info.label}.</p>
          )}
        </div>
      </article>
    </div>
  );
}
