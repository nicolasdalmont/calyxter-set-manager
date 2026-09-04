CALYXTER

SET MANAGER

Documentation technique et fonctionnelle

Version 1.6 — 2 septembre 2026

Statut : application déployée, en phase de test avec les 6 membres du groupe — rafraîchissement automatique à l'ouverture, commentaires sur les rendez-vous et les concerts, palette d'avatars individuelle et pastel par membre, écrans de liste harmonisés

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
| Base de données | Supabase (PostgreSQL) | Stockage des membres, morceaux, phases de choix, notifications, concerts et rendez-vous |
| Fonctions serveur | Supabase Edge Functions (Deno) | Recherche Deezer, gestion sécurisée des mots de passe et tamponnage de la dernière activité des membres |
| API externe | Deezer (catalogue public) | Recherche de morceaux avec auto-complétion (titre, artiste, durée, pochette) |

## 2.1 Flux général

Le navigateur (frontend React) communique directement avec Supabase via deux canaux : l'API REST PostgREST (lecture/écriture des tables, authentifiée par une clé publique dite "publishable") et les Edge Functions (pour les opérations nécessitant un secret serveur : hachage des mots de passe, tamponnage de l'activité des membres, recherche Deezer relayée pour éviter les soucis de CORS).

Aucune couche serveur propriétaire n'a été développée : toute la logique applicative réside dans le composant React et dans les deux fonctions serverless.

## 2.2 Fiabilisation des écritures Supabase

Deux anomalies identifiées en cours de développement ont été corrigées dans la fonction générique d'appel à l'API Supabase, commune à toutes les tables :

- Regroupement des écritures — l'enregistrement d'un morceau du répertoire envoyait initialement l'intégralité de la table à chaque sauvegarde en un seul appel groupé ; PostgREST exige que tous les objets d'un même envoi partagent exactement les mêmes colonnes, ce qui provoquait une erreur (PGRST102) dès qu'un morceau nouvellement créé (aux clés incomplètes côté client) cohabitait avec des morceaux déjà en base. Corrigé en ne transmettant plus que les lignes réellement ajoutées ou modifiées.

- Réponses à corps vide — un enregistrement réussi côté serveur (code HTTP 201, utilisé par les écritures avec l'en-tête "Prefer: return=minimal") pouvait néanmoins déclencher une erreur de lecture de la réponse ("SyntaxError" côté Safari), la fonction ne sachant reconnaître une réponse vide que via le code 204. Corrigée pour accepter tout corps de réponse vide, quel que soit le code HTTP retourné.

# 3. Modèle de données

La base compte désormais 8 tables. Les données des phases de choix (vetos, votes, brouillons, départages) restent volontairement embarquées en JSON directement dans la table des phases plutôt que normalisées, pour rester au plus près de la structure manipulée par l'interface ; le même principe a été repris pour les sets de concert et pour la récurrence des rendez-vous.

## 3.1 Table members

| Colonne | Type | Description |
| --- | --- | --- |
| id | uuid | Identifiant unique, généré automatiquement |
| name | text | Prénom du membre |
| instrument | text | Instrument joué |
| password_hash | text | Empreinte du mot de passe (PBKDF2 + sel) — jamais lisible depuis le frontend |
| last_activity_at | timestamptz | Horodatage de la dernière activité du membre (pas seulement de sa dernière connexion — voir § 4.1 et § 11.6), tamponné exclusivement par l'Edge Function member-auth |
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
| event_time | time | Heure (optionnelle) |
| venue | text | Lieu (optionnel) |
| song_ids | jsonb | Set du concert : tableau ordonné d'identifiants de morceaux |
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
| start_time / end_time | time | Horaires (optionnels) |
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

Choix assumé pour ce projet : pas de Supabase Auth (jugé trop complexe à gérer pour 6 utilisateurs). L'authentification est gérée entièrement au niveau applicatif.

## 4.1 Fonctionnement

- Chaque membre choisit son profil dans une liste (nom + instrument).

- Au premier accès, aucun mot de passe n'existe : l'appli propose d'en créer un (6 caractères minimum).

- Aux accès suivants, le mot de passe est demandé et vérifié.

- La création et la vérification se font exclusivement côté serveur, dans l'Edge Function member-auth, avec un hachage PBKDF2 (100 000 itérations, sel aléatoire de 16 octets, SHA-256). Le mot de passe en clair ne transite jamais vers la base, et l'empreinte n'est jamais renvoyée au navigateur.

- Une fois l'identité vérifiée, elle reste mémorisée sur l'appareil : le mot de passe n'est donc redemandé qu'à la toute première connexion, jamais aux ouvertures suivantes de l'application (jusqu'à un changement explicite de compte). Chaque ouverture — connexion fraîche ou session mémorisée — déclenche néanmoins un signal d'activité vers le serveur (action "touch" de l'Edge Function member-auth, sans mot de passe), qui tamponne members.last_activity_at. Cette distinction importe : s'appuyer sur les seuls événements de connexion aurait très largement sous-estimé la fréquence d'usage réelle du groupe. La donnée est affichée dans l'écran Accueil, section "Dernières connexions" (§ 11.6).

