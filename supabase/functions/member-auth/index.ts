// Edge Function: member-auth
// Gère la création (première connexion), la vérification du mot de passe de
// chaque membre, et le tamponnage de sa dernière activité — entièrement côté
// serveur : la clé secrète n'est jamais exposée au navigateur, le hash n'est
// jamais renvoyé au client, et last_activity_at ne peut être falsifiée par
// un client (voir l'action "touch" ci-dessous).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashPassword(password: string, existingSaltHex?: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = existingSaltHex
    ? Uint8Array.from(existingSaltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hashHex = [...new Uint8Array(derivedBits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const recomputed = await hashPassword(password, saltHex);
  return recomputed.split(":")[1] === hashHex;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const { action, member_id, password } = await req.json();

    if (!action || !member_id) {
      return new Response(JSON.stringify({ error: "Paramètres manquants." }), { status: 400, headers: jsonHeaders });
    }
    if ((action === "set" || action === "verify") && !password) {
      return new Response(JSON.stringify({ error: "Paramètres manquants." }), { status: 400, headers: jsonHeaders });
    }
    if (action === "set" && password.length < 6) {
      return new Response(JSON.stringify({ error: "Le mot de passe doit contenir au moins 6 caractères." }), { status: 400, headers: jsonHeaders });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

    // "touch" : signale une activité (écran Accueil, section Dernières
    // connexions) sans authentification — l'appli ne redemande le mot de
    // passe qu'à la toute première connexion, donc s'appuyer sur les seuls
    // événements "set"/"verify" sous-estimerait très largement l'usage réel.
    // Pas de vérification de mot de passe ici : comme le reste des données
    // de l'appli (RLS ouverte, cf. recreate_full_schema.sql), la sécurité
    // repose sur la confidentialité du lien, pas sur cette colonne — seule
    // last_activity_at elle-même reste verrouillée en écriture directe côté
    // client, pour qu'on ne puisse pas la falsifier via un PATCH REST brut.
    if (action === "touch") {
      await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${member_id}`, {
        method: "PATCH",
        headers: { ...serviceHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ last_activity_at: new Date().toISOString() }),
      });
      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    // NB : plus de colonne "preferred_platform" depuis la v1.3 (Deezer est
    // désormais l'unique plateforme d'écoute intégrée) — ne plus la
    // sélectionner ici, sous peine de faire échouer la requête PostgREST
    // (colonne inexistante) et de faire répondre "Membre introuvable" à
    // tort pour tout le monde.
    const memberRes = await fetch(
      `${SUPABASE_URL}/rest/v1/members?id=eq.${member_id}&select=id,name,instrument,password_hash`,
      { headers: serviceHeaders },
    );
    const rows = await memberRes.json();

    if (!memberRes.ok) {
      return new Response(JSON.stringify({ error: "Erreur base de données.", details: rows }), { status: 500, headers: jsonHeaders });
    }

    const member = rows && rows[0];

    if (!member) {
      return new Response(JSON.stringify({ error: "Membre introuvable." }), { status: 404, headers: jsonHeaders });
    }

    const safeMember = { id: member.id, name: member.name, instrument: member.instrument };

    // Tamponne aussi la dernière activité à la connexion elle-même (en plus
    // de l'action "touch" appelée à chaque ouverture de l'appli côté
    // client) : ceinture et bretelles, sans effet de bord si les deux se
    // chevauchent. On ne bloque jamais la connexion si cette écriture
    // échoue : ce n'est qu'un affichage de confort, pas une donnée critique.
    const stampLastActivity = async () => {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${member_id}`, {
          method: "PATCH",
          headers: { ...serviceHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ last_activity_at: new Date().toISOString() }),
        });
      } catch (e) {
        console.error("Erreur en tamponnant last_activity_at", e);
      }
    };

    if (action === "set") {
      if (member.password_hash) {
        return new Response(JSON.stringify({ error: "Un mot de passe est déjà défini pour ce profil." }), { status: 409, headers: jsonHeaders });
      }
      const hash = await hashPassword(password);
      await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${member_id}`, {
        method: "PATCH",
        headers: { ...serviceHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ password_hash: hash }),
      });
      await stampLastActivity();
      return new Response(JSON.stringify({ member: safeMember }), { headers: jsonHeaders });
    }

    if (action === "verify") {
      if (!member.password_hash) {
        return new Response(JSON.stringify({ error: "no_password_set" }), { status: 409, headers: jsonHeaders });
      }
      const ok = await verifyPassword(password, member.password_hash);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Mot de passe incorrect." }), { status: 401, headers: jsonHeaders });
      }
      await stampLastActivity();
      return new Response(JSON.stringify({ member: safeMember }), { headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ error: "Action inconnue." }), { status: 400, headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Erreur inattendue.", details: String(error) }), { status: 500, headers: jsonHeaders });
  }
});
