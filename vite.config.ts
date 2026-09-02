import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// 多环境约定见 .env 头部注释：默认跨域直连线上后端；
// dev 代理仅在 VITE_API_BASE_URL 置空（走同域）时生效，如本地调试后端。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        // rolldown 对带 ?query 的 exports 子路径解析失败，直连具体文件
        'monaco-editor/esm/vs/editor/editor.worker.js': resolve(__dirname, 'node_modules/monaco-editor/esm/vs/editor/editor.worker.js'),
      },
    },
    worker: {
      format: 'es',
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'https://bingops-api.povison-inc.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
