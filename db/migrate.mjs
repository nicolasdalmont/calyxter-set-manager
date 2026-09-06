// Migration des données Supabase <-> Neon, en Node pur (pas besoin de
// pg_dump / libpq). Copie les 8 tables d'une base à l'autre.
//
//   node db/migrate.mjs                 # Supabase -> Neon  (par défaut)
//   node db/migrate.mjs --rollback      # Neon -> Supabase  (filet § 3.4, DEMANDE confirmation)
//
// Variables d'environnement requises (chaînes DIRECTES, host SANS -pooler) :
//   SUPABASE_DIRECT_URL   Supabase -> Project Settings -> Database -> "URI"
//   NEON_DIRECT_URL       Neon -> Connection Details -> pooling désactivé
// À passer en `export ...` dans le terminal (pas dans .env.local, pas dans le chat).
//
// La source n'est jamais modifiée ; la cible est VIDÉE (truncate) puis remplie.

import pg from 'pg';
import readline from 'node:readline';

// Ordre de dépendance des clés étrangères (insertion) ; l'inverse pour le truncate.
const TABLES = [
  'members', 'songs', 'phases', 'notifications',
  'concerts', 'events', 'ideas', 'comments',
];

const rollback = process.argv.includes('--rollback');
const SRC_URL = rollback ? process.env.NEON_DIRECT_URL : process.env.SUPABASE_DIRECT_URL;
const DST_URL = rollback ? process.env.SUPABASE_DIRECT_URL : process.env.NEON_DIRECT_URL;
const SRC_NAME = rollback ? 'Neon' : 'Supabase';
const DST_NAME = rollback ? 'Supabase' : 'Neon';

if (!SRC_URL || !DST_URL) {
  console.error('Manque SUPABASE_DIRECT_URL et/ou NEON_DIRECT_URL dans l\'environnement.');
  process.exit(1);
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a); }));
}

// jsonb : pg enverrait un objet/tableau JS comme un array Postgres -> on
// sérialise en texte JSON, accepté tel quel par une colonne jsonb.
const norm = (v) =>
  v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;

async function countAll(client) {
  const out = {};
  for (const t of TABLES) {
    const { rows } = await client.query(`select count(*)::int n from "${t}"`);
    out[t] = rows[0].n;
  }
  return out;
}

async function main() {
  console.log(`Migration ${SRC_NAME} -> ${DST_NAME}`);
  if (rollback) {
    const a = await ask('!! Cela VIDE puis réécrit les 8 tables de Supabase. Taper "ROLLBACK" : ');
    if (a !== 'ROLLBACK') { console.log('Annulé.'); process.exit(1); }
  }

  const src = new pg.Client({ connectionString: SRC_URL, ssl: { rejectUnauthorized: false } });
  const dst = new pg.Client({ connectionString: DST_URL, ssl: { rejectUnauthorized: false } });
  await src.connect();
  await dst.connect();

  try {
    console.log(`\nVidage de ${DST_NAME}…`);
    await dst.query(`truncate ${[...TABLES].reverse().map((t) => `"${t}"`).join(', ')} restart identity cascade`);

    console.log('Copie des données :');
    for (const t of TABLES) {
      const { rows } = await src.query(`select * from "${t}"`);
      if (rows.length === 0) { console.log(`  ${t}: 0`); continue; }
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const text = `insert into "${t}" (${colList}) values (${placeholders})`;
      for (const row of rows) {
        await dst.query(text, cols.map((c) => norm(row[c])));
      }
      console.log(`  ${t}: ${rows.length}`);
    }

    console.log('\nVérification des volumes :');
    const [cs, cd] = [await countAll(src), await countAll(dst)];
    let mismatch = false;
    for (const t of TABLES) {
      const ok = cs[t] === cd[t];
      if (!ok) mismatch = true;
      console.log(`  ${ok ? 'OK ' : 'KO '} ${t.padEnd(14)} ${SRC_NAME} ${cs[t]}  |  ${DST_NAME} ${cd[t]}`);
    }

    console.log(mismatch ? '\n⚠️  Écart de volume — à investiguer.' : '\n✅  Volumes identiques.');
    console.log('\nContrôles à faire à la main :');
    console.log('  - members : password_hash non nul et IDENTIQUE à la source (sinon mots de passe HS)');
    console.log('  - phases  : phase active (closed_at null) + historique complet');
    console.log('  - jsonb   : song_ids / vetoes / votes / participant_ids sur 2-3 lignes');
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
