// Edge Function: search-deezer
// Recherche un morceau sur le catalogue public Deezer (aucune clé requise)
// et renvoie une liste simplifiée prête à afficher dans le formulaire d'ajout.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Le navigateur envoie d'abord une requête OPTIONS (CORS) — on doit y répondre.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q");

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Paramètre 'q' manquant (texte de recherche)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=10`;
    const deezerRes = await fetch(deezerUrl);

    if (!deezerRes.ok) {
      return new Response(
        JSON.stringify({ error: "Le service Deezer n'a pas répondu correctement." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const deezerData = await deezerRes.json();

    const results = (deezerData.data ?? []).map((track: any) => ({
      title: track.title,
      artist: track.artist?.name ?? "",
      album: track.album?.title ?? "",
      duration_seconds: track.duration ?? null,
      cover_url: track.album?.cover_medium ?? null,
      deezer_url: track.link ?? null,
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Erreur inattendue lors de la recherche.", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
