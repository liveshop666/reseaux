import { NETWORK_INFO, STATUS_INFO, type Network } from "@/lib/networks";
import { POST_STATUS } from "@/lib/posts";
import type { PostStatus } from "@/lib/types";

export function PageHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-head text-4xl leading-none font-extrabold tracking-wide uppercase md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-head text-3xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Pill({ children, className = "bg-soft-2 text-muted", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}>{children}</span>;
}

export function NetworkPill({ network }: { network: Network }) {
  const n = NETWORK_INFO[network];
  return <Pill className={n.color}>{n.label}</Pill>;
}

export function TargetStatusPill({ status }: { status: string }) {
  const s = STATUS_INFO[status] ?? STATUS_INFO.annule;
  return <Pill className={s.color}>{s.emoji} {s.label}</Pill>;
}

export function PostStatusPill({ status }: { status: PostStatus }) {
  const s = POST_STATUS[status];
  return <Pill className={s.color}>{s.emoji} {s.label}</Pill>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

/** Affiché tant que le fichier SQL n'a pas été lancé dans Supabase. */
export function SetupNotice({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} />
      <div className="card p-5 text-sm">
        <p className="font-medium">Le Studio n&apos;est pas encore installé dans ta base de données.</p>
        <p className="mt-2 text-muted">
          Dans Supabase (projet <b>crm-prospection</b>) → <b>SQL Editor</b> → <b>New query</b>, colle le contenu du fichier{" "}
          <code>supabase/migrations/0001_studio_reseaux.sql</code> (dépôt GitHub reseaux) puis clique sur <b>Run</b>. Recharge ensuite cette page.
        </p>
      </div>
    </div>
  );
}

/** true si l'erreur Supabase signifie « table absente » (SQL pas encore lancé). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""));
}
