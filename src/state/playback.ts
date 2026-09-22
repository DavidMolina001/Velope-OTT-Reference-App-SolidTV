// What "Play now" plays.
//
// The main stream is DASH with Widevine (and PlayReady) DRM: castLabs' DRMtoday staging
// licence server, an open demo. Browsers with a Widevine CDM (Chrome, Edge, Firefox, the
// LG/Samsung TV browsers) play it through Shaka Player. Apple's runtimes have no Widevine and
// AVPlayer plays neither DASH nor Widevine (HLS + FairPlay only), so on Apple TV, and in
// Safari, the player declines it and the details page falls back to the clear HLS stream:
// Big Buck Bunny (Blender Foundation, CC BY 3.0) from Mux's public test streams.
export interface Stream {
  url: string
  /** Key system id -> licence server URL, e.g. 'com.widevine.alpha'. Absent for clear content. */
  drm?: Record<string, string>
  label: string
}

export const DRM_STREAM: Stream = {
  url: 'https://d24rwxnt7vw9qb.cloudfront.net/out/v1/feb9354da126479386ae8d47ba103cf8/index.mpd',
  drm: { 'com.widevine.alpha': 'https://lic.staging.drmtoday.com/license-proxy-widevine/cenc/?specConform=true' },
  label: 'DASH + Widevine (DRMtoday demo)',
}

export const CLEAR_STREAM: Stream = {
  url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  label: 'HLS (Big Buck Bunny)',
}

export function isDash(url: string): boolean {
  return /\.mpd(\?|$)/i.test(url)
}

export function isHls(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url)
}
