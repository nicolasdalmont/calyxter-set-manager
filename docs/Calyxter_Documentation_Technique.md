CALYXTER

SET MANAGER

Documentation technique et fonctionnelle

Version 1.9 — 6 septembre 2026

Statut : application déployée, en phase de test avec les 6 membres du groupe.

Depuis la v1.8 : **notes de transition** dans les sets de concert (§ 7.2) — repères libres insérés entre les morceaux (lancements, enchaînements, remerciements), comptés pour 3 min chacun dans la durée du set, stockés dans la nouvelle colonne `concerts.set_items` (§ 3.5) ; **export imprimable du set sur une page** (§ 7.4). Correction d'un bug de la couche `/api/db` : les écritures portant un tableau JSON (set d'un concert, participants d'un rendez-vous, vetos/votes d'une phase) échouaient en base (§ 16.9).

Depuis la v1.7 : **migration du backend de Supabase vers Neon** (base PostgreSQL) avec une couche de fonctions serveur `/api/*` sur Vercel — le frontend ne se connecte plus jamais directement à la base, et plus aucun identifiant d'accès aux données n'est présent dans son code. Section § 2.5 décrivant cette migration et le filet de retour arrière. Le projet Supabase est conservé intact quelques semaines comme filet de sécurité avant nettoyage.

# 1. Présentation du projet

Calyxter Set Manager est une application web sur-mesure développée pour le groupe de rock Calyxter, destinée à centraliser la gestion du répertoire musical, à automatiser le processus collaboratif de sélection de nouveaux morceaux (reprises et compositions), et désormais à organiser la vie du groupe dans la durée : sets de concert et agenda des rendez-vous (répétitions, ateliers, résidences).

L'application répond à quatre enjeux :

- Centralisation & durée — vision claire du répertoire, classé par statut, avec calcul automatique du temps de jeu cumulé.

- Multiplateforme — Progressive Web App accessible depuis mobile et ordinateur, sans installation obligatoire.

- Gouvernance démocratique — workflow guidé en 4 étapes (Proposition, Veto, Vote, Résultat) pour choisir collectivement les nouveaux morceaux à travailler.

- Organisation collective — préparation des sets de concert à partir du répertoire, et agenda partagé des rendez-vous du groupe, récurrents ou ponctuels.

L'application est aujourd'hui déployée publiquement et opérationnelle. Les 6 membres du groupe disposent chacun d'un profil et d'un mot de passe personnel, et le répertoire complet (161 morceaux) a été importé depuis le fichier de suivi existant du groupe.

# 2. Architecture technique

L'application suit une architecture web moderne, entièrement hébergée sur des services gérés (aucun serveur à administrer), et gratuite aux volumes d'usage actuels.

| Composant | Technologie | Rôle |
| --- | --- | --- |
| Frontend | React 18 + Vite | Interface utilisateur (PWA), un seul composant principal (App.jsx) |
| Hébergement frontend | Vercel | Build et diffusion publique de l'application (déploiement automatique depuis GitHub) |
| Code source | GitHub | Dépôt versionné ; toute modification poussée sur la branche principale redéploie automatiquement l'app sur Vercel |
| Base de données | Neon (PostgreSQL) | Stockage des membres, morceaux, phases de choix, notifications, concerts, rendez-vous, idées et commentaires |
| Fonctions serveur | Vercel Functions (Node, dossier `api/`) | Accès à la base (`api/db`), gestion sécurisée des mots de passe et tamponnage de la dernière activité (`api/member-auth`), relais de recherche Deezer (`api/search-deezer`) |
| API externe | Deezer (catalogue public) | Recherche de morceaux avec auto-complétion (titre, artiste, durée, pochette) |

L'historique de cette architecture (backend Supabase jusqu'en septembre 2026, puis migration vers Neon) est décrit au § 2.5.

## 2.1 Flux général

Le navigateur (frontend React) ne se connecte **jamais directement à la base de données**. Il appelle des fonctions serveur hébergées par Vercel dans le dossier `api/` du dépôt, toutes en `POST` (ou `GET` pour Deezer), au format JSON, sur la même origine que l'application (pas de CORS) :

- `api/db` — point d'accès générique aux tables (lecture et écriture), décrit au § 2.2.
- `api/member-auth` — création et vérification des mots de passe, tamponnage de l'activité (§ 2.2, § 4).
- `api/search-deezer` — relais vers le catalogue public Deezer (§ 2.2, § 12).

Seules ces fonctions détiennent la chaîne de connexion à Neon (`DATABASE_URL`), fournie par une variable d'environnement Vercel et **jamais exposée au frontend**. Aucune autre couche serveur propriétaire n'a été développée : toute la logique applicative réside dans le composant React et dans ces trois fonctions serverless.

## 2.2 Les trois fonctions serveur (`api/`)

Code versionné dans `api/` à la racine du dépôt (Node, modules ES). Vercel les transforme automatiquement en fonctions serverless, servies sous `/api/<nom>` sur la même origine que l'application. Le helper partagé `lib/neon.js` ouvre la connexion à Neon via le pilote HTTP `@neondatabase/serverless` en lisant `DATABASE_URL`. Toutes renvoient du JSON.

### api/db — `POST /api/db`

Point d'accès générique aux 8 tables, appelé par toutes les lectures et écritures de l'application. Corps JSON `{ op, table, ... }` :

| `op` | Paramètres | Effet |
| --- | --- | --- |
| `select` | `columns?`, `where?`, `order?`, `limit?` | Lecture ; renvoie les lignes |
| `insert` | `rows: [...]` | Insertion |
| `upsert` | `rows: [...]` | Insertion avec `ON CONFLICT (id) DO UPDATE` |
| `update` | `set: {...}`, `where` | Mise à jour |
| `delete` | `where` (**obligatoire**) | Suppression |

