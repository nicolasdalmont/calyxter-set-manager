// Connexion Neon partagée par les fonctions serveur (chemin B — couche API
// maison, voir docs/Migration_Neon.md). Le driver HTTP @neondatabase/
// serverless fait un aller-retour HTTP par requête : rien à pooler, adapté
// au serverless. La chaîne DATABASE_URL (avec identifiants) ne vit QUE côté
// serveur — jamais dans le frontend.
//
// Ce fichier est hors de api/ : ce n'est donc pas une route, juste un module
// importé par les fonctions.

import { neon, types } from '@neondatabase/serverless';

// Le driver renvoie par défaut les colonnes `date` comme des objets Date JS,
// sérialisés ensuite en ISO datetime UTC (« 2026-09-12T22:00:00.000Z ») —
// ce qui casse les <input type="date"> des éditeurs (format invalide -> champ
// vide) et décale le jour d'une unité selon le fuseau. Supabase/PostgREST
// renvoyait « 2026-09-13 ». On rétablit ce comportement : `date` (OID 1082)
// et `time` (1083) passent en texte brut tel que Postgres les formate.
// Les `timestamptz` (1184 : created_at, updated_at…) restent en Date -> ISO,
// comme avant la migration.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1083, (v) => v);

// sql.query(text, params) -> Array<Record> (rows).
export const sql = neon(process.env.DATABASE_URL || 'postgres://missing:missing@missing/missing');
