"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteDraft, deleteTarget } from "@/app/actions";

/** Supprime une carte du Studio puis revient à la page du réseau. */
export function DeleteItemButton({ kind, id, network, label }: { kind: "target" | "draft"; id: string; network: string; label: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const question = kind === "draft"
    ? "Supprimer ce brouillon ? Il ne sera pas publié."
    : `Supprimer cette fiche du Studio ? Si elle est déjà en ligne, elle reste sur ${label}.`;
  return (
    <button type="button" disabled={busy} className="btn-ghost text-rose-600 dark:text-rose-400"
      onClick={() => {
        if (!confirm(question)) return;
        start(async () => {
          const r = await (kind === "draft" ? deleteDraft(id) : deleteTarget(id));
          if (r.error) alert(r.error);
          else router.push(`/reseau/${network}`);
        });
      }}>
      {busy ? "Suppression…" : "🗑 Supprimer du Studio"}
    </button>
  );
}
