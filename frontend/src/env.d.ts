/// <reference types="vite/client" />

declare const __GIT_BRANCH__: string

interface ImportMetaEnv {
  /** URL de base de l'API. Vide = proxy Vite en dev, meme domaine en prod. */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
