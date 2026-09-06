#!/usr/bin/env bash
# =====================================================================
# Phase 0 — test decisif de la Data API Neon (voir docs/Migration_Neon.md § 4)
# =====================================================================
# Question : le role « anonymous » + des GRANT ouverts suffisent-ils pour
# lire/ecrire via la Data API SANS aucun en-tete Authorization ?
#   - OUI  -> chemin A confirme (aucun token a gerer).
#   - NON  -> evaluer un JWT statique, sinon repli chemin B.
#
# Pre-requis :
#   1. Projet Neon pilote cree.
#   2. db/neon_schema.sql execute dessus (cree les tables + GRANT to anonymous).
#   3. Data API activee sur le projet (dashboard Neon -> Data API).
#   4. Exporter l'URL de la Data API affichee par le dashboard :
#        export NEON_DATA_API_URL='https://...'
#
# Usage :  bash db/phase0_dataapi_test.sh
# =====================================================================
set -u

BASE="${NEON_DATA_API_URL:?Exporter NEON_DATA_API_URL avant de lancer le script}"
BASE="${BASE%/}"
T="$BASE/notifications"   # table sans cle etrangere : ideale pour un test isole

pass=0
fail=0

check() {
  # $1 = libelle   $2 = code HTTP obtenu   $3 = codes attendus, separes par |
  local label="$1" got="$2" want="$3"
  if [[ "$got" =~ ^($want)$ ]]; then
    echo "  OK  $label (HTTP $got)"
    pass=$((pass + 1))
  else
    echo "  KO  $label (HTTP $got, attendu $want)"
    fail=$((fail + 1))
  fi
}

echo "Data API : $BASE"
echo "Toutes les requetes ci-dessous SANS en-tete Authorization."
echo

# 1. SELECT
code=$(curl -s -o /tmp/n0.json -w '%{http_code}' "$T?select=*&limit=1")
check "SELECT notifications" "$code" "200"

# 2. INSERT (retour de la ligne creee pour recuperer son id)
code=$(curl -s -o /tmp/n1.json -w '%{http_code}' -X POST "$T" \
  -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d '[{"text":"phase0 test","kind":"info"}]')
check "INSERT notifications" "$code" "200|201"
ID=$(sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' /tmp/n1.json 2>/dev/null | head -1)
echo "     id cree : ${ID:-<non recupere>}"

if [[ -n "${ID:-}" ]]; then
  # 3. UPSERT « merge on id » (le pattern de upsertRows())
  code=$(curl -s -o /tmp/n2.json -w '%{http_code}' -X POST "$T" \
    -H 'Content-Type: application/json' \
    -H 'Prefer: resolution=merge-duplicates,return=minimal' \
    -d "[{\"id\":\"$ID\",\"text\":\"phase0 test (merged)\",\"kind\":\"info\"}]")
  check "UPSERT merge-duplicates" "$code" "200|201|204"

  # 4. PATCH par id
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$T?id=eq.$ID" \
    -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
    -d '{"kind":"step"}')
  check "PATCH par id" "$code" "200|204"

  # 5. DELETE par filtre
  code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$T?id=eq.$ID" \
    -H 'Prefer: return=minimal')
  check "DELETE par filtre" "$code" "200|204"
fi

echo
echo "--- Protection de colonnes (members.password_hash) ---"

# 6. SELECT explicite de password_hash -> doit ECHOUER (permission denied)
code=$(curl -s -o /tmp/n3.json -w '%{http_code}' "$BASE/members?select=id,password_hash&limit=1")
check "SELECT members(password_hash) refuse" "$code" "401|403"

# 7. SELECT * sur members -> doit marcher, mais SANS password_hash dans le corps
code=$(curl -s -o /tmp/n4.json -w '%{http_code}' "$BASE/members?select=*&limit=1")
if [[ "$code" == "200" ]]; then
  if grep -q 'password_hash' /tmp/n4.json; then
    echo "  KO  SELECT * expose password_hash — revocation de colonne non prise"
    fail=$((fail + 1))
  else
    echo "  OK  SELECT * ne renvoie pas password_hash"
    pass=$((pass + 1))
  fi
else
  echo "  ??  SELECT * members -> HTTP $code (table vide ? a reinspecter)"
fi

echo
echo "===================================================="
echo "  $pass OK, $fail KO"
if [[ "$fail" -eq 0 ]]; then
  echo "  => Chemin A confirme : Data API + anonymous, sans JWT."
else
  echo "  => JWT probablement requis, ou config GRANT/RLS a revoir."
  echo "     Corps de reponse : /tmp/n0.json ... /tmp/n4.json"
fi
echo "===================================================="
