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
  const can = (type: string) => video.canPlayType(type) !== '';

  const videoCodecs: string[] = [];
  if (can('video/mp4; codecs="avc1.42E01E"')) videoCodecs.push('h264');
  // canPlayType() is only a heuristic, not a guarantee — a live repro showed
  // Firefox report "maybe" for the HEVC MIME/codec string and then fail to
  // actually decode a real HEVC stream ("blob:... konnte nicht dekodiert
  // werden", an MSE decode error, no network/loading issue at all). We still
  // report it here (rather than never claiming HEVC support at all) because
  // VideoPlayer now reacts to a genuine decode failure by reloading through
  // the transcode path — see its `error` event handling. That gives fast
  // direct play a chance on browsers where it truly works, while still
  // recovering automatically where canPlayType() lied.
  if (can('video/mp4; codecs="hev1.1.6.L93.B0"') || can('video/mp4; codecs="hvc1.1.6.L93.B0"')) {
    videoCodecs.push('hevc');
  }
  if (can('video/webm; codecs="vp9"')) videoCodecs.push('vp9');
  if (can('video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push('av1');

  const audioCodecs: string[] = [];
  if (can('audio/mp4; codecs="mp4a.40.2"')) audioCodecs.push('aac');
  if (can('audio/mpeg')) audioCodecs.push('mp3');
  if (can('audio/webm; codecs="opus"') || can('audio/ogg; codecs="opus"')) {
    audioCodecs.push('opus');
  }
  if (can('audio/flac') || can('audio/x-flac')) audioCodecs.push('flac');
  if (can('audio/mp4; codecs="ac-3"')) audioCodecs.push('ac3');
  if (can('audio/mp4; codecs="ec-3"')) audioCodecs.push('eac3');

  const containerFormats: string[] = ['mp4', 'm4v'];
  if (can('video/webm')) containerFormats.push('webm');
  if (can('video/x-matroska') || can('video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"')) {
    containerFormats.push('mkv', 'matroska');
  }
  if (can('video/quicktime')) containerFormats.push('mov');

  cached = { videoCodecs, audioCodecs, containerFormats };
  return cached;
}

/** JSON string ready to send as the `X-Client-Capabilities` request header. */
export function clientCapabilitiesHeader(): string {
  return JSON.stringify(detectClientCapabilities());
}
