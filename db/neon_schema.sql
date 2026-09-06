-- CALYXTER SET MANAGER — Schéma pour Neon (Data API + rôle « anonymous »)
-- Version adaptée de supabase/recreate_full_schema.sql pour la migration
-- vers Neon (voir docs/Migration_Neon.md).
--
-- Différences avec la version Supabase :
--   - rôles : Supabase utilise « anon » / « authenticated » ; la Data API
--     de Neon utilise « anonymous » / « authenticated ». L'app Calyxter
--     n'émet aucun JWT → tout passe par le rôle « anonymous », auquel on
--     accorde un accès complet (équivalent de l'ancienne clé publishable ;
--     la sécurité repose sur la confidentialité du lien, § 4.3 de la doc
--     technique).
--   - member.password_hash / last_activity_at : écriture révoquée pour
--     « anonymous ». Seule la fonction api/member-auth, connectée en direct
--     via NEON_DATABASE_URL (propriétaire de la table), peut les écrire.
--   - extension pgcrypto déclarée explicitement (gen_random_uuid()).
--
-- À exécuter une fois sur la branche Neon (SQL Editor du dashboard, ou
-- `psql "$NEON_DIRECT_URL" -f db/neon_schema.sql`).
--
-- ⚠️ Les « drop ... cascade » ci-dessous suppriment tables et données si
-- elles existent. Sur un projet neuf : sans effet.

create extension if not exists pgcrypto;

-- 0. Nettoyage préalable (ordre inverse des dépendances)
drop table if exists comments cascade;
drop table if exists ideas cascade;
drop table if exists events cascade;
drop table if exists concerts cascade;
drop table if exists notifications cascade;
drop table if exists phases cascade;
drop table if exists songs cascade;
drop table if exists members cascade;

drop type if exists idea_status cascade;
drop type if exists recurrence_unit cascade;
drop type if exists event_kind cascade;
drop type if exists phase_step cascade;
drop type if exists song_language cascade;
drop type if exists song_status cascade;

-- 1. Types énumérés
create type song_status as enum ('proposed', 'rejected', 'to_prepare', 'ready');
create type song_language as enum ('FR', 'EN', 'INSTRUMENTAL', 'OTHER');
create type phase_step as enum ('proposal', 'veto', 'vote', 'result', 'closed');
create type event_kind as enum ('repetition', 'atelier', 'residence', 'autre');
create type recurrence_unit as enum ('day', 'week', 'month', 'year');
create type idea_status as enum ('created', 'processed', 'done');

