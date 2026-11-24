"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NetworkPreview } from "@/components/NetworkPreview";
import { renderMontage, type MontageSpec } from "@/components/montage";
import { NETWORK_INFO, type MediaType, type Network } from "@/lib/networks";
import { createClient } from "@/lib/supabase/client";

type Block = { type: string; [k: string]: unknown };
export type Row = { id: string; role: "user" | "assistant"; content: Block[] | string };
type Attachment = { url: string; type: "image" | "video"; name: string };
type DraftInput = { texte_base: string; media_url: string; media_type: string; reseaux: { reseau: Network; titre: string; texte: string }[] };

const BUCKET = "reseaux-medias";
const MAX_MB = 50;
const LINK_RE = /^(Photo|Vidéo) jointe « (.*?) » : (https?:\/\/\S+)$/gm;

const SUGGESTIONS = [
  "Écris un post LinkedIn sur notre dernier site livré",
  "Voici des photos : fais-en une vidéo verticale pour TikTok",
  "Qu'est-ce qui a été publié cette semaine ?",
];

function blocks(c: Row["content"]): Block[] {
  return typeof c === "string" ? [{ type: "text", text: c }] : c;
}

function parseUser(c: Row["content"]) {
  const text = blocks(c).filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
  const files: Attachment[] = [];
  const clean = text.replace(LINK_RE, (_m, kind: string, name: string, url: string) => {
    files.push({ url, name, type: kind === "Photo" ? "image" : "video" });
    return "";
  }).trim();
  return { text: clean, files };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRec = any;

export function ChatClient({ conversationId, initial, names }: { conversationId: string; initial: Row[]; names: Record<Network, string> }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [live, setLive] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SpeechRec>(null);
  const baseRef = useRef("");

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [rows, live, status]);
  // « Studio » rouvre cette conversation ; seule « Nouvelle conversation » en crée une autre
  useEffect(() => { document.cookie = `studio_conv=${conversationId}; path=/; max-age=31536000; samesite=lax`; }, [conversationId]);
  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 200) + "px"; }
  }, [input]);

  const reload = useCallback(async () => {
    const r = await fetch(`/api/chat/history?c=${conversationId}`, { cache: "no-store" });
    if (r.ok) setRows(((await r.json()) as { messages: Row[] }).messages);
  }, [conversationId]);

  // résultats des outils, par identifiant
  const results = useMemo(() => {
    const m = new Map<string, { content: string; isError: boolean }>();
    for (const r of rows) {
      if (r.role !== "user") continue;
      for (const b of blocks(r.content)) {
        if (b.type === "tool_result") {
          const c = b.content;
          m.set(String(b.tool_use_id), { content: typeof c === "string" ? c : JSON.stringify(c), isError: !!b.is_error });
        }
      }
    }
    return m;
  }, [rows]);

  const send = useCallback(async (text: string, attachments: Attachment[]) => {
    if (busy || (!text.trim() && attachments.length === 0)) return;
    setBusy(true); setError(""); setLive(""); setStatus("L'assistant réfléchit…");
    setRows((r) => [...r, { id: "tmp-" + Date.now(), role: "user", content: [{ type: "text", text: [text.trim(), attachments.map((a) => `${a.type === "image" ? "Photo" : "Vidéo"} jointe « ${a.name} » : ${a.url}`).join("\n")].filter(Boolean).join("\n\n") }] }]);
    let montage: MontageSpec | null = null;
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, text, attachments }) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { t: string; d?: string; m?: string; name?: string; spec?: MontageSpec };
          if (ev.t === "text") { setStatus(""); setLive((l) => l + (ev.d ?? "")); }
          else if (ev.t === "tool") setStatus(ev.name === "proposer_post" ? "Je prépare le brouillon…" : ev.name === "publier" ? "Je lance la publication…" : ev.name === "monter_video" ? "Je prépare le montage…" : "Je regarde…");
          else if (ev.t === "montage" && ev.spec) montage = ev.spec;
          else if (ev.t === "error") setError(ev.m ?? "Erreur");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      await reload();
      setLive(""); setStatus(""); setBusy(false);
    }
    if (montage) {
      setBusy(true);
      try {
        const url = await renderMontage(montage, setStatus);
        setStatus(""); setBusy(false);
        await send("[Montage terminé] La vidéo est prête.", [{ url, type: "video", name: "montage.mp4" }]);
      } catch (e) {
        setStatus(""); setBusy(false);
        await send(`[Montage échoué] ${e instanceof Error ? e.message : String(e)}`, []);
      }
    }
  }, [busy, conversationId, reload]);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    const supabase = createClient();
    for (const file of Array.from(list)) {
      const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
      if (!type) { setError("Formats acceptés : JPG, PNG, WEBP, MP4, MOV."); continue; }
      if (file.size > MAX_MB * 1024 * 1024) { setError(`« ${file.name} » est trop lourd (${Math.round(file.size / 1048576)} Mo, maximum ${MAX_MB} Mo).`); continue; }
      setUploading((n) => n + 1);
      try {
        const ext = (file.name.split(".").pop() || (type === "video" ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
        const { error: err } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (err) throw err;
        const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        setFiles((f) => [...f, { url, type, name: file.name.slice(0, 120) }]);
      } catch (e) {
        setError(`Envoi impossible : ${e instanceof Error ? e.message : String(e)}`);
      } finally { setUploading((n) => n - 1); }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleMic() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setError("La dictée n'est pas disponible sur ce navigateur (essaie Chrome ou Safari)."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = true;
    baseRef.current = input ? input.trimEnd() + " " : "";
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(baseRef.current + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }

  function submit() {
    if (listening) recRef.current?.stop();
    const t = input, f = files;
    setInput(""); setFiles([]);
    void send(t, f);
  }

  const lastDraftId = useMemo(() => {
    let id = "";
    for (const r of rows) if (r.role === "assistant") for (const b of blocks(r.content)) if (b.type === "tool_use" && b.name === "proposer_post") id = String(b.id);
    return id;
  }, [rows]);
  const publishedAfter = useMemo(() => {
    let seen = false, pub = false;
    for (const r of rows) if (r.role === "assistant") for (const b of blocks(r.content)) {
      if (b.type === "tool_use" && b.id === lastDraftId) seen = true;
      else if (seen && b.type === "tool_use" && b.name === "publier" && !results.get(String(b.id))?.isError) pub = true;
    }
    return pub;
  }, [rows, lastDraftId, results]);

  const empty = rows.length === 0 && !busy;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col md:h-[calc(100dvh-5rem)]">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-4">
          {empty && (
            <div className="mt-10 text-center">
              <h1 className="font-head text-4xl leading-none font-extrabold uppercase md:text-5xl">Réseau <span className="text-warm">SolveLab</span></h1>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted">Dis-moi quoi publier. J&apos;écris, j&apos;adapte pour chaque réseau, je monte la vidéo si besoin — et je ne publie qu&apos;après ton « je valide ».</p>
              <div className="mt-5 flex flex-col items-center gap-2">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => setInput(s)} className="btn-ghost max-w-full text-left whitespace-normal">{s}</button>)}
              </div>
            </div>
          )}

          {rows.map((r) => {
            const bs = blocks(r.content);
            if (r.role === "user") {
              if (bs.every((b) => b.type === "tool_result")) return null;
              const { text, files: fs } = parseUser(r.content);
              if (text.startsWith("[Montage")) return <p key={r.id} className="text-center text-xs text-muted">🎬 {text.replace(/^\[Montage (terminé|échoué)\]\s*/, (_m, s) => (s === "terminé" ? "Montage terminé. " : "Montage échoué : "))}</p>;
              return (
                <div key={r.id} className="flex justify-end">
                  <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-accent/15 px-4 py-2.5 text-sm">
                    {fs.length > 0 && <div className="flex flex-wrap gap-2">{fs.map((f) => f.type === "image"
                      ? <Image key={f.url} src={f.url} alt={f.name} width={96} height={96} unoptimized className="size-24 rounded-lg object-cover" />
                      : <video key={f.url} src={f.url} className="size-24 rounded-lg object-cover" muted playsInline />)}</div>}
                    {text && <p className="whitespace-pre-wrap">{text}</p>}
                  </div>
                </div>
              );
            }
            return (
              <div key={r.id} className="flex flex-col gap-3">
                {bs.map((b, i) => {
                  if (b.type === "text" && String(b.text).trim()) return <div key={i} className="md max-w-[92%] text-sm leading-relaxed"><Markdown remarkPlugins={[remarkGfm]}>{String(b.text)}</Markdown></div>;
                  if (b.type !== "tool_use") return null;
                  const res = results.get(String(b.id));
                  if (b.name === "proposer_post") {
                    const inp = b.input as DraftInput;
                    return <DraftCard key={i} input={inp} names={names} error={res?.isError ? res.content : null}
                      actionable={String(b.id) === lastDraftId && !publishedAfter && !res?.isError && !busy}
                      onValidate={() => void send(`Je valide, publie sur ${inp.reseaux.map((x) => NETWORK_INFO[x.reseau].label).join(", ")}.`, [])}
                      onEdit={() => taRef.current?.focus()} />;
                  }
                  if (b.name === "publier") return <PublishLine key={i} res={res} />;
                  if (b.name === "monter_video") return <p key={i} className="text-xs text-muted">🎬 Montage de la vidéo…</p>;
                  return <p key={i} className="text-xs text-muted">{b.name === "etat_comptes" ? "🔌 Je vérifie les comptes…" : "🗂️ Je regarde les publications…"}</p>;
                })}
              </div>
            );
          })}

          {live && <div className="md max-w-[92%] text-sm leading-relaxed"><Markdown remarkPlugins={[remarkGfm]}>{live}</Markdown></div>}
          {status && <p className="flex items-center gap-2 text-xs text-muted"><span className="inline-block size-2 animate-pulse rounded-full bg-accent" />{status}</p>}
          {error && <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          <div ref={endRef} />
        </div>
      </div>

      {/* Zone de saisie */}
      <div className="mx-auto w-full max-w-3xl pt-2">
        {(files.length > 0 || uploading > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f) => (
              <span key={f.url} className="relative">
                {f.type === "image" ? <Image src={f.url} alt={f.name} width={56} height={56} unoptimized className="size-14 rounded-lg object-cover" /> : <video src={f.url} className="size-14 rounded-lg object-cover" muted playsInline />}
                <button type="button" aria-label="Retirer" onClick={() => setFiles((x) => x.filter((y) => y.url !== f.url))} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-text text-xs text-bg">×</button>
              </span>
            ))}
            {uploading > 0 && <span className="grid size-14 place-items-center rounded-lg border border-dashed border-border text-xs text-muted">⏳</span>}
          </div>
        )}
        <div className="card flex items-end gap-1.5 p-2">
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="sr-only" onChange={(e) => void onFiles(e.target.files)} />
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost size-10 shrink-0 p-0 text-xl" aria-label="Ajouter des photos ou vidéos" title="Ajouter des photos ou vidéos">+</button>
          <textarea ref={taRef} value={input} rows={1} onChange={(e) => setInput(e.target.value)} placeholder="Écris ce que tu veux publier… (Entrée pour envoyer)"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(min-width: 768px)").matches) { e.preventDefault(); submit(); } }}
            className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted/70" />
          <button type="button" onClick={toggleMic} className={`btn-ghost size-10 shrink-0 p-0 ${listening ? "!border-rose-500 !text-rose-500" : ""}`} aria-label={listening ? "Arrêter la dictée" : "Dicter"} title="Dicter">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
          </button>
          <button type="button" onClick={submit} disabled={busy || uploading > 0 || (!input.trim() && files.length === 0)} className="btn-primary size-10 shrink-0 p-0" aria-label="Envoyer">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftCard({ input, names, actionable, error, onValidate, onEdit }: {
  input: DraftInput; names: Record<Network, string>; actionable: boolean; error: string | null; onValidate: () => void; onEdit: () => void;
}) {
  const [tab, setTab] = useState<Network>(input.reseaux[0]?.reseau ?? "youtube");
  const mediaType: MediaType = input.media_type === "image" || input.media_type === "video" ? input.media_type : null;
  const cur = input.reseaux.find((r) => r.reseau === tab) ?? input.reseaux[0];
  if (error) return <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">Brouillon à refaire : {error}</p>;
  if (!cur) return null;
  const info = NETWORK_INFO[cur.reseau];
  const show = !!input.media_url && (mediaType === "image" ? info.accepts.image : mediaType === "video" ? info.accepts.video : false);
  return (
    <div className="card w-full max-w-xl p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-muted uppercase">Brouillon</span>
        {input.reseaux.map((r) => (
          <button key={r.reseau} type="button" onClick={() => setTab(r.reseau)} className={`rounded-full px-3 py-1 text-xs ${cur.reseau === r.reseau ? "bg-accent text-accent-fg" : "bg-soft-2 text-muted hover:text-text"}`}>{NETWORK_INFO[r.reseau].label}</button>
        ))}
      </div>
      <div className="rounded-xl bg-soft p-3">
        <NetworkPreview network={cur.reseau} text={cur.texte} title={cur.titre} mediaUrl={input.media_url || null} mediaType={mediaType} showMedia={show} name={names[cur.reseau]} />
        <p className="mt-2 text-right text-[11px] text-muted tabular-nums">{cur.texte.length} / {info.max}</p>
      </div>
      {actionable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onValidate} className="btn-primary">✅ Je valide, publier</button>
          <button type="button" onClick={onEdit} className="btn-ghost">✏️ Modifier…</button>
        </div>
      )}
    </div>
  );
}

function PublishLine({ res }: { res?: { content: string; isError: boolean } }) {
  if (!res) return <p className="text-xs text-muted">🚀 Publication en cours…</p>;
  if (res.isError) return <p className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">Publication impossible : {res.content}</p>;
  let d: { programme?: boolean; reseaux?: Network[]; avertissement?: string | null } = {};
  try { d = JSON.parse(res.content); } catch { /* texte brut */ }
  return (
    <p className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
      {d.programme ? "⏰ Programmé" : "🚀 Lancé"} sur {(d.reseaux ?? []).map((n) => NETWORK_INFO[n]?.label ?? n).join(", ")}. Le statut et les liens sont dans l&apos;onglet de chaque réseau.
      {d.avertissement && <span className="mt-1 block text-amber-700 dark:text-amber-300">⚠️ {d.avertissement}</span>}
    </p>
  );
}
