/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY?: string
  readonly VITE_TMDB_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
