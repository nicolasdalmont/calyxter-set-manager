#!/usr/bin/env bash
# Migration des donnees Supabase -> Neon (Phase 2 / Phase 5 du plan).
# Idempotent cote lecture : ne modifie JAMAIS Supabase (pg_dump seul).
#
# Pre-requis :
#   - pg_dump / psql installes (>= version du serveur Supabase).
#       macOS : brew install libpq && echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
#   - schema deja cree sur Neon (db/neon_schema.sql).
#   - variables d'environnement :
#       export SUPABASE_DIRECT_URL='postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres'
#       export NEON_DIRECT_URL='postgresql://neondb_owner:...@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require'
#     (chaines DIRECTES, pas les poolers ; a garder hors du chat / dans .env.local)
#
# Usage :  bash db/migrate_supabase_to_neon.sh
set -euo pipefail

: "${SUPABASE_DIRECT_URL:?export SUPABASE_DIRECT_URL=...}"
: "${NEON_DIRECT_URL:?export NEON_DIRECT_URL=...}"

TABLES=(members songs phases notifications concerts events ideas comments)
DUMP="/tmp/calyxter_data_$(date +%Y%m%d_%H%M%S).sql"

echo "== 1. Dump des donnees Supabase (data-only, sans schema ni droits) =="
pg_dump "$SUPABASE_DIRECT_URL" \
  --data-only --no-owner --no-privileges --disable-triggers \
  $(printf -- '--table=public.%s ' "${TABLES[@]}") \
  --file="$DUMP"
echo "   -> $DUMP ($(wc -l < "$DUMP") lignes)"

echo "== 2. Restauration sur Neon =="
psql "$NEON_DIRECT_URL" -v ON_ERROR_STOP=1 -f "$DUMP"

echo "== 3. Comparaison des volumes =="
COUNT_SQL="select 'members' t,count(*) n from members
  union all select 'songs',count(*) from songs
  union all select 'phases',count(*) from phases
  union all select 'notifications',count(*) from notifications
  union all select 'concerts',count(*) from concerts
  union all select 'events',count(*) from events
  union all select 'ideas',count(*) from ideas
  union all select 'comments',count(*) from comments
  order by 1;"

echo "-- Supabase --"
psql "$SUPABASE_DIRECT_URL" -A -F' | ' -c "$COUNT_SQL"
echo "-- Neon --"
psql "$NEON_DIRECT_URL" -A -F' | ' -c "$COUNT_SQL"

echo
echo "== 4. Controles ponctuels a faire a la main =="
echo "  - members : 6 profils, password_hash non nul et IDENTIQUE a la source"
echo "  - phases  : phase active eventuelle (closed_at is null) + historique complet"
echo "  - comments: event_id / concert_id coherents (jamais les deux)"
echo "  - jsonb   : song_ids / vetoes / votes / participant_ids sur 2-3 lignes"
echo
echo "Dump conserve : $DUMP"
