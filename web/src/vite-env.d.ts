/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RESTAURANT_FIRST?: string;
  readonly VITE_AMAP_JS_KEY?: string;
  readonly VITE_AMAP_SERVICE_HOST?: string;
  readonly VITE_AMAP_SECURITY_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
