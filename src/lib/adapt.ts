import { NETWORK_INFO, isNetwork, type MediaType, type Network } from "@/lib/networks";
import type { AdaptedMap } from "@/lib/types";

function cut(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const at = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  return `${(at > max * 0.6 ? slice.slice(0, at) : slice).trimEnd()}…`;
}

/** Version sans IA : même texte partout, coupé à la bonne longueur. Sert si n8n ne répond pas. */
export function adaptLocally(body: string, networks: Network[]): AdaptedMap {
  const out: AdaptedMap = {};
  const firstLine = body.trim().split("\n").find((l) => l.trim()) ?? "SolveLab";
  for (const n of networks) {
    const info = NETWORK_INFO[n];
    out[n] = { text: cut(body, info.max), ...(n === "youtube" ? { title: cut(firstLine, info.titleMax ?? 100) } : {}) };
  }
  return out;
}

/** Lit la réponse du workflow n8n (tolérant) et la complète avec la version locale si un réseau manque. */
export function normalizeAdapted(raw: unknown, body: string, networks: Network[]): { map: AdaptedMap; missing: Network[] } {
  const fallback = adaptLocally(body, networks);
  const map: AdaptedMap = {};
  const missing: Network[] = [];
  const src = (raw && typeof raw === "object" && "reseaux" in raw ? (raw as { reseaux: unknown }).reseaux : raw) as Record<string, unknown> | null;
  for (const n of networks) {
    const v = src && typeof src === "object" ? src[n] : undefined;
    const text = typeof v === "string" ? v : v && typeof v === "object" ? (v as Record<string, unknown>).texte ?? (v as Record<string, unknown>).text : undefined;
    const title = v && typeof v === "object" ? (v as Record<string, unknown>).titre ?? (v as Record<string, unknown>).title : undefined;
    if (typeof text === "string" && text.trim()) {
      const info = NETWORK_INFO[n];
      map[n] = { text: cut(text, info.max), ...(n === "youtube" ? { title: cut(typeof title === "string" && title.trim() ? title : fallback.youtube!.title!, info.titleMax ?? 100) } : {}) };
    } else {
      map[n] = fallback[n];
      missing.push(n);
    }
  }
  return { map, missing };
}

export function parseNetworks(v: unknown): Network[] {
  return Array.isArray(v) ? [...new Set(v.filter(isNetwork))] : [];
}

export function parseMediaType(v: unknown): MediaType {
  return v === "image" || v === "video" ? v : null;
}
