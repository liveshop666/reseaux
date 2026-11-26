import Link from "next/link";
import { trashMailAction } from "@/app/mail-actions";
import { ActionButton } from "@/components/ActionButton";
import { Empty, PageHeader } from "@/components/ui";
import { errorMessage, fmtRelative } from "@/lib/format";
import { listMails, listReceived, mailAddress, mailReady, type Folder, type MailSummary } from "@/lib/mail";

export const dynamic = "force-dynamic";

type SP = Promise<{ d?: string; ok?: string }>;

export default async function Mails({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const folder: Folder = sp.d === "sent" ? "sent" : "inbox";

  let mails: MailSummary[] = [];
  let error: string | null = null;
  if (mailReady()) {
    try { mails = folder === "inbox" ? await listReceived(100) : await listMails(folder, 40); } catch (e) { error = errorMessage(e); }
  }
  const linkedin = mails.filter((m) => m.kind === "linkedin");
  const cal = mails.filter((m) => m.kind === "cal");
  const normal = folder === "inbox" ? mails.filter((m) => m.kind === "mail") : mails;

  const list = (items: MailSummary[]) => (
    <ul className="card divide-y divide-border">
      {items.map((m) => (
        <li key={`${m.box}-${m.uid}`} className="group flex items-center hover:bg-soft">
          <Link href={`/mails/${m.uid}${m.box !== "inbox" ? `?d=${m.box}` : ""}`} className="flex min-w-0 flex-1 items-baseline gap-3 px-4 py-3">
            <span className={`size-2 shrink-0 rounded-full ${m.seen ? "bg-transparent" : "bg-accent"}`} title={m.seen ? "Lu" : "Non lu"} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${m.seen ? "text-muted" : "font-semibold text-text"}`}>{folder === "sent" ? `À : ${m.to}` : m.from}</span>
              <span className={`block truncate text-sm ${m.seen ? "text-muted" : "text-text"}`}>{m.subject}</span>
            </span>
            <span className="shrink-0 text-xs text-muted">{fmtRelative(m.date)}</span>
          </Link>
          <ActionButton action={trashMailAction.bind(null, m.box, m.uid, false)} label="🗑" pending="…"
            confirmText={`Mettre « ${m.subject} » à la corbeille ? (aussi dans ta boîte OVH)`}
            className="mr-2 shrink-0 rounded px-2 py-1 text-sm text-muted md:opacity-0 md:group-hover:opacity-100 hover:text-rose-600 focus:opacity-100" />
        </li>
      ))}
    </ul>
  );
  const section = (title: string, items: MailSummary[], hint: string) => {
    if (folder !== "inbox") return null;
    const unread = items.filter((m) => !m.seen).length;
    return (
      <section className="mt-8">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">{title}
          {unread > 0 && <span className="rounded-full bg-rose-500 px-2 text-xs text-white">{unread} nouveau{unread > 1 ? "x" : ""}</span>}
        </h2>
        {items.length ? list(items) : <div className="card"><Empty>{hint}</Empty></div>}
      </section>
    );
  };

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
      ) : (
        <>
          {normal.length ? list(normal) : <div className="card"><Empty>Aucun mail ici.</Empty></div>}
          {section("💼 Messages LinkedIn", linkedin, "Aucun message LinkedIn reçu.")}
          {section("📅 Réservations Cal.com", cal, "Aucune réservation reçue.")}
        </>
      )}
    </div>
  );
}
