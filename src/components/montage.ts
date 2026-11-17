"use client";
import { createClient } from "@/lib/supabase/client";

export type MontageClip = { url: string; type: "image" | "video"; texte: string; duree: number };
export type MontageSpec = { clips: MontageClip[]; texte_final: string };

const W = 720;
const H = 1280;
const FPS = 30;
const FADE = 0.4;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Photo illisible : " + url));
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Vidéo illisible : " + url));
    v.src = url;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, zoom: number) {
  const scale = Math.max(W / sw, H / sh) * zoom;
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawText(ctx: CanvasRenderingContext2D, text: string, y: number, size: number) {
  if (!text.trim()) return;
  ctx.font = `800 ${size}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxW = W - 90;
  const words = text.trim().toUpperCase().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  const lh = size * 1.1;
  const top = y - ((lines.length - 1) * lh) / 2;
  const g = ctx.createLinearGradient(0, top - lh * 1.4, 0, top + lines.length * lh + lh);
  g.addColorStop(0, "rgba(11,7,16,0)");
  g.addColorStop(1, "rgba(11,7,16,.78)");
  ctx.fillStyle = g;
  ctx.fillRect(0, top - lh * 1.4, W, lines.length * lh + lh * 2.4);
  ctx.lineJoin = "round";
  lines.forEach((l, i) => {
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(11,7,16,.9)";
    ctx.strokeText(l, W / 2, top + i * lh);
    ctx.fillStyle = "#fff";
    ctx.fillText(l, W / 2, top + i * lh);
  });
}

function pickMime(): string | null {
  const candidates = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? null;
}

/**
 * Monte la vidéo dans le navigateur (gratuit) : diaporama / extraits 9:16 avec textes et fondus,
 * enregistré en MP4 puis envoyé dans le bucket. Retourne le lien public.
 */
export async function renderMontage(spec: MontageSpec, onProgress: (txt: string) => void): Promise<string> {
  const mime = pickMime();
  if (!mime) throw new Error("Ce navigateur ne sait pas enregistrer en MP4 : utilise Chrome ou Edge à jour (ordinateur) ou Safari.");

  onProgress("Chargement des médias…");
  const sources = await Promise.all(spec.clips.map(async (c) => (c.type === "image" ? { c, img: await loadImage(c.url) } : { c, vid: await loadVideo(c.url) })));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");

  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start(500);

  const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
  const total = sources.length + (spec.texte_final.trim() ? 1 : 0);
  let done = 0;

  for (const s of sources) {
    const dur = Math.min(Math.max(s.c.duree || 3, 2), 8);
    onProgress(`Montage : plan ${++done}/${total}…`);
    if (s.vid) { s.vid.currentTime = 0; await s.vid.play().catch(() => null); }
    const start = performance.now();
    for (;;) {
      const t = (performance.now() - start) / 1000;
      if (t >= dur) break;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0b0710";
      ctx.fillRect(0, 0, W, H);
      const fade = Math.min(1, t / FADE, (dur - t) / FADE);
      ctx.globalAlpha = Math.max(0, fade);
      if (s.img) drawCover(ctx, s.img, s.img.naturalWidth, s.img.naturalHeight, 1 + 0.06 * (t / dur));
      else if (s.vid) {
        if (s.vid.ended) break;
        drawCover(ctx, s.vid, s.vid.videoWidth, s.vid.videoHeight, 1);
      }
      drawText(ctx, s.c.texte, H - 260, 74);
      await frame();
    }
    s.vid?.pause();
  }

  if (spec.texte_final.trim()) {
    onProgress(`Montage : plan ${++done}/${total}…`);
    const start = performance.now();
    for (;;) {
      const t = (performance.now() - start) / 1000;
      if (t >= 2.5) break;
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#ffb547"); bg.addColorStop(0.5, "#ff4fa3"); bg.addColorStop(1, "#8b3dff");
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.min(1, t / FADE);
      drawText(ctx, spec.texte_final, H / 2, 96);
      await frame();
    }
  }

  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  const blob = new Blob(chunks, { type: "video/mp4" });
  if (blob.size < 1000) throw new Error("Le montage est vide, réessaie.");
  if (blob.size > 50 * 1024 * 1024) throw new Error("Le montage dépasse 50 Mo : raccourcis-le.");

  onProgress("Envoi de la vidéo…");
  const supabase = createClient();
  const path = `${new Date().toISOString().slice(0, 7)}/montage-${crypto.randomUUID()}.mp4`;
  const { error } = await supabase.storage.from("reseaux-medias").upload(path, blob, { contentType: "video/mp4", upsert: false });
  if (error) throw error;
  return supabase.storage.from("reseaux-medias").getPublicUrl(path).data.publicUrl;
}
