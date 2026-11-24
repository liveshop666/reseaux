import Link from "next/link";
import { notFound } from "next/navigation";
import { trashMailAction } from "@/app/mail-actions";
import { ActionButton } from "@/components/ActionButton";
import { MailForm } from "@/components/MailForm";
import { PageHeader } from "@/components/ui";
import { errorMessage, fmtDateTime } from "@/lib/format";
import { getMail, type Folder, type MailFull } from "@/lib/mail";

export const dynamic = "force-dynamic";

type P = Promise<{ uid: string }>;
type SP = Promise<{ d?: string }>;

export default async function MailDetail({ params, searchParams }: { params: P; searchParams: SP }) {
  const { uid } = await params;
  const sp = await searchParams;
  const folder: Folder = sp.d === "sent" ? "sent" : "inbox";
  const n = Number(uid);
  if (!Number.isInteger(n) || n <= 0) notFound();

  let mail: MailFull | null = null;
  let error: string | null = null;
  try { mail = await getMail(folder, n); } catch (e) { error = errorMessage(e); }
  const back = folder === "sent" ? "/mails?d=sent" : "/mails";
  if (error) return <div className="mx-auto max-w-3xl"><div className="card border-rose-500/40 p-4 text-sm">⚠️ {error}</div></div>;
  if (!mail) notFound();

  const replyTo = mail.replyTo || mail.fromAddress;
  const subject = /^re\s*:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject}`;
  const references = [...mail.references, mail.messageId].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={<span className="normal-case">{mail.subject}</span>} action={
        <span className="flex gap-2">
          <ActionButton action={trashMailAction.bind(null, folder, n, true)} label="🗑 Supprimer" pending="Suppression…"
            confirmText="Mettre ce mail à la corbeille ? (aussi dans ta boîte OVH)" className="btn-danger" />
          <Link href={back} className="btn-ghost">← Mails</Link>
        </span>} />

      <div className="card mb-6 p-4">
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">De</dt><dd className="break-all">{mail.from}</dd>
          <dt className="text-muted">À</dt><dd className="break-all">{mail.to}</dd>
          {mail.cc && <><dt className="text-muted">Cc</dt><dd className="break-all">{mail.cc}</dd></>}
          <dt className="text-muted">Date</dt><dd>{fmtDateTime(mail.date)}</dd>
        </dl>
        {mail.text ? (
          <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">{mail.text}</div>
        ) : mail.html ? (
          // HTML seul : affiché isolé (aucun script, aucun accès au Studio)
          <iframe sandbox="" srcDoc={mail.html} title="Contenu du mail" className="h-[60vh] w-full rounded-lg border border-border bg-white" />
        ) : (
          <p className="text-sm text-muted">(mail vide)</p>
        )}
        {mail.attachments.length > 0 && (
          <p className="mt-4 text-xs text-muted">📎 {mail.attachments.join(", ")} — à ouvrir depuis ta messagerie OVH.</p>
        )}
      </div>

      {folder === "inbox" && replyTo && (
        <>
          <h2 className="mb-2 font-semibold">Répondre</h2>
          <MailForm to={replyTo} subject={subject} inReplyTo={mail.messageId ?? ""} references={references} />
        </>
      )}
    </div>
  );
}
