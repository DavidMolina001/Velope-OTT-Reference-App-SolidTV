const fs = require('fs')
const path = require('path')
const webpack = require('@nativescript/webpack')
const { chainSolidTV } = require('@solidtv/nativescript/webpack')

// The app is ../src, the web build's source, untouched; this project only bundles it for the
// runtime and adds what the bundle needs around it.
const ROOT = path.resolve(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')

// The web build reads VITE_* variables from ../.env through Vite. The tvOS bundle reads the
// same file here and defines the same `import.meta.env` members, so src/ stays identical.
// The key is injected at build time and never lives in src/ or in git.
function readDotEnv() {
  const env = {}
  // Same precedence as Vite: .env, then .env.local overrides (both gitignored except .env.example).
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line)
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

module.exports = (env) => {
  webpack.init(env)
  webpack.chainWebpack((config) => {
    // Solid JSX for @solidtv/solid (universal mode), browser export conditions so solid-js
    // does not resolve to its server build, the polyfill's optional-module ignore.
    chainSolidTV(config)
    // src/ sits outside this folder: resolve its imports from THIS project's node_modules first,
    // never from the web build's, so the bundle carries one copy of each package.
    config.resolve.modules.prepend(path.resolve(__dirname, 'node_modules'))
    const mode = env.production ? 'production' : 'development'
    const dotenv = readDotEnv()
    const viteEnv = Object.fromEntries(Object.entries(dotenv).filter(([key]) => key.startsWith('VITE_')))
    config.plugin('VelopeDefine').use(require('webpack').DefinePlugin, [
      {
        // Vite's import.meta.env, for the members src/ reads. BASE_URL is unused on tvOS
        // (the host resolves assets to file:// URLs) but kept string-shaped.
        'import.meta.env': JSON.stringify({ ...viteEnv, MODE: mode, DEV: mode === 'development', PROD: mode === 'production', BASE_URL: '/' }),
        // Renderer build flags, the same values as vite.config.ts.
        __enableInspector__: false,
        __emitBoundsEvents__: false,
        __enableCompressedTextures__: false,
        // Text batching draws every text node after the quads of the frame, so text under an
    // opaque overlay (splash, error screen) showed through it. Off keeps tree order.
    __renderTextBatching__: false,
      },
    ])
    // No type check of the bundle: the web build does none either (vite only transpiles),
    // and src/ is written against its own tsconfig. `pnpm typecheck` at the root is the check.
    config.plugins.delete('ForkTsCheckerWebpackPlugin')
    // The fonts the web build serves from public/, at the same relative paths in the bundle.
    config.plugin('CopyWebpackPlugin').tap((args) => {
      args[0].patterns.push({ from: path.join(PUBLIC, 'fonts'), to: 'fonts', noErrorOnMissing: true })
      return args
    })
  })
  return webpack.resolveConfig()
}
