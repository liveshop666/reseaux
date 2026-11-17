"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { adaptText, createPost } from "@/app/actions";
import { NetworkPreview } from "@/components/NetworkPreview";
import { adaptLocally } from "@/lib/adapt";
import { NETWORKS, NETWORK_INFO, blockReason, mediaWarning, type MediaType, type Network } from "@/lib/networks";
import { createClient } from "@/lib/supabase/client";
import type { AdaptedMap } from "@/lib/types";

const BUCKET = "reseaux-medias";
const MAX_MB = 50;
const DRAFT_KEY = "studio-brouillon";

type Media = { url: string; path: string; type: Exclude<MediaType, null>; name: string } | null;

export function Composer({ defaults, names }: { defaults: Network[]; names: Record<Network, string> }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<Media>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Network[]>(defaults);
  const [adapted, setAdapted] = useState<AdaptedMap | null>(null);
  const [tab, setTab] = useState<Network | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [adapting, startAdapt] = useTransition();
  const [publishing, startPublish] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // brouillon gardé dans ce navigateur (au cas où l'onglet se ferme)
  useEffect(() => { try { const d = localStorage.getItem(DRAFT_KEY); if (d) setBody(d); } catch { /* stockage indisponible */ } }, []);
  useEffect(() => { try { if (body) localStorage.setItem(DRAFT_KEY, body); else localStorage.removeItem(DRAFT_KEY); } catch { /* idem */ } }, [body]);

  const mediaType: MediaType = media?.type ?? null;
  const usable = useMemo(() => selected.filter((n) => !blockReason(n, mediaType)), [selected, mediaType]);
  const blocked = selected.filter((n) => blockReason(n, mediaType));

  function toggle(n: Network) {
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  }

  // si je coche un réseau après l'adaptation, on lui donne le texte d'origine
  useEffect(() => {
    if (!adapted) return;
    const missing = usable.filter((n) => !adapted[n]);
    if (missing.length) setAdapted((a) => ({ ...a, ...adaptLocally(body, missing) }));
    if (!tab || !usable.includes(tab)) setTab(usable[0] ?? null);
  }, [usable, adapted, body, tab]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!type) return setMsg({ kind: "error", text: "Formats acceptés : JPG, PNG, WEBP, MP4, MOV." });
    if (file.size > MAX_MB * 1024 * 1024) return setMsg({ kind: "error", text: `Fichier trop lourd (${Math.round(file.size / 1048576)} Mo, maximum ${MAX_MB} Mo).` });
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || (type === "video" ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
      const month = new Date().toISOString().slice(0, 7);
      const path = `${month}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      if (media) await supabase.storage.from(BUCKET).remove([media.path]);
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setMedia({ url: data.publicUrl, path, type, name: file.name });
    } catch (e) {
      setMsg({ kind: "error", text: `Envoi impossible : ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeMedia() {
    if (!media) return;
    await createClient().storage.from(BUCKET).remove([media.path]).catch(() => null);
    setMedia(null);
  }

  function adapt(withAi: boolean) {
    setMsg(null);
    if (!body.trim()) return setMsg({ kind: "error", text: "Écris d'abord ton texte." });
    if (usable.length === 0) return setMsg({ kind: "error", text: "Coche au moins un réseau compatible." });
    if (!withAi) { setAdapted(adaptLocally(body, usable)); setTab(usable[0]); return; }
    startAdapt(async () => {
      const r = await adaptText({ body, networks: usable, mediaType });
      if (!r.ok) return setMsg({ kind: "error", text: r.error });
      setAdapted(r.map);
      setTab(usable[0]);
      if (r.note) setMsg({ kind: "info", text: r.note });
    });
  }

  function edit(n: Network, patch: Partial<{ text: string; title: string }>) {
    setAdapted((a) => ({ ...a, [n]: { ...(a?.[n] ?? { text: "" }), ...patch } }));
  }

  const tooLong = usable.filter((n) => (adapted?.[n]?.text.length ?? 0) > NETWORK_INFO[n].max);

  function publish() {
    setMsg(null);
    if (!adapted) return;
    let scheduledAt: string | null = null;
    if (when === "later") {
      const d = new Date(date);
      if (!date || Number.isNaN(d.getTime())) return setMsg({ kind: "error", text: "Choisis la date et l'heure." });
      if (d.getTime() < Date.now()) return setMsg({ kind: "error", text: "Cette date est déjà passée." });
      scheduledAt = d.toISOString();
    }
    const labels = usable.map((n) => NETWORK_INFO[n].label).join(", ");
    if (!confirm(when === "now" ? `Publier maintenant sur : ${labels} ?` : `Programmer pour le ${new Date(date).toLocaleString("fr-FR")} sur : ${labels} ?`)) return;
    startPublish(async () => {
      const r = await createPost({
        body, mediaUrl: media?.url ?? null, mediaPath: media?.path ?? null, mediaType, scheduledAt,
        targets: usable.map((n) => ({ network: n, text: adapted[n]?.text ?? "", title: adapted[n]?.title })),
      });
      if (!r.ok) return setMsg({ kind: "error", text: r.error });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* rien */ }
      router.push(`/historique?ok=${scheduledAt ? "programme" : "publie"}${r.note ? `&note=${encodeURIComponent(r.note)}` : ""}`);
    });
  }

  const minDate = new Date(Date.now() + 5 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* 1. Écrire */}
      <section className="space-y-4">
        <div className="card p-4">
          <label className="label" htmlFor="body">1. Mon texte</label>
          <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="input resize-y"
            placeholder="Ce que je veux dire : une réalisation, un conseil, une offre… L'IA l'adaptera à chaque réseau." />
          <div className="mt-1 text-right text-xs text-muted tabular-nums">{body.length} caractères</div>
        </div>

        <div className="card p-4">
          <span className="label">2. Photo ou vidéo (facultatif)</span>
          {media ? (
            <div className="flex items-center gap-3">
              {media.type === "image"
                ? <Image src={media.url} alt="" width={80} height={80} unoptimized className="size-20 rounded-lg object-cover" />
                : <video src={media.url} className="size-20 rounded-lg object-cover" muted playsInline />}
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate">{media.type === "video" ? "🎬" : "🖼️"} {media.name}</div>
                <button type="button" onClick={removeMedia} className="btn-danger mt-1 px-0">Retirer</button>
              </div>
            </div>
          ) : (
            <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted hover:border-accent ${uploading ? "opacity-60" : ""}`}>
              <span className="text-2xl">{uploading ? "⏳" : "📎"}</span>
              {uploading ? "Envoi en cours…" : `Choisir une photo (JPG, PNG) ou une vidéo (MP4) · ${MAX_MB} Mo max`}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="sr-only" disabled={uploading}
                onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <div className="card p-4">
          <span className="label">3. Où publier</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {NETWORKS.map((n) => {
              const on = selected.includes(n);
              const block = blockReason(n, mediaType);
              return (
                <button key={n} type="button" onClick={() => toggle(n)} aria-pressed={on}
                  className={`rounded-lg border p-2.5 text-left text-sm transition ${on ? (block ? "border-amber-500/60 bg-amber-500/10" : "border-accent bg-accent/10") : "border-border bg-soft hover:border-accent/50"}`}>
                  <span className="font-semibold">{on ? "☑" : "☐"} {NETWORK_INFO[n].label}</span>
                  {on && block && <span className="mt-0.5 block text-[11px] text-amber-600 dark:text-amber-300">{block}</span>}
                </button>
              );
            })}
          </div>
          {blocked.length > 0 && <p className="mt-2 text-xs text-muted">Les réseaux en orange seront ignorés tant qu&apos;il n&apos;y a pas le bon média.</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => adapt(true)} disabled={adapting || uploading} className="btn-primary">
            {adapting ? "L'IA adapte…" : adapted ? "✨ Ré-adapter avec l'IA" : "✨ Adapter avec l'IA"}
          </button>
          <button type="button" onClick={() => adapt(false)} disabled={adapting || uploading} className="btn-ghost">Garder mon texte tel quel</button>
        </div>
        {msg && <p className={`text-sm ${msg.kind === "error" ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>{msg.text}</p>}
      </section>

      {/* 2. Aperçu par réseau */}
      <section className="space-y-4">
        {!adapted || usable.length === 0 ? (
          <div className="card grid min-h-60 place-items-center p-6 text-center text-sm text-muted">
            L&apos;aperçu de chaque réseau apparaît ici après « Adapter avec l&apos;IA ».<br />Rien n&apos;est publié avant ton clic sur « Publier ».
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {usable.map((n) => (
                <button key={n} type="button" onClick={() => setTab(n)}
                  className={`rounded-full px-3 py-1 text-sm ${tab === n ? "bg-accent text-accent-fg" : "bg-soft-2 text-muted hover:text-text"}`}>
                  {NETWORK_INFO[n].label}{(adapted[n]?.text.length ?? 0) > NETWORK_INFO[n].max && " ⚠️"}
                </button>
              ))}
            </div>
            {tab && adapted[tab] && (() => {
              const info = NETWORK_INFO[tab];
              const a = adapted[tab]!;
              const warn = mediaWarning(tab, mediaType);
              const showMedia = !!media && (media.type === "image" ? info.accepts.image : info.accepts.video);
              return (
                <div className="card space-y-3 p-4">
                  {tab === "youtube" && (
                    <label className="block">
                      <span className="label">Titre de la vidéo ({(a.title ?? "").length}/{info.titleMax})</span>
                      <input value={a.title ?? ""} onChange={(e) => edit(tab, { title: e.target.value })} maxLength={info.titleMax} className="input" />
                    </label>
                  )}
                  <label className="block">
                    <span className="label">Texte pour {info.label}</span>
                    <textarea value={a.text} onChange={(e) => edit(tab, { text: e.target.value })} rows={7} className="input resize-y" />
                    <span className={`mt-1 block text-right text-xs tabular-nums ${a.text.length > info.max ? "font-semibold text-rose-500" : "text-muted"}`}>{a.text.length} / {info.max}</span>
                  </label>
                  {warn && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">⚠️ {warn}</p>}
                  <details className="text-xs text-muted"><summary className="cursor-pointer">Limite de {info.label}</summary><p className="mt-1">{info.limit}</p></details>
                  <div className="rounded-xl bg-soft p-3">
                    <div className="mb-2 text-xs text-muted">Aperçu</div>
                    <NetworkPreview network={tab} text={a.text} title={a.title} mediaUrl={media?.url ?? null} mediaType={mediaType} showMedia={showMedia} name={names[tab]} />
                  </div>
                </div>
              );
            })()}

            <div className="card space-y-3 p-4">
              <span className="label">4. Quand</span>
              <div className="flex flex-wrap gap-2 text-sm">
                <label className="flex items-center gap-1.5"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} /> Tout de suite</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} /> Programmer</label>
              </div>
              {when === "later" && <input type="datetime-local" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} className="input max-w-xs" />}
              <button type="button" onClick={publish} disabled={publishing || uploading || tooLong.length > 0} className="btn-primary w-full py-3 text-base">
                {publishing ? "Envoi…" : when === "now" ? `🚀 Publier sur ${usable.length} réseau${usable.length > 1 ? "x" : ""}` : `⏰ Programmer sur ${usable.length} réseau${usable.length > 1 ? "x" : ""}`}
              </button>
              {tooLong.length > 0 && <p className="text-xs text-rose-500">Texte trop long pour : {tooLong.map((n) => NETWORK_INFO[n].label).join(", ")}.</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
