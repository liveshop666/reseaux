import type { PostStatus, Target } from "@/lib/types";

/** Statut global d'un post à partir de l'état de chaque réseau. */
export function postStatus(targets: Pick<Target, "status">[], scheduledAt: string): PostStatus {
  const s = targets.map((t) => t.status).filter((x) => x !== "annule");
  if (s.length === 0) return "annule";
  if (s.some((x) => x === "en_cours")) return "en_cours";
  if (s.some((x) => x === "a_publier")) return new Date(scheduledAt) > new Date() ? "programme" : "en_cours";
  if (s.every((x) => x === "publie")) return "publie";
  if (s.every((x) => x === "erreur")) return "erreur";
  return "partiel";
}

export const POST_STATUS: Record<PostStatus, { label: string; emoji: string; color: string }> = {
  programme: { label: "Programmé", emoji: "⏰", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  en_cours: { label: "En cours", emoji: "⏳", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  publie: { label: "Publié", emoji: "✅", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  partiel: { label: "En partie", emoji: "⚠️", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  erreur: { label: "Erreur", emoji: "❌", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  annule: { label: "Annulé", emoji: "🚫", color: "bg-soft-2 text-muted" },
};
