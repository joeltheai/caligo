import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import bundleAudioWorkletPlugin from 'vite-plugin-bundle-audioworklet'

const root = fileURLToPath(new URL('.', import.meta.url))
const strudel = resolve(root, '.research/strudel/packages')
const strudelRoot = resolve(root, '.research/strudel')

export default defineConfig({
  plugins: [tailwindcss(), svelte(), bundleAudioWorkletPlugin()],
  resolve: {
    alias: {
      '@strudel/core': resolve(strudel, 'core'),
      '@strudel/mini': resolve(strudel, 'mini'),
      '@strudel/transpiler': resolve(strudel, 'transpiler'),
      '@strudel/webaudio': resolve(strudel, 'webaudio'),
      '@strudel/web': resolve(strudel, 'web/web.mjs'),
      '@strudel/tonal': resolve(strudel, 'tonal'),
      '@strudel/edo': resolve(strudel, 'edo'),
      '@strudel/draw': resolve(strudel, 'draw'),
      '@strudel/soundfonts': resolve(strudel, 'soundfonts'),
      superdough: resolve(strudel, 'superdough'),
      'superdough/superdoughoutput.mjs': resolve(strudel, 'superdough/superdoughoutput.mjs'),
      supradough: resolve(strudel, 'supradough'),
      sfumato: resolve(strudel, 'soundfonts/node_modules/sfumato'),
      soundfont2: resolve(strudel, 'soundfonts/node_modules/soundfont2'),
    },
  },
  optimizeDeps: {
    exclude: [
      '@strudel/core',
      '@strudel/mini',
      '@strudel/transpiler',
      '@strudel/webaudio',
      '@strudel/web',
      '@strudel/tonal',
      '@strudel/edo',
      '@strudel/draw',
      '@strudel/soundfonts',
      'superdough',
      'supradough',
    ],
  },
  server: {
    port: 5173,
    fs: {
      allow: [root, strudelRoot],
    },
  },
})
