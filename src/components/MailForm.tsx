"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useActionState, useRef, useState } from "react";
import { sendMailAction } from "@/app/mail-actions";

type SpeechRec = any;

/** Formulaire d'envoi (nouveau mail ou réponse), avec dictée au micro. */
export function MailForm({ to = "", subject = "", inReplyTo = "", references = "" }: {
  to?: string; subject?: string; inReplyTo?: string; references?: string;
}) {
  const [state, action, busy] = useActionState(sendMailAction, undefined);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const recRef = useRef<SpeechRec>(null);
  const baseRef = useRef("");

  function toggleMic() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setMicError("La dictée n'est pas disponible sur ce navigateur (essaie Chrome ou Safari)."); return; }
    if (listening) { recRef.current?.stop(); return; }
    setMicError("");
    const rec = new Ctor();
    rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = true;
    baseRef.current = text ? text.trimEnd() + " " : "";
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(baseRef.current + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }

  return (
    <form action={(fd) => { if (listening) recRef.current?.stop(); return action(fd); }} className="card flex flex-col gap-3 p-4">
      <input type="hidden" name="inReplyTo" value={inReplyTo} />
      <input type="hidden" name="references" value={references} />
      <label className="text-sm">À
        <input name="to" defaultValue={to} required className="input mt-1" placeholder="client@exemple.fr" />
      </label>
      <label className="text-sm">Objet
        <input name="subject" defaultValue={subject} required className="input mt-1" />
      </label>
      <div className="text-sm">
        <div className="flex items-center justify-between">
          <label htmlFor="mail-text">Message</label>
          <button type="button" onClick={toggleMic} title={listening ? "Arrêter la dictée" : "Dicter"}
            className={`btn-ghost px-2 py-1 text-xs ${listening ? "!border-rose-500 !text-rose-500" : ""}`}>
            {listening ? "⏹ Arrêter" : "🎙️ Dicter"}
          </button>
        </div>
        <textarea id="mail-text" name="text" required rows={10} className="input mt-1 font-sans"
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={listening ? "Je t'écoute…" : "Écris ou dicte ton message"} />
      </div>
      {micError && <p className="text-sm text-muted">{micError}</p>}
      {state?.error && <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>}
      <div className="flex justify-end">
        <button disabled={busy} className="btn-primary">{busy ? "Envoi…" : "✉️ Envoyer"}</button>
      </div>
    </form>
  );
}
