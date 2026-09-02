import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Identifiant unique de ce build : le hash du commit Git sur Vercel
// (variable fournie automatiquement par Vercel), ou l'horodatage en
// développement local. Sert à détecter côté client qu'une nouvelle
// version a été déployée (voir src/versionCheck.js).
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

export default defineConfig({
  plugins: [
    react(),
    {
      // Écrit un petit fichier version.json à la racine du build, contenant
      // l'identifiant ci-dessus. L'application le relit périodiquement pour
      // savoir si une version plus récente a été déployée sur Vercel.
      name: 'emit-version-file',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId }),
        });
      },
    },
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
});
