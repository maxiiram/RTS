import { defineConfig } from 'vite';

/**
 * Le jeu est une page statique : aucun serveur n'est nécessaire pour y jouer,
 * le dossier `dist` s'héberge tel quel. `base: './'` permet de le déposer dans
 * un sous-dossier sans rien reconfigurer.
 */
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', outDir: 'dist' },
});
