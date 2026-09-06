// Vercel Function — couche d'accès générique à la base Neon (chemin B).
// Remplace les appels PostgREST directs de l'ancienne version Supabase.
// Un seul endpoint POST /api/db, corps { op, table, ... } :
//
//   { op:'select', table, columns?, where?, order?, limit? }
//   { op:'insert', table, rows:[...] }
//   { op:'upsert', table, rows:[...] }      // ON CONFLICT (id) DO UPDATE
//   { op:'update', table, set:{...}, where }
//   { op:'delete', table, where }           // where obligatoire
//
//   where  : [[col, 'eq'|'isNull'|'notNull', value?], ...]   (AND)
//   order  : [[col, 'asc'|'desc', nullsLast?], ...]
//
// Toutes les valeurs sont paramétrées ($1, $2…). Les identifiants (table,
// colonnes) sont validés contre une liste blanche / un motif strict —
// aucune portion de SQL n'est construite à partir d'entrées libres.

import { sql } from '../lib/neon.js';

const TABLES = new Set([
  'members', 'songs', 'phases', 'notifications',
  'concerts', 'events', 'ideas', 'comments',
]);
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

// Colonnes jamais renvoyées au client (member-auth les gère).
const HIDDEN_COLUMNS = { members: ['password_hash'] };
// Colonnes que le client ne peut jamais écrire via /api/db.
const READONLY_COLUMNS = { members: new Set(['password_hash', 'last_activity_at']) };

export function ident(name) {
  if (typeof name !== 'string' || !IDENT_RE.test(name)) {
    throw new Error(`Identifiant invalide : ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

export function buildWhere(where, params) {
  if (!Array.isArray(where) || where.length === 0) return '';
  const clauses = where.map((clause) => {
    if (!Array.isArray(clause)) throw new Error('Clause where invalide');
    const [col, op, value] = clause;
    const c = ident(col);
    if (op === 'isNull') return `${c} is null`;
    if (op === 'notNull') return `${c} is not null`;
    if (op === 'eq') {
      params.push(value);
      return `${c} = $${params.length}`;
    }
    throw new Error(`Opérateur where non supporté : ${op}`);
  });
  return ` where ${clauses.join(' and ')}`;
}

export function buildOrder(order) {
  if (!Array.isArray(order) || order.length === 0) return '';
  const parts = order.map(([col, dir, nullsLast]) => {
    const d = dir === 'desc' ? 'desc' : 'asc';
    return `${ident(col)} ${d}${nullsLast ? ' nulls last' : ''}`;
  });
  return ` order by ${parts.join(', ')}`;
}

export function stripHidden(table, rows) {
  const hidden = HIDDEN_COLUMNS[table];
  if (!hidden || !Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const k of hidden) delete copy[k];
    return copy;
  });
}

export function assertWritable(table, obj) {
  const blocked = READONLY_COLUMNS[table];
  if (!blocked) return;
  for (const k of Object.keys(obj)) {
    if (blocked.has(k)) throw new Error(`Écriture interdite : ${table}.${k}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const body = req.body || {};
    const { op, table } = body;
    if (!TABLES.has(table)) {
      return res.status(400).json({ error: `Table inconnue : ${JSON.stringify(table)}` });
    }
    const t = ident(table);

    if (op === 'select') {
      const { columns, where, order, limit } = body;
      let cols = '*';
      if (Array.isArray(columns) && columns.length > 0) {
        cols = columns.map(ident).join(', ');
      }
      const params = [];
      let q = `select ${cols} from ${t}${buildWhere(where, params)}${buildOrder(order)}`;
      if (Number.isInteger(limit) && limit > 0) q += ` limit ${limit}`;
      const rows = await sql.query(q, params);
      return res.status(200).json(stripHidden(table, rows));
    }

    if (op === 'insert' || op === 'upsert') {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(200).json(null);
      // Boucle non transactionnelle : les upserts de l'app portent en
      // pratique sur 1 ligne (comme l'ancien comportement Supabase).
      for (const row of rows) {
        assertWritable(table, row);
        const keys = Object.keys(row);
        if (keys.length === 0) throw new Error('Ligne vide');
        const params = keys.map((k) => row[k]);
        const colList = keys.map(ident).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        let q = `insert into ${t} (${colList}) values (${placeholders})`;
        if (op === 'upsert') {
          const updates = keys
            .filter((k) => k !== 'id')
            .map((k) => `${ident(k)} = excluded.${ident(k)}`);
          q += updates.length > 0
            ? ` on conflict (id) do update set ${updates.join(', ')}`
            : ' on conflict (id) do nothing';
        }
        await sql.query(q, params);
      }
      return res.status(200).json(null);
    }

    if (op === 'update') {
      const set = body.set || {};
      assertWritable(table, set);
      const keys = Object.keys(set);
      if (keys.length === 0) return res.status(400).json({ error: 'Rien à mettre à jour.' });
      const params = keys.map((k) => set[k]);
      const assigns = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
      const q = `update ${t} set ${assigns}${buildWhere(body.where, params)}`;
      await sql.query(q, params);
      return res.status(200).json(null);
    }

    if (op === 'delete') {
      if (!Array.isArray(body.where) || body.where.length === 0) {
        return res.status(400).json({ error: 'DELETE sans filtre refusé.' });
      }
      const params = [];
      const q = `delete from ${t}${buildWhere(body.where, params)}`;
      await sql.query(q, params);
      return res.status(200).json(null);
    }

    return res.status(400).json({ error: `Opération inconnue : ${JSON.stringify(op)}` });
  } catch (error) {
    return res.status(400).json({ error: String(error && error.message ? error.message : error) });
  }
}
