import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
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
        target: 'https://bingops-api.povison-inc.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
