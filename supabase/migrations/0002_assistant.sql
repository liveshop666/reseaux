-- Conversation avec l'assistant du Studio (une ligne par message, contenu = blocs Claude tels quels)
create table if not exists social_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null,
  role             text not null check (role in ('user', 'assistant')),
  content          jsonb not null,
  created_at       timestamptz not null default now()
);
create index if not exists social_messages_conv_idx on social_messages (conversation_id, created_at);

-- Brouillons proposés par l'assistant. Rien ne part tant qu'un brouillon n'a pas été validé.
create table if not exists social_drafts (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null,
  created_at       timestamptz not null default now(),
  payload          jsonb not null,
  post_id          uuid references social_posts (id) on delete set null
);

alter table social_messages enable row level security;
alter table social_drafts   enable row level security;
drop policy if exists "auth_all_social_messages" on social_messages;
create policy "auth_all_social_messages" on social_messages for all to authenticated using (true) with check (true);
drop policy if exists "auth_all_social_drafts" on social_drafts;
create policy "auth_all_social_drafts" on social_drafts for all to authenticated using (true) with check (true);
