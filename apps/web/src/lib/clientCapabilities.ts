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
  /**
   * Codecs decodable through Media Source Extensions, i.e. what hls.js can
   * actually feed the browser. Governs the transcode/remux path.
   */
  videoCodecs: string[];
  audioCodecs: string[];
  /**
   * Codecs decodable by a plain `<video src>` — a *different*, generally
   * larger set than the MSE one (Firefox on Windows decodes HEVC here but
   * not through MSE). Governs direct play, where no MSE is involved, so
   * that a file the browser could play untouched isn't needlessly
   * transcoded just because MSE couldn't have handled it.
   */
  nativeVideoCodecs: string[];
  nativeAudioCodecs: string[];
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

  /** Probe the plain `<video src>` decode path (no MSE involved). */
  const canDirect = (type: string) => video.canPlayType(type) !== '';

  // Firefox reports HEVC support through MediaSource.isTypeSupported(), but
  // does not deliver it: fed an HEVC stream over MSE it downloads and
  // appends every segment without complaint, emits no media-element error
  // and no fatal hls.js error, and simply never renders a frame or advances
  // the clock (measured: ~106MB pulled over 90s, no picture, clean
  // console). No feature test catches that — the browser answers "yes" to
  // every question we can ask — so this is a deliberate, targeted
  // exception. Maintaining per-browser codec facts is what other media
  // servers do, for exactly this reason.
  //
  // Note this applies to the MSE list ONLY. Firefox's *native* HEVC
  // decoding (Windows, hardware) does work, so direct play of an HEVC file
  // it can also demux stays available — no point transcoding something the
  // browser would have played untouched.
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

  // The native (direct-play) equivalents. No Firefox HEVC exception here —
  // see above.
  const nativeVideoCodecs: string[] = [];
  if (canDirect('video/mp4; codecs="avc1.42E01E"')) nativeVideoCodecs.push('h264');
  if (
    canDirect('video/mp4; codecs="hev1.1.6.L93.B0"') ||
    canDirect('video/mp4; codecs="hvc1.1.6.L93.B0"')
  ) {
    nativeVideoCodecs.push('hevc');
  }
  if (canDirect('video/webm; codecs="vp9"')) nativeVideoCodecs.push('vp9');
  if (canDirect('video/mp4; codecs="av01.0.05M.08"')) nativeVideoCodecs.push('av1');

  const nativeAudioCodecs: string[] = [];
  if (canDirect('audio/mp4; codecs="mp4a.40.2"')) nativeAudioCodecs.push('aac');
  if (canDirect('audio/mpeg')) nativeAudioCodecs.push('mp3');
  if (canDirect('audio/webm; codecs="opus"') || canDirect('audio/ogg; codecs="opus"')) {
    nativeAudioCodecs.push('opus');
  }
  if (canDirect('audio/flac') || canDirect('audio/x-flac')) nativeAudioCodecs.push('flac');
  if (canDirect('audio/mp4; codecs="ac-3"')) nativeAudioCodecs.push('ac3');
  if (canDirect('audio/mp4; codecs="ec-3"')) nativeAudioCodecs.push('eac3');

  // Containers govern *direct play* — serving the original file straight to
  // the <video> element — so these are probed with canPlayType() rather
  // than through MSE, which never accepts a container like Matroska at all.

  const containerFormats: string[] = ['mp4', 'm4v'];
  if (canDirect('video/webm')) containerFormats.push('webm');
  if (
    canDirect('video/x-matroska') ||
    canDirect('video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"')
  ) {
    containerFormats.push('mkv', 'matroska');
  }
  if (canDirect('video/quicktime')) containerFormats.push('mov');

  cached = {
    videoCodecs,
    audioCodecs,
    nativeVideoCodecs,
    nativeAudioCodecs,
    containerFormats,
  };
  return cached;
}

/** JSON string ready to send as the `X-Client-Capabilities` request header. */
export function clientCapabilitiesHeader(): string {
  return JSON.stringify(detectClientCapabilities());
}
