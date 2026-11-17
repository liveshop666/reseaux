# Studio Réseaux SolveLab

Mon appli **pour mes réseaux sociaux uniquement**, séparée du CRM : j'écris un post une fois, je coche les réseaux, l'IA adapte le texte à chacun, je vois l'aperçu, et **rien ne part avant mon clic sur « Publier »** (ou la date que j'ai programmée).

Réseaux : **YouTube · LinkedIn · TikTok · Instagram · fiche Google**. 100 % gratuit : connexions directes aux API des réseaux, publication par mes workflows n8n, IA = mon identifiant Gemini déjà présent dans n8n.

```
   Studio (cette appli, Vercel)                        n8n (mon compte)
 ┌──────────────────────────────┐   « Adapter »    ┌──────────────────────────────┐
 │ ✍️ Nouveau post               │ ───────────────▶ │ 1. Adapter le texte (Gemini)  │
 │  texte + photo/vidéo          │ ◀─────────────── │    répond tout de suite       │
 │  aperçu par réseau            │                  └──────────────────────────────┘
 │  [Publier] / [Programmer]     │   « Publier »    ┌──────────────────────────────┐
 │                               │ ───────────────▶ │ 2. Publier                    │
 │ 🗂️ Historique (statut + lien) │                  │  attend l'heure si programmé  │
 │ 🔌 Comptes connectés          │ ◀── GET /due ─── │  YouTube · LinkedIn · TikTok  │
 │ 🏠 Accueil (chiffres)         │ ◀── PATCH ────── │  Instagram · fiche Google     │
 └──────────────┬───────────────┘   (x-api-key)    └──────────────────────────────┘
                │ Supabase : même projet que le CRM (tables social_*, bucket reseaux-medias)
```

## Pages

| Page | Contenu |
|---|---|
| `/` Accueil | publiés ce mois, programmés, erreurs, taux de réussite, barres par réseau, à venir, dernières publications |
| `/nouveau` | texte + photo/vidéo (envoi direct vers Supabase Storage, 50 Mo max) + réseaux à cocher → **Adapter avec l'IA** → texte modifiable et **aperçu par réseau** (coupure « voir plus », compteur, limites) → **Publier** ou **Programmer** |
| `/historique` | chaque post, réseau par réseau : statut, lien vers la publication, erreur lisible ; **Relancer**, **Annuler**, **Publier maintenant**, **Supprimer** ; filtres statut / réseau |
| `/comptes` | état de chaque réseau (fonctionne / erreur / pas branché), dernière réussite, limites connues, étapes pour le brancher, nom affiché, **LinkedIn : en mon nom ou au nom de la page**, bouton **Connecter TikTok** |

Même style nuit SolveLab que le CRM (bouton Clair / Nuit), installable sur le téléphone (« Ajouter à l'écran d'accueil ») : c'est ce qui remplace Telegram pour publier depuis le téléphone.

## Sécurité — « pas autonome »

- Rien n'est publié sans une ligne `social_targets` en `a_publier`, et seules les actions du Studio (connecté, email dans `ALLOWED_EMAILS`) en créent : clic **Publier**, **Programmer**, **Relancer**.
- n8n ne fait que **demander ce qui est dû** (`GET /api/n8n/due`) : chaque ligne renvoyée passe aussitôt en `en_cours`, elle ne peut pas partir deux fois. Bloquée plus de 30 min → `erreur` (relançable à la main).
- n8n s'authentifie avec `STUDIO_API_KEY` (header `x-api-key`) ; la clé `service_role` et le jeton TikTok restent côté serveur.

## Ce qui appelle le Studio

