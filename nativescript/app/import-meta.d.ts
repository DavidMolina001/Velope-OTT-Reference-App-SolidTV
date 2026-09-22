// The members of Vite's `import.meta.env` that src/ reads; nativescript/webpack.config.js defines
// them for the tvOS bundle. This mirrors src/env.d.ts without Vite's ambient types.
interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY?: string
  readonly VITE_TMDB_BASE_URL?: string
  readonly BASE_URL: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
