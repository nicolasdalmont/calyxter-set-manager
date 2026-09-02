// Rafraîchissement automatique de l'application.
//
// Problème résolu : lorsque l'app est lancée depuis l'icône ajoutée à
// l'écran d'accueil d'un smartphone, elle s'ouvre dans sa propre fenêtre
// (mode "standalone"), sans barre d'adresse ni bouton pour forcer un
// rechargement. Sans mécanisme dédié, un membre peut donc rester bloqué
// indéfiniment sur une version ancienne de l'app tant qu'il ne la
// supprime pas et ne la réinstalle pas.
//
// Principe : à chaque ouverture de l'app (montage initial, retour au
// premier plan, ou après une longue période d'inactivité), on interroge
// le fichier /version.json — régénéré à chaque déploiement Vercel avec un
// identifiant de build différent — sans passer par le cache HTTP. Si cet
// identifiant diffère de celui embarqué dans le JavaScript actuellement
// exécuté, on recharge la page : le navigateur va alors chercher la
// nouvelle version d'index.html (jamais mise en cache, voir vercel.json)
// et donc les nouveaux fichiers JS/CSS.

const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : null;

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // vérif périodique toutes les 15 min si l'app reste ouverte

let checking = false;

async function checkForUpdate() {
  if (checking || !CURRENT_BUILD_ID) return;
  checking = true;
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.buildId && data.buildId !== CURRENT_BUILD_ID) {
        // Nouvelle version détectée : rechargement complet pour la récupérer.
        window.location.reload();
        return;
      }
    }
  } catch {
    // Pas de réseau ou requête échouée : on retentera à la prochaine
    // ouverture, ce n'est pas bloquant.
  } finally {
    checking = false;
  }
}

export function initAutoUpdate() {
  // 1) Vérification à chaque ouverture / montage de l'application.
  checkForUpdate();

  // 2) Vérification à chaque retour au premier plan : c'est le cas qui
  //    correspond à la relance de l'app depuis l'écran d'accueil d'un
  //    téléphone (l'app était en arrière-plan ou fermée, l'utilisateur
  //    retape sur l'icône).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate();
    }
  });

  // 3) Filet de sécurité : si l'app reste ouverte longtemps sans jamais
  //    passer en arrière-plan, on vérifie quand même de temps en temps.
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}
