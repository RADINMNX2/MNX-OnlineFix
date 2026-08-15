import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { fileURLToPath } from 'url'

// FIX: Define __dirname for an ES module environment.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isHeadlessWeb = process.platform === 'linux' && !process.env.DISPLAY;

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // CRITICAL FIX: Ensures relative paths for assets in Electron production
  plugins: [
    react(),
    ...(!isHeadlessWeb ? [
      electron([
        {
          // Main-Process entry file of the Electron App.
          entry: 'src/main/main.ts',
        },
        {
          entry: 'src/main/preload.ts',
          onstart(options) {
            // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, 
            // instead of restarting the entire Electron App.
            options.reload()
          },
        },
      ]),
      renderer(),
    ] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
})