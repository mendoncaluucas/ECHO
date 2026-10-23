/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Testes do front (npm test): navegador simulado (jsdom), sem servidor nem banco. A
  // API é sempre falsa (src/test/apiFalsa.ts); o que fala com a API de verdade é a
  // suíte do backend.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/preparo.ts'],
    // Os mocks voltam ao normal entre um teste e outro, sem precisar lembrar.
    restoreMocks: true,
    unstubGlobals: true,
    // Folga para a máquina do CI: as telas da gestão chegam sob demanda (import
    // dinâmico), e a primeira vez de cada uma é lenta.
    testTimeout: 20_000,
  },
})
