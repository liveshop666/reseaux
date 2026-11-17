# Studio Réseaux SolveLab

> À copier dans le coffre : `cerveau/projets/studio-reseaux.md` (la session cloud n'a pas accès à C:\Users\nolla\jarvis-workspace).

- **Quoi** : appli séparée du CRM, seulement pour mes réseaux (YouTube, TikTok, Instagram, LinkedIn, fiche Google). Interface = conversation façon Claude Code (+ médias, micro, envoyer) au design solvelab.fr ; un onglet par réseau pour voir ce qui a été publié. L'assistant (Claude) écrit les textes, monte la vidéo (dans le navigateur, gratuit), montre l'aperçu et ne publie qu'après mon « je valide ».
- **Dépôt** : `liveshop666/reseaux` (branche de travail `claude/optimistic-cray-ce849q`)
- **Base** : même stack que `liveshop666/crm-prospection` — Next.js 15, Tailwind 4, Supabase projet `crm-prospection` (tables `social_*`, bucket `reseaux-medias`), accès `ALLOWED_EMAILS`.
- **Publication** : n8n, workflows « Studio Réseaux — 1. Adapter le texte (Gemini) » et « 2. Publier » (webhooks protégés par x-api-key = `STUDIO_API_KEY`). IA = identifiant Gemini déjà dans n8n.
- **Décisions** : LinkedIn en mon nom par défaut (bascule « page » dans /comptes quand LinkedIn valide) · Telegram non repris (appli installable sur le téléphone) · pas de passage n8n toutes les 5 min (quota) : réveil au clic + attente de l'heure programmée + filet toutes les 2 h.
- **Contraintes** : TikTok et YouTube en privé tant que les apps ne sont pas auditées · Instagram = compte pro + app Meta · fiche Google = accès API à faire valider · LinkedIn : pas de vidéo via n8n, page = validation LinkedIn · médias 50 Mo max.

## Journal
- 2026-11-17 — Studio créé (pages Accueil, Nouveau post, Historique, Comptes ; API n8n ; connexion TikTok directe ; 2 workflows n8n à importer). Reste : lancer le SQL dans Supabase, déployer sur Vercel, importer les workflows, brancher les comptes un par un.
- 2026-11-17 — Recentrage : plus de formulaire, conversation avec assistant Claude + onglets par réseau. Tables social_messages / social_drafts créées. Reste : clé ANTHROPIC_API_KEY dans Vercel, donner à Vercel l'accès GitHub au dépôt reseaux, importer le workflow n8n Publier, brancher les comptes.