-- 2. Membres du groupe (comptes gérés au niveau de l'appli)
create table members (
  id uuid not null default gen_random_uuid(),
  name text not null,
  instrument text not null,
  created_at timestamptz not null default now(),
  password_hash text,                    -- géré exclusivement par api/member-auth
  last_activity_at timestamptz,          -- tamponnée exclusivement par api/member-auth (écran Accueil)
  constraint members_pkey primary key (id)
);

-- 3. Morceaux du répertoire
create table songs (
  id uuid not null default gen_random_uuid(),
  title text not null,
  artist text not null,
  album text,
  duration_seconds integer,
  language song_language not null default 'OTHER',
  status song_status not null default 'proposed',
  added_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  links jsonb not null default '{}'::jsonb,   -- { custom_url, deezer_url, cover_url, ... }
  constraint songs_pkey primary key (id),
  constraint songs_added_by_fkey foreign key (added_by_user_id) references members(id)
);
create index songs_status_idx on songs(status);
create index songs_language_idx on songs(language);

-- 4. Phases de choix (vetos / votes / brouillons / départages en JSON)
create table phases (
  id uuid not null default gen_random_uuid(),
  initiated_by_user_id uuid not null,
  current_step phase_step not null default 'proposal',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  vetoes jsonb not null default '[]'::jsonb,
  votes jsonb not null default '[]'::jsonb,
  vote_drafts jsonb not null default '{}'::jsonb,
  tie_break_votes jsonb not null default '[]'::jsonb,
  proposed_count integer,
  result jsonb,
  constraint phases_pkey primary key (id),
  constraint phases_initiated_by_fkey foreign key (initiated_by_user_id) references members(id)
);

-- 5. Journal d'activité (notifications internes)
create table notifications (
  id uuid not null default gen_random_uuid(),
  text text not null,
  kind text not null default 'info',
  created_at timestamptz not null default now(),
  constraint notifications_pkey primary key (id)
);

-- 6. Concerts (sets de concert)
create table concerts (
  id uuid not null default gen_random_uuid(),
  name text not null,
  event_date date not null,
  event_time time,
  end_time time,
  venue text,
  song_ids jsonb not null default '[]'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concerts_pkey primary key (id),
  constraint concerts_created_by_user_id_fkey foreign key (created_by_user_id) references members(id)
);
create index concerts_event_date_idx on concerts(event_date);

-- 7. Rendez-vous / agenda
create table events (
  id uuid not null default gen_random_uuid(),
  kind event_kind not null default 'repetition',
  subject text not null,
  event_date date not null,
  start_time time,
  end_time time,
  venue text,
  participant_ids jsonb not null default '[]'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  end_date date not null,
  all_day boolean not null default false,
  recurrence_unit recurrence_unit,
  recurrence_interval integer check (recurrence_interval is null or recurrence_interval >= 1),
  recurrence_until date,
  excluded_dates jsonb not null default '[]'::jsonb,
  constraint events_pkey primary key (id),
  constraint events_created_by_user_id_fkey foreign key (created_by_user_id) references members(id)
);
create index events_event_date_idx on events(event_date);

-- 8. Boîte à idées
create table ideas (
  id uuid not null default gen_random_uuid(),
  content text not null,
  created_by_user_id uuid,
  status idea_status not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_pkey primary key (id),
  constraint ideas_created_by_user_id_fkey foreign key (created_by_user_id) references members(id)
);
create index ideas_status_idx on ideas(status);

-- 9. Commentaires sur les rendez-vous et les concerts
create table comments (
  id uuid not null default gen_random_uuid(),
  event_id uuid,
  concert_id uuid,
  member_id uuid,
  content text not null,
  created_at timestamptz not null default now(),
  constraint comments_pkey primary key (id),
  constraint comments_event_id_fkey foreign key (event_id) references events(id),
  constraint comments_concert_id_fkey foreign key (concert_id) references concerts(id),
  constraint comments_member_id_fkey foreign key (member_id) references members(id)
);
create index comments_event_id_idx on comments(event_id);
create index comments_concert_id_idx on comments(concert_id);

-- 10. Accès Data API — rôle « anonymous »
--
-- L'app n'émet aucun JWT : toute requête de la Data API tombe sur le rôle
-- « anonymous ». On lui donne un accès complet aux 8 tables — c'est le
-- pendant Neon de l'ancienne clé publishable + RLS ouverte de Supabase.
--
-- Si le rôle « anonymous » n'existe pas encore : il est créé en activant
-- la Data API sur le projet (dashboard Neon → Data API). Rejouer ce bloc
-- après activation le cas échéant.

-- RLS activée + policy permissive (comme Supabase). Si la Data API de Neon
-- refuse l'accès sans policy, ces lignes sont nécessaires ; si elle
-- s'appuie uniquement sur les GRANT, elles sont neutres.
alter table members       enable row level security;
alter table songs         enable row level security;
alter table phases        enable row level security;
alter table notifications enable row level security;
alter table concerts      enable row level security;
alter table events        enable row level security;
alter table ideas         enable row level security;
alter table comments      enable row level security;

drop policy if exists "app access" on members;
drop policy if exists "app access" on songs;
drop policy if exists "app access" on phases;
drop policy if exists "app access" on notifications;
drop policy if exists "app access" on concerts;
drop policy if exists "app access" on events;
drop policy if exists "app access" on ideas;
drop policy if exists "app access" on comments;

create policy "app access" on members       for all using (true) with check (true);
create policy "app access" on songs         for all using (true) with check (true);
create policy "app access" on phases        for all using (true) with check (true);
create policy "app access" on notifications for all using (true) with check (true);
create policy "app access" on concerts      for all using (true) with check (true);
create policy "app access" on events        for all using (true) with check (true);
create policy "app access" on ideas         for all using (true) with check (true);
create policy "app access" on comments      for all using (true) with check (true);

-- Droits table complets pour « anonymous » sur les 8 tables.
grant select, insert, update, delete on
  members, songs, phases, notifications, concerts, events, ideas, comments
  to anonymous;

-- « anonymous » ne peut jamais lire ni écrire le mot de passe, ni écrire
-- la dernière activité : seule api/member-auth (connexion directe
-- NEON_DATABASE_URL, propriétaire de la table) le peut.
revoke select (password_hash), insert (password_hash), update (password_hash)
  on members from anonymous;
revoke insert (last_activity_at), update (last_activity_at)
  on members from anonymous;

-- Objets créés ensuite (peu probable ici, mais par sécurité) :
alter default privileges in schema public
  grant select, insert, update, delete on tables to anonymous;
