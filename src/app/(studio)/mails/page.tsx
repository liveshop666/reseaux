import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { errorMessage, fmtRelative } from "@/lib/format";
import { listMails, mailAddress, mailReady, type Folder, type MailSummary } from "@/lib/mail";

export const dynamic = "force-dynamic";

type SP = Promise<{ d?: string; ok?: string }>;

export default async function Mails({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const folder: Folder = sp.d === "sent" ? "sent" : "inbox";

  let mails: MailSummary[] = [];
  let error: string | null = null;
  if (mailReady()) {
    try { mails = await listMails(folder); } catch (e) { error = errorMessage(e); }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={<>Ma<span className="text-warm">ils</span></>} subtitle={mailAddress()}
        action={<Link href="/mails/nouveau" className="btn-primary">✍️ Nouveau mail</Link>} />

      {sp.ok === "envoye" && <div className="card mb-4 border-emerald-500/40 p-3 text-sm">✅ Mail envoyé.</div>}

      <div className="mb-4 flex gap-1.5 text-sm">
        <Link href="/mails" className={`rounded-full px-3 py-1 ${folder === "inbox" ? "bg-accent text-accent-fg" : "bg-soft-2 text-muted"}`}>📥 Reçus</Link>
        <Link href="/mails?d=sent" className={`rounded-full px-3 py-1 ${folder === "sent" ? "bg-accent text-accent-fg" : "bg-soft-2 text-muted"}`}>📤 Envoyés</Link>
      </div>

      {!mailReady() ? (
        <div className="card p-4 text-sm">⚪ Boîte mail pas encore branchée : il manque <code>MAIL_PASSWORD</code> dans Vercel.</div>
      ) : error ? (
        <div className="card border-rose-500/40 p-4 text-sm">⚠️ Impossible de lire la boîte mail : {error}</div>
      ) : !mails.length ? (
        <div className="card"><Empty>Aucun mail ici.</Empty></div>
      ) : (
        <ul className="card divide-y divide-border">
          {mails.map((m) => (
            <li key={m.uid}>
              <Link href={`/mails/${m.uid}${folder === "sent" ? "?d=sent" : ""}`} className="flex items-baseline gap-3 px-4 py-3 hover:bg-soft">
                <span className={`size-2 shrink-0 rounded-full ${m.seen ? "bg-transparent" : "bg-accent"}`} title={m.seen ? "Lu" : "Non lu"} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${m.seen ? "text-muted" : "font-semibold text-text"}`}>{folder === "sent" ? `À : ${m.to}` : m.from}</span>
                  <span className={`block truncate text-sm ${m.seen ? "text-muted" : "text-text"}`}>{m.subject}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{fmtRelative(m.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
