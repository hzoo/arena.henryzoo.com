/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARENA_APP_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
