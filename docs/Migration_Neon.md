# Migration Supabase → Neon — plan détaillé

Statut : **Phase 0 en cours** (branche `migration-neon`). Kit de test prêt (`db/neon_schema.sql`, `db/phase0_dataapi_test.sh`) — reste à créer le projet Neon pilote et lancer le test décisif (§ 4). Cocher les cases au fur et à mesure.

Motivation : le plan gratuit Supabase plafonne à 2 projets actifs ; le plan gratuit Neon en autorise ~100. L'objectif est d'avoir un socle unique (Neon + Vercel) réutilisable pour les autres projets à venir. Ce document ne concerne que `calyxter-set-manager`.

**Principe directeur (voir § 3)** : la migration *ajoute* une cible Neon, elle ne retire rien de Supabase tant que le nouveau socle n'est pas prouvé en production. Un retour à la version actuelle doit rester possible en une trentaine de secondes à tout moment.

**Référence de travail** : le projet `~/Documents/git/mabedetheque` tourne déjà sur Neon (Data API + Managed Better Auth + Object Storage) — voir § 2.5 pour ce qu'il valide et les pièges qu'il a essuyés.

---

## 1. Ce qui doit changer (écarts Supabase → Neon)

Supabase apporte aujourd'hui **quatre** choses ; Neon n'en apporte qu'une nativement.

| Brique | Aujourd'hui (Supabase) | Sur Neon |
| --- | --- | --- |
| Base PostgreSQL | Projet Supabase | **Projet Neon** — équivalent direct, Postgres standard |
| API REST de données | PostgREST intégré, appelé en `fetch` direct par `src/App.jsx` (`supabaseTable()`), authentifié par la clé publishable | **À remplacer** — voir § 2 |
| Fonctions serveur | 2 Edge Functions Deno (`member-auth`, `search-deezer`), `supabase/functions/` | **À porter** sur Vercel Functions (`api/`) |
| Contrôle d'accès | RLS « ouverte » + révocations de colonnes pour la clé publishable | Selon le chemin retenu au § 2 (RLS Neon, ou contrôle dans la couche API) |

Le frontend restant sur Vercel (déploiement auto depuis `main`), le mécanisme de version (`version.json` via `VERCEL_GIT_COMMIT_SHA`) et `vercel.json` ne changent pas.

---

## 2. Décision d'architecture — couche d'accès aux données

