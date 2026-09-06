// Connexion Neon partagée par les fonctions serveur (chemin B — couche API
// maison, voir docs/Migration_Neon.md). Le driver HTTP @neondatabase/
// serverless fait un aller-retour HTTP par requête : rien à pooler, adapté
// au serverless. La chaîne DATABASE_URL (avec identifiants) ne vit QUE côté
// serveur — jamais dans le frontend.
//
// Ce fichier est hors de api/ : ce n'est donc pas une route, juste un module
// importé par les fonctions.

import { neon } from '@neondatabase/serverless';

// sql.query(text, params) -> Array<Record> (rows).
export const sql = neon(process.env.DATABASE_URL || 'postgres://missing:missing@missing/missing');
