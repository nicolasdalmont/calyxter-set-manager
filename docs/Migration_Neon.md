# Migration Supabase → Neon — plan détaillé

Statut : **plan, non commencé.** Décision d'architecture à trancher lors de la Phase 0 (projet pilote). Cocher les cases au fur et à mesure.

Motivation : le plan gratuit Supabase plafonne à 2 projets actifs ; le plan gratuit Neon en autorise ~100. L'objectif est d'avoir un socle unique (Neon + Vercel) réutilisable pour les autres projets à venir. Ce document ne concerne que `calyxter-set-manager`.

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

Le cœur du chantier. Deux chemins, à départager en Phase 0.

### Chemin A — Neon Data API (compatible PostgREST)

Neon expose désormais une **Data API compatible PostgREST** (réimplémentation en Rust dans le proxy Neon). Le protocole est identique à celui que `supabaseTable()` utilise déjà.

- **Effort frontend** : minime — changer l'URL de base et l'en-tête d'authentification, garder la syntaxe de requête PostgREST (`songs?id=eq.X&select=*`, `order=…`, `Prefer: resolution=merge-duplicates`…).
- **Inconnue à valider (Phase 0)** : la Data API Neon valide des **JWT** et applique la RLS. L'app actuelle utilise une **clé statique non-JWT** (`sb_publishable_…`) + RLS ouverte. Il faut vérifier qu'on peut reproduire ce modèle « clé publique + accès ouvert » :
  - soit un **JWT statique longue durée** signé par un secret / JWKS configuré côté Neon, embarqué dans le frontend (même posture de sécurité qu'aujourd'hui : la sécurité repose sur la confidentialité du lien, § 4.3 de la doc technique) ;
  - soit un rôle anonyme accepté sans JWT, si la Data API le permet.
- **Risque** : produit récent, moins éprouvé que PostgREST/Supabase (années de production).

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

Tester le **chemin A d'abord** en Phase 0 (le moins cher si ça marche). Basculer sur le **chemin B** si le modèle « token statique + accès ouvert » de la Data API ne se configure pas proprement. La suite du plan couvre les deux ; les étapes spécifiques sont marquées **[A]** / **[B]**.

### Non retenu pour ce projet

- **Neon Auth** (ajouté début 2026) : pertinent pour de futurs projets à comptes e-mail, mais l'app a un modèle mot-de-passe-par-profil délibéré (§ 4 de la doc technique). Ne pas l'introduire ici.

---

## 3. Phase 0 — Projet pilote (valider les inconnues)

Objectif : lever les incertitudes **avant** de toucher à la prod. Sur un projet Neon jetable, avec un jeu de données bidon.

- [ ] Créer un compte Neon + un projet pilote.
- [ ] Créer le schéma (voir § 5.2 pour la version adaptée du script).
- [ ] **[A]** Activer la Data API sur le projet. Tenter de configurer un accès par **token statique** (JWT longue durée via secret/JWKS, ou rôle anonyme). Depuis un `curl`, reproduire : un `select` filtré, un `upsert` « merge on id », un `delete` par filtre. **Conclusion : chemin A viable ou non ?**
- [ ] **[B]** Créer une Vercel Function minimale (`api/ping-neon`) qui fait un `SELECT now()` sur Neon via `@neondatabase/serverless`. Vérifier latence à froid (autosuspend Neon) — attendu ~300-800 ms sur la 1re requête, puis rapide.
- [ ] Porter `search-deezer` en Vercel Function (le plus simple, sans base) et valider le proxy Deezer + CORS.
- [ ] Porter `member-auth` en Vercel Function : **réutiliser à l'identique** le hachage PBKDF2 (100 000 itérations, sel 16 octets, SHA-256, format `saltHex:hashHex`) via Web Crypto. Tester `set` puis `verify` avec un hash généré par l'ancienne fonction → **doit vérifier OK** (garantit la compatibilité des mots de passe migrés).
- [ ] Vérifier les quotas Neon free : 0,5 Go stockage / projet (la base fait quelques Mo — large), 100 CU-h compute / mois (usage occasionnel à 6 — large), autosuspend après inactivité (accepter le cold start).
- [ ] **Trancher A vs B** et figer la suite du plan.

---

## 4. Phase 1 — Préparation (sans impact prod)

- [ ] Créer le projet Neon définitif (nom explicite, région proche : `eu-central` ou `eu-west`).
- [ ] Récupérer les chaînes de connexion : **pooled** (pour les fonctions serverless) et **direct** (pour `pg_dump`/`pg_restore`).
- [ ] Créer une branche Git `migration-neon` pour tout le travail de code.
- [ ] Ajouter les dépendances : `@neondatabase/serverless` (chemin B), éventuellement `pg` pour les scripts de migration.
- [ ] Créer le dossier `api/` (Vercel Functions) :
  - [ ] `api/search-deezer.*` (portage direct de `supabase/functions/search-deezer/index.ts`).
  - [ ] `api/member-auth.*` (portage, hachage inchangé, connexion Neon via chaîne pooled).
  - [ ] **[B]** `api/db.*` — endpoint générique `{ op, table, select?, where?, order?, limit?, rows? }` couvrant les 6 formes du § 2. Valider `table` contre une liste blanche (les 8 tables), interdire tout SQL arbitraire.
