"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { deleteConversation, signOut } from "@/app/actions";
import { Brand } from "@/components/Brand";
import type { ConversationItem } from "@/lib/conversations";

const MAIN = [{ href: "/", label: "Studio", icon: "💬" }];
const NETWORKS = [
  { href: "/reseau/youtube", label: "YouTube", icon: "▶️" },
  { href: "/reseau/tiktok", label: "TikTok", icon: "🎵" },
  { href: "/reseau/linkedin", label: "LinkedIn", icon: "💼" },
  { href: "/reseau/google", label: "Fiche Google", icon: "📍" },
];
const MORE = [
  { href: "/historique", label: "Tout", icon: "🗂️" },
  { href: "/comptes", label: "Comptes", icon: "🔌" },
];
const ALL = [...MAIN, ...NETWORKS, ...MORE];

/** Liste des conversations (comme l'historique de Claude), avec suppression. */
function Conversations({ items }: { items: ConversationItem[] }) {
  const path = usePathname();
  const current = useSearchParams().get("c");
  const router = useRouter();
  const [busy, start] = useTransition();
  if (!items.length) return null;
  return (
    <div className="mt-4 flex min-h-0 flex-col">
      <div className="px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">Conversations</div>
      <ul className="mt-1 flex flex-col gap-0.5 overflow-y-auto">
        {items.map((c) => {
          const on = path === "/" && current === c.id;
          return (
            <li key={c.id} className={`group flex items-center rounded-lg ${on ? "bg-accent/15" : "hover:bg-soft"}`}>
              <Link href={`/?c=${c.id}`} title={c.title} className={`min-w-0 flex-1 truncate px-3 py-1.5 text-sm ${on ? "font-semibold text-text" : "text-muted hover:text-text"}`}>{c.title}</Link>
              <button type="button" disabled={busy} title="Supprimer la conversation" aria-label={`Supprimer « ${c.title} »`}
                className="mr-1 shrink-0 rounded px-1.5 py-1 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-rose-600 focus:opacity-100"
                onClick={() => {
                  if (!confirm(`Supprimer la conversation « ${c.title} » ? Les publications déjà faites restent.`)) return;
                  start(async () => {
                    const r = await deleteConversation(c.id);
                    if (r.error) alert(r.error);
                    else if (on) router.push("/?c=new");
                  });
                }}>🗑</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Nav({ scheduled, errors, conversations }: { scheduled: number; errors: number; conversations: ConversationItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const link = (l: { href: string; label: string; icon: string }) => (
    <Link key={l.href} href={l.href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active(l.href) ? "bg-accent/15 font-semibold text-text shadow-[inset_3px_0_0_var(--accent)]" : "text-muted hover:bg-soft hover:text-text"}`}>
      <span>{l.icon}</span>{l.label}
      {l.href === "/historique" && errors > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-xs text-white" title="Publications en erreur">{errors}</span>}
    </Link>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/70 p-4 backdrop-blur md:flex">
        <div className="mb-6 px-1"><Brand /></div>
        <Link href="/?c=new" className="btn-primary mb-4 w-full">＋ Nouvelle conversation</Link>
        <nav className="flex flex-col gap-1">
          {MAIN.map(link)}
          <div className="mt-3 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">Mes réseaux</div>
          {NETWORKS.map(link)}
          <div className="mt-3 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">Suivi</div>
          {MORE.map(link)}
        </nav>
        <Conversations items={conversations} />
        {scheduled > 0 && <p className="mt-4 px-3 text-xs text-muted">⏰ {scheduled} publication{scheduled > 1 ? "s" : ""} programmée{scheduled > 1 ? "s" : ""}</p>}
        <form action={signOut} className="mt-auto pt-4"><button className="btn-ghost w-full">Se déconnecter</button></form>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {ALL.map((l) => (
          <Link key={l.href} href={l.href} className={`relative flex min-w-[4.5rem] flex-1 flex-col items-center py-2 text-[10px] ${active(l.href) ? "font-semibold text-accent" : "text-muted"}`}>
            <span className="text-lg">{l.icon}</span>{l.label}
            {l.href === "/historique" && errors > 0 && <span className="absolute top-1 right-[28%] size-2 rounded-full bg-rose-500" />}
          </Link>
        ))}
      </nav>
    </>
  );
}
