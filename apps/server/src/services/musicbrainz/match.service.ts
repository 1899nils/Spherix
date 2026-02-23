import { mbFetch } from './client.js';
import type {
  LocalAlbum,
  MatchCandidate,
  MatchResult,
  MBRelease,
  MBReleaseSearchResponse,
} from './types.js';

const AUTO_MATCH_THRESHOLD = 90;

/**
 * Normalises a string for fuzzy comparison:
 * lowercase, strip diacritics, collapse whitespace, remove punctuation.
 */
function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^\w\s]/g, '')         // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance between two strings (iterative, O(m*n)).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * String similarity 0-100 based on normalised Levenshtein distance.
 */
function similarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 100;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 100;
  const dist = levenshtein(na, nb);
  return Math.round((1 - dist / maxLen) * 100);
}

/**
 * Extract the combined artist name from MusicBrainz artist credits.
 */
function creditedArtistName(release: MBRelease): string {
  if (!release['artist-credit']?.length) return '';
  return release['artist-credit']
    .map((c) => c.name + (c.joinphrase || ''))
    .join('');
}

/**
 * Compute the total track count across all media.
 */
function totalTrackCount(release: MBRelease): number {
  if (!release.media?.length) return 0;
  return release.media.reduce((sum, m) => sum + m['track-count'], 0);
}

/**
 * Score a single MusicBrainz release against a local album.
 * Returns a confidence score (0-100) and human-readable reasons.
 */
function scoreCandidate(
  release: MBRelease,
  local: LocalAlbum,
): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  let maxScore = 0;

  // Title similarity (weight: 40)
  const titleSim = similarity(release.title, local.title);
  const titleWeight = 40;
  score += (titleSim / 100) * titleWeight;
  maxScore += titleWeight;
  if (titleSim === 100) reasons.push('Exact title match');
  else if (titleSim >= 80) reasons.push(`Title similar (${titleSim}%)`);

  // Artist similarity (weight: 35)
  const mbArtist = creditedArtistName(release);
  if (mbArtist) {
    const artistSim = similarity(mbArtist, local.artistName);
    const artistWeight = 35;
    score += (artistSim / 100) * artistWeight;
    maxScore += artistWeight;
    if (artistSim === 100) reasons.push('Exact artist match');
    else if (artistSim >= 80) reasons.push(`Artist similar (${artistSim}%)`);
  }

  // Year match (weight: 15)
  if (local.year && release.date) {
    const releaseYear = parseInt(release.date.slice(0, 4), 10);
    const yearWeight = 15;
    maxScore += yearWeight;
    if (releaseYear === local.year) {
      score += yearWeight;
      reasons.push('Year matches');
    } else if (Math.abs(releaseYear - local.year) <= 1) {
      score += yearWeight * 0.5;
      reasons.push(`Year close (${releaseYear} vs ${local.year})`);
    }
  }

  // Track count match (weight: 10)
  if (local.trackCount && local.trackCount > 0) {
    const mbTracks = totalTrackCount(release);
    const trackWeight = 10;
    maxScore += trackWeight;
    if (mbTracks === local.trackCount) {
      score += trackWeight;
      reasons.push('Track count matches');
    } else if (mbTracks > 0 && Math.abs(mbTracks - local.trackCount) <= 2) {
      score += trackWeight * 0.5;
      reasons.push(`Track count close (${mbTracks} vs ${local.trackCount})`);
    }
  }

  const confidence = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return { confidence, reasons };
}

/**
 * Match a local album against MusicBrainz releases.
 *
 * Searches by artist + album title, scores the top results, and returns
 * up to 5 candidates sorted by confidence. If the best candidate exceeds
 * 90% confidence it is flagged as `autoMatch`.
 */
export async function matchAlbum(album: LocalAlbum): Promise<MatchResult> {
  // Build a Lucene query that targets both artist and release name
  const query = `release:"${album.title}" AND artist:"${album.artistName}"`;

  const response = await mbFetch<MBReleaseSearchResponse>('release', {
    query,
    limit: '10',
    offset: '0',
  });

  const candidates: MatchCandidate[] = response.releases
    .map((release) => {
      const { confidence, reasons } = scoreCandidate(release, album);
      return { release, confidence, reasons };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const autoMatch =
    candidates.length > 0 && candidates[0].confidence >= AUTO_MATCH_THRESHOLD
      ? candidates[0]
      : null;

  return { query: album, candidates, autoMatch };
}