- [ ] Variables d'environnement Vercel (Preview + Production) : `DATABASE_URL` (pooled Neon), et pour `member-auth` la même chaîne (il lui faut les droits d'écriture sur `members`). **[A]** ajouter `NEON_DATA_API_URL` + le token.
- [ ] Adapter `src/App.jsx` (bloc connexion + fetchers + `callMemberAuth` + `searchDeezer`) — **sur la branche, non déployé en prod**.
- [ ] Adapter la doc technique : § 2 (architecture), § 2.2 (fonctions → Vercel), § 4 (accès), § 14 (déploiement), § 18 (première installation).
- [ ] Mettre à jour `supabase/` → renommer ou dupliquer en `db/` : garder `recreate_full_schema.sql` (adapté § 5.2) comme source de vérité du schéma, déplacer les fonctions sous `api/`.

---

## 5. Phase 2 — Migration des données

Supabase et Neon sont tous deux du PostgreSQL standard : `pg_dump` / `pg_restore` suffisent. La base est petite (161 morceaux, une poignée de concerts/rendez-vous, historique de phases) → dump de quelques Mo, restauration en quelques secondes.

### 5.1 Pré-requis

- [ ] `pg_dump` / `psql` installés (version ≥ celle du serveur Supabase ; `brew install libpq` puis ajouter au PATH sur macOS).
- [ ] Chaîne de connexion **directe** Supabase (Dashboard → Project Settings → Database → Connection string, mode « URI », **pas** le pooler pour le dump) et chaîne **directe** Neon.

### 5.2 Adapter le schéma pour Neon

Le script `recreate_full_schema.sql` contient des éléments **spécifiques à Supabase** à retirer ou adapter :

