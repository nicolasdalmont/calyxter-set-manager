// Tests des constructeurs SQL de api/db.js — aucun accès réseau/base.
//   node --test api/db.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ident, buildWhere, buildOrder, stripHidden, assertWritable, normValue } from './db.js';

test('ident : accepte un identifiant valide, entre guillemets', () => {
  assert.equal(ident('song_ids'), '"song_ids"');
  assert.equal(ident('a1'), '"a1"');
});

test('ident : rejette tout ce qui sort du motif', () => {
  for (const bad of ['1col', 'Col', 'a-b', 'a b', 'a;drop', 'a"', '', 42, null, undefined]) {
    assert.throws(() => ident(bad), /Identifiant invalide/);
  }
});

test('buildWhere : vide si absent ou pas un tableau', () => {
  const p = [];
  assert.equal(buildWhere(undefined, p), '');
  assert.equal(buildWhere([], p), '');
  assert.equal(p.length, 0);
});

test('buildWhere : eq paramétré, isNull / notNull en SQL littéral', () => {
  const p = [];
  const frag = buildWhere([['closed_at', 'isNull'], ['id', 'eq', 'x1'], ['name', 'notNull']], p);
  assert.equal(frag, ' where "closed_at" is null and "id" = $1 and "name" is not null');
  assert.deepEqual(p, ['x1']);
});

test('buildWhere : numérote les params à la suite de ceux déjà présents', () => {
  const p = ['déjà'];
  const frag = buildWhere([['a', 'eq', 1], ['b', 'eq', 2]], p);
  assert.equal(frag, ' where "a" = $2 and "b" = $3');
  assert.deepEqual(p, ['déjà', 1, 2]);
});

test('buildWhere : opérateur inconnu ou colonne invalide -> throw', () => {
  assert.throws(() => buildWhere([['a', 'like', 'x']], []), /non supporté/);
  assert.throws(() => buildWhere([['a b', 'eq', 'x']], []), /Identifiant invalide/);
  assert.throws(() => buildWhere(['pas un tableau'], []), /Clause where invalide/);
});

test('buildOrder : direction bornée à asc/desc, nulls last optionnel', () => {
  assert.equal(buildOrder([['event_date', 'desc'], ['event_time', 'desc', true]]),
    ' order by "event_date" desc, "event_time" desc nulls last');
  assert.equal(buildOrder([['name', 'peu importe']]), ' order by "name" asc');
  assert.equal(buildOrder([]), '');
  assert.throws(() => buildOrder([['a;', 'asc']]), /Identifiant invalide/);
});

test('stripHidden : retire password_hash des lignes members, laisse le reste', () => {
  const rows = [{ id: '1', name: 'Do', password_hash: 'secret' }];
  assert.deepEqual(stripHidden('members', rows), [{ id: '1', name: 'Do' }]);
  assert.deepEqual(stripHidden('songs', rows), rows);
});

test('assertWritable : bloque password_hash / last_activity_at sur members', () => {
  assert.throws(() => assertWritable('members', { last_activity_at: 'x' }), /Écriture interdite/);
  assert.throws(() => assertWritable('members', { password_hash: 'x' }), /Écriture interdite/);
  assert.doesNotThrow(() => assertWritable('members', { name: 'Do' }));
  assert.doesNotThrow(() => assertWritable('concerts', { song_ids: [] }));
});

test('normValue : sérialise objets et tableaux, laisse les scalaires', () => {
  assert.equal(normValue(['a', 'b']), '["a","b"]');
  assert.equal(normValue([{ type: 'song', song_id: 'x' }]), '[{"type":"song","song_id":"x"}]');
  assert.equal(normValue({ k: 1 }), '{"k":1}');
  assert.equal(normValue('texte'), 'texte');
  assert.equal(normValue(3), 3);
  assert.equal(normValue(null), null);
  const d = new Date('2026-01-01T00:00:00Z');
  assert.equal(normValue(d), d);
});
