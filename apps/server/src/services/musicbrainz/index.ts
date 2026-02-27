export {
  searchRelease,
  getReleaseById,
  searchArtist,
  getArtistById,
  searchRecording,
  getCoverArtUrl,
} from './musicbrainz.service.js';

export { matchAlbum } from './match.service.js';

export { autoMatchAlbum } from './auto-match.service.js';
export type { AutoMatchResult } from './auto-match.service.js';

export type {
  MBRelease,
  MBReleaseSearchResponse,
  MBArtist,
  MBArtistSearchResponse,
  MBRecording,
  MBRecordingSearchResponse,
  CAAResponse,
  LocalAlbum,
  MatchCandidate,
  MatchResult,
} from './types.js';
