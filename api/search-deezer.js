// Vercel Function — relais de recherche Deezer (portage de
// supabase/functions/search-deezer). Appelé en same-origin (/api/search-deezer)
// par le frontend : pas d'en-têtes CORS nécessaires.

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();
  if (!q) {
    return res.status(400).json({ error: "Paramètre 'q' manquant (texte de recherche)." });
  }

  try {
    const dz = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`,
    );
    if (!dz.ok) {
      return res.status(502).json({ error: "Le service Deezer n'a pas répondu correctement." });
    }
    const data = await dz.json();
    const results = (data.data ?? []).map((t) => ({
      title: t.title,
      artist: t.artist?.name ?? '',
      album: t.album?.title ?? '',
      duration_seconds: t.duration ?? null,
      cover_url: t.album?.cover_medium ?? null,
      deezer_url: t.link ?? null,
    }));
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({
      error: 'Erreur inattendue lors de la recherche.',
      details: String(error),
    });
  }
}
