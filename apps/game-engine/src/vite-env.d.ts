/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
  readonly VITE_DASHBOARD_ORIGIN?: string;
  readonly VITE_DEMO_TEMPLATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly glob: import("vite").ImportMetaGlob;
}
