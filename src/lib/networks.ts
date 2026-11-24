export const NETWORKS = ["youtube", "linkedin", "tiktok", "instagram", "google"] as const;
export type Network = (typeof NETWORKS)[number];
export type MediaType = "image" | "video" | null;

export type NetworkInfo = {
  id: Network;
  label: string;
  short: string;
  /** couleur de la pastille (classes Tailwind) */
  color: string;
  /** limite de caractères du texte */
  max: number;
  /** limite du titre (YouTube) */
  titleMax?: number;
  /** ce que le réseau accepte */
  accepts: { text: boolean; image: boolean; video: boolean };
  /** obligatoire pour publier */
  needs?: "video" | "media";
  /** contrainte connue, affichée dans l'aperçu et la page Comptes */
  limit: string;
  /** étapes pour brancher le compte (page Comptes) */
  setup: string[];
};

export const NETWORK_INFO: Record<Network, NetworkInfo> = {
  youtube: {
    id: "youtube", label: "YouTube", short: "YT", color: "bg-red-500/15 text-red-600 dark:text-red-300",
    max: 5000, titleMax: 100,
    accepts: { text: false, image: false, video: true }, needs: "video",
    limit: "Vidéo obligatoire (format vertical de moins de 3 min = Short). Tant que Google n'a pas audité ton projet API, les vidéos envoyées par l'API restent en privé.",
    setup: [
      "Google Cloud Console : projet gratuit → activer « YouTube Data API v3 » → identifiants OAuth (application Web).",
      "Adresse de redirection : celle indiquée par n8n dans l'identifiant « YouTube OAuth2 API ».",
      "Dans n8n : créer l'identifiant YouTube OAuth2 API, se connecter avec le compte de la chaîne SolveLab.",
      "Demander l'audit (formulaire « YouTube API Services – Audit ») pour publier en public directement.",
    ],
  },
  linkedin: {
    id: "linkedin", label: "LinkedIn", short: "in", color: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    max: 3000,
    accepts: { text: true, image: true, video: false },
    limit: "Le module LinkedIn de n8n gère le texte et les images, pas les vidéos : avec une vidéo, seul le texte part. Au nom de la page SolveLab : il faut que LinkedIn valide l'accès « Community Management API ».",
    setup: [
      "linkedin.com/developers : créer une app (rattachée à la page SolveLab), ajouter le produit « Share on LinkedIn » (immédiat).",
      "Pour la page : ajouter « Community Management API » et attendre la validation de LinkedIn.",
      "Dans n8n : identifiant « LinkedIn OAuth2 API » (en ton nom) ou « LinkedIn Community Management OAuth2 API » (page).",
      "Choisir ci-dessous : publier en ton nom ou au nom de la page.",
    ],
  },
  tiktok: {
    id: "tiktok", label: "TikTok", short: "TT", color: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    max: 2200,
    accepts: { text: false, image: false, video: true }, needs: "video",
    limit: "Vidéo obligatoire. Tant que ton app TikTok n'est pas validée (audit), les vidéos sont publiées en privé (visibles par toi seul) : tu les passes en public depuis l'appli TikTok.",
    setup: [
      "developers.tiktok.com : créer une app, ajouter « Login Kit » et « Content Posting API » (Direct Post).",
      "Adresse de redirection : <adresse du Studio>/api/oauth/tiktok/callback.",
      "Copier Client key et Client secret dans Vercel (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET), puis bouton « Connecter TikTok » ci-dessous.",
      "Demander l'audit de l'app pour publier en public.",
    ],
  },
  instagram: {
    id: "instagram", label: "Instagram", short: "IG", color: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
    max: 2200,
    accepts: { text: false, image: true, video: true }, needs: "media",
    limit: "Photo ou vidéo obligatoire (vidéo = Reel). Compte Instagram professionnel (Créateur ou Entreprise).",
    setup: [
      "Compte Instagram en « professionnel » (Créateur ou Entreprise).",
      "developers.facebook.com : app « Studio SolveLab », cas d'utilisation « API Instagram » ; ajouter le compte Instagram comme testeur.",
      "Dans l'app : « Générez des tokens d'accès » → « Générer un token » pour le compte.",
      "Coller ce jeton dans Vercel (INSTAGRAM_ACCESS_TOKEN), puis Redeploy. Il est prolongé tout seul ensuite.",
    ],
  },
  google: {
    id: "google", label: "Fiche Google", short: "G", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    max: 1500,
    accepts: { text: true, image: true, video: false },
    limit: "Texte + photo (pas de vidéo : avec une vidéo, seul le texte part). Google doit d'abord valider ton accès à l'API Business Profile (formulaire, quelques jours).",
    setup: [
      "Google Cloud : demander l'accès « Google Business Profile API » (formulaire de demande d'accès).",
      "Une fois accepté : activer « My Business Account Management » et « My Business Business Information ».",
      "Dans n8n : identifiant « Google Business Profile OAuth2 API ».",
      "Mettre accounts/… et locations/… dans « Mes paramètres » du workflow Publier.",
    ],
  },
};

export const STATUS_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  a_publier: { label: "Programmé", emoji: "⏰", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  en_cours: { label: "En cours", emoji: "⏳", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  publie: { label: "Publié", emoji: "✅", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  erreur: { label: "Erreur", emoji: "❌", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  annule: { label: "Annulé", emoji: "🚫", color: "bg-soft-2 text-muted" },
};

/** Pourquoi ce réseau ne peut pas recevoir ce post (null = OK). */
export function blockReason(n: Network, media: MediaType): string | null {
  const info = NETWORK_INFO[n];
  if (info.needs === "video" && media !== "video") return `${info.label} demande une vidéo.`;
  if (info.needs === "media" && !media) return `${info.label} demande une photo ou une vidéo.`;
  return null;
}

/** Avertissement (le post part quand même, mais pas en entier). */
export function mediaWarning(n: Network, media: MediaType): string | null {
  if (media === "video" && !NETWORK_INFO[n].accepts.video) return "La vidéo ne passe pas : seul le texte sera publié.";
  return null;
}

export function isNetwork(v: unknown): v is Network {
  return typeof v === "string" && (NETWORKS as readonly string[]).includes(v);
}
