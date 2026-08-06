/**
 * Detects what this browser can actually decode, using the standard
 * `HTMLMediaElement.canPlayType()` feature-detection API — not a fixed
 * per-browser assumption.
 *
 * The server's default capability profile (`getDefaultClientCapabilities()`
 * in mediaInfo.service.ts) assumes MKV/AVI/MOV containers and AC3/E-AC3
 * audio are natively playable for every client. That's roughly true for
 * Chrome/Edge, but Firefox's Matroska (.mkv) demuxer support is much more
 * limited — a file the server thinks is "direct playable" can fail there
 * with a native NS_ERROR_DOM_MEDIA_DEMUXER_ERR, producing no video *and*
 * no audio instead of falling back to the transcode/remux path that
 * already exists specifically to handle this.
 *
 * This result is sent as the `X-Client-Capabilities` header (already read
 * server-side by `parseClientCapabilities()`, just never populated by the
 * frontend) and merged on top of the server's defaults, so we only need to
 * report the fields we can actually probe here.
 */
export interface DetectedClientCapabilities {
  videoCodecs: string[];
  audioCodecs: string[];
  containerFormats: string[];
}

let cached: DetectedClientCapabilities | null = null;

export function detectClientCapabilities(): DetectedClientCapabilities {
  if (cached) return cached;

  const video = document.createElement('video');

  /**
   * Probe a codec the way it will actually be delivered.
   *
   * Anything the server decides isn't direct-playable is delivered as HLS
   * through hls.js, which feeds the browser via Media Source Extensions —
   * and MSE codec support is NOT the same set as `<video src>` support.
   * Firefox on Windows, for instance, can decode HEVC in a plain file but
   * does not support it through MSE, so `canPlayType()` says yes while the
   * stream we'd actually send it fails to decode. Asking
   * `MediaSource.isTypeSupported()` asks the question we actually care
   * about; canPlayType() is only the fallback when MSE isn't available at
   * all (in which case we couldn't use hls.js anyway).
   */
  const can = (type: string) => {
    if (typeof MediaSource !== 'undefined' && typeof MediaSource.isTypeSupported === 'function') {
      return MediaSource.isTypeSupported(type);
    }
    return video.canPlayType(type) !== '';
  };

  // Firefox reports HEVC support through both canPlayType() and
  // MediaSource.isTypeSupported(), but does not deliver it: fed an HEVC
  // stream it downloads and appends every segment without complaint, emits
  // no media-element error and no fatal hls.js error, and simply never
  // renders a frame or advances the clock (measured: ~106MB pulled over
  // 90s, no picture, clean console). There's no feature test that catches
  // that — the browser answers "yes" to every question we can ask — so this
  // is a deliberate, targeted exception. Maintaining per-browser codec
  // facts like this is what other media servers do for the same reason.
  //
  // Consequence: HEVC gets re-encoded to H.264 for Firefox. That costs CPU,
  // but it plays, which beats a silent black screen. The stall watchdog in
  // VideoPlayer is the general safety net for cases we haven't catalogued.
  const isFirefox = /firefox|fxios/i.test(navigator.userAgent);

  const videoCodecs: string[] = [];
  if (can('video/mp4; codecs="avc1.42E01E"')) videoCodecs.push('h264');
  if (
    !isFirefox &&
    (can('video/mp4; codecs="hev1.1.6.L93.B0"') || can('video/mp4; codecs="hvc1.1.6.L93.B0"'))
  ) {
    videoCodecs.push('hevc');
  }
  if (can('video/webm; codecs="vp9"') || can('video/mp4; codecs="vp09.00.10.08"')) {
    videoCodecs.push('vp9');
  }
  if (can('video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push('av1');

  const audioCodecs: string[] = [];
  if (can('audio/mp4; codecs="mp4a.40.2"')) audioCodecs.push('aac');
  if (can('audio/mpeg') || can('audio/mp4; codecs="mp4a.69"')) audioCodecs.push('mp3');
  if (can('audio/webm; codecs="opus"') || can('audio/mp4; codecs="opus"')) {
    audioCodecs.push('opus');
  }
  if (can('audio/mp4; codecs="flac"') || can('audio/flac')) audioCodecs.push('flac');
  if (can('audio/mp4; codecs="ac-3"')) audioCodecs.push('ac3');
  if (can('audio/mp4; codecs="ec-3"')) audioCodecs.push('eac3');

  // Containers govern *direct play* — serving the original file straight to
  // the <video> element — so these are probed with canPlayType() rather
  // than through MSE, which never accepts a container like Matroska at all.
  const canDirect = (type: string) => video.canPlayType(type) !== '';

  const containerFormats: string[] = ['mp4', 'm4v'];
  if (canDirect('video/webm')) containerFormats.push('webm');
  if (
    canDirect('video/x-matroska') ||
    canDirect('video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"')
  ) {
    containerFormats.push('mkv', 'matroska');
  }
  if (canDirect('video/quicktime')) containerFormats.push('mov');

  cached = { videoCodecs, audioCodecs, containerFormats };
  return cached;
}

/** JSON string ready to send as the `X-Client-Capabilities` request header. */
export function clientCapabilitiesHeader(): string {
  return JSON.stringify(detectClientCapabilities());
}