## 4.2 Contrôle d'accès (Row Level Security)

Toutes les tables sont protégées par des règles Postgres (RLS), avec un accès ouvert à quiconque dispose de la clé "publishable" de l'application (clé destinée à vivre dans le code du frontend). Deux colonnes de la table members font exception : password_hash, dont les privilèges de lecture ET d'écriture sont explicitement révoqués pour cette clé, et last_activity_at, dont seule l'écriture est révoquée (la lecture reste ouverte, cette donnée étant affichée à l'écran). Dans les deux cas, seule l'Edge Function (via la clé secrète, jamais exposée) peut modifier la colonne — ce qui empêche un client de falsifier son propre mot de passe ou la dernière activité d'un autre membre via un appel REST direct. La table comments (§ 3.8) suit le régime d'accès ouvert commun à la majorité des tables : tout membre peut y ajouter ou supprimer une ligne, sans restriction liée à l'auteur (§ 8.5).

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

- Pochette d'album affichée pour chaque morceau ayant été ajouté ou complété via la recherche Deezer (au même gabarit que la pastille date des listes Concerts et Rendez-vous, voir § 13.2) ; icône de remplacement sinon.

- Ligne de la liste entièrement cliquable pour ouvrir l'édition du morceau, comme sur les listes Concerts et Rendez-vous (§ 13.2) ; le bouton d'écoute rapide reste une action distincte, isolée en bout de ligne.

- Bouton d'écoute rapide : ouvre le lien Deezer direct si disponible, sinon une recherche sur Deezer (seule plateforme d'écoute intégrée — choix assumé du groupe, sans notion de service préféré par membre).

- Liste contenue dans un conteneur à hauteur limitée avec défilement interne, comme les listes Concerts et Rendez-vous (§ 13.2).

- Mise en page responsive : sur mobile, les informations (titre, artiste, album) s'affichent en pleine largeur, les métadonnées (statut, langue, durée, actions) se replacent sur une ligne dédiée.

## 5.3 Ajout, édition et suppression

- Recherche Deezer intégrée avec auto-complétion : la sélection d'un résultat préremplit titre, artiste, album, durée, pochette et lien d'écoute.

- Saisie manuelle toujours disponible en complément, pour les compositions originales ou démos absentes de Deezer (avec lien externe personnalisé : YouTube, SoundCloud, Drive…).

- Détection de doublon à l'ajout et à l'édition : un morceau de même titre et artiste (insensible à la casse) déjà présent bloque l'enregistrement, avec indication du statut existant.

