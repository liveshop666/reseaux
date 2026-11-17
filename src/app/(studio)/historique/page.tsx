import Link from "next/link";
import { cancelTarget, deletePost, publishNow, retryTarget } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { Empty, PageHeader, Pill, PostStatusPill, SetupNotice, TargetStatusPill, isMissingTable } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NETWORKS, NETWORK_INFO, isNetwork } from "@/lib/networks";
import { POST_STATUS, postStatus } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";
import type { Post, PostStatus } from "@/lib/types";

type SP = Promise<{ ok?: string; note?: string; statut?: string; reseau?: string; page?: string }>;
const PER_PAGE = 20;

export default async function Historique({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  let q = supabase.from("social_posts").select("*, social_targets!inner(*)").order("scheduled_at", { ascending: false });
  if (sp.reseau && isNetwork(sp.reseau)) q = q.eq("social_targets.network", sp.reseau);
  // le filtre de statut s'applique après coup (statut calculé) : on charge un peu plus large
  const { data, error } = await q.range(0, sp.statut ? 199 : page * PER_PAGE);
  if (isMissingTable(error)) return <SetupNotice title="Historique" />;

  // avec un filtre réseau, l'inner join ne renvoie que ce réseau : on recharge tous les réseaux des posts trouvés
  let posts = (data ?? []) as Post[];
  if (sp.reseau && posts.length) {
    const { data: full } = await supabase.from("social_posts").select("*, social_targets(*)").in("id", posts.map((p) => p.id)).order("scheduled_at", { ascending: false });
    posts = (full ?? []) as Post[];
  }
  const withStatus = posts.map((p) => ({ p, s: postStatus(p.social_targets ?? [], p.scheduled_at) }));
  const filtered = sp.statut ? withStatus.filter((x) => x.s === sp.statut) : withStatus;
  const shown = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const hasMore = filtered.length > page * PER_PAGE;

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { statut: sp.statut, reseau: sp.reseau, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/historique${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={<>Histo<span className="text-warm">rique</span></>} subtitle="Chaque post, réseau par réseau : statut et lien vers la publication."
        action={<Link href="/nouveau" className="btn-primary">✍️ Nouveau post</Link>} />

      {sp.ok && (
        <div className="card mb-4 border-emerald-500/40 p-3 text-sm">
          {sp.ok === "programme" ? "⏰ C'est programmé : n8n attend l'heure prévue et publie tout seul." : "🚀 C'est parti ! Les statuts se mettent à jour d'ici une minute (bouton Rafraîchir)."}
          {sp.note && <span className="mt-1 block text-muted">{sp.note}</span>}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        <Link href={link({ statut: undefined, page: undefined })} className={`rounded-full px-3 py-1 ${!sp.statut ? "bg-accent text-accent-fg" : "bg-soft-2 text-muted"}`}>Tous</Link>
        {(Object.keys(POST_STATUS) as PostStatus[]).map((s) => (
          <Link key={s} href={link({ statut: s, page: undefined })} className={`rounded-full px-3 py-1 ${sp.statut === s ? "bg-accent text-accent-fg" : "bg-soft-2 text-muted"}`}>{POST_STATUS[s].emoji} {POST_STATUS[s].label}</Link>
        ))}
        <span className="mx-1 self-center text-muted">·</span>
        {NETWORKS.map((n) => (
          <Link key={n} href={link({ reseau: sp.reseau === n ? undefined : n, page: undefined })} className={`rounded-full px-3 py-1 ${sp.reseau === n ? "bg-accent text-accent-fg" : "bg-soft-2 text-muted"}`}>{NETWORK_INFO[n].label}</Link>
        ))}
      </div>

      <div className="card divide-y divide-border">
        {shown.length === 0 && <Empty>Aucune publication ici.</Empty>}
        {shown.map(({ p, s }) => {
          const targets = [...(p.social_targets ?? [])].sort((a, b) => NETWORKS.indexOf(a.network) - NETWORKS.indexOf(b.network));
          const deletable = !targets.some((t) => t.status === "en_cours");
          return (
            <article key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <PostStatusPill status={s} />
                <span title={fmtDateTime(p.scheduled_at)}>{s === "programme" ? `prévu ${fmtDateTime(p.scheduled_at)}` : fmtRelative(p.scheduled_at)}</span>
                {p.media_type && <Pill>{p.media_type === "video" ? "🎬 vidéo" : "🖼️ photo"}</Pill>}
                <span className="ml-auto flex gap-1">
                  {s === "programme" && <ActionButton action={publishNow.bind(null, p.id)} label="Publier maintenant" confirmText="Publier ce post maintenant ?" />}
                  {deletable && <ActionButton action={deletePost.bind(null, p.id)} label="Supprimer" className="btn-danger px-2 py-1 text-xs"
                    confirmText="Supprimer ce post de l'historique ? (ce qui est déjà publié reste en ligne sur les réseaux)" />}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap">{p.body}</p>

              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {targets.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border bg-soft p-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{NETWORK_INFO[t.network].label}</span>
                      <TargetStatusPill status={t.status} />
                      {t.is_private && <Pill title="App TikTok pas encore validée">🔒 privé</Pill>}
                      <span className="ml-auto flex gap-1">
                        {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs">Voir ↗</a>}
                        {(t.status === "erreur" || t.status === "annule") && <ActionButton action={retryTarget.bind(null, t.id)} label="↻ Relancer" confirmText={`Republier sur ${NETWORK_INFO[t.network].label} maintenant ?`} />}
                        {t.status === "a_publier" && s === "programme" && <ActionButton action={cancelTarget.bind(null, t.id)} label="Annuler" />}
                      </span>
                    </div>
                    {t.published_at && <div className="mt-1 text-xs text-muted">Publié {fmtDateTime(t.published_at)}</div>}
                    {t.error && <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">{t.error}</div>}
                    <details className="mt-1 text-xs text-muted">
                      <summary className="cursor-pointer">Texte envoyé</summary>
                      {t.title && <p className="mt-1 font-semibold">{t.title}</p>}
                      <p className="mt-1 whitespace-pre-wrap">{t.text}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {(page > 1 || hasMore) && (
        <div className="mt-4 flex justify-between text-sm">
          {page > 1 ? <Link href={link({ page: String(page - 1) })} className="btn-ghost">← Plus récents</Link> : <span />}
          {hasMore && <Link href={link({ page: String(page + 1) })} className="btn-ghost">Plus anciens →</Link>}
        </div>
      )}
    </div>
  );
}
