import { clearAccountError, updateAccount } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { PageHeader, Pill, SetupNotice, isMissingTable } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NETWORKS, NETWORK_INFO } from "@/lib/networks";
import { createClient } from "@/lib/supabase/server";
import { facebookCheck, facebookConfigured, facebookSecretCheck } from "@/lib/facebook";
import { instagramCheck, instagramConfigured, instagramStatus } from "@/lib/instagram";
import { tiktokConfigured, tiktokStatus } from "@/lib/tiktok";
import type { Account } from "@/lib/types";

const TIKTOK_MSG: Record<string, string> = {
  ok: "✅ TikTok est connecté.",
  config: "Il manque TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET dans Vercel (puis Redeploy).",
  refus: "Connexion TikTok annulée.",
  etat: "La connexion a expiré, recommence.",
  erreur: "TikTok a refusé la connexion (vérifie l'adresse de redirection dans ton app TikTok).",
};

const INSTAGRAM_MSG: Record<string, string> = {
  ok: "✅ Instagram est connecté.",
  config: "Il manque INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET dans Vercel (puis Redeploy).",
  refus: "Connexion Instagram annulée.",
  etat: "La connexion a expiré, recommence.",
  erreur: "Instagram a refusé la connexion (compte pro ? testeur accepté dans l'app ? adresse de redirection ?).",
};

const FACEBOOK_MSG: Record<string, string> = {
  ok: "✅ Facebook est connecté (Page Verdana).",
  config: "Il manque FACEBOOK_APP_SECRET dans Vercel (puis Redeploy).",
  refus: "Connexion Facebook annulée.",
  etat: "La connexion a expiré, recommence.",
  erreur: "Facebook a refusé la connexion (as-tu bien coché la Page Verdana ? adresse de redirection dans l'app Meta ?).",
};