- Édition libre de tous les champs, y compris un changement manuel de statut en dehors de toute phase de choix (avec avertissement à l'écran).

- Suppression définitive d'un morceau possible depuis la fiche d'édition, avec confirmation explicite avant l'action, irréversible.

# 6. Fonctionnalités — Module Phase de choix

N'importe quel membre peut lancer une phase de choix. Ce module n'a plus d'onglet dédié dans la barre de navigation : son accès est désormais rattaché à l'onglet Répertoire, avec lequel il est étroitement lié (voir § 6.8). Elle se déroule en 4 étapes successives, avec une barre de progression affichant, sous le libellé de chaque étape, un indicateur contextuel : nombre de morceaux proposés depuis le lancement de la phase, nombre de morceaux rejetés par veto, nombre de bulletins de vote validés.

## 6.1 Étape 1 — Proposition

Tout membre peut proposer un nouveau morceau (recherche Deezer ou saisie manuelle). Les morceaux déjà au statut "Proposé" avant l'ouverture de la phase intègrent automatiquement la liste.

## 6.2 Étape 2 — Veto

Chaque membre peut poser son veto sur un ou plusieurs morceaux proposés. Le veto d'un seul membre suffit à rejeter immédiatement et définitivement un morceau (statut "Sorti"), avec notification sur le journal de l'application.

## 6.3 Étape 3 — Vote

Le vote se fait par un classement interactif plutôt qu'une saisie de notes indépendantes :

- Les morceaux n'ont aucune note par défaut.

- Glisser-déposer ou flèches haut/bas pour positionner un morceau : le premier de la liste reçoit la meilleure note (jusqu'à 10), un morceau inséré sous un morceau déjà noté reçoit la note immédiatement inférieure, et tous les morceaux en dessous rétrogradent d'un cran en cascade.

- Le défilement automatique de la liste s'active pendant un glisser-déposer approchant le haut ou le bas de l'écran.

- Le classement en cours est sauvegardé automatiquement en continu (brouillon), même sans validation — aucune perte de progression en cas de fermeture accidentelle.

- La validation du bulletin (qui le fait compter dans le résultat) est bloquée tant que les meilleures places disponibles (jusqu'à 10) ne sont pas toutes classées.

## 6.4 Étape 4 — Résultat

Le classement final est calculé automatiquement à partir des points cumulés de tous les bulletins validés, avec application des règles suivantes :

- Quota francophone : si aucun morceau francophone ne figure naturellement dans le Top 3, le meilleur morceau francophone du classement est automatiquement promu en 3ᵉ position, à la place du morceau initialement classé 3ᵉ.

- Départage en cas d'égalité, dans l'ordre : (1) meilleure note individuelle reçue par un morceau ; (2) mini-vote de départage express entre les morceaux ex-æquo ; (3) message invitant à un arbitrage oral en répétition si l'égalité persiste.

- La clôture de la phase (réservée à son initiateur) fait passer les 3 morceaux retenus au statut "À préparer" et publie le résultat sur le journal de notifications. Au même moment, un instantané du nombre de propositions et du résultat final est enregistré sur la ligne de la phase (colonnes proposed_count et result, § 3.3) pour alimenter l'historique des phases (§ 6.7).

## 6.5 Copie dans le presse-papier

Chaque étape propose un bouton dédié pour copier un résumé prêt à coller dans une conversation :

- Étape Proposition — "Copier les propositions" : liste des morceaux proposés depuis le lancement de la phase, avec l'identité du membre à l'origine de chaque proposition.

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

Accessible depuis un bouton dédié (visible en permanence pendant une phase active, et depuis l'écran "Aucune phase en cours"), l'historique liste les phases clôturées normalement, avec pour chacune : l'initiateur, la date de début, la date de fin et la durée écoulée entre les deux, le nombre de propositions, le nombre de morceaux rejetés par veto, et le résultat final (titre et artiste des 3 morceaux retenus, sans lien vers le répertoire). Les phases annulées (§ 6.6) n'y apparaissent jamais.

Le nombre de propositions et le résultat final proviennent d'un instantané pris au moment précis de la clôture (§ 3.3, § 6.4) : ils ne peuvent pas être recalculés après coup, les morceaux gagnants changeant de statut et le répertoire pouvant évoluer depuis. Pour une phase close avant l'introduction de ces colonnes (ou importée rétroactivement sans cette donnée), l'écran affiche "—" plutôt qu'un chiffre ou un résultat inventés. Le nombre de vetos, lui, reste dérivé à l'affichage à partir des vetos conservés sur la ligne de la phase — aucune colonne dédiée n'est nécessaire.

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

- Chaque carte affiche le nom, la date, l'heure, le lieu, le nombre de morceaux du set et sa durée totale, ainsi qu'une bulle affichant le nombre de commentaires laissés sur le concert (§ 8.5).

## 7.2 Création et édition d'un concert

- Champs : nom et date obligatoires ; heure et lieu facultatifs.

- Sélection des morceaux du set via trois filtres de statut indépendants et combinables librement — "Prêt" (activé par défaut, seul), "À préparer" et "Sorti" — chacun s'active ou se désactive séparément selon que l'on souhaite élargir ou restreindre la liste des morceaux proposés à l'ajout ; recherche texte parmi les morceaux disponibles.

- Ordonnancement du set par glisser-déposer ou flèches haut/bas, avec défilement automatique de la liste pendant un glisser-déposer approchant le haut ou le bas de l'écran (même mécanique que le module Phase de choix).

- Durée théorique totale du set recalculée et affichée en continu, dans le même format que le compteur du répertoire.

- Suppression du concert possible depuis l'écran d'édition, avec confirmation explicite.

## 7.3 Copie dans le presse-papier

Un bouton "Copier le concert" génère et copie un texte prêt à coller dans une conversation (nom du concert, date, heure et lieu ; le set complet, un morceau par ligne avec sa durée ; puis la durée théorique totale du set). Une confirmation visuelle ("Copié !") s'affiche brièvement après la copie ; un message d'erreur explicite apparaît si le navigateur bloque l'accès au presse-papier.

# 8. Fonctionnalités — Module Rendez-vous

Agenda partagé du groupe, distinct des concerts mais les intégrant automatiquement en lecture seule.

## 8.1 Définition d'un rendez-vous

Un rendez-vous est défini par un type (Répétition, Atelier de travail, Résidence ou Autre), un objet, une date de début, une date de fin, un statut "toute la journée", des horaires de début/fin, un lieu et une liste de participants choisis parmi les membres du groupe.

## 8.2 Saisie assistée

- La date de fin recopie automatiquement la date de début à chaque saisie de celle-ci (modifiable ensuite librement, pour un rendez-vous sur plusieurs jours comme une résidence).

- L'horaire de fin recopie automatiquement l'horaire de début à chaque saisie de celui-ci, sauf sur un rendez-vous multi-jours, ou si la nouvelle heure de début reste antérieure à l'heure de fin déjà saisie (la plage reste alors valide et n'est pas modifiée).

- La case "Toute la journée" masque et vide les champs d'horaires.

## 8.3 Écran liste et filtre

- Rendez-vous triés par date croissante, dans une liste défilante, ouverte automatiquement centrée sur le prochain événement à venir (même mécanique que le module Concerts, badge "PROCHAIN" inclus).

- Compteur en tête de liste : nombre de rendez-vous **à venir** ("X rendez-vous à venir"), les rendez-vous passés étant exclus du décompte (un rendez-vous en cours, dont la date de fin n'est pas dépassée, compte comme à venir). Le décompte porte sur les rendez-vous que le filtre par type actif laisse afficher, concerts intégrés compris. Les rendez-vous passés restent affichés dans la liste.

- Filtre par type à choix unique (Tous, ou exactement un type à la fois), identique dans son fonctionnement au filtre de statut du Répertoire (§ 5.2).

- Code couleur par type, repris sur la pastille de date, le badge de catégorie et (écran Accueil) la bande d'angle : Répétition bleu ardoise, Atelier de travail sauge, Résidence or, Autre violet, Concert turquoise. Le turquoise du concert le distingue nettement des autres rendez-vous dans la liste ; il a remplacé un rouge qui se confondait avec la couleur d'alerte de l'application (vetos, erreurs, suppressions, statut "Sorti"). Le violet du type "Autre" a de même remplacé un taupe qui, étant le gris neutre d'interface de l'application, faisait lire ces rendez-vous comme passés ou désactivés. Un rendez-vous passé, lui, perd bien sa couleur au profit d'un gris neutre.

- Les libellés de la ligne (indication "récurrent" le cas échéant, badge "PROCHAIN" le cas échéant, puis catégorie du rendez-vous) sont regroupés en bout de ligne dans cet ordre, au même endroit et selon la même logique de repli sur mobile que les badges de statut et de langue du Répertoire (§ 13.2) — le titre du rendez-vous occupe désormais la première ligne de la carte.

- Les concerts apparaissent dans cette liste au même titre que les autres rendez-vous : cliquer dessus bascule vers le module Concerts et ouvre directement le concert concerné en édition (la mention "non modifiable ici", auparavant affichée sur ces lignes, a été retirée — elle entrait en contradiction avec ce comportement au clic et n'apportait qu'une confusion). Les données affichées proviennent en direct de la table concerts — toute modification faite depuis le module Concerts se répercute donc immédiatement dans l'agenda.

- Chaque carte affiche une bulle avec le nombre de commentaires laissés sur le rendez-vous (§ 8.5).

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
| Deezer | Opérationnel | Recherche du catalogue public via l'Edge Function search-deezer, sans compte ni clé nécessaire côté Deezer ; utilisée à la fois pour compléter les métadonnées d'un morceau et pour le bouton d'écoute rapide. |

# 13. Interface et navigation

- Barre d'onglets responsive : en dessous de 640 px de largeur d'écran, les onglets passent en icônes seules (texte conservé pour les lecteurs d'écran et en info-bulle) et occupent toute la largeur disponible ; un défilement horizontal reste disponible en filet de sécurité dans tous les cas, pour qu'aucun onglet ne soit jamais tronqué ou inaccessible sur smartphone.

- Nouvel onglet "Accueil" (icône maison), en première position dans la barre de navigation et affiché par défaut à l'ouverture de l'application (§ 11).

- Icônes d'onglets distinctes et évocatrices : "Concerts" (microphone) et "Rendez-vous" (calendrier) utilisent des pictogrammes différents pour éviter toute confusion, auparavant tous deux représentés par un calendrier.

- Le bouton "Réinitialiser les données de démo", susceptible de provoquer des erreurs ou des pertes de données accidentelles, a été retiré de la barre supérieure.

- Corrections de mise en page sur mobile : les lignes de boutons d'action (Supprimer / Annuler / Enregistrer) des écrans d'édition acceptent désormais le retour à la ligne plutôt que de se comprimer les unes contre les autres sur un écran étroit ; le bandeau de lancement d'une phase de choix, dans le Répertoire, ne déborde plus de l'écran sur smartphone ; la carte d'un rendez-vous dans sa liste ne force plus de largeur minimale susceptible de repousser son bouton d'édition hors de l'écran visible.

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

- Action secondaire en bout de ligne (écouter un morceau sur le Répertoire, consulter les commentaires sur Concerts et Rendez-vous, § 8.5) présentée de façon identique : bulle séparée par un filet vertical, avec le même comportement au survol.

- Vignette de gauche (pochette d'album ou pastille de date) au même gabarit sur les trois écrans. La pastille de date affiche le jour, le mois abrégé puis l'année, sur trois lignes — présentation identique sur les écrans Accueil (§ 11.2), Concerts (§ 7.1) et Rendez-vous (§ 8.3).

- Liste contenue dans un conteneur à hauteur limitée avec défilement interne, propre à chaque écran plutôt que de faire défiler la page entière.

- Réorganisation identique en dessous de 560 px de largeur d'écran : la vignette de gauche et le titre restent groupés sur la première ligne, le reste (statuts, badges, actions) se replace proprement sur la ligne suivante plutôt que de se comprimer.

- Sur l'écran Rendez-vous, les libellés ("récurrent", "PROCHAIN", catégorie) rejoignent ce même bloc de fin de ligne, dans cet ordre, à l'emplacement occupé par les badges de statut et de langue sur le Répertoire (§ 8.3) — le titre du rendez-vous apparaît donc désormais en première position sur la carte, comme le titre d'un morceau sur le Répertoire. La mention "non modifiable ici", auparavant affichée sur les concerts intégrés à cette liste, a été retirée : elle entrait en contradiction avec le clic sur la ligne, qui ouvre bien le concert en édition (§ 7).

# 14. Déploiement et infrastructure

- Code source hébergé sur GitHub ; tout changement poussé sur la branche principale déclenche un redéploiement automatique sur Vercel.

- Frontend construit avec Vite et servi statiquement par Vercel (offre gratuite, sans carte bancaire).

- Backend hébergé sur Supabase, projet identifié par l'URL hhtjuwmlllgglnxtnjtx.supabase.co (offre gratuite, sans carte bancaire).

- Aucun serveur à maintenir : les deux plateformes gèrent l'hébergement, la mise à l'échelle et la sécurité de l'infrastructure.

- Rafraîchissement automatique (§ 13.2) : chaque build Vite génère un identifiant de version (hash du commit Git fourni par Vercel) et l'écrit dans un fichier version.json déposé à la racine du site ; l'application compare cet identifiant à celui embarqué dans le code qu'elle exécute pour détecter qu'une version plus récente a été déployée.

- Règles de cache (fichier vercel.json) : la page d'accueil (index.html), le fichier version.json et le manifest PWA ne sont jamais mis en cache par le navigateur, pour être certain que la vérification de version porte toujours sur les dernières données publiées ; les fichiers JS/CSS générés par le build (nom unique à chaque déploiement) restent au contraire mis en cache durablement, sans conflit possible entre deux versions.

Coût actuel : 0 € par mois, les volumes d'usage (6 membres, quelques centaines de morceaux, usage occasionnel) restant très en-deçà des paliers gratuits des deux plateformes.

# 15. Limites connues et pistes d'évolution

| Sujet | État actuel | Évolution possible |
| --- | --- | --- |
| Authentification | Mot de passe par profil, sans limite de tentatives | Ajout d'un blocage après plusieurs échecs ; éventuellement Supabase Auth si besoin de comptes email formels |
| Pochettes | Disponibles seulement pour les morceaux passés par la recherche Deezer | Recherche automatique en lot pour compléter les pochettes du catalogue importé |
| Notifications | Journal interne à l'application uniquement | Intégration d'un envoi réel vers un canal externe, si le besoin revient |
| Streaming | Deezer uniquement, par choix assumé et définitif du groupe | — (piste Spotify / Apple Music explicitement écartée, voir § 12) |
| Récurrence des rendez-vous | Plafonnée à 200 occurrences par série | Limite technique de sécurité ; à ajuster si un cas d'usage réel la dépasse |
| Icônes des membres | Association codée en dur par prénom exact, pour les 6 membres actuels (§ 11.5) | Prévoir un mécanisme plus robuste (ex. champ dédié en base) si la composition du groupe change |
| Dernière activité | Tamponnée à l'ouverture de l'application uniquement, pas à chaque action | Granularité plus fine possible (ex. tamponnage sur des actions clés) si le besoin s'en fait sentir |
| Multi-comptes simultanés | Un profil à la fois par appareil | Non prioritaire pour un usage à 6 personnes |
| Rafraîchissement automatique | Une instance déjà installée sur un téléphone avant la mise en place de ce mécanisme (§ 13.2) doit encore être mise à jour une dernière fois manuellement pour en bénéficier | Aucune (limite ponctuelle, sans impact au-delà de cette transition unique) |

# 16. Journal des évolutions

## 16.1 Depuis la v1.0 (→ v1.1)

- Ajout du module Concerts : création/édition d'un concert (nom, date, heure, lieu), composition du set à partir du répertoire avec ordonnancement par glisser-déposer ou flèches, durée théorique du set, écran liste triée et défilante avec focus automatique sur le prochain concert, copie du concert dans le presse-papier.

- Ajout du module Rendez-vous : agenda des répétitions, ateliers, résidences et autres événements, avec date de fin, mode "toute la journée", récurrence (fréquence + date limite, suppression d'occurrence isolée, modification de série), participants choisis parmi les membres, filtre par type, tri croissant, liste défilante avec focus automatique sur le prochain événement. Intégration en lecture seule des concerts dans cette même liste.

- Alignement du fonctionnement du filtre par type (Rendez-vous) sur celui du filtre par statut (Répertoire) : choix unique, jamais aucune sélection ni sélection multiple.

- Renommage de l'onglet et de l'écran "WhatsApp" en "Historique" ; abandon de la piste d'intégration WhatsApp Business / Twilio dans la documentation et le code.

- Remplacement des icônes des onglets "Phase de choix" et "Concerts" pour lever toute ambiguïté visuelle, notamment entre Concerts et Rendez-vous.

- Retrait du bouton "Réinitialiser les données de démo".

- Correction de la barre d'onglets sur petit écran (mode icônes seules en dessous de 640 px, défilement horizontal de secours).

- Correction de deux anomalies d'enregistrement affectant l'ensemble des tables (voir § 2.2) : erreur PGRST102 lors de l'ajout d'un morceau, et erreur de lecture de réponse vide sur Safari.

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

# 17. Références

Application déployée : https://calyxter-set-manager-8xe2nnee2-ndalmont.vercel.app (URL de déploiement la plus récente testée — vérifier l'URL de production stable dans le tableau de bord Vercel).

Dépôt de code : GitHub, dépôt "calyxter-set-manager" du compte utilisé pour le déploiement Vercel — src/App.jsx (code source complet), recreate_full_schema.sql à la racine (structure complète à jour de la base, sans données) et cette documentation dans docs/.

Projet Supabase : https://hhtjuwmlllgglnxtnjtx.supabase.co (tableau de bord Supabase pour la base de données et les Edge Functions).

Migrations incrémentales et code des Edge Functions (search-deezer, member-auth) : disponibles en pièces jointes du projet de développement.
