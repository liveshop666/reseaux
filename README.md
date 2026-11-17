# Studio Réseaux SolveLab

Une appli **à part du CRM**, uniquement pour mes réseaux sociaux : **YouTube · TikTok · Instagram · LinkedIn · fiche Google**.

Je parle à un assistant comme dans Claude Code (bouton **+** pour mes photos et vidéos, **micro** pour dicter, bouton envoyer), dans le design de solvelab.fr. Il écrit les textes pour chaque réseau, monte la vidéo, me montre un aperçu, me dit ce qu'il fait — et **ne publie qu'après mon « je valide »**. Dans l'onglet de chaque réseau, je retrouve ce qu'il a publié.

```
 Studio (Vercel)                                         n8n (mon compte)
┌───────────────────────────────────┐   « Publier »   ┌───────────────────────────┐
│ 💬 Conversation avec l'assistant   │ ──────────────▶ │ Studio Réseaux — Publier   │
│    (Claude : texte, aperçus, outils)│                 │ attend l'heure si programmé│
│ ▶️ 🎵 📸 💼 📍 un onglet par réseau │ ◀── GET /due ── │ YouTube · LinkedIn · TikTok│
│ 🗂️ Tout · 🔌 Comptes                │ ◀── PATCH ───── │ Instagram · fiche Google   │
└───────────────┬───────────────────┘   (x-api-key)   └───────────────────────────┘
                │ Supabase : même projet que le CRM (tables social_*, bucket reseaux-medias)
```

## Comment ça se passe

1. J'écris (ou je dicte) : « Fais un post sur le site du boulanger, pour LinkedIn et Instagram » + je joins des photos.
2. L'assistant regarde les photos, écrit un texte par réseau et affiche un **brouillon avec aperçu** (coupure « voir plus », compteur de caractères, limites du réseau).
3. Je corrige en discutant (« plus court », « ajoute un emoji ») ou je clique **✅ Je valide** / j'écris « je valide, publie sur YouTube ».
4. Il lance la publication (tout de suite ou à la date demandée) et me le dit. Le statut et le lien arrivent dans l'onglet du réseau.
5. « Fais-moi une vidéo avec ces photos » : il monte une vidéo verticale 9:16 (textes à l'écran, fondus, carte finale) **dans mon navigateur** (gratuit), puis me la propose.

## Garde-fous (« pas autonome »)

- La seule façon de publier est l'outil `publier`, que l'assistant n'a le droit d'utiliser que sur un **brouillon déjà affiché**, et **seulement si un message de ma part est arrivé après** : le serveur refuse sinon (même si l'IA se trompe).
- Un brouillon ne se publie qu'une fois. Chaque réseau a ses règles (vidéo obligatoire pour YouTube/TikTok, longueur…) vérifiées côté serveur.
- n8n ne fait que **demander ce qui est dû** (`GET /api/n8n/due`) ; chaque ligne passe aussitôt en « en cours » et ne part jamais deux fois.
- Accès protégé par `ALLOWED_EMAILS` (même compte que le CRM). La clé `service_role`, la clé Claude et le jeton TikTok restent côté serveur.

## Pages

| Page | Contenu |
|---|---|
| `/` | la conversation (bouton « Nouvelle conversation » dans le menu) |
| `/reseau/youtube` · `tiktok` · `instagram` · `linkedin` · `google` | tout ce qui a été publié / programmé / en erreur pour ce réseau, avec miniature, lien, Relancer, Annuler |
| `/historique` | « Tout » : chaque post réseau par réseau, filtres statut / réseau |
| `/comptes` | état de chaque réseau, limites connues, étapes pour le brancher, LinkedIn en mon nom ou au nom de la page, bouton « Connecter TikTok » |

## Installation

1. **Supabase** (projet `crm-prospection`) → *SQL Editor* → lancer [`0001_studio_reseaux.sql`](supabase/migrations/0001_studio_reseaux.sql) puis [`0002_assistant.sql`](supabase/migrations/0002_assistant.sql). Tables `social_*` + bucket public `reseaux-medias`. Rien ne touche au CRM.
2. **Vercel** → importer `liveshop666/reseaux` → variables de [`.env.example`](.env.example) :
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAILS`, `NEXT_PUBLIC_APP_URL`
   - `STUDIO_API_KEY` (clé partagée avec n8n)
   - **`ANTHROPIC_API_KEY`** : clé API Claude (console.anthropic.com), c'est le cerveau de l'assistant
3. **n8n** : importer [`n8n/studio-publier.json`](n8n/README.md), choisir les identifiants, remplir « Mes paramètres », publier, puis coller l'adresse du webhook dans Vercel (`N8N_PUBLISH_WEBHOOK_URL`) → *Redeploy*.
4. **Comptes** : brancher les réseaux un par un (`/comptes`, « Comment le brancher »). On peut commencer avec un seul.

## Coûts

- **Gratuit** : hébergement Vercel/Supabase (offres gratuites), montage vidéo (dans le navigateur), dictée vocale (navigateur), connexions directes aux réseaux, n8n.
- **Payant à l'usage** : l'assistant (API Claude). Comptez quelques centimes par conversation ; les images jointes pèsent un peu plus.

## Limites connues

| Réseau | Accepte | Limite |
|---|---|---|
| YouTube | vidéo (obligatoire) | vidéos en **privé** tant que Google n'a pas audité le projet API |
| LinkedIn | texte, photo | **pas de vidéo** avec le module n8n (le texte part seul) ; **page SolveLab** seulement après validation de LinkedIn |
| TikTok | vidéo (obligatoire) | **privé** tant que l'app TikTok n'est pas auditée |
| Instagram | photo ou vidéo (obligatoire) | compte **professionnel** relié à la page Facebook + app Meta |
| Fiche Google | texte, photo | Google doit **valider l'accès** à l'API ; pas de vidéo, pas de numéro de téléphone dans le texte |

Médias : JPG, PNG, WEBP, MP4, MOV, **50 Mo max**. Le montage vidéo demande un navigateur qui enregistre en MP4 (Chrome / Edge récents, Safari) ; il est **muet** pour l'instant (pas de musique).

## Décisions

- **LinkedIn** : en mon nom par défaut ; bascule « page SolveLab » dans `/comptes` quand LinkedIn aura validé.
- **Telegram** : non repris (le Studio s'installe sur le téléphone, avec aperçus).
- **Quota n8n** : réveil au clic, attente de l'heure pour les posts programmés, filet de sécurité toutes les 2 h.

## Stack

Next.js 15 (App Router, TypeScript, Tailwind 4) · Supabase (Postgres, Auth, Storage) · Claude (API Anthropic, flux en direct, outils) · n8n.
