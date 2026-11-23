"use client";
import Image from "next/image";
import { useState } from "react";
import type { MediaType, Network } from "@/lib/networks";

type Props = {
  network: Network;
  text: string;
  title?: string;
  mediaUrl: string | null;
  mediaType: MediaType;
  /** le réseau publie-t-il le média ? (false = texte seul) */
  showMedia: boolean;
  name: string;
};

/** Texte coupé comme le réseau le coupe dans le fil (« … voir plus »). */
function Folded({ text, at, more = "voir plus" }: { text: string; at: number; more?: string }) {
  const [open, setOpen] = useState(false);
  if (open || text.length <= at) return <span className="whitespace-pre-wrap">{text}</span>;
  return (
    <span className="whitespace-pre-wrap">
      {text.slice(0, at).trimEnd()}…{" "}
      <button type="button" onClick={() => setOpen(true)} className="font-semibold opacity-70">{more}</button>
    </span>
  );
}

function Media({ url, type, className }: { url: string; type: MediaType; className: string }) {
  if (type === "video") return <video src={url} className={`${className} object-cover`} muted playsInline loop autoPlay />;
  return <Image src={url} alt="" width={600} height={600} unoptimized className={`${className} object-cover`} />;
}

function Avatar({ letter = "S" }: { letter?: string }) {
  return <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#ffb547,#ff4fa3,#8b3dff)] text-xs font-bold text-white">{letter}</span>;
}

export function NetworkPreview({ network, text, title, mediaUrl, mediaType, showMedia, name }: Props) {
  const media = showMedia && mediaUrl ? mediaUrl : null;

  if (network === "youtube") {
    return (
      <div className="overflow-hidden rounded-lg bg-white text-[#0f0f0f]">
        <div className="relative aspect-video bg-black">
          {media && <Media url={media} type={mediaType} className="size-full" />}
          <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1 text-[10px] text-white">Short / vidéo</span>
        </div>
        <div className="flex gap-2 p-3">
          <Avatar />
          <div className="min-w-0">
            <div className="line-clamp-2 text-sm font-semibold">{title || "Titre de la vidéo"}</div>
            <div className="text-xs text-[#606060]">{name} · 0 vue · à l&apos;instant</div>
            <div className="mt-2 rounded-lg bg-[#f2f2f2] p-2 text-xs"><Folded text={text} at={160} more="…plus" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (network === "linkedin") {
    return (
      <div className="overflow-hidden rounded-lg bg-white text-[#191919]">
        <div className="flex items-center gap-2 p-3">
          <Avatar />
          <div><div className="text-sm font-semibold">{name}</div><div className="text-[11px] text-[#666]">à l&apos;instant · 🌐</div></div>
        </div>
        <div className="px-3 pb-3 text-sm"><Folded text={text} at={210} more="…voir plus" /></div>
        {media && <Media url={media} type={mediaType} className="max-h-72 w-full" />}
        <div className="flex justify-around border-t border-[#e8e8e8] py-2 text-xs text-[#666]"><span>👍 J&apos;aime</span><span>💬 Commenter</span><span>↗ Partager</span></div>
      </div>
    );
  }

  if (network === "tiktok") {
    return (
      <div className="relative mx-auto aspect-[9/16] max-h-96 overflow-hidden rounded-lg bg-black text-white">
        {media && <Media url={media} type={mediaType} className="absolute inset-0 size-full" />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-xs">
          <div className="font-semibold">@{name.replace(/^@/, "")}</div>
          <div className="mt-1"><Folded text={text} at={90} more="plus" /></div>
        </div>
        <div className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px]">🔒 privé tant que l&apos;app n&apos;est pas validée</div>
      </div>
    );
  }

  if (network === "instagram") {
    return (
      <div className="overflow-hidden rounded-lg bg-white text-[#262626]">
        <div className="flex items-center gap-2 p-2.5"><Avatar /><span className="text-sm font-semibold">{name.replace(/^@/, "")}</span></div>
        <div className="aspect-square bg-[#efefef]">{media && <Media url={media} type={mediaType} className="size-full" />}</div>
        <div className="p-3 text-sm">
          <div className="mb-1 text-lg">♡ 💬 ↗</div>
          <span className="font-semibold">{name.replace(/^@/, "")}</span> <Folded text={text} at={125} more="plus" />
        </div>
      </div>
    );
  }

  if (network === "facebook") {
    return (
      <div className="overflow-hidden rounded-lg bg-white text-[#050505]">
        <div className="flex items-center gap-2 p-3">
          <Avatar />
          <div><div className="text-sm font-semibold">{name}</div><div className="text-[11px] text-[#65676b]">à l&apos;instant · 🌐</div></div>
        </div>
        <div className="px-3 pb-3 text-sm"><Folded text={text} at={250} more="Voir plus" /></div>
        {media && <Media url={media} type={mediaType} className="max-h-80 w-full" />}
        <div className="flex justify-around border-t border-[#e4e6eb] py-2 text-xs text-[#65676b]"><span>👍 J&apos;aime</span><span>💬 Commenter</span><span>↗ Partager</span></div>
      </div>
    );
  }

  // fiche Google
  return (
    <div className="overflow-hidden rounded-lg bg-white text-[#202124]">
      <div className="flex items-center gap-2 p-3"><Avatar letter="G" /><div><div className="text-sm font-medium">{name}</div><div className="text-[11px] text-[#5f6368]">Publication · à l&apos;instant</div></div></div>
      {media && <Media url={media} type={mediaType} className="max-h-60 w-full" />}
      <div className="p-3 text-sm"><Folded text={text} at={250} more="Plus" /></div>
    </div>
  );
}
