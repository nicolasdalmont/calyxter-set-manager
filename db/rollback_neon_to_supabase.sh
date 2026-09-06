#!/usr/bin/env bash
# Retour arriere des donnees : Neon -> Supabase (filet de securite niveau 3,
# docs/Migration_Neon.md § 3.3-3.4).
#
# A n'utiliser QUE si, apres la bascule prod, on a laisse Neon tourner un
# moment et on ne veut pas perdre ce qui y a ete ecrit. Sinon le rollback
# niveau 1 (Instant Rollback Vercel, ~30 s) suffit : Supabase n'ayant jamais
# ete modifie, il redevient la source immediatement.
#
# CE SCRIPT ECRIT DANS SUPABASE (truncate + restore). A repeter a blanc en
# Phase 4 contre un projet Supabase jetable avant de compter dessus.
#
# Pre-requis (chaines DIRECTES) :
#   export NEON_DIRECT_URL='postgresql://neondb_owner:...@ep-...neon.tech/neondb?sslmode=require'
#   export SUPABASE_DIRECT_URL='postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres'
#
# Usage :  bash db/rollback_neon_to_supabase.sh
set -euo pipefail

: "${NEON_DIRECT_URL:?export NEON_DIRECT_URL=...}"
: "${SUPABASE_DIRECT_URL:?export SUPABASE_DIRECT_URL=...}"

TABLES=(members songs phases notifications concerts events ideas comments)
DUMP="/tmp/calyxter_rollback_$(date +%Y%m%d_%H%M%S).sql"

echo "!! Ce script va VIDER puis reremplir les 8 tables de Supabase."
read -r -p "   Taper 'ROLLBACK' pour confirmer : " ANS
[ "$ANS" = "ROLLBACK" ] || { echo "Annule."; exit 1; }

echo "== 1. Dump des donnees Neon =="
pg_dump "$NEON_DIRECT_URL" \
  --data-only --no-owner --no-privileges --disable-triggers \
  $(printf -- '--table=public.%s ' "${TABLES[@]}") \
  --file="$DUMP"
echo "   -> $DUMP"

echo "== 2. Vidage des tables Supabase (ordre inverse des FK) =="
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -c \
  "truncate comments, ideas, events, concerts, notifications, phases, songs, members restart identity cascade;"

echo "== 3. Restauration sur Supabase =="
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f "$DUMP"

echo "== 4. Volumes =="
COUNT_SQL="select 'members' t,count(*) n from members
  union all select 'songs',count(*) from songs
  union all select 'phases',count(*) from phases
  union all select 'notifications',count(*) from notifications
  union all select 'concerts',count(*) from concerts
  union all select 'events',count(*) from events
  union all select 'ideas',count(*) from ideas
  union all select 'comments',count(*) from comments order by 1;"
echo "-- Neon --";     psql "$NEON_DIRECT_URL" -A -F' | ' -c "$COUNT_SQL"
echo "-- Supabase --"; psql "$SUPABASE_DIRECT_URL" -A -F' | ' -c "$COUNT_SQL"

echo
echo "Puis : repasser BACKEND='supabase' dans src/App.jsx (ou Instant Rollback"
echo "Vercel sur le dernier deploiement ere Supabase). Dump : $DUMP"
