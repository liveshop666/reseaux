-- Studio Réseaux : droits d'accès API.
-- Nécessaire sur un projet Supabase créé avec « Grant API access to new tables automatically » décoché :
-- sans ces droits, le Studio ne voit aucune table (tout s'affiche « base à mettre à jour »).
-- Les règles RLS restent actives (social_tokens reste illisible côté navigateur).
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
