/// <reference types="vite/client" />

/** Yalnızca gerçekten kullandığımız değişkenler — `any` sızmasın diye elle yazıldı. */
interface ImportMetaEnv {
  readonly VITE_APP_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
