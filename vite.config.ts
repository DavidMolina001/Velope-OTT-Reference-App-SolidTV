import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

// Web build. The tvOS bundle is built by nativescript/webpack.config.js from the same src/.
export default defineConfig(({ mode }) => ({
  define: {
    // Renderer build flags (see docs/articles/renderer-1.9-upgrade.md): make each explicit so the
    // bundler can fold the guarded branches away.
    __DEV__: mode !== 'production',
    __enableInspector__: mode !== 'production',
    __emitBoundsEvents__: false,
    __enableCompressedTextures__: false,
    __renderTextBatching__: true,
  },
  plugins: [
    solidPlugin({
      solid: {
        moduleName: '@solidtv/solid',
        generate: 'universal',
      },
    }),
  ],
  resolve: {
    dedupe: ['solid-js', '@solidtv/solid', '@solidtv/renderer'],
  },
  optimizeDeps: {
    exclude: ['@solidtv/solid', '@solidtv/renderer'],
  },
  server: {
    port: 5173,
  },
}))
