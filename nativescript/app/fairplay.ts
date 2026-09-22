// FairPlay Streaming key delivery for AVPlayer.
//
// AVPlayer decrypts HLS through an AVContentKeySession: the playlist's `#EXT-X-KEY` names a
// `skd://` URI, the session hands us a key request, we turn it into an SPC with the provider's
// application certificate, POST that to their licence server, and hand the CKC back. This is
// the only DRM Apple's players know — no Widevine, no PlayReady, no DASH.
//
// Note: FairPlay needs the device's secure key path, which the tvOS Simulator does not have.
// There the key request fails and the app falls back to the next stream; a real Apple TV plays.
import { Utils } from '@nativescript/core'
import type { FairPlayConfig } from '../../src/state/playback'

// ObjC protocols are runtime globals; the type declarations describe them as interfaces only.
const ContentKeySessionDelegate = (globalThis as unknown as Record<string, unknown>)
  .AVContentKeySessionDelegate as never

export interface FairPlaySession {
  /** Puts the asset under this session's key delivery. Call before creating the player item. */
  attach(asset: AVURLAsset): void
  /** Stops key delivery and releases the session. */
  dispose(): void
}

function request(url: string, method: 'GET' | 'POST', body?: NSData, contentType?: string): Promise<NSData> {
  return new Promise((resolve, reject) => {
    const req = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(url))
    req.HTTPMethod = method
    if (body) req.HTTPBody = body
    if (contentType) req.setValueForHTTPHeaderField(contentType, 'Content-Type')
    const task = NSURLSession.sharedSession.dataTaskWithRequestCompletionHandler(req, (data, response, error) => {
      // NSURLSession calls back on its own queue; NativeScript's JS belongs to the main thread.
      Utils.executeOnMainThread(() => {
        const status = response instanceof NSHTTPURLResponse ? response.statusCode : 0
        if (error) {
          reject(new Error(`${method} ${url} failed: ${error.localizedDescription}`))
        } else if (status >= 400) {
          reject(new Error(`${method} ${url} responded with ${status}`))
        } else if (!data || data.length === 0) {
          reject(new Error(`${method} ${url} returned an empty body`))
        } else {
          resolve(data)
        }
      })
    })
    task.resume()
  })
}

// Some licence servers answer with the CKC raw, others base64-encoded. Both are easy to tell
// apart: a raw CKC is binary, a base64 one is printable ASCII in the base64 alphabet.
function decodeCkc(data: NSData): NSData {
  const text = NSString.alloc().initWithDataEncoding(data, NSUTF8StringEncoding)
  if (text && /^[A-Za-z0-9+/=\s]+$/.test(text.toString()) && text.length > 32) {
    const decoded = NSData.alloc().initWithBase64EncodedStringOptions(text.toString(), 0 as NSDataBase64DecodingOptions)
    if (decoded && decoded.length > 0) {
      console.log('FAIRPLAY licence response was base64')
      return decoded
    }
  }
  return data
}

export function createFairPlaySession(config: FairPlayConfig): FairPlaySession {
  console.log(
    `FAIRPLAY session: keySystem=${typeof AVContentKeySystemFairPlayStreaming} delegateProtocol=${typeof ContentKeySessionDelegate}`
  )
  const session = AVContentKeySession.contentKeySessionWithKeySystem(AVContentKeySystemFairPlayStreaming)
  let certificate: NSData | undefined
  const certificateReady = request(config.certificateUrl, 'GET')
    .then((data) => {
      certificate = data
      console.log(`FAIRPLAY certificate loaded (${data.length} bytes)`)
    })
    .catch((error: unknown) => {
      console.warn(`FAIRPLAY certificate failed: ${String(error)}`)
      throw error
    })

  async function handle(keyRequest: AVContentKeyRequest): Promise<void> {
    await certificateReady
    if (!certificate) throw new Error('no FairPlay certificate')
    // `skd://fps.example.com/;<assetId>` -> content id for the SPC, asset id for the licence URL.
    const identifier = String(keyRequest.identifier ?? '')
    const contentId = identifier.replace(/^skd:\/\//, '')
    const assetId = (contentId.includes(';') ? contentId.split(';').pop() : contentId.split('/').pop()) ?? contentId
    const contentIdData = NSString.stringWithString(contentId).dataUsingEncoding(NSUTF8StringEncoding)
    const spc = await new Promise<NSData>((resolve, reject) => {
      keyRequest.makeStreamingContentKeyRequestDataForAppContentIdentifierOptionsCompletionHandler(
        certificate as NSData,
        contentIdData,
        null,
        (data, error) => {
          Utils.executeOnMainThread(() => {
            if (data) resolve(data)
            else reject(new Error(`SPC failed: ${error ? error.localizedDescription : 'no data'}`))
          })
        }
      )
    })
    const licenceUrl = `${config.licenceUrl.replace(/\/$/, '')}/${assetId}`
    console.log(`FAIRPLAY SPC ${spc.length} bytes -> ${licenceUrl}`)
    const ckc = decodeCkc(await request(licenceUrl, 'POST', spc, 'application/octet-stream'))
    console.log(`FAIRPLAY CKC ${ckc.length} bytes`)
    keyRequest.processContentKeyResponse(AVContentKeyResponse.contentKeyResponseWithFairPlayStreamingKeyResponseData(ckc))
  }

  const delegate = (NSObject as unknown as {
    extend(members: Record<string, unknown>, options: { protocols: never[] }): { new (): NSObject }
  }).extend(
    {
      contentKeySessionDidProvideContentKeyRequest(_session: AVContentKeySession, keyRequest: AVContentKeyRequest) {
        Utils.executeOnMainThread(() => {
          console.log(`FAIRPLAY key request for ${String(keyRequest.identifier ?? 'unknown')}`)
          handle(keyRequest).catch((error: unknown) => {
            console.warn(`FAIRPLAY key request failed: ${String(error)}`)
            // Tell AVPlayer, so the item fails fast and the player moves to the next stream
            // instead of stalling on a key that will never arrive.
            keyRequest.processContentKeyResponseError(
              NSError.errorWithDomainCodeUserInfo('velope.fairplay', -1, null)
            )
          })
        })
      },
      contentKeySessionContentKeyRequestDidFailWithError(
        _session: AVContentKeySession,
        _keyRequest: AVContentKeyRequest,
        error: NSError
      ) {
        Utils.executeOnMainThread(() => console.warn(`FAIRPLAY key request error: ${error.localizedDescription}`))
      },
    },
    { protocols: [ContentKeySessionDelegate] }
  )

  // The session holds its delegate weakly, so the instance is kept alive here.
  const delegateInstance = new delegate()
  // AVContentKeySession insists on a real queue (a null one is rejected at runtime), so it gets
  // a serial queue of its own; each callback hops to the main thread, where NativeScript's JS
  // belongs, before doing any work.
  session.setDelegateQueue(
    delegateInstance as unknown as AVContentKeySessionDelegate,
    dispatch_queue_create('velope.fairplay', null)
  )

  return {
    attach(asset) {
      session.addContentKeyRecipient(asset)
    },
    dispose() {
      void delegateInstance
      session.expire()
    },
  }
}