Le cœur du chantier. Deux chemins, à départager en Phase 0 — le § 2.5 (retour d'expérience du projet mabedetheque) fait pencher pour le **chemin A**.

### Chemin A — Neon Data API (compatible PostgREST)

Neon expose une **Data API compatible PostgREST** (réimplémentation en Rust dans le proxy Neon). **Éprouvée** : le projet mabedetheque tourne dessus en production (§ 2.5).

Deux sous-options :

- **A1 — client `@neondatabase/postgrest-js`** (`NeonPostgrestClient`) : API quasi identique à `supabase-js` (`client.from("songs").select("*").order("title", { ascending: true })`). On réécrit les ~10 fetchers dans ce style (plus propre, typé) mais on abandonne la syntaxe query-string brute.
- **A2 — `fetch` brut sur l'URL Data API** en gardant la syntaxe PostgREST actuelle (`songs?id=eq.X&select=*`, `order=…`, `Prefer: …`) : `supabaseTable()` change juste d'URL de base (et d'en-tête d'auth si nécessaire). Le moins de code touché.

- **Modèle d'accès** : la Data API bascule sur le rôle Postgres `authenticated` si la requête porte un JWT valide, sinon sur `anonymous`. On accorde les droits par `grant select, insert, update, delete on <table> to anonymous;`. → **`grant … to anonymous` reproduit le modèle « accès ouvert » actuel de Calyxter** : l'URL de la Data API tient le rôle de l'ancienne clé publishable, sans JWT à gérer (§ 4.3 de la doc technique). À **confirmer en Phase 0** : une requête Data API *sans* en-tête `Authorization` aboutit bien quand `anonymous` a les droits.
- **Effort frontend** : faible (A2) à modéré (A1), un seul fichier.
- **Risque résiduel** : Data API en beta au 4 sept. 2026 (§ 2.5).

### Chemin B — Couche API maison sur Vercel Functions (recommandé si A ne tient pas)

Un petit endpoint `/api/db` (ou quelques routes REST) sur Vercel Functions, qui interroge Neon via `@neondatabase/serverless` (driver HTTP, compatible edge runtime). La chaîne de connexion Neon (avec identifiants) **reste côté serveur**, jamais dans le frontend — donc *plus* sûr qu'aujourd'hui.

Surface d'API réellement utilisée par `src/App.jsx` (inventaire complet) :

| Opération | Détail | Occurrences |
| --- | --- | --- |
| `select` | `select`, `order`, `limit`, filtres `col=eq.x` / `col=is.null` / `col=not.is.null` | 10 (`fetchMembers`, `loadSongs`, `fetchActivePhase`, `fetchPhaseHistory`, `fetchNotifications`, `fetchConcerts`, `fetchEvents`, `fetchIdeas`, `fetchComments`) |
| `upsert` | POST « merge on id » (`resolution=merge-duplicates`) | `upsertRows()` → songs, concerts, events, ideas, comments, phases |
| `insert` | POST simple | `notifications` |
| `patch` | mise à jour partielle par `id` | clôture de phase (`current_step`, `closed_at`, instantanés) |
| `delete` | par filtre `col=eq.x` | songs, concerts, events, ideas, comments (×3), phases (×2) |

→ **~6 formes d'opérations**, toutes concentrées dans le bloc « SUPABASE — connexion » de `src/App.jsx` (lignes ~186-330) + les callbacks `deleteX` / `saveX` / `updatePhase`. Le wrapper `supabaseTable()` existe déjà : c'est lui (et les ~10 fetchers) qu'on réécrit, pas les 4400 lignes du composant.

- **Effort frontend** : refonte bornée d'un seul fichier — réécrire `supabaseTable`/`upsertRows`/`callMemberAuth`/`searchDeezer` et les 10 fetchers vers la nouvelle API. Les appels `delete*` passent d'une query string PostgREST à un petit objet `{ table, where: { id } }`.
- **Avantage** : aucun secret dans le frontend ; indépendant de la maturité de la Data API ; **c'est le patron réutilisable** pour les autres projets.
- **Coût** : plus de code initial que le chemin A (mais une seule fois).

### Recommandation

**Chemin A** (sous-option A2 pour minimiser le code touché, ou A1 pour un data-layer plus propre), avec `grant … to anonymous` sur les 8 tables et **`member-auth` porté en Vercel Function** qui se connecte à Neon par la chaîne directe `NEON_DATABASE_URL` (en tant que propriétaire de la table, hors Data API — patron éprouvé par le script d'import de mabedetheque, § 2.5). Repli sur le **chemin B** uniquement si le test « Data API + `anonymous` sans JWT » échoue en Phase 0. La suite du plan couvre les deux ; les étapes spécifiques sont marquées **[A]** / **[B]**.

### Non retenu pour ce projet

- **Neon Managed Better Auth** : l'app a un modèle mot-de-passe-par-profil délibéré (§ 4 de la doc technique, qui écarte déjà Supabase Auth « jugé trop complexe pour 6 utilisateurs » — le même raisonnement s'applique). mabedetheque, qui l'utilise, a dû contourner un bug du client (`set-auth-jwt` non envoyé) et imposer HTTPS en dev local (cookie `Secure`) — complexité inutile ici. On garde `member-auth` (PBKDF2) tel quel, porté en Vercel Function.

### 2.5 Référence : le projet mabedetheque (Neon en production)

`~/Documents/git/mabedetheque` (dév. début septembre 2026) tourne déjà sur Neon — référence concrète pour ce chantier.

Ce qu'il valide / fournit comme patron :

- **Data API viable en prod.** Accès aux données via `@neondatabase/postgrest-js` (`NeonPostgrestClient`), API type `supabase-js`. Remplace directement `supabaseTable()` + les fetchers.
- **Rôles `authenticated` / `anonymous`** de la Data API : `grant … to authenticated;` / `to anonymous;` (voir `db/migrations/0001_init.sql`). Confirme qu'un accès **sans JWT** existe (rôle `anonymous`) — la piste retenue pour Calyxter.
- **`NEON_DATABASE_URL` (chaîne directe) = migrations et scripts uniquement**, jamais le runtime. mabedetheque s'en sert pour un import en masse « en tant que propriétaire de la table, contourne la Data API/RLS » — exactement le patron pour la migration des données (§ 6.3) et pour `member-auth` porté.
- **`NEXT_PUBLIC_NEON_DATA_API_URL`** exposée au client (public, OK — équivalent de la clé publishable).
- Migrations SQL numérotées dans `db/migrations/`, exécutées dans le SQL Editor Neon ou via `psql`. `create extension if not exists pgcrypto;` explicite en tête.
- `db/migrations/0001_init.sql` : bon modèle de schéma Neon (table + index + trigger `set_updated_at()` + RLS + grants) à décalquer pour adapter `recreate_full_schema.sql`.
- Ré-interrogation des données au retour au premier plan (`visibilitychange` + `focus`, `hooks/useAlbums.ts`) — même besoin que le rafraîchissement auto de Calyxter (§ 13.2 de la doc technique).

Pièges rencontrés par mabedetheque, à éviter :

| Piège | Détail | Impact pour Calyxter |
| --- | --- | --- |
| Bug du client unifié `@neondatabase/neon-js` | Son cache de JWT attend un en-tête de réponse `set-auth-jwt` que Managed Better Auth n'envoie pas (le token de session est un id, pas un JWT ; la Data API le rejette). Contournement : client Data API séparé qui va chercher un vrai JWT sur `/api/auth/token` à chaque requête. | **Sans objet** si Calyxter reste sur le rôle `anonymous` + `member-auth` maison (pas de Neon Auth). |
| Syntaxe des policies RLS | `auth.user_id() = owner_id` échoue silencieusement (lignes invisibles, écritures rejetées 42501) ; il faut `(select auth.user_id()) = owner_id`. | Pertinent **seulement** si Calyxter utilise la RLS derrière la Data API (chemin A avec rôle non-`anonymous`). Avec `anonymous` + grants ouverts, pas de policy à écrire. |
| HTTPS obligatoire en dev local | Neon Auth pose un cookie `Secure`, refusé par les navigateurs sur `http://localhost`. mabedetheque lance `next dev --experimental-https` + certif auto-signé. | **Sans objet** si Calyxter garde `member-auth` (pas de cookie). |
| Tout est en beta | Data API, Managed Better Auth, Object Storage — au 4 sept. 2026. | Prévoir des ajustements en conditions réelles ; garder Supabase en secours (§ 3). |
| Framework | mabedetheque est en **Next.js** (routes API et proxy intégrés). Calyxter est une **SPA Vite/React**. | Les *clients* Neon (`@neondatabase/postgrest-js`) se réutilisent tels quels ; les fonctions serveur (`member-auth`, `search-deezer`) doivent être des **Vercel Functions** autonomes dans `api/`, pas des routes Next. |

---

## 3. Filet de sécurité — retour rapide à la version Supabase

À tenir présent à chaque phase. La version Supabase actuelle est le **point de retour permanent** : elle ne doit jamais être dégradée avant la validation finale (Phase 6).

### 3.1 Ce qui reste intact pendant toute l'opération

- **Le projet Supabase** (base, données, Edge Functions, clé publishable) : on n'y touche **jamais** — ni schéma, ni données, ni fonctions — jusqu'à la Phase 6. Tous les dumps sont en lecture seule (`pg_dump` n'écrit rien sur la source).
- **Le code d'accès Supabase** dans `src/App.jsx` : conservé, pas supprimé, pendant toute la fenêtre de coexistence. La bascule se fait via **un seul point de commutation** — p. ex. `const BACKEND = 'supabase' | 'neon'` en tête de fichier, ou une variable d'environnement `VITE_BACKEND` — et non par un remplacement destructif. Revenir en arrière = changer cette valeur (une ligne) et redéployer.
- **Les déploiements Vercel antérieurs** : Vercel les conserve tous ; n'importe lequel peut être re-promu en production sans rebuild.

### 3.2 Repère du point de retour

- [ ] Avant la Phase 5 : `git tag pre-neon-migration <sha> && git push --tags` sur le dernier commit « ère Supabase ».
- [ ] Noter l'ID / l'URL du déploiement Vercel de production en cours (ère Supabase) — cible du rollback niveau 1.

### 3.3 Trois niveaux de retour arrière (du plus rapide au plus complet)

| Niveau | Quand | Comment | Délai | Perte de données |
| --- | --- | --- | --- | --- |
| **1 — Instant Rollback Vercel** | Le nouveau front est cassé ou injouable | Vercel → « Promote to Production » sur le dernier déploiement ère Supabase (ou `vercel rollback`). Aucun rebuild. | ~30 s | Les écritures faites sur Neon depuis la bascule |
| **2 — Revert Git** | Le problème est dans le code mergé, on veut repartir proprement | `git revert` du commit de bascule → redéploiement Vercel automatique | ~3-5 min | Idem niveau 1 |
| **3 — Retour des données** | Neon a tourné un moment, on ne veut pas perdre ce qui y a été écrit | Rejouer `db/rollback_neon_to_supabase.sh` (§ 3.4) : Neon → Supabase, puis niveau 1 ou 2 | ~15-30 min | Nulle (si le script a été répété à blanc) |

La version Supabase n'ayant jamais été modifiée, **le niveau 1 seul suffit à retrouver une application fonctionnelle** immédiatement. Les niveaux 2-3 ne servent qu'à consolider ensuite.

### 3.4 Script de retour des données (Neon → Supabase) — préparé à l'avance

- [ ] En Phase 1, écrire `db/rollback_neon_to_supabase.sh`, symétrique du script de migration : `pg_dump --data-only` depuis Neon, `truncate` des 8 tables Supabase dans l'ordre des clés étrangères, puis restauration.
- [ ] Le **répéter à blanc en Phase 4** (Neon de test → un projet Supabase jetable). Un rollback jamais testé n'est pas un rollback.

### 3.5 Réduire la fenêtre de perte à zéro

- Faire la bascule (Phase 5) pendant un **vrai créneau creux**, écritures gelées (bannière maintenance + annonce). S'il n'y a aucune écriture entre le dernier dump et la bascule, un rollback niveau 1 ne perd **rien**.
- Ne pas basculer si une phase de choix est en cours à une étape sensible (vote, résultat).

### 3.6 Critères de déclenchement (go / no-go)

- [ ] Fixer avant la bascule les conditions d'un rollback immédiat, p. ex. : un membre ne peut pas se connecter avec son mot de passe existant · une écriture échoue silencieusement · latence perçue > 3 s de façon répétée · toute perte de données constatée.
- [ ] Fenêtre d'observation : **48 h** avec le rollback niveau 1 armé (déploiement Supabase repéré, personne ne supprime rien). Sans incident au-delà, la bascule est considérée acquise.

### 3.7 Conservation

- [ ] Ne rien supprimer côté Supabase (projet, données, fonctions) avant **au moins 2 semaines** sans incident — voir Phase 6.

---

## 4. Phase 0 — Projet pilote (valider les inconnues)

Objectif : lever les incertitudes **avant** de toucher à la prod. Sur un projet Neon jetable, avec un jeu de données bidon.

**Kit préparé dans le dépôt (branche `migration-neon`)** :

- `db/neon_schema.sql` — schéma adapté pour Neon (rôle `anonymous` + grants ouverts, révocations de colonnes sur `members`, `pgcrypto`). Prêt à coller dans le SQL Editor Neon.
- `db/phase0_dataapi_test.sh` — le **test décisif** en `curl` (select / insert / upsert merge / patch / delete **sans `Authorization`**, + vérif de la protection de `password_hash`). Verdict automatique « chemin A confirmé » ou non.

**À faire côté dashboards (seul toi peux) :**

1. [ ] Créer un compte Neon, un **projet pilote** (région `aws eu-central-1` / Frankfurt), noter la chaîne de connexion **directe**.
2. [ ] SQL Editor du pilote → coller/exécuter `db/neon_schema.sql`.
3. [ ] Activer la **Data API** sur le projet (dashboard → Postgres database → Data API). Si le rôle `anonymous` est créé à ce moment-là, ré-exécuter le bloc « 10. » de `neon_schema.sql`. Copier l'**URL de la Data API**.
4. [ ] Lancer le test : `export NEON_DATA_API_URL='https://…' && bash db/phase0_dataapi_test.sh`. Me transmettre la sortie.

Selon le verdict, j'enchaîne :

- [ ] Si besoin de A1 vs A2 : essayer le client `@neondatabase/postgrest-js` (`NeonPostgrestClient`) contre la Data API du pilote.
- [ ] Créer une Vercel Function minimale (`api/ping-neon`) : `SELECT now()` sur Neon via `@neondatabase/serverless` avec `NEON_DATABASE_URL` (chaîne pooled). Mesurer la latence à froid (autosuspend Neon) — attendu ~300-800 ms sur la 1re requête.
- [ ] Porter `search-deezer` en Vercel Function (sans base) et valider le proxy Deezer + CORS.
- [ ] Porter `member-auth` en Vercel Function, connexion Neon par `NEON_DATABASE_URL` (propriétaire de la table, hors Data API — patron `scripts/db/run-import.mjs` de mabedetheque). **Réutiliser à l'identique** le hachage PBKDF2 (100 000 itérations, sel 16 octets, SHA-256, format `saltHex:hashHex`) via Web Crypto. Test croisé : `verify` d'un hash généré par l'ancienne fonction Supabase → **doit renvoyer OK** (compatibilité des mots de passe migrés).
- [ ] Vérifier les quotas Neon free : 0,5 Go stockage / projet (la base fait quelques Mo — large), 100 CU-h compute / mois (usage occasionnel à 6 — large), autosuspend après inactivité (accepter le cold start).
- [ ] **Trancher A (A1 ou A2) vs B** et figer la suite du plan.

---

## 5. Phase 1 — Préparation (sans impact prod)

- [ ] Créer le projet Neon définitif (nom explicite, région proche : `eu-central` ou `eu-west`).
- [ ] Récupérer les chaînes de connexion : **pooled** (pour les fonctions serverless) et **direct** (pour `pg_dump`/`pg_restore`).
- [ ] Créer une branche Git `migration-neon` pour tout le travail de code.
- [ ] Ajouter les dépendances : `@neondatabase/serverless` (chemin B), éventuellement `pg` pour les scripts de migration.
- [ ] Introduire le **point de commutation unique** dans `src/App.jsx` (`BACKEND` / `VITE_BACKEND`, § 3.1) : le code Supabase actuel reste actif par défaut, le code Neon vit à côté.
- [ ] Créer le dossier `api/` (Vercel Functions) :
  - [ ] `api/search-deezer.*` (portage direct de `supabase/functions/search-deezer/index.ts`).
  - [ ] `api/member-auth.*` (portage, hachage inchangé, connexion Neon via chaîne pooled).
  - [ ] **[B]** `api/db.*` — endpoint générique `{ op, table, select?, where?, order?, limit?, rows? }` couvrant les 6 formes du § 2. Valider `table` contre une liste blanche (les 8 tables), interdire tout SQL arbitraire.
- [ ] Écrire `db/rollback_neon_to_supabase.sh` (§ 3.4).
- [ ] Variables d'environnement Vercel (Preview + Production) : `DATABASE_URL` (pooled Neon), et pour `member-auth` la même chaîne (il lui faut les droits d'écriture sur `members`). **[A]** ajouter `NEON_DATA_API_URL` + le token.
- [ ] Adapter `src/App.jsx` (bloc connexion + fetchers + `callMemberAuth` + `searchDeezer`) derrière le point de commutation — **sur la branche, non déployé en prod**.
- [ ] Adapter la **doc technique** (`Calyxter_Documentation_Technique.md`) : sections 2 (architecture), 2.2 (fonctions → Vercel), 4 (accès), 14 (déploiement), 18 (première installation).
- [ ] Mettre à jour `supabase/` → renommer ou dupliquer en `db/` : garder `recreate_full_schema.sql` (adapté § 6.2) comme source de vérité du schéma, déplacer les fonctions sous `api/`.

---

## 6. Phase 2 — Migration des données

Supabase et Neon sont tous deux du PostgreSQL standard : `pg_dump` / `pg_restore` suffisent. La base est petite (161 morceaux, une poignée de concerts/rendez-vous, historique de phases) → dump de quelques Mo, restauration en quelques secondes.

### 6.1 Pré-requis

- [ ] `pg_dump` / `psql` installés (version ≥ celle du serveur Supabase ; `brew install libpq` puis ajouter au PATH sur macOS).
- [ ] Chaîne de connexion **directe** Supabase (Dashboard → Project Settings → Database → Connection string, mode « URI », **pas** le pooler pour le dump) et chaîne **directe** Neon.

### 6.2 Adapter le schéma pour Neon

Le script `recreate_full_schema.sql` contient des éléments **spécifiques à Supabase** à retirer ou adapter :

- [ ] Retirer les `grant` / `revoke` sur les rôles `anon` / `authenticated` (n'existent pas sur Neon).
  - **[B]** La protection de `members.password_hash` / `last_activity_at` est alors assurée par la couche API (l'endpoint ne sélectionne jamais `password_hash` pour le client ; l'écriture de ces colonnes n'est possible que via `api/member-auth`). Comme aujourd'hui côté code (`safeMember`).
  - **[A]** Recréer des rôles Neon équivalents et rejouer les `revoke` adaptés ; garder `enable row level security` + les policies (indispensables si la Data API est le seul rempart).
- [ ] **[B]** Retirer / commenter `enable row level security` et les policies « app access » : inutiles derrière une couche API maison (à garder seulement comme défense en profondeur si souhaité).
- [ ] Vérifier `gen_random_uuid()` : natif en PostgreSQL ≥ 13, donc OK sur Neon (PG 14+) sans extension. Si le script fait `create extension pgcrypto`, le garder (disponible sur Neon) ou le retirer.
- [ ] Conserver tel quel : les 8 `create table`, les types `enum`, les contraintes PK/FK, les index.
- [ ] Produire `db/neon_schema.sql` (version nettoyée) et le versionner.

### 6.3 Procédure de migration

À faire **deux fois** : une répétition à blanc (Phase 2 elle-même), puis pour de vrai lors de la bascule (Phase 5).

```bash
# 1. Schéma sur Neon (version adaptée)
psql "$NEON_DIRECT_URL" -f db/neon_schema.sql

# 2. Dump des données seules depuis Supabase (pas le schéma, pas les droits)
pg_dump "$SUPABASE_DIRECT_URL" \
  --data-only --no-owner --no-privileges \
  --disable-triggers \
  --table=public.members --table=public.songs --table=public.phases \
  --table=public.notifications --table=public.concerts --table=public.events \
  --table=public.ideas --table=public.comments \
  --file=calyxter_data.sql

# 3. Restauration sur Neon
psql "$NEON_DIRECT_URL" -f calyxter_data.sql

# 4. Vérification des volumes
psql "$NEON_DIRECT_URL" -c "
  select 'members' t, count(*) from members
  union all select 'songs', count(*) from songs
  union all select 'phases', count(*) from phases
  union all select 'notifications', count(*) from notifications
  union all select 'concerts', count(*) from concerts
  union all select 'events', count(*) from events
  union all select 'ideas', count(*) from ideas
  union all select 'comments', count(*) from comments
  order by 1;"
```

- [ ] Comparer chaque `count(*)` avec la source Supabase (`psql "$SUPABASE_DIRECT_URL" -c "…"` idem).
- [ ] Contrôles ponctuels :
  - [ ] `members` : les 6 profils, avec `password_hash` **non nul et identique** à la source (⇒ les mots de passe existants resteront valides).
  - [ ] `phases` : la phase active éventuelle (`closed_at is null`), l'historique complet.
  - [ ] `songs` : 161 lignes (ou le compte réel), statuts répartis correctement.
  - [ ] `comments` : `event_id` / `concert_id` cohérents (jamais les deux, cf. § 3.8 de la doc technique).
  - [ ] `jsonb` (`song_ids`, `vetoes`, `votes`, `participant_ids`, `links`, `excluded_dates`…) : valeurs bien transférées (spot check sur 2-3 lignes).
- [ ] Ordre d'insertion : `pg_dump --data-only` gère les FK via `--disable-triggers` ; si un souci, restaurer dans l'ordre members → songs/phases/notifications → concerts/events/ideas → comments.
- [ ] Pas de séquences à resynchroniser (tous les `id` en `uuid` avec `default gen_random_uuid()`, pas de `serial`).

---

## 7. Phase 3 — Bascule du frontend (sur la branche)

- [ ] Basculer le point de commutation (§ 3.1) sur `neon` :
  - **[A]** `NEON_DATA_API_URL` + token statique Neon ; `supabaseTable()` quasi inchangée.
  - **[B]** appels routés vers `/api/db`, `/api/member-auth`, `/api/search-deezer` ; plus aucun identifiant dans le frontend.
- [ ] Adapter `upsertRows` : la logique « union des clés + `_at` = now() » (contrainte PGRST102) n'a peut-être plus lieu d'être — **[B]** l'API maison peut accepter des objets hétérogènes ; simplifier si possible, sinon garder.
- [ ] `deleteEvent` / `deleteConcert` : la suppression préalable des `comments` liés reste nécessaire (aucune clause `ON DELETE` — inchangé).
- [ ] `npm run build` OK, `npm run dev` OK.
- [ ] Déployer la branche en **Preview Vercel**, pointant sur le **projet Neon de test** contenant une copie des données (répétition de la Phase 2).

---

## 8. Phase 4 — Recette fonctionnelle (sur le Preview)

Tester chaque parcours avec 1-2 membres réels, contre la copie des données :

- [ ] Écran de connexion : choix de profil, **connexion avec un mot de passe existant** (validation cruciale de la migration du `password_hash`), création de mot de passe pour un profil de test.
- [ ] Accueil : prochain rendez-vous / concert, récap phase, dernières connexions (tamponnage `last_activity_at` via `touch`).
- [ ] Répertoire : liste, filtres, **recherche Deezer** (ajout d'un morceau prérempli), édition, suppression, détection de doublon.
- [ ] Phase de choix : lancer, proposer, veto, vote (glisser-déposer + brouillon), résultat, **clôture** (instantanés `proposed_count` / `result`), historique, annulation.
- [ ] Concerts : création (nom/date/heure/durée/lieu), set + ordonnancement, durée calculée, copie presse-papier, **« Ajouter à mon agenda »** (.ics), suppression (avec commentaires liés).
- [ ] Rendez-vous : création simple + multi-jours + récurrent, participants, filtre par type, **.ics** (série entière), suppression d'occurrence / de série.
- [ ] Commentaires : ajout / suppression sur concert et rendez-vous, bulle de comptage, journalisation.
- [ ] Boîte à idées : ajout, changement de statut, suppression.
- [ ] Journal d'activité : toutes les notifications ci-dessus apparaissent.
- [ ] Rafraîchissement automatique (version.json) : inchangé, revérifier quand même.
- [ ] Mobile : mise en page, zoom iOS, champs date, .ics.
- [ ] Latence : acceptable même avec cold start Neon.
- [ ] **Répéter à blanc le rollback des données Neon → Supabase** (`db/rollback_neon_to_supabase.sh`, § 3.4) contre un projet Supabase jetable — vérifier les volumes après.

---

## 9. Phase 5 — Bascule en production

Fenêtre de maintenance courte (app utilisée occasionnellement par 6 personnes).

- [ ] `git tag pre-neon-migration` + repérer le déploiement Vercel de prod actuel (§ 3.2).
- [ ] Fixer les critères go / no-go (§ 3.6).
- [ ] Annoncer dans le groupe : « app indisponible ~30 min le [date/heure creuse] ».
- [ ] Choisir un créneau sans écritures en cours (pas de phase de choix à une étape sensible).
- [ ] Geler les écritures : prévenir + (optionnel) bannière « maintenance » sur le front actuel.
- [ ] **Rejouer la Phase 2** (dump Supabase → restore Neon) sur le projet Neon **de production**, avec les données les plus fraîches.
- [ ] Vérifs de volumes + contrôles ponctuels (§ 6.3).
- [ ] Merger `migration-neon` dans `main` (point de commutation sur `neon`, `api/`, doc) → déploiement Vercel automatique.
- [ ] Vérifier les variables d'env **Production** sur Vercel (pas seulement Preview).
- [ ] Test de fumée immédiat : connexion d'un membre, une lecture, une écriture (créer puis supprimer une idée de test).
- [ ] Retirer la bannière maintenance, annoncer « c'est reparti ».
- [ ] **Observation 48 h**, rollback niveau 1 armé (§ 3.3, § 3.6). Surveiller le journal Vercel Functions et les métriques Neon.

**En cas de blocage** : appliquer le niveau de rollback approprié (§ 3.3). Le niveau 1 (Instant Rollback Vercel, ~30 s) restaure une application fonctionnelle immédiatement, la version Supabase n'ayant jamais été touchée.

---

## 10. Phase 6 — Nettoyage (après période d'observation)

- [ ] Au moins **2 semaines** sans incident (§ 3.7).
- [ ] Supprimer / mettre en pause le projet Supabase (libère 1 des 2 slots gratuits).
- [ ] Retirer du dépôt : le point de commutation et le code d'accès Supabase, `supabase/functions/` (déplacé sous `api/`), les références Supabase dans la doc, `db/rollback_neon_to_supabase.sh` si on considère le retour arrière définitivement clos.
- [ ] Supprimer la dépendance / les scripts de migration ponctuels.
- [ ] Mettre à jour la mémoire projet et le § 16 (changelog) de la doc technique.
- [ ] Documenter le socle « Neon + Vercel Functions » comme patron réutilisable pour les prochains projets.

---

## 11. Risques et mitigations

| Risque | Impact | Mitigation |
| --- | --- | --- |
| Data API : le rôle `anonymous` + grants ne suffit pas sans JWT | Chemin A tel qu'envisagé non viable | Test décisif en Phase 0 (§ 4) ; replis : JWT statique, ou chemin B (couche API maison) déjà spécifié |
| Data API / composants Neon en beta (au 4 sept. 2026) | Comportement inattendu en conditions réelles | mabedetheque a essuyé les plâtres (§ 2.5) ; recette § 8 exhaustive ; Supabase gardé en secours (§ 3) |
| Incompatibilité du hachage des mots de passe après portage | Les 6 membres ne peuvent plus se connecter | Réutiliser l'algo PBKDF2 **à l'identique** ; test croisé ancien hash / nouvelle fonction en Phase 0 ; migrer la colonne `password_hash` telle quelle |
| Piège RLS `auth.user_id()` (si RLS utilisée) | Lignes invisibles, écritures rejetées 42501 | Utiliser `(select auth.user_id()) = …` (§ 2.5) — ou éviter la RLS en restant sur le rôle `anonymous` + grants ouverts |
| Perte d'écritures pendant la fenêtre de bascule | Quelques données récentes perdues | Fenêtre courte + créneau creux + gel des écritures (§ 3.5) ; script de retour des données préparé et répété (§ 3.4) |
| Blocage après bascule prod | App indisponible pour le groupe | Filet de sécurité § 3 : rollback niveau 1 en ~30 s, Supabase jamais modifié, observation 48 h armée |
| `jsonb` / `enum` mal transférés | Corruption silencieuse | `--data-only` de `pg_dump` les préserve ; contrôles ponctuels § 6.3 |
| Cold start Neon (autosuspend) | 1re requête ~500 ms après inactivité | Acceptable pour cet usage ; mentionné dans la doc ; possibilité de désactiver l'autosuspend (coûte des CU-h) |
| Data API Neon jeune, bugs | Régressions | Recette § 8 exhaustive ; chemin B en repli ; Supabase gardé 2 semaines |
| Régression sur le refactor du data-layer (chemin B) | Bugs fonctionnels | Un seul fichier touché, surface d'API réduite (§ 2) ; recette § 8 ; Preview avant prod |
| `pg_dump` version mismatch | Dump échoue | Installer une version de `pg_dump` ≥ serveur ; tester en Phase 2 |
| Rollback jamais testé | Le filet de sécurité ne fonctionne pas le jour J | Répétition à blanc du rollback données en Phase 4 (§ 3.4) ; niveau 1 vérifiable à tout moment sur Vercel |

---

## 12. Estimation d'effort (ordre de grandeur, dev solo)

| Phase | Chemin A | Chemin B |
| --- | --- | --- |
| 0 — Pilote | 0,5 j | 1 j |
| 1 — Préparation (code + Vercel Functions + script rollback) | 0,5 j | 1,5-2 j |
| 2 — Migration données (script + répétition) | 0,5 j | 0,5 j |
| 3 — Bascule frontend | 0,5 j | 1 j |
| 4 — Recette (dont répétition rollback) | 0,5 j | 0,5-1 j |
| 5 — Bascule prod | 0,5 j (dont fenêtre ~30 min) | 0,5 j |
| 6 — Nettoyage | 0,25 j | 0,25 j |
| **Total** | **~3-3,5 j** | **~5-6,5 j** |

À étaler sur plusieurs sessions ; seule la Phase 5 implique une indisponibilité (courte).

---

## 13. Ordre d'exécution résumé

1. Phase 0 sur un pilote jetable → **trancher A ou B**.
2. Phases 1-2-3 sur la branche `migration-neon` + un projet Neon de test, code Neon derrière un point de commutation (Supabase reste actif par défaut).
3. Phase 4 (recette + répétition du rollback) sur un Preview Vercel.
4. Phase 5 (bascule prod) sur un créneau annoncé, tag `pre-neon-migration` posé, rollback niveau 1 armé.
5. Observation 48 h puis 2 semaines, Supabase gardé en secours (§ 3).
6. Phase 6 (nettoyage) une fois la bascule acquise.
