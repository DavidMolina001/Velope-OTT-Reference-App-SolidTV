// What "Play now" plays.
//
// Three streams, tried in order by the runtime's own player. DRM is the point of the first
// two: no runtime plays both, because the two key systems belong to different worlds.
//
// - Browsers with a Widevine CDM (Chrome, Edge, Firefox, the LG/Samsung TV browsers) play the
//   DASH stream through Shaka Player and castLabs' DRMtoday staging licence server.
// - Apple's runtimes have no Widevine, and AVPlayer reads neither DASH nor Widevine: FairPlay
//   over HLS is the only DRM it knows. So Apple TV plays the FairPlay stream instead, with its
//   own certificate and licence server (EZDRM's public demo).
// - Anything that can play neither falls back to clear HLS: Big Buck Bunny (Blender
//   Foundation, CC BY 3.0) from Mux's public test streams.
export interface FairPlayConfig {
  /** The application certificate (DER), fetched once per session. */
  certificateUrl: string
  /** Where the SPC is POSTed and the CKC comes back. */
  licenceUrl: string
}

export interface Stream {
  url: string
  /** EME key system id -> licence server URL, e.g. 'com.widevine.alpha'. Absent for clear content. */
  drm?: Record<string, string>
  /** FairPlay Streaming, which AVPlayer handles through an AVContentKeySession. */
  fairplay?: FairPlayConfig
  label: string
}

export const WIDEVINE_STREAM: Stream = {
  url: 'https://d24rwxnt7vw9qb.cloudfront.net/out/v1/feb9354da126479386ae8d47ba103cf8/index.mpd',
  drm: { 'com.widevine.alpha': 'https://lic.staging.drmtoday.com/license-proxy-widevine/cenc/?specConform=true' },
  label: 'DASH + Widevine (DRMtoday demo)',
}

export const FAIRPLAY_STREAM: Stream = {
  url: 'https://fps.ezdrm.com/demo/video/ezdrm.m3u8',
  fairplay: {
    certificateUrl: 'https://fps.ezdrm.com/demo/video/eleisure.cer',
    licenceUrl: 'https://fps.ezdrm.com/api/licenses',
  },
  label: 'HLS + FairPlay (EZDRM demo)',
}

export const CLEAR_STREAM: Stream = {
  url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  label: 'HLS (Big Buck Bunny)',
}

/** The order every player tries: the DRM its runtime supports first, clear content last. */
export const STREAMS: Stream[] = [WIDEVINE_STREAM, FAIRPLAY_STREAM, CLEAR_STREAM]

export function isDash(url: string): boolean {
  return /\.mpd(\?|$)/i.test(url)
}

export function isHls(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url)
}
