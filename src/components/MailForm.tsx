"use client";
import { useActionState } from "react";
import { sendMailAction } from "@/app/mail-actions";

/** Formulaire d'envoi (nouveau mail ou réponse). */
export function MailForm({ to = "", subject = "", inReplyTo = "", references = "", quote = "" }: {
  to?: string; subject?: string; inReplyTo?: string; references?: string; quote?: string;
}) {
  const [state, action, busy] = useActionState(sendMailAction, undefined);
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <input type="hidden" name="inReplyTo" value={inReplyTo} />
      <input type="hidden" name="references" value={references} />
      <label className="text-sm">À
        <input name="to" defaultValue={to} required className="input mt-1" placeholder="client@exemple.fr" />
      </label>
      <label className="text-sm">Objet
        <input name="subject" defaultValue={subject} required className="input mt-1" />
      </label>
      <label className="text-sm">Message
        <textarea name="text" required rows={10} className="input mt-1 font-sans" defaultValue={quote} autoFocus />
      </label>
      {state?.error && <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>}
      <div className="flex justify-end">
        <button disabled={busy} className="btn-primary">{busy ? "Envoi…" : "✉️ Envoyer"}</button>
      </div>
    </form>
  );
}
