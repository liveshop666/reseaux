import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

/**
 * Boîte mail pro (OVH) lue et envoyée DIRECTEMENT par le Studio (IMAP + SMTP),
 * sans n8n : rien ne tourne tant que la page Mails n'est pas ouverte.
 * Variables Vercel : MAIL_PASSWORD (obligatoire), MAIL_USER (défaut contact@solvelab.fr),
 * MAIL_HOST (défaut ssl0.ovh.net), MAIL_FROM_NAME (défaut « Nolla – SolveLab »).
 */
const USER = () => (process.env.MAIL_USER ?? "contact@solvelab.fr").trim();
const HOST = () => (process.env.MAIL_HOST ?? "ssl0.ovh.net").trim();
const FROM_NAME = () => (process.env.MAIL_FROM_NAME ?? "Nolla – SolveLab").trim();

export const mailAddress = USER;
export function mailReady() {
  return !!process.env.MAIL_PASSWORD?.trim();
}

export type Folder = "inbox" | "sent" | "spam";
export const asFolder = (d: string | undefined): Folder => (d === "sent" ? "sent" : d === "spam" ? "spam" : "inbox");
/** « linkedin » = notifications de messages LinkedIn, « cal » = réservations Cal.com, « mail » = le reste. */
export type Kind = "mail" | "linkedin" | "cal";
export type MailSummary = { uid: number; from: string; to: string; subject: string; date: string | null; seen: boolean; kind: Kind; box: Folder };

/** Range un mail reçu selon son expéditeur (LinkedIn envoie ses notifications par mail, Cal.com aussi). */
export function classify(address: string | undefined, subject: string): Kind {
  const a = (address ?? "").toLowerCase();
  if (/@([a-z0-9-]+\.)*linkedin\.com$/.test(a)) {
    // on garde les vrais messages / demandes ; pas les newsletters « offres d'emploi », etc.
    return /message|inmail|invitation|connect|répond|replied|sent you|vous a envoy|accepted|accepté/i.test(subject + " " + a) || /^(messages|invitations|inmail)/.test(a) ? "linkedin" : "mail";
  }
  if (/@([a-z0-9-]+\.)*cal\.com$/.test(a)) return "cal";
  return "mail";
}

