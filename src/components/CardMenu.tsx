"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteDraft, deleteTarget } from "@/app/actions";

/** Menu « ⋯ » d'une carte : Supprimer (du Réseau seulement, la publication reste en ligne). */
export function CardMenu({ kind, id, label }: { kind: "target" | "draft"; id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const question = kind === "draft"
    ? "Supprimer ce brouillon ? Il ne sera pas publié."
    : `Supprimer cette publication du Réseau ? Si elle est déjà en ligne, elle reste sur ${label}.`;

  return (
    <div ref={ref} className="absolute top-2 right-2 z-10">
      <button type="button" aria-label="Plus d'options" title="Plus d'options" disabled={busy}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="flex size-8 items-center justify-center rounded-full bg-black/55 text-lg leading-none text-white backdrop-blur hover:bg-black/75">
        {busy ? "…" : "⋯"}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <button type="button" disabled={busy}
            className="w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-soft dark:text-rose-400"
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              setOpen(false);
              if (!confirm(question)) return;
              start(async () => {
                const r = await (kind === "draft" ? deleteDraft(id) : deleteTarget(id));
                if (r.error) alert(r.error);
                else router.refresh();
              });
            }}>
            🗑 Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
