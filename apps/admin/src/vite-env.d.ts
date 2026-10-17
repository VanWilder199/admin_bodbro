/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `1` — включить MSW-моки вместо бэкенда. */
  readonly VITE_API_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