/** Lien LinkedIn (messagerie / invitation) trouvé dans le mail, pour répondre sur LinkedIn. */
export function linkedinLink(text: string, html: string | null): string | null {
  const src = `${text}\n${html ?? ""}`;
  const urls = [...src.matchAll(/https?:\/\/(?:[a-z0-9-]+\.)*linkedin\.com\/[^\s"'<>)\]]+/gi)].map((m) => m[0].replace(/&amp;/g, "&"));
  return urls.find((u) => /messaging|\/comm\/.*(message|thread)|inbox|mynetwork|invitation/i.test(u)) ?? urls.find((u) => !/unsubscribe|settings|help|legal/i.test(u)) ?? null;
}

/** Adresse du client qui a réservé (Cal.com) : première adresse du mail qui n'est ni la nôtre ni cal.com. */
export function bookingEmail(text: string, html: string | null): string | null {
  const mine = USER().toLowerCase();
  const all = `${text}\n${html ?? ""}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return all.map((x) => x.toLowerCase()).find((x) => x !== mine && !/@([a-z0-9-]+\.)*(cal\.com|solvelab\.fr|example\.com)$/.test(x) && !/no-?reply/.test(x)) ?? null;
}

let unreadCache: { at: number; v: Record<Kind, number> } | null = null;
/** Nombre de mails non lus par type (pour la pastille du menu) — mis en cache 60 s, jamais bloquant. */
export async function unreadCounts(): Promise<Record<Kind, number>> {
  const zero = { mail: 0, linkedin: 0, cal: 0 };
  if (!mailReady()) return zero;
  if (unreadCache && Date.now() - unreadCache.at < 60_000) return unreadCache.v;
  try {
    const v = { ...zero };
    for (const m of await listReceived(60)) if (!m.seen) v[m.kind]++;
    unreadCache = { at: Date.now(), v };
    return v;
  } catch {
    return unreadCache?.v ?? zero;
  }
}
export type MailFull = MailSummary & {
  fromAddress: string;
  replyTo: string;
  cc: string;
  messageId: string | null;
  references: string[];
  text: string;
  html: string | null;
  attachments: string[];
};

async function withImap<T>(fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: HOST(), port: 993, secure: true,
    auth: { user: USER(), pass: (process.env.MAIL_PASSWORD ?? "").trim() },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Chemin du dossier IMAP (Boîte de réception ou Envoyés, selon OVH). */
async function folderPath(c: ImapFlow, folder: Folder): Promise<string | null> {
  if (folder === "inbox") return "INBOX";
  const list = await c.list();
  if (folder === "spam") {
    const junk = list.find((b) => b.specialUse === "\\Junk")
      ?? list.find((b) => /^(inbox[./])?(spam|junk|ind[ée]sirable|courrier ind)/i.test(b.path));
    return junk?.path ?? null;
  }
  const sent = list.find((b) => b.specialUse === "\\Sent")
    ?? list.find((b) => /^(inbox[./])?(sent|envoy)/i.test(b.path));
  return sent?.path ?? null;
}

const addr = (a: { name?: string; address?: string }[] | undefined) =>
  (a ?? []).map((x) => x.name || x.address || "").filter(Boolean).join(", ");

export async function listMails(folder: Folder, limit = 40): Promise<MailSummary[]> {
  return withImap(async (c) => {
    const path = await folderPath(c, folder);
    if (!path) return [];
    const lock = await c.getMailboxLock(path);
    try {
      const total = typeof c.mailbox === "object" ? c.mailbox.exists : 0;
      if (!total) return [];
      const out: MailSummary[] = [];
      for await (const m of c.fetch(`${Math.max(1, total - limit + 1)}:*`, { uid: true, envelope: true, flags: true })) {
        const subject = m.envelope?.subject || "(sans objet)";
        out.push({
          uid: m.uid,
          from: addr(m.envelope?.from),
          to: addr(m.envelope?.to),
          subject,
          date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null,
          seen: m.flags?.has("\\Seen") ?? false,
          kind: folder === "sent" ? "mail" : classify(m.envelope?.from?.[0]?.address, subject),
          box: folder,
        });
      }
      // du plus récent au plus ancien (date du mail, pas l'ordre d'arrivée dans le dossier)
      return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.uid - a.uid);
    } finally {
      lock.release();
    }
  });
}

/**
 * Mails reçus : la boîte de réception + les mails LinkedIn / Cal.com tombés dans le spam
 * (OVH y range souvent les notifications LinkedIn). Le spam ordinaire reste caché.
 */
export async function listReceived(limit = 100): Promise<MailSummary[]> {
  const [inbox, spam] = await Promise.all([
    listMails("inbox", limit),
    listMails("spam", 60).catch(() => [] as MailSummary[]),
  ]);
  return [...inbox, ...spam.filter((m) => m.kind !== "mail")]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export async function getMail(folder: Folder, uid: number): Promise<MailFull | null> {
  return withImap(async (c) => {
    const path = await folderPath(c, folder);
    if (!path) return null;
    const lock = await c.getMailboxLock(path);
    try {
      const m = await c.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
      if (!m || !m.source) return null;
      const p = await simpleParser(m.source);
      if (!m.flags?.has("\\Seen")) await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
      const one = (v: typeof p.to) => (Array.isArray(v) ? v.map((x) => x.text).join(", ") : v?.text ?? "");
      const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
      return {
        uid,
        from: one(p.from),
        fromAddress: p.from?.value?.[0]?.address ?? "",
        replyTo: (Array.isArray(p.replyTo) ? p.replyTo[0] : p.replyTo)?.value?.[0]?.address ?? "",
        to: one(p.to),
        cc: one(p.cc),
        subject: p.subject || "(sans objet)",
        date: p.date ? p.date.toISOString() : null,
        seen: true,
        kind: folder === "sent" ? "mail" : classify(p.from?.value?.[0]?.address, p.subject || ""),
        box: folder,
        messageId: p.messageId ?? null,
        references: refs,
        text: p.text ?? "",
        html: typeof p.html === "string" ? p.html : null,
        attachments: (p.attachments ?? []).map((a) => a.filename || "pièce jointe"),
      };
    } finally {
      lock.release();
    }
  });
}

/** Met le mail à la corbeille de la boîte OVH (récupérable depuis la messagerie OVH). */
export async function trashMail(folder: Folder, uid: number) {
  await withImap(async (c) => {
    const path = await folderPath(c, folder);
    if (!path) throw new Error("Dossier introuvable.");
    const list = await c.list();
    const trash = list.find((b) => b.specialUse === "\\Trash")
      ?? list.find((b) => /^(inbox[./])?(trash|corbeille|deleted)/i.test(b.path));
    const lock = await c.getMailboxLock(path);
    try {
      if (trash && trash.path !== path) await c.messageMove(String(uid), trash.path, { uid: true });
      else await c.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function sendMail(m: { to: string; subject: string; text: string; inReplyTo?: string; references?: string[] }) {
  const transport = nodemailer.createTransport({
    host: HOST(), port: 465, secure: true,
    auth: { user: USER(), pass: (process.env.MAIL_PASSWORD ?? "").trim() },
  });
  const info = await transport.sendMail({
    from: { name: FROM_NAME(), address: USER() },
    to: m.to,
    subject: m.subject,
    text: m.text,
    inReplyTo: m.inReplyTo,
    references: m.references,
  });
  // copie dans « Envoyés » (OVH ne le fait pas tout seul en SMTP) — sans bloquer si ça rate
  try {
    const raw = await new Promise<Buffer>((resolve, reject) => {
      nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({
        from: { name: FROM_NAME(), address: USER() }, to: m.to, subject: m.subject, text: m.text,
        inReplyTo: m.inReplyTo, references: m.references, messageId: info.messageId, date: new Date(),
      }, (err, res) => (err ? reject(err) : resolve(res.message as Buffer)));
    });
    await withImap(async (c) => {
      const path = await folderPath(c, "sent");
      if (path) await c.append(path, raw, ["\\Seen"]);
    });
  } catch {
    /* la copie est un bonus : le mail est déjà parti */
  }
}
