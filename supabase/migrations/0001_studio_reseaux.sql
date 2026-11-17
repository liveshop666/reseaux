-- =====================================================================
-- Studio Réseaux SolveLab — tables (même projet Supabase que le CRM)
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run
-- Toutes les tables commencent par « social_ » : rien ne touche au CRM.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les posts : ce que j'écris une fois
-- ---------------------------------------------------------------------
create table if not exists social_posts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  body          text not null,                       -- mon texte de départ
  media_url     text,                                -- lien public de la photo / vidéo (Supabase Storage)
  media_path    text,                                -- chemin dans le bucket (pour la supprimer)
  media_type    text check (media_type in ('image', 'video')),
  scheduled_at  timestamptz not null default now()   -- date de publication (now = tout de suite)
);
create index if not exists social_posts_created_idx on social_posts (created_at desc);

-- ---------------------------------------------------------------------
-- 2. Une ligne par réseau coché : texte adapté, statut, lien
-- ---------------------------------------------------------------------
create table if not exists social_targets (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references social_posts (id) on delete cascade,
  network       text not null check (network in ('youtube', 'linkedin', 'tiktok', 'instagram', 'google')),
  title         text,                                -- YouTube : titre de la vidéo
  text          text not null,                       -- texte adapté (validé par moi)
  status        text not null default 'a_publier'
                check (status in ('a_publier', 'en_cours', 'publie', 'erreur', 'annule')),
  scheduled_at  timestamptz not null default now(),  -- copie de la date du post (filtre rapide pour n8n)
  claimed_at    timestamptz,                         -- pris en charge par n8n
  published_at  timestamptz,
  external_id   text,                                -- id renvoyé par le réseau
  url           text,                                -- lien vers la publication
  is_private    boolean not null default false,      -- TikTok tant que l'app n'est pas validée
  error         text,
  unique (post_id, network)
);
create index if not exists social_targets_due_idx on social_targets (status, scheduled_at);

-- ---------------------------------------------------------------------
-- 3. Les comptes : état de chaque réseau (affiché dans « Comptes connectés »)
-- ---------------------------------------------------------------------
create table if not exists social_accounts (
  network        text primary key check (network in ('youtube', 'linkedin', 'tiktok', 'instagram', 'google')),
  enabled        boolean not null default false,     -- je l'ai branché dans n8n
  handle         text,                               -- @solvelab, nom de la chaîne…
  profile_url    text,
  linkedin_mode  text not null default 'personne' check (linkedin_mode in ('personne', 'page')),
  last_ok_at     timestamptz,                        -- dernière publication réussie (rempli par l'appli)
  last_error     text,
  last_error_at  timestamptz,
  updated_at     timestamptz not null default now()
);
insert into social_accounts (network) values ('youtube'), ('linkedin'), ('tiktok'), ('instagram'), ('google')
on conflict (network) do nothing;

-- ---------------------------------------------------------------------
-- 4. Jetons OAuth gérés par l'appli (TikTok). Aucune règle d'accès :
--    seul le serveur (clé service_role) peut les lire. Jamais le navigateur.
-- ---------------------------------------------------------------------
create table if not exists social_tokens (
  network             text primary key,
  access_token        text not null,
  refresh_token       text,
  expires_at          timestamptz,
  refresh_expires_at  timestamptz,
  open_id             text,
  scope               text,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Sécurité (RLS) : comme le CRM, toute personne connectée (ALLOWED_EMAILS
-- filtre l'accès à l'appli) ; n8n passe par l'API avec x-api-key.
-- ---------------------------------------------------------------------
alter table social_posts    enable row level security;
alter table social_targets  enable row level security;
alter table social_accounts enable row level security;
alter table social_tokens   enable row level security;   -- volontairement sans règle

drop policy if exists "auth_all_social_posts" on social_posts;
create policy "auth_all_social_posts" on social_posts for all to authenticated using (true) with check (true);
drop policy if exists "auth_all_social_targets" on social_targets;
create policy "auth_all_social_targets" on social_targets for all to authenticated using (true) with check (true);
drop policy if exists "auth_all_social_accounts" on social_accounts;
create policy "auth_all_social_accounts" on social_accounts for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 5. Stockage des photos / vidéos : bucket public « reseaux-medias »
--    (Instagram et la fiche Google vont chercher l'image par son lien).
--    Les noms de fichiers sont aléatoires. 50 Mo max par fichier (offre gratuite).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reseaux-medias', 'reseaux-medias', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "reseaux_medias_upload" on storage.objects;
create policy "reseaux_medias_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'reseaux-medias');
drop policy if exists "reseaux_medias_delete" on storage.objects;
create policy "reseaux_medias_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reseaux-medias');