export default async function Comptes({ searchParams }: { searchParams: Promise<{ tiktok?: string; instagram?: string; facebook?: string; fbmsg?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("social_accounts").select("*");
  if (isMissingTable(error)) return <SetupNotice title="Comptes connectés" />;
  const accounts = (data ?? []) as Account[];
  const [tiktok, instagram] = await Promise.all([tiktokStatus(), instagramStatus()]);
  const [igCheck, fb, fbSecret] = await Promise.all([instagram.connected ? instagramCheck() : Promise.resolve(null), facebookCheck(), facebookSecretCheck()]);
  const n8nReady = { ia: !!process.env.ASSEMBLYAI_API_KEY || !!process.env.GEMINI_API_KEY || !!process.env.ANTHROPIC_API_KEY, publish: !!process.env.N8N_PUBLISH_WEBHOOK_URL };
  const iaName = process.env.ASSEMBLYAI_API_KEY ? `AssemblyAI · ${process.env.ASSEMBLYAI_MODEL || "claude-sonnet-5-5"}` : process.env.GEMINI_API_KEY ? "Gemini" : "Claude";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={<>Comptes <span className="text-warm">connectés</span></>}
        subtitle="Connexions directes et gratuites : n8n publie avec tes propres accès, sans service payant." />

      {sp.tiktok && TIKTOK_MSG[sp.tiktok] && <div className="card mb-4 p-3 text-sm">{TIKTOK_MSG[sp.tiktok]}</div>}
      {sp.instagram && INSTAGRAM_MSG[sp.instagram] && <div className="card mb-4 p-3 text-sm">{INSTAGRAM_MSG[sp.instagram]}</div>}
      {sp.facebook && FACEBOOK_MSG[sp.facebook] && <div className="card mb-4 p-3 text-sm">{FACEBOOK_MSG[sp.facebook]}{sp.fbmsg && <span className="mt-1 block text-xs text-muted">Détail : {sp.fbmsg}</span>}</div>}

      <section className="card mb-6 p-4 text-sm">
        <h2 className="mb-2 font-head text-xl font-extrabold uppercase">Moteur</h2>
        <ul className="space-y-1">
          <li>{n8nReady.ia ? "✅" : "❌"} Assistant ({iaName}) — <code>ASSEMBLYAI_API_KEY</code>, <code>GEMINI_API_KEY</code> ou <code>ANTHROPIC_API_KEY</code>{!n8nReady.ia && " : sans l'une d'elles, la conversation ne répond pas"}</li>
          <li>{n8nReady.publish ? "✅" : "⚪"} Publication (au clic et à l&apos;heure programmée) — <code>N8N_PUBLISH_WEBHOOK_URL</code>{!n8nReady.publish && " : sans elle, n8n ne passe que toutes les 2 h"}</li>
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {NETWORKS.map((n) => {
          const info = NETWORK_INFO[n];
          const row = accounts.find((x) => x.network === n);
          // réseau ajouté dans le code mais pas encore dans la base (migration à lancer plus tard) : on l'affiche quand même
          const pending = !row;
          const a: Account = row ?? { network: n, enabled: false, handle: null, profile_url: null, linkedin_mode: "personne", last_ok_at: null, last_error: null, last_error_at: null };
          const state = pending ? { t: "Prêt, base à mettre à jour", c: "bg-amber-500/15 text-amber-700 dark:text-amber-300" }
            : a.last_error ? { t: "Erreur", c: "bg-rose-500/15 text-rose-700 dark:text-rose-300" }
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

              {n === "instagram" && (
                <div className="mt-3 rounded-lg border border-border bg-soft p-3 text-sm">
                  {instagram.connected
                    ? igCheck?.username
                      ? <>✅ Instagram connecté : <strong>@{igCheck.username}</strong>{instagram.until && <> (jeton valable jusqu&apos;au {fmtDateTime(instagram.until)}, prolongé tout seul)</>}.</>
                      : <span className="text-rose-600 dark:text-rose-400">⚠️ Jeton Instagram refusé : {igCheck?.error}</span>
                    : instagramConfigured()
                      ? <a href="/api/oauth/instagram/start" className="btn-primary">Connecter Instagram</a>
                      : <>Colle le jeton généré dans l&apos;app Meta dans Vercel (<code>INSTAGRAM_ACCESS_TOKEN</code>), puis Redeploy.</>}
                </div>
              )}

              {n === "facebook" && (
                <div className="mt-3 rounded-lg border border-border bg-soft p-3 text-sm">
                  {fb.connected
                    ? fb.name
                      ? <>✅ Facebook connecté : Page <strong>{fb.name}</strong>. <a href="/api/oauth/facebook/start" className="text-accent underline">Reconnecter</a></>
                      : <span className="text-rose-600 dark:text-rose-400">⚠️ Jeton Facebook refusé : {fb.error} <a href="/api/oauth/facebook/start" className="underline">Reconnecter</a></span>
                    : facebookConfigured()
                      ? <>
                          <a href="/api/oauth/facebook/start" className="btn-primary">Connecter Facebook</a>
                          <span className={`mt-2 block text-xs ${fbSecret.ok ? "text-muted" : "text-rose-600 dark:text-rose-400"}`}>
                            {fbSecret.ok ? `✅ Clé secrète valide (${fbSecret.length} caractères).` : `⚠️ Clé secrète refusée par Facebook (${fbSecret.length} caractères, il en faut 32) : ${fbSecret.error}`}
                          </span>
                        </>
                      : <>Colle la clé secrète de l&apos;app Meta dans Vercel (<code>FACEBOOK_APP_SECRET</code>), puis Redeploy, pour activer le bouton « Connecter Facebook ».</>}
                </div>
              )}

              {pending ? (
                <p className="mt-3 rounded-lg border border-border bg-soft p-3 text-sm">
                  🛠️ {info.label} est prêt dans le Réseau et dans n8n, mais pas encore activé dans la base de données
                  (mise à jour <code>à faire</code>, à lancer quand tu le décides). En attendant, rien ne part sur {info.label}.
                </p>
              ) : (
              <form action={updateAccount} className="mt-3 space-y-2">
                <input type="hidden" name="network" value={n} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> Branché dans n8n (coché par défaut dans « Nouveau post »)</label>
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
                </div>
              </form>
              )}

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
