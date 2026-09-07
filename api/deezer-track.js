// Vercel Function — détail d'une piste Deezer (pour lier une compo à Deezer :
// pochette d'album + indicateur de popularité `rank`). Appelé same-origin
// (/api/deezer-track?id=<n>). Deezer : catalogue public, aucune clé.

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').trim();
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Paramètre 'id' manquant ou invalide." });
  }

  try {
    const dz = await fetch(`https://api.deezer.com/track/${id}`);
    if (!dz.ok) {
      return res.status(502).json({ error: "Le service Deezer n'a pas répondu correctement." });
    }
    const t = await dz.json();
    if (!t || t.error) {
      return res.status(404).json({ error: 'Piste Deezer introuvable.' });
    }
    const album = t.album || {};
    return res.status(200).json({
      id: t.id,
      title: t.title ?? null,
      artist: t.artist?.name ?? null,
      album_title: album.title ?? null,
      duration_seconds: t.duration ?? null,
      rank: typeof t.rank === 'number' ? t.rank : null,
      cover_url: album.cover_big || album.cover_medium || album.cover || null,
      deezer_url: t.link ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Erreur inattendue lors de la récupération de la piste.',
      details: String(error),
    });
  }
}
