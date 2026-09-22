// The L3 reference build's palette and geometry, verbatim (colours as 0xRRGGBBAA).
export const colors = {
  background: 0x0b0e17ff,
  accent: 0x8b6cffff,
  textPrimary: 0xf2f5ffff,
  textSecondary: 0xc7cee0ff,
  textMuted: 0x8a93adff,
  textRow: 0xe8ecf7ff,
  surface: 0x1c2233ff,
  surfaceButton: 0x232b45ff,
  navPill: 0x2a3350ff,
  monogram: 0x39415cff,
  focusRing: 0xf5f7ffff,
  loader: 0x94a3b8ff,
} as const

export const layout = {
  width: 1920,
  height: 1080,
  navHeight: 176,
  rowStep: 470,
  tileStep: 240,
  tileWidth: 220,
  tileHeight: 330,
  visibleTiles: 7,
  recycleBuffer: 2,
} as const

export const easing = 'cubic-bezier(0.25,0.1,0.25,1)'
