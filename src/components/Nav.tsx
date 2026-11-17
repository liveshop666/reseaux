"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { Brand } from "@/components/Brand";

const LINKS = [
  { href: "/", label: "Accueil", icon: "🏠" },
  { href: "/nouveau", label: "Nouveau post", icon: "✍️" },
  { href: "/historique", label: "Historique", icon: "🗂️" },
  { href: "/comptes", label: "Comptes", icon: "🔌" },
];

export function Nav({ scheduled, errors }: { scheduled: number; errors: number }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const badge = (href: string) => (href === "/historique" ? errors : 0);

  return (
    <>
      {/* Ordinateur */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/70 p-4 backdrop-blur md:flex">
        <div className="mb-6 px-1"><Brand /></div>
        <Link href="/nouveau" className="btn-primary mb-4 w-full">✍️ Écrire un post</Link>
        <nav className="flex flex-col gap-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active(l.href) ? "bg-accent/15 font-semibold text-text shadow-[inset_3px_0_0_var(--accent)]" : "text-muted hover:bg-soft hover:text-text"}`}>
              <span>{l.icon}</span>{l.label}
              {badge(l.href) > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-xs text-white" title="Publications en erreur">{badge(l.href)}</span>}
            </Link>
          ))}
        </nav>
        {scheduled > 0 && <p className="mt-4 px-3 text-xs text-muted">⏰ {scheduled} publication{scheduled > 1 ? "s" : ""} programmée{scheduled > 1 ? "s" : ""}</p>}
        <form action={signOut} className="mt-auto pt-4"><button className="btn-ghost w-full">Se déconnecter</button></form>
      </aside>

      {/* Téléphone */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`relative flex flex-col items-center py-2 text-[11px] ${active(l.href) ? "font-semibold text-accent" : "text-muted"}`}>
            <span className="text-lg">{l.icon}</span>{l.label}
            {badge(l.href) > 0 && <span className="absolute top-1 right-[30%] size-2 rounded-full bg-rose-500" />}
          </Link>
        ))}
      </nav>
    </>
  );
}
