"use client";
import { useTransition } from "react";

/** Petit bouton qui lance une action serveur, avec confirmation facultative et message d'erreur. */
export function ActionButton({ action, label, pending = "…", confirmText, className = "btn-ghost px-2 py-1 text-xs" }: {
  action: () => Promise<{ error?: string } | void>;
  label: string;
  pending?: string;
  confirmText?: string;
  className?: string;
}) {
  const [busy, start] = useTransition();
  return (
    <button type="button" disabled={busy} className={className}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(async () => {
          const r = await action();
          if (r && r.error) alert(r.error);
        });
      }}>
      {busy ? pending : label}
    </button>
  );
}