- [ ] Retirer les `grant` / `revoke` sur les rôles `anon` / `authenticated` (n'existent pas sur Neon).
  - **[B]** La protection de `members.password_hash` / `last_activity_at` est alors assurée par la couche API (l'endpoint ne sélectionne jamais `password_hash` pour le client ; l'écriture de ces colonnes n'est possible que via `api/member-auth`). Comme aujourd'hui côté code (`safeMember`).
  - **[A]** Recréer des rôles Neon équivalents et rejouer les `revoke` adaptés ; garder `enable row level security` + les policies (indispensables si la Data API est le seul rempart).
- [ ] **[B]** Retirer / commenter `enable row level security` et les policies « app access » : inutiles derrière une couche API maison (à garder seulement comme défense en profondeur si souhaité).
- [ ] Vérifier `gen_random_uuid()` : natif en PostgreSQL ≥ 13, donc OK sur Neon (PG 14+) sans extension. Si le script fait `create extension pgcrypto`, le garder (disponible sur Neon) ou le retirer.
- [ ] Conserver tel quel : les 8 `create table`, les types `enum`, les contraintes PK/FK, les index.
- [ ] Produire `db/neon_schema.sql` (version nettoyée) et le versionner.

### 5.3 Procédure de migration

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
  - [ ] `comments` : `event_id` / `concert_id` cohérents (jamais les deux, cf. § 3.8).
  - [ ] `jsonb` (`song_ids`, `vetoes`, `votes`, `participant_ids`, `links`, `excluded_dates`…) : valeurs bien transférées (spot check sur 2-3 lignes).
- [ ] Ordre d'insertion : `pg_dump --data-only` gère les FK via `--disable-triggers` ; si un souci, restaurer dans l'ordre members → songs/phases/notifications → concerts/events/ideas → comments.
- [ ] Pas de séquences à resynchroniser (tous les `id` en `uuid` avec `default gen_random_uuid()`, pas de `serial`).

---

## 6. Phase 3 — Bascule du frontend (sur la branche)

- [ ] Remplacer dans `src/App.jsx` :
  - **[A]** `SUPABASE_URL` → `NEON_DATA_API_URL`, `SUPABASE_ANON_KEY` → token statique Neon ; `supabaseTable()` quasi inchangée.
  - **[B]** `SUPABASE_URL`/`ANON_KEY` supprimées du frontend ; `supabaseTable()` réécrite en `apiRequest(op, params)` vers `/api/db` ; `callMemberAuth` → `/api/member-auth` ; `searchDeezer` → `/api/search-deezer`.
- [ ] Adapter `upsertRows` : la logique « union des clés + `_at` = now() » (contrainte PGRST102) n'a peut-être plus lieu d'être — **[B]** l'API maison peut accepter des objets hétérogènes ; simplifier si possible, sinon garder.
- [ ] `deleteEvent` / `deleteConcert` : la suppression préalable des `comments` liés reste nécessaire (aucune clause `ON DELETE` — inchangé).
- [ ] `npm run build` OK, `npm run dev` OK.
- [ ] Déployer la branche en **Preview Vercel**, pointant sur le **projet Neon de test** contenant une copie des données (répétition de la Phase 2).

---

## 7. Phase 4 — Recette fonctionnelle (sur le Preview)

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

---

## 8. Phase 5 — Bascule en production

Fenêtre de maintenance courte (app utilisée occasionnellement par 6 personnes).

- [ ] Annoncer dans le groupe : « app indisponible ~30 min le [date/heure creuse] ».
- [ ] Idéalement, choisir un créneau où personne n'écrit (pas de phase de choix en cours à une étape sensible).
- [ ] Geler les écritures : prévenir + (optionnel) déployer une bannière « maintenance » sur le front actuel.
- [ ] **Rejouer la Phase 2** (dump Supabase → restore Neon) sur le projet Neon **de production**, avec les données les plus fraîches.
- [ ] Vérifs de volumes + contrôles ponctuels (§ 5.3).
- [ ] Merger `migration-neon` dans `main` (config Neon, `api/`, doc) → déploiement Vercel automatique.
- [ ] Vérifier les variables d'env **Production** sur Vercel (pas seulement Preview).
- [ ] Test de fumée immédiat : connexion d'un membre, une lecture, une écriture (créer puis supprimer une idée de test).
- [ ] Retirer la bannière maintenance, annoncer « c'est reparti ».
- [ ] Surveiller le journal Vercel Functions et les métriques Neon pendant 24-48 h.

### Rollback

- Rollback = `git revert` du merge + redéploiement Vercel → retour sur Supabase.
- Fenêtre de risque : les écritures faites sur Neon entre la bascule et un éventuel rollback seraient perdues. Vu le faible trafic et la fenêtre courte, acceptable ; sinon, refaire un dump Neon → Supabase avant de revenir.
- **Garder le projet Supabase actif (non supprimé) pendant au moins 2 semaines** après la bascule.

---

## 9. Phase 6 — Nettoyage (après période d'observation)

- [ ] Supprimer / mettre en pause le projet Supabase (libère 1 des 2 slots gratuits).
- [ ] Retirer du dépôt : `supabase/functions/` (déplacé sous `api/`), les références Supabase dans la doc.
- [ ] Retirer la dépendance / les scripts de migration ponctuels.
- [ ] Mettre à jour la mémoire projet et le § 16 (changelog) de la doc technique.
- [ ] Documenter le socle « Neon + Vercel Functions » comme patron réutilisable pour les prochains projets.

---

## 10. Risques et mitigations

| Risque | Impact | Mitigation |
| --- | --- | --- |
| Data API Neon : pas de modèle « token statique + accès ouvert » simple | Chemin A non viable | Phase 0 le valide **avant** tout ; repli sur chemin B (couche API maison) déjà spécifié |
| Incompatibilité du hachage des mots de passe après portage | Les 6 membres ne peuvent plus se connecter | Réutiliser l'algo PBKDF2 **à l'identique** ; test croisé ancien hash / nouvelle fonction en Phase 0 ; migrer la colonne `password_hash` telle quelle |
| Perte d'écritures pendant la fenêtre de bascule | Quelques données récentes perdues | Fenêtre courte + créneau creux + annonce ; à la limite, second dump différentiel |
| `jsonb` / `enum` mal transférés | Corruption silencieuse | `--data-only` de `pg_dump` les préserve ; contrôles ponctuels § 5.3 |
| Cold start Neon (autosuspend) | 1re requête ~500 ms après inactivité | Acceptable pour cet usage ; mentionné dans la doc ; possibilité de désactiver l'autosuspend (coûte des CU-h) |
| Data API Neon jeune, bugs | Régressions | Recette § 7 exhaustive ; chemin B en repli ; Supabase gardé 2 semaines |
| Régression sur le refactor du data-layer (chemin B) | Bugs fonctionnels | Un seul fichier touché, surface d'API réduite (§ 2) ; recette § 7 ; Preview avant prod |
| `pg_dump` version mismatch | Dump échoue | Installer une version de `pg_dump` ≥ serveur ; tester en Phase 2 |

---

## 11. Estimation d'effort (ordre de grandeur, dev solo)

| Phase | Chemin A | Chemin B |
| --- | --- | --- |
| 0 — Pilote | 0,5 j | 1 j |
| 1 — Préparation (code + Vercel Functions) | 0,5 j | 1,5-2 j |
| 2 — Migration données (script + répétition) | 0,5 j | 0,5 j |
| 3 — Bascule frontend | 0,5 j | 1 j |
| 4 — Recette | 0,5 j | 0,5 j |
| 5 — Bascule prod | 0,5 j (dont fenêtre ~30 min) | 0,5 j |
| 6 — Nettoyage | 0,25 j | 0,25 j |
| **Total** | **~3 j** | **~5-6 j** |

À étaler sur plusieurs sessions ; seules les Phases 5 impliquent une indisponibilité (courte).

---

## 12. Ordre d'exécution résumé

1. Phase 0 sur un pilote jetable → **trancher A ou B**.
2. Phases 1-2-3 sur la branche `migration-neon` + un projet Neon de test.
3. Phase 4 (recette) sur un Preview Vercel.
4. Phase 5 (bascule prod) sur un créneau annoncé.
5. Observation 2 semaines, Supabase gardé en secours.
6. Phase 6 (nettoyage).
