import type { AppHost, SdfFont } from './host'

// The two fonts of the L3 reference build, as pre-generated MSDF atlases (committed; no font
// tooling runs at build time). Both builds load the same files: the web from public/fonts,
// tvOS from the copy webpack puts in the app bundle.
export function appFonts(host: AppHost): SdfFont[] {
  return [
    {
      fontFamily: 'lato',
      atlasDataUrl: host.assetUrl('fonts/Lato-Regular.msdf.json'),
      atlasUrl: host.assetUrl('fonts/Lato-Regular.msdf.png'),
      metrics: { ascender: 1610, descender: -390, lineGap: 400, unitsPerEm: 2000 },
    },
    {
      fontFamily: 'raleway',
      atlasDataUrl: host.assetUrl('fonts/Raleway-ExtraBold.msdf.json'),
      atlasUrl: host.assetUrl('fonts/Raleway-ExtraBold.msdf.png'),
      metrics: { ascender: 940, descender: -234, lineGap: 0, unitsPerEm: 1000 },
    },
  ]
}
