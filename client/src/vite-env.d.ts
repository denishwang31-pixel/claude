/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 앱(Capacitor) 빌드 시 주입하는 서버 절대주소. 웹/개발 빌드에선 비워둔다. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
