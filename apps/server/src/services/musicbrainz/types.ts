// ─── MusicBrainz API Response Types ─────────────────────────────────────────

/** ISO 8601 partial date as returned by the API (e.g. "1967-06-01", "1967", null). */
export type MBDate = string | null;

// ─── Shared primitives ──────────────────────────────────────────────────────

export interface MBArtistCredit {
  name: string;
  joinphrase: string;
  artist: MBArtistRef;
}

export interface MBArtistRef {
  id: string;
  name: string;
  'sort-name': string;
  disambiguation?: string;
}

export interface MBTextRepresentation {
  language: string | null;
  script: string | null;
}

export interface MBArea {
  id: string;
  name: string;
  'sort-name': string;
  'iso-3166-1-codes'?: string[];
}

export interface MBTag {
  name: string;
  count: number;
}

export interface MBLifeSpan {
  begin: MBDate;
  end: MBDate;
  ended: boolean;
}

export interface MBAlias {
  name: string;
  'sort-name': string;
  type: string | null;
  locale: string | null;
  primary: boolean | null;
}

export interface MBRelation {
  type: string;
  'type-id': string;
  direction: 'forward' | 'backward';
  'target-type': string;
  url?: { id: string; resource: string };
  attributes?: string[];
}

// ─── Release (Album) ────────────────────────────────────────────────────────

export interface MBRelease {
  id: string;
  title: string;
  status?: string;
  date?: string;
  country?: string;
  barcode?: string;
  disambiguation?: string;
  packaging?: string;
  'release-group'?: MBReleaseGroup;
  'text-representation'?: MBTextRepresentation;
  'artist-credit'?: MBArtistCredit[];
  'label-info'?: MBLabelInfo[];
  media?: MBMedia[];
  'cover-art-archive'?: MBCoverArtArchive;
  tags?: MBTag[];
  score?: number; // search relevance 0-100
}

export interface MBReleaseGroup {
  id: string;
  title: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
}

export interface MBLabelInfo {
  'catalog-number'?: string;
  label?: { id: string; name: string };
}

export interface MBMedia {
  position: number;
  format?: string;
  'track-count': number;
  title?: string;
  tracks?: MBTrack[];
}

export interface MBTrack {
  id: string;
  number: string;
  title: string;
  length: number | null;
  position: number;
  recording: MBRecording;
}

export interface MBCoverArtArchive {
  artwork: boolean;
  count: number;
  front: boolean;
  back: boolean;
}

// ─── Artist ─────────────────────────────────────────────────────────────────

export interface MBArtist {
  id: string;
  name: string;
  'sort-name': string;
  type?: string;
  gender?: string;
  disambiguation?: string;
  country?: string;
  area?: MBArea;
  'begin-area'?: MBArea;
  'life-span'?: MBLifeSpan;
  aliases?: MBAlias[];
  tags?: MBTag[];
  relations?: MBRelation[];
  'release-groups'?: MBReleaseGroup[];
  score?: number; // search relevance 0-100
}

// ─── Recording (Track) ──────────────────────────────────────────────────────

export interface MBRecording {
  id: string;
  title: string;
  length: number | null;
  disambiguation?: string;
  'first-release-date'?: string;
  'artist-credit'?: MBArtistCredit[];
  releases?: MBRelease[];
  tags?: MBTag[];
  isrcs?: string[];
  score?: number; // search relevance 0-100
}

// ─── Search Responses ───────────────────────────────────────────────────────

export interface MBSearchResponse<T> {
  created: string;
  count: number;
  offset: number;
  releases?: T[];
  artists?: T[];
  recordings?: T[];
}

export interface MBReleaseSearchResponse extends MBSearchResponse<MBRelease> {
  releases: MBRelease[];
}

export interface MBArtistSearchResponse extends MBSearchResponse<MBArtist> {
  artists: MBArtist[];
}

export interface MBRecordingSearchResponse extends MBSearchResponse<MBRecording> {
  recordings: MBRecording[];
}

// ─── Cover Art Archive ──────────────────────────────────────────────────────

export interface CAAImage {
  id: number;
  image: string;
  thumbnails: {
    250?: string;
    500?: string;
    1200?: string;
    small?: string;
    large?: string;
  };
  front: boolean;
  back: boolean;
  types: string[];
  approved: boolean;
}

export interface CAAResponse {
  images: CAAImage[];
  release: string;
}

// ─── Match Service Types ────────────────────────────────────────────────────

export interface LocalAlbum {
  title: string;
  artistName: string;
  year?: number | null;
  trackCount?: number | null;
}

export interface MatchCandidate {
  release: MBRelease;
  confidence: number; // 0-100
  reasons: string[];
}

export interface MatchResult {
  query: LocalAlbum;
  candidates: MatchCandidate[];
  autoMatch: MatchCandidate | null; // non-null if confidence > 90
}
