-- =====================================================================
-- CALYXTER SET MANAGER — Script complet de recréation de la base
-- (structure uniquement, sans données)
-- =====================================================================
-- À exécuter dans l'éditeur SQL Supabase d'un projet neuf (ou d'un
-- projet dont on accepte de repartir de zéro sur ces objets : les
-- instructions "drop table/type ... cascade" suppriment les tables et
-- toutes leurs données si elles existent déjà).
--
-- État du modèle reflété par ce script : 8 tables — members, songs,
-- phases, notifications, concerts, events, ideas, comments.
--
-- Gestion des utilisateurs au niveau de l'application (pas de Supabase
-- Auth) : accès protégé par la clé publishable + mot de passe par
-- membre, vérifié côté serveur par l'Edge Function "member-auth".
-- Deezer est l'unique plateforme d'écoute intégrée (pas de notion de
-- service préféré par membre).
--
-- Colonnes, types et contraintes de clé primaire/étrangère : vérifiés le
-- 2026-09-04 contre la base Supabase réelle (export "Database > Schema
-- Visualizer > Copy as SQL"), donc alignés avec l'état effectivement en
-- production à cette date. Index, RLS et policies (sections 10) ne sont
-- PAS couverts par cet export et restent tels que déduits des migrations
-- précédentes — non re-vérifiés indépendamment contre le catalogue live.
--
-- Écart constaté par rapport à une version antérieure (non versionnée)
-- de ce script : la base réelle ne comporte AUCUNE clause ON DELETE
-- (ni SET NULL, ni CASCADE) sur les clés étrangères ci-dessous, et la
-- table comments ne comporte PAS de contrainte CHECK garantissant qu'une
-- ligne référence exactement l'un des deux (event_id XOR concert_id).
-- Ce script reflète donc désormais la réalité : suppression d'un membre,
-- d'un événement ou d'un concert référencé échoue par défaut (NO ACTION)
-- tant que les lignes dépendantes n'ont pas été supprimées au préalable
-- (le code applicatif ne le fait pas non plus aujourd'hui pour
-- comments — à surveiller, voir deleteConcert/deleteEvent dans
-- src/App.jsx qui ne suppriment pas les commentaires liés avant de
-- supprimer l'événement/concert).
-- =====================================================================


-- =====================================================================
-- 0. Nettoyage préalable (ordre inverse des dépendances)
-- =====================================================================
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


-- =====================================================================
-- 1. Types énumérés
-- =====================================================================
create type song_status as enum ('proposed', 'rejected', 'to_prepare', 'ready');
create type song_language as enum ('FR', 'EN', 'INSTRUMENTAL', 'OTHER');
create type phase_step as enum ('proposal', 'veto', 'vote', 'result', 'closed');
create type event_kind as enum ('repetition', 'atelier', 'residence', 'autre');
create type recurrence_unit as enum ('day', 'week', 'month', 'year');
create type idea_status as enum ('created', 'processed', 'done');


-- =====================================================================
-- 2. Membres du groupe (comptes gérés au niveau de l'appli)
-- =====================================================================
create table members (
  id uuid not null default gen_random_uuid(),
  name text not null,
  instrument text not null,
  created_at timestamptz not null default now(),
  password_hash text,                    -- géré exclusivement par l'Edge Function member-auth
  last_activity_at timestamptz,          -- dernière activité (pas juste connexion) : tamponnée exclusivement par member-auth (écran Accueil)
  constraint members_pkey primary key (id)
);


-- =====================================================================
-- 3. Morceaux du répertoire
-- =====================================================================
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


-- =====================================================================
-- 4. Phases de choix — vetos / votes / brouillons / départages embarqués
-- directement en JSON sur la ligne de la phase (plus simple à faire
-- correspondre à l'état de l'appli qu'un modèle pleinement normalisé).
--
-- Une phase menée à son terme (résultat validé) voit sa ligne conservée
-- avec current_step = closed et closed_at renseigné : c'est ce qui
-- alimente l'historique des phases. Une phase annulée en cours de route
-- voit au contraire sa ligne purement et simplement supprimée — elle ne
-- laisse donc aucune trace dans l'historique.
--
-- proposed_count et result sont des instantanés pris uniquement au
-- moment de la clôture (ResultStep.finalize), pour que l'écran
-- "Historique des phases" puisse afficher le nombre de propositions et
-- le résultat final sans dépendre des votes (qui restent dans leur JSON
-- mais deviennent impossibles à réinterpréter correctement une fois les
-- morceaux gagnants passés au statut "À préparer") ni du répertoire
-- actuel (un morceau du résultat peut depuis avoir été renommé ou
-- supprimé). Le nombre de vetos, lui, reste dérivé à l'affichage de la
-- colonne vetoes existante (pas de colonne dédiée). Les deux colonnes
-- restent NULL pour les phases closes avant l'introduction de cette
-- fonctionnalité (l'écran affiche alors "—" plutôt qu'un chiffre ou un
-- résultat inventés).
-- =====================================================================
create table phases (
  id uuid not null default gen_random_uuid(),
  initiated_by_user_id uuid not null,
  current_step phase_step not null default 'proposal',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  vetoes jsonb not null default '[]'::jsonb,          -- [{id, song_id, user_id, created_at}]
  votes jsonb not null default '[]'::jsonb,           -- [{id, user_id, rankings:[{song_id, points}], created_at}]
  vote_drafts jsonb not null default '{}'::jsonb,     -- { [user_id]: { order:[song_id...], ranked_up_to } }
  tie_break_votes jsonb not null default '[]'::jsonb, -- [{user_id, song_id}]
  proposed_count integer,                             -- snapshot pris à la clôture (NULL si inconnu / phase pré-migration)
  result jsonb,                                       -- snapshot pris à la clôture : [{title, artist}, ...] (NULL si inconnu / phase pré-migration)
  constraint phases_pkey primary key (id),
  constraint phases_initiated_by_fkey foreign key (initiated_by_user_id) references members(id)
);


-- =====================================================================
-- 5. Journal d'activité (notifications internes à l'application)
-- =====================================================================
create table notifications (
  id uuid not null default gen_random_uuid(),
  text text not null,
  kind text not null default 'info',
  created_at timestamptz not null default now(),
  constraint notifications_pkey primary key (id)
);


-- =====================================================================
-- 6. Concerts (sets de concert)
-- =====================================================================
create table concerts (
  id uuid not null default gen_random_uuid(),
  name text not null,
  event_date date not null,
  event_time time,                        -- optionnelle
  venue text,                             -- optionnel
  song_ids jsonb not null default '[]'::jsonb,  -- ordre du set : [song_id, song_id, ...]
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concerts_pkey primary key (id),
  constraint concerts_created_by_user_id_fkey foreign key (created_by_user_id) references members(id)
);
create index concerts_event_date_idx on concerts(event_date);


-- =====================================================================
-- 7. Rendez-vous / agenda (répétitions, ateliers, résidences, autres)
-- Les concerts (table "concerts" ci-dessus) apparaissent automatiquement
-- dans l'agenda côté application — ils ne sont PAS dupliqués ici.
--
-- Récurrence : la ligne représente la 1re occurrence ; les occurrences
-- suivantes sont calculées côté application entre event_date et
-- recurrence_until. Une occurrence supprimée individuellement est
-- ajoutée à excluded_dates plutôt que de faire éclater la série en
-- plusieurs lignes — modifier la série met donc à jour toutes ses
-- occurrences restantes en une seule écriture.
-- =====================================================================
create table events (
  id uuid not null default gen_random_uuid(),
  kind event_kind not null default 'repetition',
  subject text not null,
  event_date date not null,
  start_time time,                        -- optionnelle (vide si "toute la journée")
  end_time time,                          -- optionnelle
  venue text,                             -- optionnel
  participant_ids jsonb not null default '[]'::jsonb,  -- [member_id, ...]
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  end_date date not null,                 -- par défaut identique à event_date (géré côté appli)
  all_day boolean not null default false,
  recurrence_unit recurrence_unit,
  recurrence_interval integer check (recurrence_interval is null or recurrence_interval >= 1),
  recurrence_until date,
  excluded_dates jsonb not null default '[]'::jsonb,
  constraint events_pkey primary key (id),
  constraint events_created_by_user_id_fkey foreign key (created_by_user_id) references members(id)
);
create index events_event_date_idx on events(event_date);


-- =====================================================================
-- 8. Boîte à idées (suggestions d'amélioration de l'application)
-- =====================================================================
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


-- =====================================================================
-- 9. Commentaires sur les rendez-vous et les concerts
-- Table partagée entre "events" et "concerts" : en pratique chaque ligne
-- ne référence que l'un des deux, mais ce n'est PAS imposé par une
-- contrainte CHECK côté base (vérifié absente sur la base réelle au
-- 2026-09-04) — seul le code applicatif (saveComment) garantit
-- aujourd'hui qu'un seul des deux est renseigné. Tous les membres
-- peuvent ajouter ou supprimer un commentaire, sans restriction liée à
-- l'auteur — comme pour le reste de l'application.
-- =====================================================================
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


-- =====================================================================
-- 10. Sécurité (Row Level Security)
-- Pas de Supabase Auth : l'accès est ouvert à quiconque dispose de la
-- clé publishable (protégé par la confidentialité du lien de l'appli),
-- à l'exception du mot de passe des membres et de leur dernière activité,
-- verrouillés séparément.
-- =====================================================================
alter table members enable row level security;
alter table songs enable row level security;
alter table phases enable row level security;
alter table notifications enable row level security;
alter table concerts enable row level security;
alter table events enable row level security;
alter table ideas enable row level security;
alter table comments enable row level security;

create policy "app access" on members for all using (true) with check (true);
create policy "app access" on songs for all using (true) with check (true);
create policy "app access" on phases for all using (true) with check (true);
create policy "app access" on notifications for all using (true) with check (true);
create policy "app access" on concerts for all using (true) with check (true);
create policy "app access" on events for all using (true) with check (true);
create policy "app access" on ideas for all using (true) with check (true);
create policy "app access" on comments for all using (true) with check (true);

-- La clé publishable ne peut jamais lire/modifier le mot de passe :
-- seule l'Edge Function member-auth (clé secrète côté serveur) le peut.
revoke select (password_hash), update (password_hash), insert (password_hash)
  on members from anon, authenticated;

-- last_activity_at reste lisible par la clé publishable (affiché sur
-- l'écran Accueil), mais seule l'Edge Function member-auth (clé secrète)
-- peut l'écrire — sinon un client pourrait falsifier la dernière activité
-- de n'importe quel membre via un simple PATCH REST.
revoke update (last_activity_at), insert (last_activity_at)
  on members from anon, authenticated;