- `table` doit appartenir à la liste blanche des 8 tables ; tout nom de colonne est validé contre `^[a-z_][a-z0-9_]*$` ; toutes les valeurs passent en paramètres SQL liés (`$1`, `$2`, …). Une clause `where` absente sur un `delete` est refusée.
- **Protection de `members`** : `password_hash` n'est jamais renvoyé (retiré des lignes côté fonction) ; `password_hash` et `last_activity_at` ne sont pas modifiables par cet endpoint (rejet). Seule `api/member-auth` peut y toucher. Cela remplace le mécanisme de RLS + révocation de privilèges qui existait sous Supabase (§ 2.5, § 4.2).
- Les constructeurs de requêtes SQL (`where`, `order`) sont couverts par des tests unitaires (rejet d'injection, paramétrage, protection des colonnes).

### api/member-auth — `POST /api/member-auth`

Corps JSON `{ action, member_id, password? }`. Trois actions :

| Action | Effet | Réponses |
| --- | --- | --- |
| `verify` | Vérifie le mot de passe du membre | `{ member }` (200) ; `{ error: "no_password_set" }` (409) si aucun mot de passe n'est encore défini ; `{ error: "Mot de passe incorrect." }` (401) |
| `set` | Définit le mot de passe (première connexion) | `{ member }` (200) ; `{ error }` (409) si un mot de passe existe déjà, (400) si < 6 caractères |
| `touch` | Tamponne `members.last_activity_at = now()`, **sans mot de passe** | `{ ok: true }` (200) — réponse ignorée par le client (§ 4.1, § 11.6) |

- `member` renvoyé = `{ id, name, instrument }` uniquement — jamais `password_hash`.
- Hachage PBKDF2 (Web Crypto) : 100 000 itérations, sel aléatoire de 16 octets, SHA-256, stocké au format `saltHex:hashHex` (§ 4.1). **Modifier ce schéma invalide tous les mots de passe existants** — ne le faire qu'avec un plan de migration. Ce schéma est identique à celui de l'ancienne Edge Function Supabase, pour que les empreintes migrées restent vérifiables (§ 2.5).
- La fonction se connecte à Neon avec le rôle propriétaire (via `DATABASE_URL`) : elle seule écrit dans `members.password_hash` et `members.last_activity_at`. `api/db` refuse toute écriture sur ces colonnes (§ 2.2).
- `verify` et `set` tamponnent aussi `last_activity_at` au passage (redondant avec `touch`, sans effet de bord).

### api/search-deezer — `GET /api/search-deezer?q=<recherche>`

Relais sans état vers l'API publique Deezer (`api.deezer.com/search`, aucune clé, aucun accès à la base de données). Historiquement destiné à contourner les restrictions CORS d'un appel direct depuis le navigateur ; sur la même origine que l'application depuis la migration (§ 2.5), il reste utile comme point d'accès stable et pour ne pas dépendre du format de réponse brut de Deezer.

Réponse `{ results: [...] }` (10 max), chaque entrée au format `{ title, artist, album, duration_seconds, cover_url, deezer_url }` — exactement les champs attendus par le formulaire d'ajout de morceau (§ 5.3). Erreurs : `{ error }` avec code `400` (paramètre `q` absent), `502` (Deezer indisponible) ou `500` (exception).

## 2.3 Fiabilisation des écritures

Deux anomalies historiques, identifiées du temps du backend Supabase (§ 2.5), avaient été corrigées dans la fonction générique d'appel à l'API, commune à toutes les tables. Elles restent documentées ici car le comportement côté frontend (n'envoyer que les lignes réellement modifiées, tolérer une réponse vide) a été conservé lors de la migration :

- Regroupement des écritures — l'enregistrement d'un morceau du répertoire envoyait initialement l'intégralité de la table à chaque sauvegarde en un seul appel groupé ; PostgREST (API REST de Supabase) exigeait que tous les objets d'un même envoi partagent exactement les mêmes colonnes, ce qui provoquait une erreur (PGRST102) dès qu'un morceau nouvellement créé (aux clés incomplètes côté client) cohabitait avec des morceaux déjà en base. Corrigé en ne transmettant plus que les lignes réellement ajoutées ou modifiées — principe conservé avec `api/db`.

- Réponses à corps vide — un enregistrement réussi côté serveur (code HTTP 201, écritures avec l'en-tête « Prefer: return=minimal ») pouvait néanmoins déclencher une erreur de lecture de la réponse (« SyntaxError » côté Safari), la fonction ne sachant reconnaître une réponse vide que via le code 204. Corrigée pour accepter tout corps de réponse vide, quel que soit le code HTTP retourné.

## 2.4 Piège historique members

Ne jamais sélectionner la colonne `preferred_platform` (supprimée en v1.3) dans une requête sur `members` : elle n'existe plus dans le schéma. Sous Supabase, une telle requête faisait échouer PostgREST et `member-auth` répondait « Membre introuvable » à tort pour tous. `api/db` ne sélectionne que les colonnes explicitement demandées et échouerait de la même façon sur une colonne inexistante.

## 2.5 Migration de Supabase vers Neon (septembre 2026)

### Pourquoi

Jusqu'à la v1.7, le backend était **Supabase** : base PostgreSQL exposée au frontend via l'API REST PostgREST (authentifiée par une clé « publishable » codée en dur dans `src/App.jsx`), protégée par des règles Row Level Security « accès ouvert », plus deux Edge Functions Deno (`member-auth`, `search-deezer`). Motivation du changement : le plafond de 2 projets gratuits chez Supabase, alors que Neon propose une offre gratuite beaucoup plus large et que le frontend est déjà hébergé sur Vercel — regrouper base et fonctions serveur au même endroit simplifie l'ensemble.

### Architecture retenue (« chemin B »)

Une première piste consistait à réutiliser la **Data API** de Neon (compatible PostgREST, quasi-substitut direct de l'appel `fetch` existant). Elle a été écartée : la Data API de Neon **exige un jeton JWT** validé contre un fournisseur d'identité (Neon Auth par défaut), sans mode anonyme simple équivalent à la clé publishable de Supabase — inadapté au modèle de l'application (6 profils partagés, sécurité par confidentialité du lien, § 4.3).

Le choix final : **une couche de fonctions serveur maison** (`api/db`, `api/member-auth`, `api/search-deezer`) sur Vercel, qui se connectent à Neon en direct avec le rôle propriétaire. Conséquences :

- Le frontend ne contient plus **aucun identifiant** d'accès aux données (avant : URL Supabase + clé publishable en dur). La chaîne `DATABASE_URL` vit uniquement dans les variables d'environnement Vercel.
- Plus de RLS ni de politiques Postgres : la base n'est jamais jointe depuis l'extérieur. La protection de `members.password_hash` / `last_activity_at` est faite dans le code de `api/db` (§ 2.2, § 4.2).
- `src/App.jsx` conserve un point de commutation `const BACKEND` (`'neon'` en production) : les branches d'appel à Supabase sont restées dans le code le temps de la période de sécurité, un simple retour de la constante à `'supabase'` rebranche l'ancien backend.

### Migration des données

Script `db/migrate.mjs` (Node + pilote `pg`), lancé une fois à la bascule : copie les 8 tables de Supabase vers Neon dans l'ordre des dépendances de clés étrangères, en préservant les identifiants, les empreintes de mots de passe et les colonnes JSON. La source (Supabase) n'est jamais modifiée. Un mode `--rollback` copie en sens inverse (Neon → Supabase). Schéma cible : `db/neon_schema.sql` (identique au schéma Supabase, sans la partie RLS/rôles).

### Filet de sécurité

- Étiquette Git `pre-neon-migration` = dernier état du code sur Supabase.
- Retour arrière niveau 1 : **Instant Rollback** de Vercel (réactive le déploiement Supabase précédent en ~30 s).
- Retour arrière niveau 2 : repasser `const BACKEND` à `'supabase'` dans `src/App.jsx` et redéployer.
- Retour arrière niveau 3 : `node db/migrate.mjs --rollback` (si des données ont été écrites côté Neon entre-temps).
- Le projet Supabase (base + Edge Functions) est **laissé strictement intact au moins deux semaines** après la bascule. Son nettoyage (suppression du dossier `supabase/`, des branches Supabase de `src/App.jsx`, puis du projet lui-même) fera l'objet d'une évolution ultérieure.

Plan détaillé et journal d'exécution : `docs/Migration_Neon.md` dans le dépôt.

# 3. Modèle de données

La base compte désormais 8 tables. Les données des phases de choix (vetos, votes, brouillons, départages) restent volontairement embarquées en JSON directement dans la table des phases plutôt que normalisées, pour rester au plus près de la structure manipulée par l'interface ; le même principe a été repris pour les sets de concert et pour la récurrence des rendez-vous.

## 3.1 Table members

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique, généré automatiquement |
| name | text | Prénom du membre |
| instrument | text | Instrument joué |
| password_hash | text | Empreinte du mot de passe (PBKDF2 + sel) — jamais lisible depuis le frontend |
| last_activity_at | timestamptz | Horodatage de la dernière activité du membre (pas seulement de sa dernière connexion — voir § 4.1 et § 11.6), tamponné exclusivement par la fonction `api/member-auth` |
| created_at | timestamptz | Date de création du profil |

## 3.2 Table songs

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique |
| title / artist / album | text | Métadonnées du morceau |
| duration_seconds | integer | Durée en secondes (utilisée pour le compteur cumulé) |
| language | enum | FR │ EN │ INSTRUMENTAL │ OTHER |
| status | enum | proposed │ to_prepare │ ready │ rejected (affiché "Sorti") |
| added_by_user_id | uuid | Référence vers members.id — auteur de la proposition |
| links | jsonb | custom_url, deezer_url, cover_url — liens externes et pochette |
| created_at / updated_at | timestamptz | Horodatage de création / dernière modification |

## 3.3 Table phases

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique de la phase |
| initiated_by_user_id | uuid | Membre ayant lancé la phase |
| current_step | enum | proposal │ veto │ vote │ result │ closed |
| vetoes | jsonb | Liste des vetos posés durant la phase |
| votes | jsonb | Bulletins validés (classement de chaque membre) |
| vote_drafts | jsonb | Classements en cours, non validés, par membre |
| tie_break_votes | jsonb | Votes du mini-départage express en cas d'égalité |
| proposed_count | integer | Instantané du nombre de propositions, pris à la clôture (voir § 6.7) — NULL pour les phases closes avant l'introduction de cette colonne |
| result | jsonb | Instantané du résultat final ([{title, artist}, ...]), pris à la clôture (voir § 6.7) — NULL pour les phases closes avant l'introduction de cette colonne |
| created_at / closed_at | timestamptz | Ouverture et clôture de la phase |

Une phase menée à son terme (résultat validé) voit sa ligne conservée avec current_step = closed et closed_at renseigné : c'est ce qui alimente l'historique des phases (§ 6.7). Une phase annulée en cours de route (§ 6.6), à l'inverse, voit sa ligne purement et simplement supprimée de la table — elle ne laisse donc aucune trace dans l'historique.

## 3.4 Table notifications

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique |
| text | text | Contenu du message |
| kind | text | Catégorie (info, veto, launch, step, result…) |
| created_at | timestamptz | Horodatage |

## 3.5 Table concerts

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique |
| name | text | Nom du concert |
| event_date | date | Date du concert |
| event_time | time | Heure de début (optionnelle) |
| end_time | time | Heure de fin — calculée à partir de event_time + la durée saisie (défaut 1 h) ; NULL si aucune heure de début |
| venue | text | Lieu (optionnel) |
| song_ids | jsonb | Set du concert : tableau ordonné d'identifiants de morceaux. Reste le reflet des morceaux du set (compteur, durée, agenda en dépendent) |
| set_items | jsonb | Set détaillé : tableau ordonné mêlant morceaux et **notes de transition** (§ 7.2). Éléments `{ type:'song', song_id }` ou `{ type:'note', id, text }`. Vide `[]` pour les concerts créés avant cette fonctionnalité — l'éditeur le reconstruit alors depuis song_ids |
| created_by_user_id | uuid | Référence vers members.id |
| created_at / updated_at | timestamptz | Horodatage de création / dernière modification |

## 3.6 Table events (rendez-vous)

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique |
| kind | enum | repetition │ atelier │ residence │ autre |
| subject | text | Objet du rendez-vous |
| event_date / end_date | date | Date de début / de fin (identiques par défaut) |
| all_day | boolean | Rendez-vous sur toute la journée (masque les horaires) |
| start_time | time | Heure de début (optionnelle, vide si "toute la journée") |
| end_time | time | Heure de fin — sur un seul jour, calculée depuis start_time + la durée saisie (défaut 1 h) ; sur du multi-jours, horaire quotidien saisi tel quel |
| venue | text | Lieu (optionnel) |
| participant_ids | jsonb | Tableau d'identifiants de membres participants |
| recurrence_unit | enum | day │ week │ month │ year — vide si non récurrent |
| recurrence_interval | integer | Fréquence ("tous les X …") |
| recurrence_until | date | Date limite de la récurrence |
| excluded_dates | jsonb | Occurrences individuellement supprimées de la série |
| created_by_user_id | uuid | Référence vers members.id |
| created_at / updated_at | timestamptz | Horodatage de création / dernière modification |

Les concerts (table concerts) apparaissent automatiquement dans l'agenda des rendez-vous côté application, sans y être dupliqués : ils sont recalculés à l'affichage à partir de la table concerts (voir § 8).

## 3.7 Table ideas

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique |
| content | text | Contenu de l'idée |
| created_by_user_id | uuid | Référence vers members.id — auteur de l'idée |
| status | enum | created (Créée) │ processed (Traitée) │ done (Terminée) |
| created_at / updated_at | timestamptz | Horodatage de création / dernière modification |

## 3.8 Table comments

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique |
| event_id | uuid | Référence vers events.id — renseignée uniquement pour un commentaire sur un rendez-vous |
| concert_id | uuid | Référence vers concerts.id — renseignée uniquement pour un commentaire sur un concert |
| member_id | uuid | Référence vers members.id — auteur du commentaire |
| content | text | Contenu libre du commentaire |
| created_at | timestamptz | Horodatage |

Table partagée entre les modules Rendez-vous et Concerts (§ 8.5) : en pratique chaque ligne ne référence que l'une des deux colonnes event_id / concert_id, jamais les deux. **Vérification faite contre la base réelle le 2026-09-04 (Schema Visualizer) : cette règle n'est pas imposée par une contrainte CHECK côté base, uniquement respectée côté code (saveComment)** — et la base ne comporte aucune clause ON DELETE sur les clés étrangères de la table (ni d'ailleurs sur aucune des clés étrangères du schéma : added_by_user_id, initiated_by_user_id, created_by_user_id, member_id). La suppression en cascade des commentaires liés à un rendez-vous ou à un concert est donc désormais prise en charge côté application : deleteEvent et deleteConcert (src/App.jsx) suppriment d'abord les lignes de comments référençant l'élément (via un DELETE filtré sur event_id ou concert_id) avant de supprimer l'élément lui-même. Auparavant cette suppression préalable n'était pas faite et supprimer un rendez-vous ou un concert commenté échouait en base sur une violation de contrainte de clé étrangère. Reste non traité : la suppression d'un membre référencé (added_by_user_id, etc.) échoue toujours en base pour la même raison — cas non exposé par l'interface actuelle.

# 4. Sécurité et authentification

Choix assumé pour ce projet : pas de service d'authentification tiers (jugé trop complexe à gérer pour 6 utilisateurs). L'authentification est gérée entièrement au niveau applicatif.

## 4.1 Fonctionnement

- Chaque membre choisit son profil dans une liste (nom + instrument).

- Au premier accès, aucun mot de passe n'existe : l'appli propose d'en créer un (6 caractères minimum).

- Aux accès suivants, le mot de passe est demandé et vérifié.

- La création et la vérification se font exclusivement côté serveur, dans la fonction `api/member-auth` (contrat d'API au § 2.2, code dans `api/member-auth.js`), avec un hachage PBKDF2 (100 000 itérations, sel aléatoire de 16 octets, SHA-256). Le mot de passe en clair ne transite jamais vers la base, et l'empreinte n'est jamais renvoyée au navigateur.

- Une fois l'identité vérifiée, elle reste mémorisée sur l'appareil : le mot de passe n'est donc redemandé qu'à la toute première connexion, jamais aux ouvertures suivantes de l'application (jusqu'à un changement explicite de compte). Chaque ouverture — connexion fraîche ou session mémorisée — déclenche néanmoins un signal d'activité vers le serveur (action "touch" de `api/member-auth`, sans mot de passe), qui tamponne members.last_activity_at. Cette distinction importe : s'appuyer sur les seuls événements de connexion aurait très largement sous-estimé la fréquence d'usage réelle du groupe. La donnée est affichée dans l'écran Accueil, section "Dernières connexions" (§ 11.6).

## 4.2 Contrôle d'accès aux données

Depuis la migration vers Neon (§ 2.5), **la base de données n'est jamais jointe depuis l'extérieur** : seules les fonctions `api/*` de Vercel s'y connectent, avec le rôle propriétaire, via la variable d'environnement `DATABASE_URL` jamais exposée au frontend. Il n'y a donc plus ni règles Row Level Security ni clé d'accès publique à protéger.

Le contrôle d'accès repose entièrement sur `api/db` (§ 2.2), qui :

- n'accepte de requête que sur les 8 tables connues, valide tout nom de colonne et lie toutes les valeurs en paramètres SQL (pas d'injection possible) ;
- ne renvoie **jamais** `members.password_hash` (colonne retirée des lignes avant réponse) ;
- **refuse toute écriture** sur `members.password_hash` et `members.last_activity_at` — seule `api/member-auth` peut les modifier. Un client ne peut donc pas falsifier son propre mot de passe ni la dernière activité d'un autre membre.

La table comments (§ 3.8) suit le régime commun : tout membre peut y ajouter ou supprimer une ligne, sans restriction liée à l'auteur (§ 8.5).

*Rappel de l'architecture antérieure (backend Supabase) : toutes les tables étaient protégées par des règles RLS « accès ouvert » à quiconque disposait de la clé « publishable » présente dans le frontend, et les deux colonnes sensibles de `members` étaient protégées par une révocation de privilèges au niveau Postgres, seule l'Edge Function pouvant les écrire via la clé service role. Le nouveau dispositif obtient le même résultat, sans clé dans le frontend.*

## 4.3 Limites connues

- L'accès à l'application repose sur la confidentialité de son URL, pas sur un compte individuel au sens strict — quiconque a le lien voit la liste des 6 profils (noms et instruments).

- Aucune limitation du nombre de tentatives de mot de passe n'est en place (pas de protection anti-brute-force).

- Niveau de sécurité adapté à un usage privé entre 6 personnes de confiance ; à revoir avant toute ouverture plus large.

# 5. Fonctionnalités — Module Répertoire

## 5.1 Statuts des morceaux

| Statut | Badge | Description |
| --- | --- | --- |
| Prêt | PRÊT | Morceau maîtrisé, validé pour la setlist de concert |
| En préparation | À PRÉPARER | Sélectionné lors d'un vote, en cours de travail |
| Proposé | PROPOSÉ | Suggéré par un membre, en attente de phase de choix |
| Sorti | SORTI | Rejeté par veto, ou historiquement retiré de la setlist active |

## 5.2 Fonctionnalités de la liste

- Compteur en tête de liste : nombre de morceaux affichés et durée totale cumulée, recalculés dynamiquement selon les filtres actifs.

- Recherche texte libre (titre / artiste) et filtres combinables : statut, langue (Francophone / Anglophone / Instrumental / Inconnu), artiste (liste dynamique, cohérente avec les autres filtres actifs).

- Le filtre de statut est à choix unique : "Tous" ou exactement une catégorie à la fois (jamais aucune, jamais plusieurs simultanément). Ce même comportement a été repris pour le filtre par type de l'agenda des rendez-vous (voir § 8.3).

- Tri alphabétique par titre appliqué par défaut sur l'ensemble de la liste.

- Pochette d'album affichée pour chaque morceau ayant été ajouté ou complété via la recherche Deezer (au même gabarit que la pastille date des listes Concerts et Rendez-vous, voir § 13.3) ; icône de remplacement sinon.

- Ligne de la liste entièrement cliquable pour ouvrir l'édition du morceau, comme sur les listes Concerts et Rendez-vous (§ 13.3) ; le bouton d'écoute rapide reste une action distincte, isolée en bout de ligne.

- Bouton d'écoute rapide : ouvre le lien Deezer direct si disponible, sinon une recherche sur Deezer (seule plateforme d'écoute intégrée — choix assumé du groupe, sans notion de service préféré par membre).

- Liste contenue dans un conteneur à hauteur limitée avec défilement interne, comme les listes Concerts et Rendez-vous (§ 13.3).

- Mise en page responsive : sur mobile, les informations (titre, artiste, album) s'affichent en pleine largeur, les métadonnées (statut, langue, durée, actions) se replacent sur une ligne dédiée.

## 5.3 Ajout, édition et suppression

- Recherche Deezer intégrée avec auto-complétion : la sélection d'un résultat préremplit titre, artiste, album, durée, pochette et lien d'écoute.

- Saisie manuelle toujours disponible en complément, pour les compositions originales ou démos absentes de Deezer (avec lien externe personnalisé : YouTube, SoundCloud, Drive…).

- Détection de doublon à l'ajout et à l'édition : un morceau de même titre et artiste (insensible à la casse) déjà présent bloque l'enregistrement, avec indication du statut existant.

- Édition libre de tous les champs, y compris un changement manuel de statut en dehors de toute phase de choix (avec avertissement à l'écran).

- Suppression définitive d'un morceau possible depuis la fiche d'édition, avec confirmation explicite avant l'action, irréversible.

# 6. Fonctionnalités — Module Phase de choix

N'importe quel membre peut lancer une phase de choix, la faire avancer d'une étape à la suivante, la clôturer une fois le résultat obtenu (§ 6.4) ou l'annuler (§ 6.6) : aucune de ces actions n'est réservée à l'initiateur·rice, pour que le groupe ne dépende jamais d'une seule personne. Le passage à l'étape suivante et la clôture demandent une confirmation, puisque tout le groupe y a accès. Ce module n'a plus d'onglet dédié dans la barre de navigation : son accès est désormais rattaché à l'onglet Répertoire, avec lequel il est étroitement lié (voir § 6.8). Elle se déroule en 4 étapes successives, avec une barre de progression affichant, sous le libellé de chaque étape, un indicateur contextuel : nombre de **nouvelles** propositions (voir § 6.1), nombre de morceaux rejetés par veto, nombre de bulletins de vote validés.

## 6.1 Étape 1 — Proposition

Tout membre peut proposer un nouveau morceau (recherche Deezer ou saisie manuelle). L'écran affiche l'intégralité des morceaux au statut "Proposé" — y compris ceux proposés avant l'ouverture de la phase, ou entre deux phases — car c'est sur cette liste complète que portera le vote (§ 6.3).

L'indicateur chiffré sous l'étape (et l'écran Accueil, § 11.3) ne compte en revanche que les **nouvelles** propositions : celles faites depuis la fin de la dernière phase clôturée, et non depuis le seul lancement de la phase en cours. Une proposition ajoutée entre deux phases est donc bien comptabilisée. En l'absence de phase antérieure (toute première phase), toutes les propositions comptent.

## 6.2 Étape 2 — Veto

Chaque membre peut poser son veto sur un ou plusieurs morceaux proposés. Le veto d'un seul membre suffit à rejeter immédiatement et définitivement un morceau (statut "Sorti"), avec notification sur le journal de l'application.

## 6.3 Étape 3 — Vote

Le vote se fait par un classement interactif plutôt qu'une saisie de notes indépendantes :

- Le vote porte sur l'**intégralité** des morceaux au statut "Proposé" au moment du vote (tous ceux non rejetés par veto), quelle que soit leur date de proposition — pas seulement les nouvelles propositions comptées par l'indicateur de l'étape Proposition (§ 6.1). Le classement final (§ 6.4) est calculé sur ce même ensemble complet.

- Les morceaux n'ont aucune note par défaut.

- Glisser-déposer ou flèches haut/bas pour positionner un morceau : le premier de la liste reçoit la meilleure note (jusqu'à 10), un morceau inséré sous un morceau déjà noté reçoit la note immédiatement inférieure, et tous les morceaux en dessous rétrogradent d'un cran en cascade.

- Le défilement automatique de la liste s'active pendant un glisser-déposer approchant le haut ou le bas de l'écran.

- Le classement en cours est sauvegardé automatiquement en continu (brouillon), même sans validation — aucune perte de progression en cas de fermeture accidentelle.

- La validation du bulletin (qui le fait compter dans le résultat) est bloquée tant que les meilleures places disponibles (jusqu'à 10) ne sont pas toutes classées.

## 6.4 Étape 4 — Résultat

Le classement final est calculé automatiquement à partir des points cumulés de tous les bulletins validés, avec application des règles suivantes :

- Quota francophone : si aucun morceau francophone ne figure naturellement dans le Top 3, le meilleur morceau francophone du classement est automatiquement promu en 3ᵉ position, à la place du morceau initialement classé 3ᵉ.

- Départage en cas d'égalité, dans l'ordre : (1) meilleure note individuelle reçue par un morceau ; (2) mini-vote de départage express entre les morceaux ex-æquo ; (3) message invitant à un arbitrage oral en répétition si l'égalité persiste.

- La clôture de la phase — ouverte à **n'importe quel membre**, pas seulement l'initiateur·rice, et confirmée par une boîte de dialogue — fait passer les 3 morceaux retenus au statut "À préparer" et publie le résultat sur le journal de notifications (avec le nom du membre qui a clôturé). Au même moment, un instantané du nombre de nouvelles propositions et du résultat final est enregistré sur la ligne de la phase (colonnes proposed_count et result, § 3.3) pour alimenter l'historique des phases (§ 6.7).

## 6.5 Copie dans le presse-papier

Chaque étape propose un bouton dédié pour copier un résumé prêt à coller dans une conversation :

- Étape Proposition — "Copier les propositions" : liste des **nouvelles** propositions (celles faites depuis la fin de la dernière phase clôturée, § 6.1), avec l'identité du membre à l'origine de chaque proposition.

- Étape Veto — "Copier les rejets" : liste des morceaux rejetés durant la phase, avec l'identité du ou des membres ayant posé leur veto sur chacun.

- Étape Résultat — "Copier le résultat" : le Top 3 final tel qu'affiché à l'écran (avec les points), et la mention du quota francophone s'il a été appliqué. Disponible uniquement une fois le résultat déterminé (égalité éventuelle résolue).

Une confirmation visuelle ("Copié !") s'affiche brièvement après chaque copie.

## 6.6 Annulation d'une phase en cours

N'importe quel membre du groupe — pas seulement l'initiateur — peut annuler la phase en cours à tout moment, quelle que soit l'étape atteinte, via le bouton "Annuler la phase en cours". Une confirmation détaille les conséquences avant validation :

- Les propositions sont conservées (les morceaux restent au statut "Proposé").

- Les morceaux rejetés par veto durant cette phase précise réintègrent le statut "Proposé" ; un morceau déjà "Sorti" avant le lancement de la phase n'est pas concerné.

- Les votes et brouillons de vote en cours sont définitivement perdus.

- La phase annulée est supprimée et ne figure pas dans l'historique des phases (§ 6.7), à la différence d'une phase menée normalement à son terme.

## 6.7 Historique des phases

Accessible depuis un bouton dédié (visible en permanence pendant une phase active, et depuis l'écran "Aucune phase en cours"), l'historique liste les phases clôturées normalement, avec pour chacune : l'initiateur, la date de début, la date de fin et la durée écoulée entre les deux, le nombre de nouvelles propositions, le nombre de morceaux rejetés par veto, et le résultat final (titre et artiste des 3 morceaux retenus, sans lien vers le répertoire). Les phases annulées (§ 6.6) n'y apparaissent jamais.

Le nombre de propositions retenu est celui des **nouvelles** propositions de la phase (§ 6.1) : celles faites depuis la fin de la phase précédente, qu'elles soient au final retenues, encore en lice ou rejetées par veto durant la phase — cohérent avec l'indicateur affiché pendant la phase. Ce nombre et le résultat final proviennent d'un instantané pris au moment précis de la clôture (§ 3.3, § 6.4) : ils ne peuvent pas être recalculés après coup, les morceaux gagnants changeant de statut et le répertoire pouvant évoluer depuis. Pour une phase close avant l'introduction de ces colonnes (ou importée rétroactivement sans cette donnée), l'écran affiche "—" plutôt qu'un chiffre ou un résultat inventés. Le nombre de vetos, lui, reste dérivé à l'affichage à partir des vetos conservés sur la ligne de la phase — aucune colonne dédiée n'est nécessaire.

## 6.8 Rattachement à l'onglet Répertoire

- Aucune phase en cours : un bandeau apparaît en haut de l'écran Répertoire, avec deux actions — "Lancer une phase de choix" et "Historique des phases".

- Une phase est en cours : un lien "Historique des phases" reste accessible en haut du Répertoire ; l'accès à la phase elle-même se fait via le bandeau persistant (voir ci-dessous).

- Bandeau persistant : dès qu'une phase est active, un bandeau orange apparaît sous l'en-tête sur tous les onglets (sauf l'écran de la phase elle-même), avec l'étape en cours et un lien direct "Voir" — la phase reste donc accessible en un clic depuis n'importe quel écran de l'application, sans pour autant occuper une place permanente dans la barre d'onglets.

# 7. Fonctionnalités — Module Concerts

Nouveau module permettant de composer et gérer les sets de concert à partir du répertoire.

## 7.1 Écran liste

- Concerts triés par date croissante, dans une liste défilante (hauteur limitée, défilement interne).

- Compteur en tête de liste : nombre de concerts **à venir** ("X concert(s) programmé(s)"), les concerts passés étant exclus du décompte (un concert du jour compte comme à venir). Ils restent affichés dans la liste, seulement au-dessus du prochain concert.

- Ouverture automatique de la liste positionnée sur le prochain concert à venir, placé en haut de la zone défilante (les concerts passés restent accessibles en remontant), mis en évidence par un badge "PROCHAIN" et une bordure accentuée — même mécanique que l'agenda des rendez-vous (§ 8.3). Si aucun concert n'est à venir, la liste se cale sur le dernier concert passé (le plus récent) plutôt que sur le plus ancien : à la différence des rendez-vous, alimentés par des répétitions récurrentes, les concerts n'ont pas toujours une prochaine occurrence programmée. La zone défilante a une hauteur fixe et se prolonge par une cale vide sous la dernière carte, pour qu'un défilement reste toujours possible même quand les concerts tiennent tous dans la zone visible (sans quoi les concerts passés resteraient affichés en tête) ; le revers assumé est un espace vide sous la liste lorsqu'elle est courte.

- Chaque carte affiche, sur trois lignes sous la pastille de date : le nom du concert ; la date, l'heure de début, la durée puis le lieu ; le nombre de morceaux du set et sa durée totale. Le badge "PROCHAIN" et l'icône crayon sont regroupés en bout de ligne, à l'emplacement occupé par les badges de statut et de langue du Répertoire (§ 13.3) — présentation désormais identique à celle des cartes Rendez-vous (§ 8.3), le concert n'ayant pas de catégorie propre à afficher en plus. En bout de ligne, une colonne d'actions (séparée de la ligne par un filet vertical) empile deux boutons pour n'occuper qu'une gouttière : une icône agenda pour ajouter le concert au calendrier de l'appareil (§ 7.2) sans ouvrir la fiche, et une bulle indiquant le nombre de commentaires (§ 8.5). La pastille de date d'un concert à venir utilise la couleur du type "Concert" (§ 8.3) plutôt que l'ambre, y compris pour le prochain concert.

## 7.2 Création et édition d'un concert

- Champs : nom et date obligatoires ; heure de début, durée et lieu facultatifs. La durée se choisit dans une liste de valeurs courantes (de 15 min à 12 h), pré-remplie à 1 h ; l'heure de fin du concert est déduite de l'heure de début + la durée et stockée (concerts.end_time), sans champ "heure de fin" à saisir. Si aucune heure de début n'est renseignée, aucune heure de fin n'est calculée.

- Sélection des morceaux du set via trois filtres de statut indépendants et combinables librement — "Prêt" (activé par défaut, seul), "À préparer" et "Sorti" — chacun s'active ou se désactive séparément selon que l'on souhaite élargir ou restreindre la liste des morceaux proposés à l'ajout ; recherche texte parmi les morceaux disponibles.

- Ordonnancement du set par glisser-déposer ou flèches haut/bas, avec défilement automatique de la liste pendant un glisser-déposer approchant le haut ou le bas de l'écran (même mécanique que le module Phase de choix).

- **Notes de transition** : chaque ligne de morceau du set porte un bouton (icône bulle) qui insère une note **avant** ce morceau — pour préciser un lancement, un enchaînement, une intro, des remerciements, etc. La note s'affiche sur sa propre ligne, en italique, encadrée en pointillés, sans numéro ; elle se saisit sur une seule ligne, se réordonne comme un morceau (glisser-déposer / flèches) et se supprime par sa croix. Une note laissée vide est ignorée à l'enregistrement. Les notes **ne comptent pas** dans le nombre de morceaux, mais **chacune ajoute 3 minutes à la durée théorique du set** (temps de parole / d'enchaînement) ; le compteur rappelle leur nombre et le total ajouté ("· N notes de transition (+M min)"). Stockage : colonne `concerts.set_items` (§ 3.5), `song_ids` restant le reflet des seuls morceaux.

- Durée théorique totale du set recalculée et affichée en continu, dans le même format que le compteur du répertoire.

- Bouton "Ajouter à mon agenda" (dès que nom et date sont renseignés) : génère un fichier iCalendar (.ics) que l'appareil ouvre dans son application de calendrier par défaut (Agenda iOS, Google Agenda, etc.), pré-rempli avec le nom, la date, l'horaire (heure de début → heure de fin), le lieu et un résumé du set. Horaires en "heure locale flottante" (le groupe est sur un seul fuseau). Limite connue : en application installée sur l'écran d'accueil d'un iPhone, le téléchargement direct du .ics peut être ignoré par iOS — il faut alors ouvrir l'application depuis Safari.

- Suppression du concert possible depuis l'écran d'édition, avec confirmation explicite.

## 7.3 Copie dans le presse-papier

Un bouton "Copier le concert" génère et copie un texte prêt à coller dans une conversation (nom du concert, date, heure de début suivie de la durée entre parenthèses, lieu ; le set complet, un morceau par ligne avec sa durée, les **notes de transition** intercalées à leur place sur une ligne préfixée `→` et sans numéro ; puis la durée théorique totale du set). Une confirmation visuelle ("Copié !") s'affiche brièvement après la copie ; un message d'erreur explicite apparaît si le navigateur bloque l'accès au presse-papier.

## 7.4 Export imprimable du set

Un bouton "Imprimer le set" (dès que le nom est renseigné) ouvre, dans un nouvel onglet, un document HTML autonome — une **feuille de set pensée pour être lue depuis le sol pendant le concert** : gros titres de morceaux en gras, numéros marqués, forte lisibilité. En-tête (nom du concert, horaire et lieu, date en toutes lettres) puis le set complet — morceaux numérotés (artiste en petit à côté, à titre indicatif), **notes de transition** intercalées à leur place sous forme de bandeaux gris préfixés `→`, sans numéro — et un pied de page récapitulatif (nombre de morceaux, nombre de transitions, durée estimée). Fond blanc.

- **Tenue sur une page** : au chargement, la feuille est mesurée en la forçant à la largeur d'impression, et la police de la liste est fixée à la plus grande valeur (26 → 13 px) pour laquelle le set tient sur une page — cible de hauteur volontairement prudente (~800 px) pour absorber les marges variables des moteurs d'impression mobiles et le format Letter (plus court qu'A4). La taille retenue s'applique à l'aperçu comme à l'impression, l'aperçu reflète donc la sortie.
- **Sur ordinateur** : le document ouvre directement la boîte d'impression du système (où l'on imprime ou choisit "Enregistrer en PDF").
- **Sur mobile** (détecté via `pointer: coarse`) : **pas d'impression automatique**. Barre d'actions fixe en bas — bouton principal "Enregistrer en PDF / Imprimer" (ouvre la fenêtre de partage / d'impression du téléphone, d'où l'on enregistre le PDF dans les fichiers), et "Retour au concert" qui referme l'onglet. Après la fenêtre d'enregistrement (qu'on ait enregistré ou annulé), l'onglet se referme de lui-même quand le navigateur le permet (`onafterprint`). L'aperçu à l'écran étroit d'un téléphone peut renvoyer certains titres à la ligne, mais le PDF produit (rendu à la largeur d'une page) ne les coupe pas.
- Aucun serveur ni bibliothèque tierce : le document est fabriqué côté navigateur (`buildConcertSetHTML`) et ouvert via `window.open`. Limite connue, comme pour le .ics : en application installée sur l'écran d'accueil d'un iPhone, l'ouverture de la fenêtre peut être bloquée — un message invite alors à autoriser les fenêtres surgissantes (ou ouvrir l'application depuis Safari).

# 8. Fonctionnalités — Module Rendez-vous

Agenda partagé du groupe, distinct des concerts mais les intégrant automatiquement en lecture seule.

## 8.1 Définition d'un rendez-vous

Un rendez-vous est défini par un type (Répétition, Atelier de travail, Résidence ou Autre), un objet, une date de début, une date de fin, un statut "toute la journée", une heure de début, une durée (sur un seul jour) ou une heure de fin quotidienne (sur plusieurs jours), un lieu et une liste de participants choisis parmi les membres du groupe.

## 8.2 Saisie assistée

- La date de fin recopie automatiquement la date de début à chaque saisie de celle-ci (modifiable ensuite librement, pour un rendez-vous sur plusieurs jours comme une résidence).

- Rendez-vous sur un seul jour : on saisit une heure de début et une durée (liste de valeurs courantes, pré-remplie à 1 h) ; l'heure de fin (events.end_time) est calculée à l'enregistrement à partir de ces deux valeurs, il n'y a pas de champ "heure de fin" à saisir.

- Rendez-vous sur plusieurs jours : le champ "durée" laisse place à un champ "heure de fin (chaque jour)" ; début et fin représentent alors des horaires quotidiens indépendants, saisis tels quels.

- La case "Toute la journée" masque et vide les champs d'horaires (l'heure de fin enregistrée est alors NULL).

- Bouton "Ajouter à mon agenda" (dès que l'objet et la date sont renseignés) : même mécanique que pour les concerts (§ 7.2) — un fichier iCalendar (.ics) ouvert par l'application de calendrier par défaut de l'appareil, pré-rempli avec l'objet, le type, la date, l'horaire, le lieu et la liste des participants. Pour un rendez-vous récurrent, le .ics décrit toute la série (règle de récurrence + dates d'occurrences supprimées), pas seulement l'occurrence ouverte.

## 8.3 Écran liste et filtre

- Rendez-vous triés par date croissante, dans une liste défilante, ouverte automatiquement centrée sur le prochain événement à venir (même mécanique que le module Concerts, badge "PROCHAIN" inclus).

- Compteur en tête de liste : nombre de rendez-vous **à venir** ("X rendez-vous à venir"), les rendez-vous passés étant exclus du décompte (un rendez-vous en cours, dont la date de fin n'est pas dépassée, compte comme à venir). Le décompte porte sur les rendez-vous que le filtre par type actif laisse afficher, concerts intégrés compris. Les rendez-vous passés restent affichés dans la liste.

- Filtre par type à choix unique (Tous, ou exactement un type à la fois), identique dans son fonctionnement au filtre de statut du Répertoire (§ 5.2).

- Code couleur par type, repris sur la pastille de date, le badge de catégorie et (écran Accueil) la bande d'angle : Répétition bleu ardoise, Atelier de travail sauge, Résidence ambre clair (blé doré), Autre violet, Concert turquoise. Le turquoise du concert le distingue nettement des autres rendez-vous dans la liste ; il a remplacé un rouge qui se confondait avec la couleur d'alerte de l'application (vetos, erreurs, suppressions, statut "Sorti"). Le violet du type "Autre" a de même remplacé un taupe qui, étant le gris neutre d'interface de l'application, faisait lire ces rendez-vous comme passés ou désactivés. L'ambre de la Résidence a été éclairci (`#F0CE8A`) pour ne plus se confondre avec l'ambre d'accent de l'application (`#F2A93B` : badge "PROCHAIN", surbrillance, bandeau de phase). Un rendez-vous passé, lui, perd bien sa couleur au profit d'un gris neutre.

- Les libellés de la ligne (indication "récurrent" le cas échéant, badge "PROCHAIN" le cas échéant, puis catégorie du rendez-vous) sont regroupés en bout de ligne dans cet ordre, au même endroit et selon la même logique de repli sur mobile que les badges de statut et de langue du Répertoire (§ 13.3) — le titre du rendez-vous occupe désormais la première ligne de la carte.

- Les concerts apparaissent dans cette liste au même titre que les autres rendez-vous : cliquer dessus bascule vers le module Concerts et ouvre directement le concert concerné en édition (la mention "non modifiable ici", auparavant affichée sur ces lignes, a été retirée — elle entrait en contradiction avec ce comportement au clic et n'apportait qu'une confusion). Les données affichées proviennent en direct de la table concerts — toute modification faite depuis le module Concerts se répercute donc immédiatement dans l'agenda.

- Sur la ligne date/horaire de la carte, la durée du rendez-vous (heure de fin − heure de début) est affichée juste après l'horaire, avec une icône de sablier. Même affichage sur les cartes Concerts (§ 7.1) et sur les cartes "Prochain rendez-vous"/"Prochain concert" de l'écran d'accueil (§ 11.2). Rien n'est affiché pour un rendez-vous "toute la journée" ou sans heure de fin connue.

- En bout de ligne, comme sur les cartes Concerts (§ 7.1) : une colonne d'actions empilées — icône agenda pour ajouter le rendez-vous (ou le concert intégré) au calendrier de l'appareil sans ouvrir la fiche, et bulle du nombre de commentaires (§ 8.5). Pour une série récurrente, l'icône agenda exporte toute la série (§ 8.2).

## 8.4 Récurrence

- Fréquence exprimée en "tous les X jours / semaines / mois / ans", avec une date limite obligatoire dès que la récurrence est activée.

- Une série récurrente reste une seule ligne en base (la première occurrence) ; les occurrences suivantes sont calculées côté application entre la date de début et la date limite, avec un plafond de sécurité de 200 occurrences par série.

- Modifier une série récurrente (objet, horaires, participants, lieu…) s'applique automatiquement à toutes ses occurrences, celles-ci n'étant pas dupliquées en base.

- Une occurrence isolée peut être supprimée sans affecter le reste de la série ; la série entière peut elle aussi être supprimée. Les deux actions sont désormais regroupées exclusivement dans l'écran d'édition (la liste n'affiche plus de bouton de suppression rapide, par cohérence avec les autres listes de l'application — Répertoire, Concerts) : ouvrir une occurrence d'une série récurrente y affiche côte à côte "Supprimer cette occurrence" et "Supprimer toute la série", avec un message de confirmation distinct pour chacune afin d'éviter toute ambiguïté. Un rendez-vous non récurrent ne propose que l'option de suppression simple.

- À l'activation de la récurrence, la date "Jusqu'au" est automatiquement pré-remplie à date de début + 1 an, et recalculée de la même façon à chaque changement ultérieur de la date de début tant que la récurrence reste active (modifiable ensuite librement).

## 8.5 Commentaires (rendez-vous et concerts)

Tout membre peut laisser un commentaire libre sur un rendez-vous ou sur un concert, pour échanger sur son organisation sans passer par un canal externe au groupe.

- Une bulle affichée dans les listes Rendez-vous (§ 8.3) et Concerts (§ 7.1) indique le nombre de commentaires déjà laissés sur l'élément ; elle s'ouvre au clic pour afficher le fil complet et en ajouter un nouveau, sans passer par l'écran d'édition.

- Chaque commentaire affiche son auteur (icône et prénom, § 11.5), la date et l'heure, et son contenu.

- Un commentaire peut être supprimé par n'importe quel membre du groupe, pas seulement son auteur — même principe d'ouverture que le reste de l'application (§ 4.2), avec confirmation explicite avant suppression, irréversible.

- L'ajout et la suppression d'un commentaire sont journalisés dans le Journal d'activité (§ 10).

- Stockés dans une table dédiée, partagée entre les deux modules (§ 3.8) : chaque commentaire référence soit un rendez-vous, soit un concert, jamais les deux à la fois.

# 9. Fonctionnalités — Module Boîte à idées

Nouvel onglet permettant à chaque membre de consigner librement des idées d'amélioration de l'application, en dehors du circuit formel des phases de choix (qui ne portent que sur le répertoire musical).

- Une idée est définie par un contenu libre, son auteur, sa date/heure de création et un statut : Créée (par défaut), Traitée ou Terminée.

- Ajout rapide en un seul champ, sans écran dédié : un simple encart en haut de la liste.

- Liste triée des plus récentes aux plus anciennes, avec filtre par statut à choix unique (Tous, ou exactement un statut à la fois), identique dans son fonctionnement au filtre de statut du Répertoire (§ 5.2).

- Le statut d'une idée peut être changé par n'importe quel membre directement depuis la liste ; sa suppression est également ouverte à tous.

- Le passage au statut Terminée est journalisé dans le Journal d'activité (§ 10) ; les autres changements de statut restent silencieux pour ne pas le surcharger.

# 10. Journal d'activité

Un onglet dédié ("Journal d'activité", anciennement nommé "Historique", et avant cela "WhatsApp" — le principe d'un envoi réel de messages via une API de messagerie externe n'a pas été poursuivi) affiche un journal chronologique des événements clés : lancement de phase, changement d'étape, veto posé, résultat final, ajout/modification/suppression de morceau, changement manuel de statut, création/modification/suppression de concerts et de rendez-vous, ajout/suppression d'un commentaire (§ 8.5), ajout d'une idée et passage d'une idée au statut Terminée.

Ce journal reste interne à l'application : aucun message n'est envoyé vers un service tiers. Il ne doit pas être confondu avec le suivi de la dernière activité de chaque membre (§ 4.1, § 11.6), qui est un indicateur de présence individuel et non un historique des actions effectuées.

# 11. Fonctionnalités — Module Accueil

Écran affiché par défaut à l'ouverture de l'application (nouvel onglet "Accueil", en première position dans la barre de navigation, devant Répertoire), pensé comme un tableau de bord condensant en un coup d'œil l'essentiel de la vie du groupe.

## 11.1 En-tête

Message de bienvenue nominatif ("Bonjour, [prénom]"), précédé de l'icône du membre connecté (§ 11.5), et de la date du jour.

## 11.2 Prochain rendez-vous et prochain concert

Deux cartes côte à côte (empilées sur mobile) : le prochain rendez-vous à venir hors concert (répétition, atelier, résidence, autre), et le prochain concert programmé — chacune reprenant la présentation compacte des listes des modules Concerts et Rendez-vous (§ 7 et § 8), avec navigation directe vers l'onglet correspondant au clic. Chaque carte affiche désormais la liste des participants (ou "Tout le groupe" pour un concert, qui engage toujours l'ensemble des membres), reprise du module correspondant.

## 11.3 Phase de choix en cours

Si une phase de choix est active : une mini barre de progression reprenant les 4 étapes (Proposition, Veto, Vote, Résultat), un message contextuel selon l'étape en cours du membre connecté, et un récapitulatif chiffré.

Messages contextuels, un seul affiché à la fois selon l'étape (et, pour le Vote, selon que le membre a déjà validé son bulletin) :

- Étape Proposition : "Pense à partager tes propositions si tu ne l'as pas encore fait."

- Étape Veto : "Pense à écouter les propositions pour te faire une idée, tu as le droit de mettre un veto sur les morceaux que tu ne veux pas jouer."

- Étape Vote, bulletin non encore validé : "Pense à valider ton vote que l'on puisse annoncer les résultats."

- Étape Vote, bulletin déjà validé : "On attend les derniers votes avant d'annoncer les résultats."

Récapitulatif chiffré : nombre de morceaux encore au statut "Proposé" depuis la fin de la dernière phase clôturée (et non depuis le seul lancement de la phase en cours — une phase peut hériter de propositions plus anciennes, voir § 6.1), nombre de morceaux rejetés par veto durant la phase en cours, et nombre de bulletins de vote validés sur le nombre total de membres.

Si aucune phase n'est active, un message invite à en lancer une depuis le Répertoire (§ 6.8).

## 11.4 Répertoire

Deux blocs, l'un pour le statut "Prêt", l'autre pour "À préparer" (§ 5.1), chacun affichant le nombre de morceaux concernés ainsi que la durée théorique cumulée de leurs morceaux (même calcul et même format que le compteur du Répertoire, § 5.2) — un aperçu immédiat du temps de jeu déjà disponible et de celui encore en préparation, sans avoir à ouvrir le Répertoire et à en filtrer la liste. Un lien direct vers le Répertoire complète le bloc.

## 11.5 Icônes des membres

Chaque membre est représenté par une icône liée à son instrument plutôt que par la seule initiale de son prénom, aussi bien dans l'en-tête de bienvenue (§ 11.1) que dans la liste des dernières connexions (§ 11.6) :

| Membre | Instrument | Icône |
| --- | --- | --- |
| Do | Batterie | Tambour (icône "drum" de la bibliothèque lucide-react, déjà utilisée ailleurs dans l'application) |
| Dave | Clavier / piano | Piano (icône "piano") |
| Alex | Guitare | Guitare (icône "guitar") |
| Niko | Basse | Icône guitare dont le manche est allongé côté tête (la tête restant à son extrémité) et dont le corps est légèrement réduit, pour un encombrement global identique. Aucune icône de basse n'existe à ce jour dans lucide-react (manque documenté par les mainteneurs de la bibliothèque) ; le pictogramme est obtenu par transformation géométrique (étirement / réduction) de l'icône guitare réelle plutôt qu'en redessinant ses tracés à la main, pour rester fidèle à son style |
| Véro | Chant | Microphone (icône "mic-vocal", anciennement nommée "Mic2") orienté à gauche |
| Gawel | Chant | Le même microphone, orienté à droite — image miroir du précédent, obtenue par un simple retournement horizontal plutôt qu'un second dessin |

L'association se fait par le prénom exact du membre, et non par son seul instrument : deux membres (Véro et Gawel) partagent le même instrument (chant) mais doivent apparaître avec des icônes visuellement distinctes. Un membre non couvert par ce tableau (ex. nouvel arrivant dans le groupe) conserve l'affichage par défaut : initiale du prénom sur fond coloré.

Le fond coloré du cercle d'avatar (icône ou initiale) attribue désormais une couleur pastel individuelle à chaque membre — Do (or pastel), Dave (sauge pastel), Alex (bleu ciel pastel), Véro (turquoise pastel), Gawel (terracotta pastel), Niko (moutarde pastel) — choisies pour rester bien distinctes les unes des autres sans recourir à une logique genrée (pas de rose ni de mauve réservés à certains prénoms), et sans jamais utiliser le rouge, cette couleur restant réservée dans l'application aux statuts d'alerte (veto, morceau sorti, erreurs de saisie, actions de suppression). La couleur est associée au prénom exact du membre (même principe que le tableau des icônes ci-dessus), qui la conserve donc de façon stable d'une session à l'autre ; un membre non couvert par cette liste (ex. nouvel arrivant) retombe sur un mécanisme de secours à deux couleurs (ambre / gris), en attendant qu'une teinte dédiée lui soit attribuée.

## 11.6 Dernières connexions

Liste de tous les membres, triée par activité la plus récente, affichant pour chacun son icône (§ 11.5), son instrument, un indicateur de couleur (vert : moins d'une heure, ambre : moins de 24 heures, gris : au-delà ou aucune activité connue) et un horodatage relatif ("à l'instant", "il y a X min", "il y a X h", "hier, HH:MM", "il y a X jours", ou une date complète au-delà d'une semaine).

Le libellé de la section ("Dernières connexions") désigne en réalité la dernière ACTIVITÉ de chaque membre, et non sa dernière authentification au sens strict (§ 4.1) : l'application ne redemandant le mot de passe qu'à la toute première connexion, une date de dernière connexion aurait très largement sous-estimé la fréquence d'usage réelle. Le signal d'activité pris en compte est l'ouverture de l'application (connexion fraîche ou session mémorisée) ; il ne descend pas au niveau d'une action précise (voter, proposer un morceau…).

# 12. Intégrations externes

Deezer est l'unique plateforme d'écoute intégrée à l'application, et le restera : le groupe a explicitement écarté toute intégration future d'un service concurrent (Spotify, Apple Music), ainsi que la notion de plateforme préférée par membre qui existait dans une version antérieure.

| Plateforme | Statut | Détail |
| --- | --- | --- |
| Deezer | Opérationnel | Recherche du catalogue public via la fonction `api/search-deezer`, sans compte ni clé nécessaire côté Deezer ; utilisée à la fois pour compléter les métadonnées d'un morceau et pour le bouton d'écoute rapide. |

# 13. Interface et navigation

- Logo du groupe : dans la barre supérieure, il remplace le point ambre à gauche du nom "CALYXTER", à la hauteur des caractères du titre. Sur l'écran de connexion (choix du profil puis saisie du mot de passe), il est placé au-dessus du nom du groupe (largeur `min(44vw, 180px)`), le contenu restant centré verticalement. Le fichier `public/logo.png` est dérivé de l'illustration source du groupe (motif en "X" au pinceau, "X négatif") : fond noir détouré par la luminance (le motif devient un aplat blanc cassé `#F5F1E8` à opacité variable), pour un rendu propre sur n'importe quel fond sombre sans recourir à un mode de fusion.

- Écran de connexion : la vignette "scotch" en haut de chaque carte (grille des profils et écran du mot de passe) reprend la couleur d'avatar du membre concerné (§ 11.5) au lieu de l'ambre générique.

- Barre d'onglets responsive : en dessous de 640 px de largeur d'écran, les onglets passent en icônes seules (texte conservé pour les lecteurs d'écran et en info-bulle) et occupent toute la largeur disponible ; un défilement horizontal reste disponible en filet de sécurité dans tous les cas, pour qu'aucun onglet ne soit jamais tronqué ou inaccessible sur smartphone.

- Nouvel onglet "Accueil" (icône maison), en première position dans la barre de navigation et affiché par défaut à l'ouverture de l'application (§ 11).

- Champs de saisie : police portée à 16 px sur les appareils tactiles (14 px ailleurs). En dessous de 16 px, iOS Safari zoome automatiquement la page au focus d'un champ et ne dézoome pas toujours ensuite — on arrivait alors sur l'application zoomée et décalée après avoir tapé le mot de passe. Après connexion (ou changement de compte), un retour explicite en haut de page est également déclenché.

- Icônes d'onglets distinctes et évocatrices : "Concerts" (microphone) et "Rendez-vous" (calendrier) utilisent des pictogrammes différents pour éviter toute confusion, auparavant tous deux représentés par un calendrier.

- Le bouton "Réinitialiser les données de démo", susceptible de provoquer des erreurs ou des pertes de données accidentelles, a été retiré de la barre supérieure.

- Corrections de mise en page sur mobile : les lignes de boutons d'action (Supprimer / Annuler / Enregistrer) des écrans d'édition acceptent désormais le retour à la ligne plutôt que de se comprimer les unes contre les autres sur un écran étroit ; le bandeau de lancement d'une phase de choix, dans le Répertoire, ne déborde plus de l'écran sur smartphone ; la carte d'un rendez-vous dans sa liste ne force plus de largeur minimale susceptible de repousser son bouton d'édition hors de l'écran visible ; les champs `date` et `heure` des éditeurs de concert et de rendez-vous (notamment "Date de fin") ne débordent plus sur la droite sur iOS, où ils conservaient une largeur intrinsèque incompressible — neutralisée par `min-width: 0` sur le champ et sur son conteneur.

## 13.1 Icône d'écran d'accueil (PWA)

L'application affiche une icône personnalisée (le motif du logo Calyxter, sur fond noir) lorsqu'elle est ajoutée à l'écran d'accueil d'un smartphone, à la place de la capture d'écran générique proposée par défaut :

- Un Web App Manifest (manifest.webmanifest) déclare les icônes utilisées par Android/Chrome, en deux variantes : icônes pleines (le motif occupe la quasi-totalité de la surface) pour un usage général, et icônes "maskable" à marge de sécurité réduite pour ne pas être rognées par le masque circulaire/arrondi appliqué aux icônes adaptatives Android.

- Une balise apple-touch-icon dédiée couvre iOS/Safari, qui ne lit pas le Web App Manifest.

- Un favicon multi-résolution complète l'ensemble pour l'onglet du navigateur.

- Intégration désormais confirmée dans index.html (balises manifest, apple-touch-icon et favicon correctement référencées) — un accès direct au dépôt de code a permis de vérifier ce point, resté en suspens dans les versions précédentes de cette documentation faute d'accès (voir § 15).

## 13.2 Rafraîchissement automatique de l'application

Une fois ajoutée à l'écran d'accueil d'un smartphone, l'application s'ouvre dans sa propre fenêtre, sans barre d'adresse ni bouton de rechargement : sans mécanisme dédié, un membre pouvait donc rester bloqué sur une ancienne version, sans autre recours que de supprimer puis réinstaller l'application.

- À chaque ouverture de l'application, et à chaque retour au premier plan (cas typique d'une relance depuis l'écran d'accueil), l'application interroge silencieusement un indicateur de version déposé sur le serveur à chaque déploiement.

- Si une version plus récente est détectée, l'application se recharge automatiquement pour la récupérer, sans action requise de l'utilisateur.

- Une vérification périodique (toutes les 15 minutes) s'applique également si l'application reste ouverte en continu sans jamais repasser au premier plan.

- Détail technique du mécanisme (fichier de version, règles de mise en cache) : voir § 14.

## 13.3 Harmonisation des écrans de liste

Les trois écrans présentant une liste de cartes (Répertoire, Concerts, Rendez-vous) suivent désormais les mêmes règles d'interaction et de mise en page :

- Ligne entièrement cliquable pour ouvrir l'édition de l'élément, sur les trois écrans (le Répertoire ne réservait auparavant cette action qu'à un bouton crayon dédié).

- Icône crayon strictement identique sur les trois écrans (icône seule, sans bouton visible autour), simple indication visuelle que la ligne s'ouvre en édition.

- Actions secondaires en bout de ligne, séparées de la ligne par un filet vertical, avec le même comportement au survol : écouter un morceau sur le Répertoire ; sur Concerts et Rendez-vous, une colonne empilant l'ajout au calendrier de l'appareil (icône agenda, § 7.2) et les commentaires (§ 8.5) — empilement plutôt que juxtaposition pour ne consommer qu'une gouttière.

- Vignette de gauche (pochette d'album ou pastille de date) au même gabarit sur les trois écrans. La pastille de date affiche le jour, le mois abrégé puis l'année, sur trois lignes — présentation identique sur les écrans Accueil (§ 11.2), Concerts (§ 7.1) et Rendez-vous (§ 8.3).

- Liste contenue dans un conteneur à hauteur limitée avec défilement interne, propre à chaque écran plutôt que de faire défiler la page entière.

- Réorganisation identique en dessous de 560 px de largeur d'écran : la vignette de gauche et le titre restent groupés sur la première ligne, le reste (statuts, badges, actions) se replace proprement sur la ligne suivante plutôt que de se comprimer.

- Sur l'écran Rendez-vous, les libellés ("récurrent", "PROCHAIN", catégorie) rejoignent ce même bloc de fin de ligne, dans cet ordre, à l'emplacement occupé par les badges de statut et de langue sur le Répertoire (§ 8.3) — le titre du rendez-vous apparaît donc désormais en première position sur la carte, comme le titre d'un morceau sur le Répertoire. La mention "non modifiable ici", auparavant affichée sur les concerts intégrés à cette liste, a été retirée : elle entrait en contradiction avec le clic sur la ligne, qui ouvre bien le concert en édition (§ 7).

- Sur l'écran Concerts, même bloc de fin de ligne pour le badge "PROCHAIN" (§ 7.1), et troisième ligne sous le titre pour le nombre de morceaux du set et sa durée totale (auparavant affichés à part, en bout de ligne) — la carte suit désormais exactement la même structure que celle d'un rendez-vous (titre, ligne date/heure/lieu, ligne d'information complémentaire, bloc de fin de ligne).

# 14. Déploiement et infrastructure

- Code source hébergé sur GitHub ; tout changement poussé sur la branche principale déclenche un redéploiement automatique sur Vercel.

- Frontend construit avec Vite et servi statiquement par Vercel (offre gratuite, sans carte bancaire).

- Fonctions serveur `api/*` (§ 2.2) déployées automatiquement par Vercel avec le frontend, depuis le dossier `api/` du dépôt (runtime Node). Elles lisent la variable d'environnement **`DATABASE_URL`** (chaîne de connexion Neon, en pool), à définir dans Vercel → Settings → Environment Variables pour les portées *Production* et *Preview*. C'est le seul secret du projet ; il n'apparaît nulle part dans le code.

- Base de données hébergée sur **Neon** (PostgreSQL, offre gratuite, sans carte bancaire). Le projet Supabase historique (`hhtjuwmlllgglnxtnjtx.supabase.co`) est conservé intact quelques semaines comme filet de retour arrière (§ 2.5) puis sera supprimé.

- Aucun serveur à maintenir : les plateformes gèrent l'hébergement, la mise à l'échelle et la sécurité de l'infrastructure.

- Rafraîchissement automatique (§ 13.2) : chaque build Vite génère un identifiant de version (hash du commit Git fourni par Vercel) et l'écrit dans un fichier version.json déposé à la racine du site ; l'application compare cet identifiant à celui embarqué dans le code qu'elle exécute pour détecter qu'une version plus récente a été déployée.

- Règles de cache (fichier vercel.json) : la page d'accueil (index.html), le fichier version.json et le manifest PWA ne sont jamais mis en cache par le navigateur, pour être certain que la vérification de version porte toujours sur les dernières données publiées ; les fichiers JS/CSS générés par le build (nom unique à chaque déploiement) restent au contraire mis en cache durablement, sans conflit possible entre deux versions.

Coût actuel : 0 € par mois, les volumes d'usage (6 membres, quelques centaines de morceaux, usage occasionnel) restant très en-deçà des paliers gratuits des plateformes.

# 15. Limites connues et pistes d'évolution

| Sujet | État actuel | Évolution possible |
| --- | --- | --- |
| Authentification | Mot de passe par profil, sans limite de tentatives | Ajout d'un blocage après plusieurs échecs ; éventuellement un vrai service d'authentification si besoin de comptes email formels |
| Pochettes | Disponibles seulement pour les morceaux passés par la recherche Deezer | Recherche automatique en lot pour compléter les pochettes du catalogue importé |
| Notifications | Journal interne à l'application uniquement | Intégration d'un envoi réel vers un canal externe, si le besoin revient |
| Streaming | Deezer uniquement, par choix assumé et définitif du groupe | — (piste Spotify / Apple Music explicitement écartée, voir § 12) |
| Récurrence des rendez-vous | Plafonnée à 200 occurrences par série | Limite technique de sécurité ; à ajuster si un cas d'usage réel la dépasse |
| Icônes des membres | Association codée en dur par prénom exact, pour les 6 membres actuels (§ 11.5) | Prévoir un mécanisme plus robuste (ex. champ dédié en base) si la composition du groupe change |
| Dernière activité | Tamponnée à l'ouverture de l'application uniquement, pas à chaque action | Granularité plus fine possible (ex. tamponnage sur des actions clés) si le besoin s'en fait sentir |
| Multi-comptes simultanés | Un profil à la fois par appareil | Non prioritaire pour un usage à 6 personnes |
| Rafraîchissement automatique | Une instance déjà installée sur un téléphone avant la mise en place de ce mécanisme (§ 13.2) doit encore être mise à jour une dernière fois manuellement pour en bénéficier | Aucune (limite ponctuelle, sans impact au-delà de cette transition unique) |
| Nettoyage post-migration Neon | Le dépôt contient encore le dossier `supabase/` et les branches Supabase de `src/App.jsx` (point de commutation `const BACKEND`), conservés comme filet de retour arrière (§ 2.5) | À supprimer après quelques semaines d'exploitation stable sur Neon, avec suppression du projet Supabase et mise à jour du § 18 |

# 16. Journal des évolutions

## 16.1 Depuis la v1.0 (→ v1.1)

- Ajout du module Concerts : création/édition d'un concert (nom, date, heure, lieu), composition du set à partir du répertoire avec ordonnancement par glisser-déposer ou flèches, durée théorique du set, écran liste triée et défilante avec focus automatique sur le prochain concert, copie du concert dans le presse-papier.

- Ajout du module Rendez-vous : agenda des répétitions, ateliers, résidences et autres événements, avec date de fin, mode "toute la journée", récurrence (fréquence + date limite, suppression d'occurrence isolée, modification de série), participants choisis parmi les membres, filtre par type, tri croissant, liste défilante avec focus automatique sur le prochain événement. Intégration en lecture seule des concerts dans cette même liste.

- Alignement du fonctionnement du filtre par type (Rendez-vous) sur celui du filtre par statut (Répertoire) : choix unique, jamais aucune sélection ni sélection multiple.

- Renommage de l'onglet et de l'écran "WhatsApp" en "Historique" ; abandon de la piste d'intégration WhatsApp Business / Twilio dans la documentation et le code.

- Remplacement des icônes des onglets "Phase de choix" et "Concerts" pour lever toute ambiguïté visuelle, notamment entre Concerts et Rendez-vous.

- Retrait du bouton "Réinitialiser les données de démo".

- Correction de la barre d'onglets sur petit écran (mode icônes seules en dessous de 640 px, défilement horizontal de secours).

- Correction de deux anomalies d'enregistrement affectant l'ensemble des tables (voir § 2.3) : erreur PGRST102 lors de l'ajout d'un morceau, et erreur de lecture de réponse vide sur Safari.

## 16.2 Depuis la v1.1 (→ v1.2)

- Ajout de boutons de copie dans le presse-papier à chaque étape du module Phase de choix : propositions (avec le proposant), morceaux rejetés par veto (avec le ou les membres à l'origine du veto), résultat final du vote.

- Ajout de la possibilité d'annuler la phase de choix en cours, à tout moment et par n'importe quel membre du groupe : propositions conservées, vetos annulés (les morceaux concernés réintègrent le statut "Proposé"), votes perdus, phase non conservée dans l'historique.

- Ajout d'un historique des phases clôturées (initiateur, date de début, date de fin, durée), accessible depuis le module Phase de choix.

- Préparation de l'icône personnalisée pour l'ajout de l'application à l'écran d'accueil d'un smartphone (Web App Manifest, apple-touch-icon, favicon) — fichiers prêts, intégration finale sur le dépôt de code à réaliser (§ 13.1).

## 16.3 Depuis la v1.2 (→ v1.3)

- Ajout du module Boîte à idées : saisie libre, statut (Créée / Traitée / Terminée), filtre associé, changement de statut et suppression ouverts à tous les membres.

- Suppression du principe de service d'écoute préféré par membre : Deezer devient l'unique plateforme d'écoute intégrée, de façon définitive. Retrait corollaire de la modale "Réglages", qui ne contenait que ce choix.

- Retrait de l'onglet "Phase de choix" de la barre de navigation : son accès est désormais rattaché à l'écran Répertoire (bandeau de lancement, lien vers l'historique des phases), complété par un bandeau persistant visible sur les autres onglets dès qu'une phase est active.

- Renommage de l'onglet et de l'écran "Historique" en "Journal d'activité".

- Remplacement, dans le module Concerts, des deux filtres liés ("Prêt + En préparation" / "+ Inclure les morceaux sortis") par trois filtres de statut indépendants (Prêt, À préparer, Sorti), combinables librement, Prêt étant seul actif par défaut.

- Retrait du bouton de suppression rapide sur la liste des rendez-vous, par cohérence avec les autres listes de l'application ; la suppression (d'une occurrence isolée ou de toute une série récurrente) se fait désormais exclusivement depuis l'écran d'édition.

- Corrections de mise en page sur mobile : boutons d'action non alignés en hauteur, débordement du bandeau de lancement de phase, carte de rendez-vous poussant son bouton d'édition hors de l'écran (voir § 13).

- Régénération du script SQL consolidé de recréation de la base, reflétant l'intégralité du modèle à date (7 tables).

## 16.4 Depuis la v1.3 (→ v1.4)

- Ajout de l'écran d'accueil (§ 11) : nouvel onglet par défaut à l'ouverture de l'application, résumant le prochain rendez-vous hors concert, le prochain concert, l'état de la phase de choix en cours (mini barre de progression, message contextuel selon l'étape, récapitulatif des propositions/vetos/votes), les statistiques du répertoire (morceaux prêts / en préparation), et la dernière activité de chaque membre.

- Ajout d'icônes personnalisées par membre, en lien avec leur instrument (§ 11.5), en remplacement de l'initiale du prénom dans l'écran d'accueil — dont un pictogramme de basse obtenu par transformation de l'icône guitare, en l'absence d'icône dédiée dans la bibliothèque utilisée.

- Renommage de la colonne members.last_seen_at en last_activity_at et changement de sémantique associé : la donnée est désormais tamponnée à chaque ouverture de l'application (nouvelle action "touch" de l'Edge Function member-auth, sans mot de passe requis), et non plus seulement lors d'une authentification — celle-ci restant rare une fois l'identité mémorisée sur l'appareil (§ 4.1).

- Ajustement du contrôle d'accès (§ 4.2) : la colonne last_activity_at rejoint password_hash parmi les colonnes de members dont l'écriture directe est révoquée pour la clé publishable ; seule l'Edge Function peut la modifier.

## 16.5 Depuis la v1.4 (→ v1.5)

- Écran d'accueil, blocs Répertoire (§ 11.4) : ajout, sous le compteur de chaque statut ("Prêt" et "À préparer"), de la durée théorique cumulée des morceaux concernés — même calcul que le compteur du Répertoire (§ 5.2).

- Icônes des membres (§ 11.5) : la palette de couleurs du cercle d'avatar est resserrée à deux couleurs, ambre et gris, répartie par membre — au lieu des six couleurs utilisées jusque-là. L'indicateur de couleur de la section "Dernières connexions" (§ 11.6, vert / ambre / gris selon l'ancienneté de l'activité) n'est pas concerné par ce changement et garde ses trois niveaux.

## 16.6 Depuis la v1.5 (→ v1.6)

- Rafraîchissement automatique de l'application (§ 13.2 et § 14) : résout le blocage des membres sur une ancienne version une fois l'application ajoutée à l'écran d'accueil d'un smartphone (auparavant, seule une suppression/réinstallation permettait de récupérer la dernière version).

- Écran d'accueil (§ 11.2) : les cartes "Prochain rendez-vous" et "Prochain concert" affichent désormais la liste des participants, reprise du module correspondant.

- Icônes des membres (§ 11.5) : remplacement de la palette resserrée à deux couleurs (v1.5) par une couleur pastel individuelle par membre, choisie sans logique genrée.

- Ajout du module Commentaires (§ 8.5), partagé entre les rendez-vous et les concerts : tout membre peut ajouter ou supprimer un commentaire ; une nouvelle table comments (§ 3.8) les stocke, et une bulle dans les listes Rendez-vous et Concerts en affiche le nombre.

- Harmonisation ergonomique des trois écrans de liste — Répertoire, Concerts, Rendez-vous (§ 13.3) : ligne entièrement cliquable partout, icône crayon identique, action secondaire en bout de ligne au style unifié, gabarit de vignette commun, défilement interne systématique, réorganisation mobile étendue aux trois écrans, et repositionnement des libellés de l'écran Rendez-vous en bout de ligne dans l'ordre récurrent / PROCHAIN / catégorie (§ 8.3) — avec, au passage, le retrait de la mention "non modifiable ici" sur les concerts intégrés à cette liste, en contradiction avec le clic sur la ligne qui ouvre bien le concert en édition.

- Mise à jour de cette documentation suite à un premier accès direct au dépôt de code : confirmation que l'intégration de l'icône PWA (§ 13.1), mentionnée comme en suspens depuis la v1.2, était en réalité déjà finalisée.

## 16.7 Depuis la v1.6 (→ v1.7)

- Historique des phases (§ 6.7) enrichi : en plus de l'initiateur, de la date de début, de la date de fin et de la durée, chaque phase clôturée affiche désormais le nombre de propositions, le nombre de morceaux rejetés par veto et le résultat final (titre et artiste des 3 morceaux retenus). Nombre de propositions et résultat proviennent d'un instantané pris à la clôture (nouvelles colonnes phases.proposed_count et phases.result, § 3.3), le recalcul a posteriori n'étant pas fiable.

- Ce fichier et le script SQL consolidé de recréation de la base (recreate_full_schema.sql) rejoignent le dépôt Git (dossier docs/ et racine du dépôt), qui devient leur unique source de vérité — ils n'existaient auparavant que comme documents à part, avec le risque de désynchronisation que cela implique.

- Correction de la suppression des commentaires liés (§ 3.8) : deleteConcert et deleteEvent suppriment désormais les lignes de la table comments référençant le concert ou le rendez-vous avant de le supprimer. Auparavant, supprimer un concert ou un rendez-vous commenté échouait en base sur une violation de contrainte de clé étrangère (aucune clause ON DELETE côté schéma).

- Ajout d'un fichier .gitignore à la racine du dépôt (.DS_Store, node_modules/, dist/, .env*) et arrêt du suivi Git des fichiers .DS_Store précédemment commités.

- Écran liste des concerts (§ 7.1) : le défilement automatique amène désormais réellement le prochain concert en haut de la zone défilante, comme sur l'agenda des rendez-vous. Trois ajustements : la zone a une hauteur fixe prolongée d'une cale vide (un défilement est donc toujours possible, même quand la liste est courte — auparavant elle tenait entièrement dans la zone visible et les concerts passés restaient en tête) ; le défilement se rejoue quand la liste finit de charger et non plus à la seule ouverture de l'onglet ; la liste se cale sur le dernier concert passé quand aucun concert n'est à venir.

- Compteurs en tête des listes Concerts (§ 7.1) et Rendez-vous (§ 8.3) : ils décomptent désormais uniquement les éléments à venir ("X concert(s) programmé(s)", "X rendez-vous à venir"), les éléments passés étant exclus du chiffre (ils restent affichés dans la liste). Pour les rendez-vous, le décompte suit le filtre par type actif.

- Pastille de date des écrans Accueil (§ 11.2), Concerts (§ 7.1) et Rendez-vous (§ 8.3) : ajout de l'année sous le jour et le mois (§ 13.3).

- Couleurs des types de rendez-vous (§ 8.3), sur la pastille de date, le badge et la bande d'angle de l'écran d'accueil : "Concert" passe du rouge au turquoise (`#2E9FB8`) — le rouge se confondait avec la couleur d'alerte de l'application (vetos, erreurs, suppressions, statut "Sorti") et rendait les concerts peu identifiables dans la liste ; "Autre" passe du taupe au violet (`#9884C4`) — le taupe est le gris neutre d'interface de l'application et faisait passer ces rendez-vous pour des événements passés ou désactivés. §11.5 corrigé en conséquence (le rouge n'est plus décrit comme la couleur du concert).

- Harmonisation de la carte de l'écran Concerts (§ 7.1, § 13.3) sur celle de l'écran Rendez-vous : le badge "PROCHAIN", auparavant accolé au nom du concert, rejoint désormais le bloc de fin de ligne partagé avec l'icône crayon ; le nombre de morceaux du set et sa durée totale, auparavant affichés à part en bout de ligne, deviennent une troisième ligne sous la ligne date/heure/lieu. La pastille de date d'un concert à venir utilise désormais la couleur turquoise du type "Concert" plutôt que l'ambre, y compris pour le prochain concert (l'ambre restant réservé au badge "PROCHAIN" lui-même et à la bordure de la carte).

- Ajout du logo du groupe (§ 13) : il remplace le point ambre à gauche de "CALYXTER" dans la barre supérieure, et coiffe le nom du groupe sur l'écran de connexion (largeur `min(44vw, 180px)`, contenu centré verticalement). Fichier `public/logo.png` dérivé de l'illustration source "X négatif" (fond noir détouré par la luminance).

- Correction du zoom d'iOS Safari (§ 13) : la police des champs de saisie passe à 16 px sur appareil tactile (le seuil sous lequel iOS zoome au focus et ne dézoome pas toujours) ; après connexion, on force en plus un retour en haut de page. Résout le fait d'arriver sur l'application zoomée et décalée après avoir saisi le mot de passe.

- Type de rendez-vous "Résidence" (§ 8.3) : ambre éclairci de `#E8B04B` à `#F0CE8A` (blé doré) pour ne plus se confondre avec l'ambre d'accent `#F2A93B`.

- Durée des rendez-vous et des concerts (§ 3.5, § 3.6, § 7.2, § 8.1, § 8.2) : la saisie passe de "heure de début + heure de fin" à "heure de début + durée" (liste de valeurs, pré-remplie à 1 h) sur les rendez-vous d'un seul jour comme sur les concerts ; l'heure de fin est calculée puis stockée. Les rendez-vous multi-jours conservent une heure de fin quotidienne saisie à la main. Nouvelle colonne `concerts.end_time` (migration requise : `alter table public.concerts add column if not exists end_time time;`) ; `events.end_time` existait déjà. La durée est affichée dans les listes juste après l'horaire (§ 8.3), avec une icône de sablier, sur les écrans Concerts, Rendez-vous et Accueil.

- Écran de connexion (§ 13) : les vignettes "scotch" en haut des cartes de profil et de l'écran mot de passe reprennent la couleur d'avatar de chaque membre au lieu de l'ambre.

- Bouton "Ajouter à mon agenda" sur les éditeurs de concert (§ 7.2) et de rendez-vous (§ 8.2), et icône agenda en bout de ligne dans les listes Concerts (§ 7.1) et Rendez-vous (§ 8.3) : génère un fichier iCalendar (.ics) ouvert par l'application de calendrier par défaut de l'appareil (heure locale flottante ; règle de récurrence incluse pour une série). Aucun serveur ni compte tiers, aucune donnée envoyée à l'extérieur.

- Listes Concerts et Rendez-vous (§ 13.3) : les actions de bout de ligne (agenda, commentaires) sont empilées dans une seule colonne au lieu d'être juxtaposées, pour rendre de la largeur à la carte.

- Documentation : passage en v1.7 (en-tête et statut), correction de renvois « § 13.2 » qui visaient en réalité « § 13.3 » (harmonisation des listes), et ajout d'une section « Première installation » (§ 18) décrivant la reconstruction complète sur des comptes neufs.

- Phase de choix (§ 6) : l'indicateur « propositions » de la barre de progression, la liste « Copier les propositions » et l'instantané `proposed_count` de l'historique comptent désormais les nouvelles propositions **depuis la dernière phase clôturée** (et non depuis le seul lancement de la phase en cours) — une proposition ajoutée entre deux phases est donc prise en compte. Le vote, lui, portait déjà et porte toujours sur l'intégralité des morceaux non rejetés (§ 6.3), quelle que soit leur date : rien changé, clarifié dans la doc.

- Phase de choix (§ 6.4) : faire avancer une phase d'une étape à l'autre et la clôturer une fois le résultat obtenu sont désormais ouverts à tous les membres (comme le lancement et l'annulation l'étaient déjà), pour ne pas dépendre de l'initiateur·rice. Ces deux actions demandent une confirmation, et la notification de clôture indique le membre qui a clôturé.

- Edge Functions : le code de `member-auth` et `search-deezer` rejoint le dépôt Git dans `supabase/functions/` (avec un README de contrat d'API), après avoir vécu jusque-là hors versionnement. Nouvelle section § 2.2 « Les deux Edge Functions » (l'ancienne § 2.2 devient § 2.3), et § 18.4 étoffé (variables d'environnement injectées par Supabase, question du `--no-verify-jwt` selon la config du projet, avertissement sur le schéma de hachage à ne pas modifier).

## 16.8 Depuis la v1.7 (→ v1.8)

- **Migration du backend de Supabase vers Neon** (§ 2.5). Motivation : le plafond de 2 projets gratuits chez Supabase. Le frontend ne se connecte plus directement à la base : il passe par trois fonctions serveur `api/*` hébergées sur Vercel (`api/db` — accès générique aux tables ; `api/member-auth` — mots de passe et activité, schéma de hachage PBKDF2 inchangé ; `api/search-deezer` — relais Deezer). La chaîne de connexion Neon (`DATABASE_URL`) vit uniquement dans les variables d'environnement Vercel ; **plus aucun identifiant d'accès aux données n'est présent dans `src/App.jsx`** (avant : URL Supabase + clé publishable en dur).

- La Data API de Neon (compatible PostgREST) a été évaluée puis écartée : elle impose un jeton JWT sans mode anonyme simple, incompatible avec le modèle « 6 profils partagés, sécurité par confidentialité du lien » (§ 2.5, § 4.3).

- Contrôle d'accès (§ 4.2) refondu : plus de Row Level Security ni de clé publique à protéger (la base n'est jamais jointe de l'extérieur). La protection de `members.password_hash` (jamais renvoyé) et `last_activity_at` (non modifiable) est faite dans le code de `api/db`. Constructeurs de requêtes SQL paramétrés et testés.

- Migration des données par le script `db/migrate.mjs` (Node + `pg`) : copie des 8 tables en préservant identifiants, empreintes de mots de passe et colonnes JSON, source jamais modifiée, mode `--rollback` pour le sens inverse. Schéma cible `db/neon_schema.sql`.

- Filet de sécurité (§ 2.5) : étiquette Git `pre-neon-migration`, Instant Rollback Vercel (~30 s), point de commutation `const BACKEND` dans `src/App.jsx` (les branches Supabase du code sont conservées), et **projet Supabase laissé intact au moins deux semaines** avant nettoyage. Plan complet dans `docs/Migration_Neon.md`.

- Sections mises à jour : § 2 (architecture, flux, fonctions serveur), nouvelle § 2.4 (piège `preferred_platform`) et § 2.5 (migration), § 4 (authentification et contrôle d'accès), § 12, § 14 (infrastructure, variable `DATABASE_URL`), § 15, § 17, § 18 (première installation entièrement réécrite pour Neon).

## 16.9 Depuis la v1.8 (→ v1.9)

- **Notes de transition dans les sets de concert** (§ 7.2, § 3.5) : chaque ligne de morceau porte un bouton qui insère une note libre **avant** ce morceau (lancement, enchaînement, intro, remerciements…). Les notes s'affichent sur leur propre ligne (italique, pointillés, sans numéro), se réordonnent et se suppriment comme les morceaux. Elles **ne comptent pas dans le nombre de morceaux**, mais **chacune ajoute 3 min à la durée théorique du set** (constante `NOTE_SECONDS`, appliquée partout où cette durée est affichée : éditeur, carte de la liste, résumé du .ics, texte copié). Elles apparaissent dans le texte « Copier le concert » (§ 7.3), préfixées `→`. Nouvelle colonne `concerts.set_items` (`alter table concerts add column if not exists set_items jsonb not null default '[]'::jsonb;`) ; `song_ids` reste le reflet des seuls morceaux, donc tous les écrans qui en dépendent (liste, Accueil, agenda .ics) sont inchangés. Les concerts créés avant la fonctionnalité ont `set_items = []` : l'éditeur reconstruit alors la liste depuis `song_ids` au premier chargement.

- **Export imprimable du set** (§ 7.4) : bouton "Imprimer le set" dans l'éditeur de concert → document HTML autonome sur une page A4 (nom, date, set complet transitions comprises), impression ou "Enregistrer en PDF". Fabriqué côté navigateur, sans bibliothèque tierce.

- **Correction — écritures `jsonb` via `api/db`** : le pilote `@neondatabase/serverless` encode un tableau JS comme un littéral tableau Postgres (`{a,b}`), rejeté par les colonnes `jsonb`. Toute écriture d'une ligne portant un tableau JSON échouait donc depuis la bascule Neon : enregistrer le set d'un concert (`song_ids`), les participants ou dates exclues d'un rendez-vous (`participant_ids`, `excluded_dates`), poser un veto ou voter (`phases.vetoes`, `votes`, `tie_break_votes`). Passé inaperçu à la recette (seuls des chemins sans tableau avaient été testés). `api/db.js` sérialise désormais tout objet/tableau en texte JSON avant paramétrage (`normValue`, même règle que `db/migrate.mjs`). Ajout d'un fichier de tests `api/db.test.mjs` (lancé par `npm test`, `node --test`) couvrant les constructeurs SQL et `normValue`.

# 17. Références

Application déployée : https://calyxter-set-manager-8xe2nnee2-ndalmont.vercel.app (URL de déploiement la plus récente testée — vérifier l'URL de production stable dans le tableau de bord Vercel).

Dépôt de code : GitHub, dépôt "calyxter-set-manager" du compte utilisé pour le déploiement Vercel. Points d'entrée : `src/App.jsx` (frontend complet), `api/` (fonctions serveur : `db.js`, `member-auth.js`, `search-deezer.js`) et `lib/neon.js` (connexion Neon partagée), `db/neon_schema.sql` (schéma de la base) et `db/migrate.mjs` (migration/rollback des données), cette documentation dans `docs/` et le plan de migration `docs/Migration_Neon.md`.

Base de données : projet **Neon** (tableau de bord Neon → branche `main` → SQL Editor et Connection Details). La variable `DATABASE_URL` des fonctions Vercel pointe vers ce projet.

Filet de retour arrière — projet Supabase historique : https://hhtjuwmlllgglnxtnjtx.supabase.co, conservé intact quelques semaines (§ 2.5). Code des anciennes Edge Functions et schéma d'origine encore dans `supabase/` (`functions/`, `recreate_full_schema.sql`) jusqu'au nettoyage post-migration.

# 18. Première installation (repartir de zéro)

Procédure pour reconstruire l'application sur des comptes neufs (nouveau projet Neon, nouveau déploiement Vercel), par exemple pour un environnement de test ou après une perte d'accès. Décrit l'architecture depuis la migration Neon (§ 2.5). Une seule configuration à faire : la variable d'environnement `DATABASE_URL` sur Vercel — aucun secret dans le code, aucun fichier `.env` versionné.

## 18.1 Prérequis

- Node.js ≥ 18 (testé avec la 24) et npm, pour le développement local et le build.
- Un compte GitHub (dépôt de code), un compte Neon (base de données), un compte Vercel (frontend + fonctions serveur). Les trois suffisent en offre gratuite aux volumes d'usage du groupe.
- Aucun outil `psql` / `pg_dump` requis : le script de migration des données (§ 18.6) est en Node pur.

## 18.2 Récupérer le code

```
git clone <url-du-dépôt> calyxter-set-manager
cd calyxter-set-manager
npm install
```

`npm run dev` lance le serveur de développement Vite (port 5173) — mais les fonctions `api/*` n'y tournent pas ; pour les tester en local, utiliser `npx vercel dev` (après `vercel link`) qui sert frontend et fonctions ensemble et lit `.env.local`. `npm run build` produit le site statique dans `dist/`.

## 18.3 Base de données Neon

1. Créer un projet Neon (région au choix ; une branche `main` est créée par défaut). **Neon Auth n'est pas nécessaire** — l'application n'utilise pas la Data API.
2. Dans le SQL Editor, exécuter l'intégralité de `db/neon_schema.sql` (dans le dépôt) : extension `pgcrypto`, 8 tables, types enum, index. Pas de RLS ni de rôle applicatif (§ 2.5, § 4.2). Le script commence par des `drop ... cascade` — sur un projet neuf, sans effet.
3. Dans *Connection Details*, relever la chaîne de connexion **en pool** (« Pooled connection », hôte en `-pooler`) : c'est la valeur de `DATABASE_URL` (§ 18.5). Garder aussi la chaîne **directe** (sans `-pooler`) sous la main pour la migration des données (§ 18.6).

## 18.4 Fonctions serveur (`api/`)

Rien à déployer séparément : les trois fichiers de `api/` (`db.js`, `member-auth.js`, `search-deezer.js`) et le helper `lib/neon.js` sont déployés automatiquement par Vercel avec le frontend, servis sous `/api/<nom>` (§ 2.2, § 14).

Précisions :

- **Unique variable d'environnement** : `DATABASE_URL` (chaîne Neon en pool). À définir sur Vercel (§ 18.7) et, pour le développement local avec `vercel dev`, dans `.env.local` (gitignoré ; un modèle est fourni dans `.env.example`).
- **Dépendance runtime** : `@neondatabase/serverless` doit rester dans `dependencies` (pas `devDependencies`) — les fonctions en ont besoin à l'exécution. `pg` est en `devDependencies` (utilisé seulement par le script de migration `db/migrate.mjs`).
- **Schéma de hachage** : `api/member-auth.js` utilise PBKDF2 100 000 itérations / sel 16 octets / SHA-256, format `saltHex:hashHex`. Sur une base neuve, les mots de passe sont vides et chaque membre crée le sien (§ 18.6, § 4.1). Sur une base contenant des empreintes migrées, **ne jamais modifier ce schéma** : les mots de passe deviendraient invérifiables (§ 2.2).

## 18.5 Configurer le frontend

Le frontend ne contient **aucun identifiant**. Vérifier seulement, dans `src/App.jsx`, que la constante `BACKEND` (vers le début du fichier) vaut `'neon'`. La valeur `'supabase'` réactive l'ancien backend (branches de code conservées le temps de la période de sécurité, § 2.5) et suppose un projet Supabase configuré.

## 18.6 Créer les membres et le répertoire

Deux cas.

**Reprise de données existantes** (migration depuis un backend Supabase encore en place) : lancer le script de copie, avec les chaînes de connexion **directes** des deux bases passées en variables d'environnement (jamais en clair dans un fichier versionné) :

```
export SUPABASE_DIRECT_URL='postgresql://postgres.<ref>:<mdp>@aws-<...>.pooler.supabase.com:5432/postgres'
export NEON_DIRECT_URL='postgresql://<user>:<mdp>@<hôte-sans-pooler>/<db>?sslmode=require'
node db/migrate.mjs
```

Le script copie les 8 tables dans l'ordre des clés étrangères, vide la cible au préalable, préserve identifiants / empreintes de mots de passe / colonnes JSON, vérifie les volumes, et **ne modifie jamais la source**. `node db/migrate.mjs --rollback` copie en sens inverse (Neon → Supabase).

**Base vierge** :

- Insérer les 6 lignes de `members` (colonnes `name`, `instrument` ; `id` et `created_at` auto-générés). Ne pas renseigner `password_hash` : chaque membre définit son mot de passe à sa première connexion (§ 4.1).
- Pour les icônes et couleurs d'avatar personnalisées, les prénoms doivent correspondre exactement au tableau du § 11.5 (Do, Dave, Alex, Niko, Véro, Gawel). Un autre prénom retombe sur l'affichage par défaut.
- Importer éventuellement le répertoire (161 morceaux) dans `songs`.

## 18.7 Déploiement Vercel

1. Connecter le dépôt GitHub à un projet Vercel.
2. Build command `npm run build`, output directory `dist` (Vercel détecte Vite automatiquement) ; le dossier `api/` est repris automatiquement comme fonctions serverless.
3. **Environment Variables** : ajouter `DATABASE_URL` (chaîne Neon en pool) pour les portées *Production* **et** *Preview*. `VERCEL_GIT_COMMIT_SHA` est fournie automatiquement et alimente le mécanisme de version (§ 14).
4. Le fichier `vercel.json` (déjà dans le dépôt) fixe les règles de cache (§ 14) : ne pas le modifier.

Chaque `git push` sur la branche principale redéploie ensuite l'application automatiquement.

## 18.8 Vérification

Ouvrir l'URL de production, choisir un profil, créer (ou saisir) un mot de passe : l'application doit charger la liste des membres, permettre la connexion, puis afficher l'écran Accueil. Ouvrir les outils de développement du navigateur (onglet Réseau) : toutes les requêtes de données doivent viser `/api/db`, `/api/member-auth`, `/api/search-deezer` — aucune vers un autre domaine. En cas d'échec de chargement des membres : vérifier que `DATABASE_URL` est bien définie sur Vercel et que le schéma `db/neon_schema.sql` a été exécuté sur la bonne branche Neon (consulter les logs de la fonction `api/db` dans Vercel).
