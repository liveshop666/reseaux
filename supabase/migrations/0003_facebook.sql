-- Studio Réseaux : ajout de Facebook (publication sur une Page Facebook).
-- À lancer une fois dans Supabase → SQL Editor (après 0001 et 0002). Rien ne touche au CRM.

alter table social_targets drop constraint if exists social_targets_network_check;
alter table social_targets add constraint social_targets_network_check
  check (network in ('youtube', 'linkedin', 'tiktok', 'instagram', 'facebook', 'google'));

alter table social_accounts drop constraint if exists social_accounts_network_check;
alter table social_accounts add constraint social_accounts_network_check
  check (network in ('youtube', 'linkedin', 'tiktok', 'instagram', 'facebook', 'google'));

insert into social_accounts (network) values ('facebook')
on conflict (network) do nothing;
