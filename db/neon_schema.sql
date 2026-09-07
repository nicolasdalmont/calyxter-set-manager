-- CALYXTER SET MANAGER — Schéma pour Neon (chemin B : couche /api/db)
-- Version adaptée de supabase/recreate_full_schema.sql (voir docs/Migration_Neon.md).
--
-- Différences avec la version Supabase :
--   - aucune RLS, aucune policy, aucun rôle applicatif : la base n'est
--     jamais jointe depuis le frontend. Seules les Vercel Functions
--     (api/db.js, api/member-auth.js) s'y connectent, avec le rôle
--     propriétaire, via DATABASE_URL. La protection de
--     members.password_hash / last_activity_at est faite dans api/db.js
--     (jamais renvoyés au client, non écrivables par cet endpoint).
--   - extension pgcrypto déclarée explicitement (gen_random_uuid()).
--
-- À exécuter une fois sur le projet Neon (SQL Editor du dashboard, ou
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
drop table if exists compos cascade;
drop type if exists compo_status cascade;

-- 1. Types énumérés
create type song_status as enum ('proposed', 'rejected', 'to_prepare', 'ready');
create type song_language as enum ('FR', 'EN', 'INSTRUMENTAL', 'OTHER');
create type phase_step as enum ('proposal', 'veto', 'vote', 'result', 'closed');
create type event_kind as enum ('repetition', 'atelier', 'residence', 'autre');
create type recurrence_unit as enum ('day', 'week', 'month', 'year');
create type idea_status as enum ('created', 'processed', 'done');
create type compo_status as enum ('wip', 'done');   -- wip = en création, done = abouti

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
  set_items jsonb not null default '[]'::jsonb,   -- set détaillé : [{type:'song',song_id} | {type:'note',id,text}] ; song_ids en reste le reflet
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

-- 10. Compos — répertoire des morceaux originaux du groupe (distinct du
-- répertoire de reprises « songs »). Paroles, grille d'accords et maquette
-- sont des LIENS externes (Drive…), pas des fichiers stockés. Le lien Deezer
-- (piste) alimente pochette + indicateur de popularité (rank).
create table compos (
  id uuid not null default gen_random_uuid(),
  title text not null,
  status compo_status not null default 'wip',
  duration_seconds integer,
  album text,                                        -- nom de l'album si le morceau y figure, sinon null
  author_ids jsonb not null default '[]'::jsonb,     -- auteur(s) des paroles (membres)
  composer_ids jsonb not null default '[]'::jsonb,   -- compositeur(s) (membres)
  lyrics_url text,                                   -- lien vers les paroles
  chords text,                                       -- grille d'accords, saisie libre (quelques accords)
  demo_url text,                                     -- lien vers la maquette (morceaux en création)
  deezer_track_id text,                              -- id de la piste Deezer si le morceau y est
  deezer_url text,
  cover_url text,                                    -- pochette récupérée de Deezer
  deezer_rank integer,                              -- indicateur de popularité Deezer (rank)
  deezer_synced_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compos_pkey primary key (id),
  constraint compos_created_by_user_id_fkey foreign key (created_by_user_id) references members(id)
);
create index compos_status_idx on compos(status);

-- (Chemin B retenu — voir docs/Migration_Neon.md § 4 : la couche /api/db
-- sur Vercel Functions parle a Neon en direct, sans Data API. Aucun role
-- "anonymous", aucune policy RLS a poser ici : la protection de
-- password_hash / last_activity_at est assuree cote code, /api/db ne les
-- renvoyant jamais et n'acceptant pas de les ecrire.)