| Qui | Route | Rôle |
|---|---|---|
| n8n « 2. Publier » | `GET /api/n8n/due?limit=10` | ce qui doit partir maintenant (réservé d'office) |
| n8n « 2. Publier » | `PATCH /api/n8n/targets/:id` | `{ status: "publie", url, external_id, is_private }` ou `{ status: "erreur", error }` |
| n8n « 2. Publier » | `GET /api/n8n/tiktok-token` | jeton TikTok valide (rafraîchi automatiquement) |
| Le Studio → n8n | `N8N_ADAPT_WEBHOOK_URL`, `N8N_PUBLISH_WEBHOOK_URL` | header `x-api-key` envoyé par le Studio |

Détail des workflows : [`n8n/README.md`](n8n/README.md).

## Installation (≈ 20 min)

1. **Supabase** (projet `crm-prospection`, le même que le CRM) → *SQL Editor* → coller [`supabase/migrations/0001_studio_reseaux.sql`](supabase/migrations/0001_studio_reseaux.sql) → *Run*. Crée les tables `social_*` et le bucket public `reseaux-medias`. Rien ne touche aux tables du CRM.
2. **Vercel** → *Add New → Project → Import* `liveshop666/reseaux` → variables de [`.env.example`](.env.example) :
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAILS` : **mêmes valeurs que le CRM** (même connexion, même mot de passe)
   - `STUDIO_API_KEY` : même valeur que `CRM_API_KEY` si tu veux réutiliser l'identifiant n8n « CRM x-api-key »
   - `NEXT_PUBLIC_APP_URL` : l'adresse Vercel du Studio
   - *Deploy*
3. **n8n** : importer les 2 workflows de [`n8n/`](n8n/README.md), choisir les identifiants, remplir « Mes paramètres », publier, puis coller les 2 *Production URL* dans Vercel (`N8N_ADAPT_WEBHOOK_URL`, `N8N_PUBLISH_WEBHOOK_URL`) → *Redeploy*.
4. **Comptes** : brancher les réseaux un par un (page `/comptes`, section « Comment le brancher »). On peut commencer avec un seul : les autres restent décochés.

En local :
```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev                  # http://localhost:3000
```

## Limites connues (affichées dans l'appli)

| Réseau | Accepte | Limite |
|---|---|---|
| YouTube | vidéo (obligatoire) | vidéos en **privé** tant que Google n'a pas audité le projet API (règle YouTube depuis 2020) |
| LinkedIn | texte, photo | **pas de vidéo** avec le module n8n (le texte part seul) ; **page SolveLab** seulement après validation de LinkedIn (Community Management API) |
| TikTok | vidéo (obligatoire) | **privé** tant que l'app TikTok n'est pas auditée ; jeton géré par le Studio (bouton « Connecter TikTok ») |
| Instagram | photo ou vidéo (obligatoire) | compte **professionnel** relié à la page Facebook + app Meta ; vidéo publiée en Reel |
| Fiche Google | texte, photo | Google doit **valider l'accès** à l'API Business Profile ; pas de vidéo, pas de numéro de téléphone dans le texte |

Médias : JPG, PNG, WEBP, MP4, MOV, **50 Mo max** (limite gratuite de Supabase Storage).

## Décisions

- **LinkedIn** : par défaut **en mon nom** (marche tout de suite avec « Share on LinkedIn »). Quand LinkedIn aura validé la page, je bascule sur « au nom de la page SolveLab » dans `/comptes` — aucun code à changer (voir `n8n/README.md`).
- **Telegram** : **pas repris**. Le Studio s'installe sur le téléphone comme une appli et donne l'aperçu par réseau, ce que Telegram ne permet pas ; ça évite un 2e chemin de publication à surveiller. Le modèle `reseaux-sociaux-auto-modele` reste disponible si je veux le rebrancher plus tard.
- **Quota n8n** : pas de passage toutes les 5 minutes. Le Studio réveille n8n au clic ; pour un post programmé, n8n **attend l'heure prévue** (1 exécution par post) ; un filet de sécurité passe toutes les 2 h (7h-23h).

## Stack

Next.js 15 (App Router, TypeScript, Tailwind 4) sur Vercel · Supabase (Postgres, Auth, Storage) · n8n · Gemini (gratuit).
