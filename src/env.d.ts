/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  /** API 直连地址；置空表示走同域（dev 下由 vite proxy 转发） */
  readonly VITE_API_BASE_URL: string
  /** dev server /api 代理目标；仅 VITE_API_BASE_URL 置空时生效 */
  readonly VITE_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
