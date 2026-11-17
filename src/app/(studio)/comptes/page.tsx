import { clearAccountError, updateAccount } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { PageHeader, Pill, SetupNotice, isMissingTable } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NETWORKS, NETWORK_INFO } from "@/lib/networks";
import { createClient } from "@/lib/supabase/server";
import { tiktokConfigured, tiktokStatus } from "@/lib/tiktok";
import type { Account } from "@/lib/types";

const TIKTOK_MSG: Record<string, string> = {
  ok: "✅ TikTok est connecté.",
  config: "Il manque TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET dans Vercel (puis Redeploy).",
  refus: "Connexion TikTok annulée.",
  etat: "La connexion a expiré, recommence.",
  erreur: "TikTok a refusé la connexion (vérifie l'adresse de redirection dans ton app TikTok).",
};

export default async function Comptes({ searchParams }: { searchParams: Promise<{ tiktok?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("social_accounts").select("*");
  if (isMissingTable(error)) return <SetupNotice title="Comptes connectés" />;
  const accounts = (data ?? []) as Account[];
  const tiktok = await tiktokStatus();
  const n8nReady = { adapt: !!process.env.N8N_ADAPT_WEBHOOK_URL, publish: !!process.env.N8N_PUBLISH_WEBHOOK_URL };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={<>Comptes <span className="text-warm">connectés</span></>}
        subtitle="Connexions directes et gratuites : n8n publie avec tes propres accès, sans service payant." />

      {sp.tiktok && TIKTOK_MSG[sp.tiktok] && <div className="card mb-4 p-3 text-sm">{TIKTOK_MSG[sp.tiktok]}</div>}

      <section className="card mb-6 p-4 text-sm">
        <h2 className="mb-2 font-head text-xl font-extrabold uppercase">Moteur n8n</h2>
        <ul className="space-y-1">
          <li>{n8nReady.adapt ? "✅" : "⚪"} IA (Gemini) pour adapter les textes — <code>N8N_ADAPT_WEBHOOK_URL</code>{!n8nReady.adapt && " : sans elle, ton texte est repris tel quel"}</li>
          <li>{n8nReady.publish ? "✅" : "⚪"} Publication (au clic et à l&apos;heure programmée) — <code>N8N_PUBLISH_WEBHOOK_URL</code>{!n8nReady.publish && " : sans elle, n8n ne passe que toutes les 2 h"}</li>
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {NETWORKS.map((n) => {
          const info = NETWORK_INFO[n];
          const a = accounts.find((x) => x.network === n);
          if (!a) return null;
          const state = a.last_error ? { t: "Erreur", c: "bg-rose-500/15 text-rose-700 dark:text-rose-300" }
            : a.enabled && a.last_ok_at ? { t: "Fonctionne", c: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" }
            : a.enabled ? { t: "Branché, pas encore testé", c: "bg-amber-500/15 text-amber-700 dark:text-amber-300" }
            : { t: "Pas branché", c: "bg-soft-2 text-muted" };
          return (
            <section key={n} className="card p-4">
              <div className="flex items-center gap-2">
                <h2 className="font-head text-2xl font-extrabold uppercase">{info.label}</h2>
                <Pill className={state.c}>{state.t}</Pill>
              </div>
              {a.last_ok_at && <p className="mt-1 text-xs text-muted">Dernière publication réussie : {fmtRelative(a.last_ok_at)}</p>}
              {a.last_error && (
                <div className="mt-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300">
                  {a.last_error} <span className="opacity-70">({fmtDateTime(a.last_error_at)})</span>
                  <div className="mt-1"><ActionButton action={clearAccountError.bind(null, n)} label="Effacer l'alerte" /></div>
                </div>
              )}
              <p className="mt-2 text-xs text-muted">⚠️ {info.limit}</p>

              {n === "tiktok" && (
                <div className="mt-3 rounded-lg border border-border bg-soft p-3 text-sm">
                  {tiktok.connected
                    ? <>✅ Jeton TikTok enregistré{tiktok.refreshUntil && <> (valable jusqu&apos;au {fmtDateTime(tiktok.refreshUntil)})</>}. <a href="/api/oauth/tiktok/start" className="text-accent underline">Reconnecter</a></>
                    : tiktokConfigured()
                      ? <a href="/api/oauth/tiktok/start" className="btn-primary">Connecter TikTok</a>
                      : <>Ajoute <code>TIKTOK_CLIENT_KEY</code> et <code>TIKTOK_CLIENT_SECRET</code> dans Vercel pour activer le bouton « Connecter TikTok ».</>}
                </div>
              )}

              <form action={updateAccount} className="mt-3 space-y-2">
                <input type="hidden" name="network" value={n} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> Branché dans n8n (coché par défaut dans « Nouveau post »)</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block"><span className="label">Nom affiché dans l&apos;aperçu</span><input name="handle" defaultValue={a.handle ?? ""} className="input" placeholder={n === "instagram" || n === "tiktok" ? "solvelab" : "SolveLab"} /></label>
                  <label className="block"><span className="label">Lien du profil</span><input name="profile_url" defaultValue={a.profile_url ?? ""} className="input" placeholder="https://…" /></label>
                </div>
                {n === "linkedin" && (
                  <fieldset className="text-sm">
                    <span className="label">Publier…</span>
                    <label className="mr-4 inline-flex items-center gap-1.5"><input type="radio" name="linkedin_mode" value="personne" defaultChecked={a.linkedin_mode !== "page"} /> en mon nom</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name="linkedin_mode" value="page" defaultChecked={a.linkedin_mode === "page"} /> au nom de la page SolveLab</label>
                    <p className="mt-1 text-xs text-muted">« Page » ne marche qu&apos;une fois l&apos;accès Community Management validé par LinkedIn.</p>
                  </fieldset>
                )}
                <div className="flex items-center gap-2">
                  <button className="btn-ghost">Enregistrer</button>
                  {a.profile_url && <a href={a.profile_url} target="_blank" rel="noreferrer" className="text-sm text-accent">Ouvrir le profil ↗</a>}
                </div>
              </form>

              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted">Comment le brancher</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">{info.setup.map((s) => <li key={s}>{s}</li>)}</ol>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
