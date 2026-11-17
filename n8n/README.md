# Workflow n8n du Studio Réseaux

Un seul workflow : **[`studio-publier.json`](studio-publier.json)**. L'écriture des textes est faite par l'assistant du Studio (Claude), pas par n8n.

| # | Fichier | Déclencheur | Rôle |
|---|---|---|---|
| 2 | [`studio-publier.json`](studio-publier.json) | webhook `studio-publier` (clic « Publier » / « Programmer ») + filet de sécurité toutes les 2 h | `GET /api/n8n/due` → publie réseau par réseau → `PATCH /api/n8n/targets/:id` |

Les fichiers sont générés par [`generer_workflows.py`](generer_workflows.py) (`python3 n8n/generer_workflows.py n8n`) : modifier le script plutôt que les JSON à la main.

## Installation

2. **Identifiants** (ouvrir chaque nœud marqué d'un triangle rouge) :
   - **CRM x-api-key** (*Header Auth*, nom `x-api-key`, valeur = `STUDIO_API_KEY`) : sur les 2 webhooks et les appels au Studio. Si `STUDIO_API_KEY` = `CRM_API_KEY`, reprends l'identifiant du CRM.
   - **Google Gemini(PaLM) Api account** : déjà relié (ton identifiant existant).
   - **YouTube OAuth2 API**, **LinkedIn OAuth2 API**, **Facebook Graph API**, **Google Business Profile OAuth2 API** : seulement pour les réseaux que tu branches.
3. Workflow 2 → nœud **« Mes paramètres »** :

| Paramètre | Exemple | Obligatoire |
|---|---|---|
| `url_studio` | `https://studio-reseaux.vercel.app` | oui (tant qu'il contient `A_REMPLIR`, rien ne part) |
| `linkedin_personne` | `AbC123xyz` (le nœud LinkedIn le propose dans sa liste) | si LinkedIn |
| `linkedin_page` | `12345678` (id numérique de la page) | si LinkedIn au nom de la page |
| `instagram_compte_id` | `17841400000000000` | si Instagram |
| `compte_google` / `etablissement_google` | `accounts/123` / `locations/456` | si fiche Google |
| `site_web` | `https://www.solvelab.fr` | bouton « En savoir plus » de la fiche Google |
| `tiktok_confidentialite` | `SELF_ONLY` → `PUBLIC_TO_EVERYONE` après l'audit TikTok | — |
| `youtube_visibilite` | `public` (`unlisted` / `private` possibles) | — |

4. **Publish** les 2 workflows, puis copie les *Production URL* des 2 webhooks dans Vercel : `N8N_PUBLISH_WEBHOOK_URL`` → *Redeploy*.

## Comment se passe une publication

1. Clic **Publier** dans le Studio → lignes `a_publier` en base + webhook `{ action: "publier", post_id, quand }`.
2. n8n **attend** `quand` (immédiat, ou la date programmée), puis appelle `GET /api/n8n/due` : il reçoit les lignes dues, déjà passées en `en_cours`.
3. Aiguillage par réseau :
   - **YouTube** : télécharge la vidéo → nœud YouTube (titre, description, catégorie Science & Tech, FR) → lien `https://youtu.be/<id>`.
   - **LinkedIn** : avec image → télécharge + nœud LinkedIn `IMAGE` ; sinon (ou vidéo) → texte seul. `postAs` = personne ou organisation selon le choix fait dans `/comptes`.
   - **TikTok** : jeton via le Studio → télécharge → `post/publish/video/init` (FILE_UPLOAD, 1 morceau) → envoi → attente 30 s → état. Confidentialité = `tiktok_confidentialite`.
   - **Instagram** : crée le média (photo, ou Reel si vidéo) → attend qu'il soit prêt (15 s × 20 max) → `media_publish` → lien (permalink).
   - **Fiche Google** : `POST v4/{compte}/{établissement}/localPosts` avec la photo et un bouton « En savoir plus ».
4. Chaque branche se termine par « Résultat … » → `PATCH /api/n8n/targets/:id` : statut, lien, ou erreur lisible (visible dans l'historique et la page Comptes).

Une erreur sur un réseau n'empêche pas les autres de partir.

## LinkedIn au nom de la page SolveLab

1. Dans ton app LinkedIn, ajoute le produit **Community Management API** et attends la validation.
2. Dans n8n, ouvre l'identifiant **LinkedIn OAuth2 API**, coche **Organization Support**, reconnecte-toi.
3. Remplis `linkedin_page` dans « Mes paramètres ».
4. Dans le Studio → `/comptes` → LinkedIn → « au nom de la page SolveLab » → Enregistrer.

## Quota n8n

Environ 1 exécution par post + 1 par clic « Adapter » + 9 par jour pour le filet de sécurité (≈ 270 / mois). Si tu veux un filet plus serré, change le cron du nœud « Filet de sécurité » (chaque passage compte comme une exécution).
