import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {loadEnv} from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { egonFaviconPlugin } from '@stellar-enclosure/stellar-enclosure-web-shared/vite-plugin'

export default defineConfig(async ({mode, command}) => {
  const permissionPlugins: import('vite').PluginOption[] = []
  if (command === 'build') {
    if (!process.env.PAC_SDK_DIR) throw new Error('PAC_SDK_DIR_REQUIRED')
    const plugin = await import(pathToFileURL(resolve(process.env.PAC_SDK_DIR, 'scripts/permissions/consumer-vite-plugin.mjs')).href)
    permissionPlugins.push(plugin.permissionBuildPlugin())
  }
  const configuredBase = loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE_PATH ?? '/'
  if (!configuredBase.startsWith('/') || configuredBase.startsWith('//')
    || /[\\?#%]/.test(configuredBase) || Array.from(configuredBase).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /\/{2,}/.test(configuredBase)
    || configuredBase.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid VITE_BASE_PATH')
  }
  const basePath = configuredBase === '/' ? '/' : configuredBase.replace(/\/?$/, '/')

  return {
    base: basePath,
    plugins: [react(), egonFaviconPlugin(), ...permissionPlugins],
    resolve: {
      dedupe: ["react", "react-dom", "react-i18next", "i18next", "antd", "@tanstack/react-query", "react-router-dom", "@ant-design/icons"],
    },
    server: {
      host: '127.0.0.1',
      port: 18152,
      strictPort: true,
      proxy: {
        '/apps': {
          target: process.env.TIANSHU_AUTH_PROXY ?? 'http://127.0.0.1:18180',
          changeOrigin: false,
        },
      },
    },
    preview: {
      proxy: {
        '/apps': {
          target: process.env.TIANSHU_AUTH_PROXY ?? 'http://127.0.0.1:18180',
          changeOrigin: false,
        },
      },
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      fileParallelism: false,
      setupFiles: './src/test/setup.ts',
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
      coverage: {
        reporter: ['text', 'html'],
      },
    },
  }
})
