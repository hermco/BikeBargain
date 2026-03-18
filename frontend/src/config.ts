/**
 * Configuration centralisee du frontend.
 *
 * Les valeurs proviennent des variables d'environnement VITE_*
 * (fichiers .env, .env.local, .env.production).
 *
 * Toutes les variables sont resolues au build time par Vite.
 */

export const config = {
  /** URL de base de l'API. Vide = chemin relatif (proxy Vite en dev, meme domaine en prod). */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',

  /** Mode Vite courant (development, production). */
  mode: import.meta.env.MODE,

  /** true en developpement local. */
  isDev: import.meta.env.DEV,

  /** true en build production. */
  isProd: import.meta.env.PROD,
} as const
