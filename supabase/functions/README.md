# Edge Functions Supabase

Deux fonctions serverless Deno, appelées directement par le frontend (`src/App.jsx`).
Voir aussi la documentation technique, § 2.1, § 4.1 et § 18.4.

```
supabase/functions/
├── member-auth/index.ts
└── search-deezer/index.ts
```

Déploiement (CLI Supabase, depuis la racine du dépôt) :

```
supabase functions deploy member-auth
supabase functions deploy search-deezer
```

## member-auth

Gestion des mots de passe (jamais côté client) et tamponnage de l'activité.
Écrit dans des colonnes de `members` protégées pour la clé publishable
(`password_hash`, `last_activity_at`), donc **a besoin de la clé service role**
du projet (variable d'environnement `SUPABASE_SERVICE_ROLE_KEY`, fournie
automatiquement par Supabase à l'exécution).

`POST /functions/v1/member-auth` — corps JSON (préflight CORS `OPTIONS` géré) :

| `action` | Champs | Réponse |
| --- | --- | --- |
| `verify` | `member_id`, `password` | `200 { member }` si OK ; `409 { error: "no_password_set" }` si aucun mot de passe défini ; `401 { error: "Mot de passe incorrect." }` sinon |
| `set` | `member_id`, `password` (≥ 6 car., contrôlé côté serveur) | `200 { member }` si OK ; `409 { error }` si un mot de passe existe déjà ; `400 { error }` si trop court |
| `touch` | `member_id` | `200 { ok: true }` — tamponne `members.last_activity_at = now()`, sans mot de passe (réponse ignorée par le client) |

`member` renvoyé = `{ id, name, instrument }` uniquement (jamais `password_hash`).
`verify` et `set` tamponnent aussi `last_activity_at` au passage.

Hachage : PBKDF2, 100 000 itérations, sel aléatoire de 16 octets, SHA-256,
stocké au format `saltHex:hashHex` (§ 4.1). **Ne pas modifier ce schéma sans
plan de migration** : changer le nombre d'itérations ou le format du sel
invalide tous les mots de passe existants.

## search-deezer

Relais sans état vers l'API publique Deezer (`api.deezer.com/search`, aucune
clé). Contourne CORS. Aucun secret, aucun accès à la base.

`GET /functions/v1/search-deezer?q=<recherche>` (préflight CORS `OPTIONS`
géré) → `200 { results: [...] }`, chaque résultat au format :

```
{ title, artist, album, duration_seconds, cover_url, deezer_url }
```

(10 résultats max). Réponses d'erreur : `400` si `q` absent/vide, `502` si
Deezer répond mal, `500` sur exception — toutes au format `{ error }`
(+ `details` sur le 500).

## Note

Ces fichiers ont été ajoutés au dépôt a posteriori (ils vivaient jusque-là
hors versionnement). Vérifier qu'ils correspondent bien à ce qui est
effectivement déployé sur le projet Supabase avant de redéployer depuis ici.
