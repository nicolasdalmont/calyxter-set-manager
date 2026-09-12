// Vercel Function — gestion des mots de passe et tamponnage d'activité
// (portage de supabase/functions/member-auth). Connexion Neon directe : la
// fonction agit avec le rôle propriétaire de la table, elle peut donc
// écrire members.password_hash / last_activity_at / must_reset_password
// (interdits à /api/db — voir READONLY_COLUMNS).
//
// ⚠️ Schéma de hachage identique à l'ancienne Edge Function (PBKDF2, 100 000
// itérations, sel 16 octets, SHA-256, format "saltHex:hashHex") : le
// changer invaliderait tous les mots de passe existants après migration.

import { sql } from '../lib/neon.js';

async function hashPassword(password, existingSaltHex) {
  const enc = new TextEncoder();
  const salt = existingSaltHex
    ? Uint8Array.from(existingSaltHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hashHex = [...new Uint8Array(derivedBits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const recomputed = await hashPassword(password, saltHex);
  return recomputed.split(':')[1] === hashHex;
}

async function stampActivity(memberId) {
  try {
    await sql.query('update members set last_activity_at = now() where id = $1', [memberId]);
  } catch (e) {
    console.error('Erreur en tamponnant last_activity_at', e);
  }
}

// Mot de passe temporaire lisible à l'oral/par message (pas de 0/O/1/l/I,
// trop faciles à confondre en les relayant à un autre membre) — communiqué
// une seule fois, à l'admin qui vient de déclencher la réinitialisation.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateTempPassword(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => TEMP_PASSWORD_ALPHABET[b % TEMP_PASSWORD_ALPHABET.length]).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { action, member_id, password, admin_id } = req.body || {};

    if (!action || !member_id) {
      return res.status(400).json({ error: 'Paramètres manquants.' });
    }
    if ((action === 'set' || action === 'verify' || action === 'confirm_reset') && !password) {
      return res.status(400).json({ error: 'Paramètres manquants.' });
    }
    if ((action === 'set' || action === 'confirm_reset') && password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    if (action === 'admin_reset' && !admin_id) {
      return res.status(400).json({ error: 'Paramètres manquants.' });
    }

    if (action === 'touch') {
      await sql.query('update members set last_activity_at = now() where id = $1', [member_id]);
      return res.status(200).json({ ok: true });
    }

    const rows = await sql.query(
      'select id, name, instrument, password_hash, is_admin, must_reset_password, active from members where id = $1',
      [member_id],
    );
    const member = rows[0];
    if (!member) {
      return res.status(404).json({ error: 'Membre introuvable.' });
    }

    const safeMember = {
      id: member.id, name: member.name, instrument: member.instrument, is_admin: !!member.is_admin,
    };

    if (action === 'set') {
      if (member.password_hash) {
        return res.status(409).json({ error: 'Un mot de passe est déjà défini pour ce profil.' });
      }
      const hash = await hashPassword(password);
      await sql.query('update members set password_hash = $1 where id = $2', [hash, member_id]);
      await stampActivity(member_id);
      return res.status(200).json({ member: safeMember });
    }

    if (action === 'verify') {
      if (member.active === false) {
        return res.status(403).json({ error: 'Ce profil a été désactivé.' });
      }
      if (!member.password_hash) {
        return res.status(409).json({ error: 'no_password_set' });
      }
      const ok = await verifyPassword(password, member.password_hash);
      if (!ok) {
        return res.status(401).json({ error: 'Mot de passe incorrect.' });
      }
      await stampActivity(member_id);
      return res.status(200).json({ member: safeMember, must_reset_password: !!member.must_reset_password });
    }

    // Réinitialisation déclenchée par un·e admin : génère et enregistre un
    // mot de passe temporaire pour member_id, marque must_reset_password —
    // le profil visé devra en choisir un nouveau (action confirm_reset) dès
    // sa prochaine connexion réussie avec ce mot de passe temporaire.
    if (action === 'admin_reset') {
      const adminRows = await sql.query('select is_admin, active from members where id = $1', [admin_id]);
      const admin = adminRows[0];
      if (!admin || !admin.is_admin || admin.active === false) {
        return res.status(403).json({ error: "Réservé aux membres administrateur·rice·s." });
      }
      const tempPassword = generateTempPassword();
      const hash = await hashPassword(tempPassword);
      await sql.query(
        'update members set password_hash = $1, must_reset_password = true where id = $2',
        [hash, member_id],
      );
      return res.status(200).json({ member: safeMember, temp_password: tempPassword });
    }

    // Finalise une réinitialisation forcée : appelée juste après un
    // 'verify' réussi avec le mot de passe temporaire (le client enchaîne
    // directement, sans redemander l'ancien mot de passe — voir
    // MemberPicker, mode "forced-reset").
    if (action === 'confirm_reset') {
      if (!member.must_reset_password) {
        return res.status(409).json({ error: 'Aucune réinitialisation en attente pour ce profil.' });
      }
      const hash = await hashPassword(password);
      await sql.query(
        'update members set password_hash = $1, must_reset_password = false where id = $2',
        [hash, member_id],
      );
      await stampActivity(member_id);
      return res.status(200).json({ member: safeMember });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur inattendue.', details: String(error) });
  }
}
