import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { sendResponse, sendError, SubsonicError } from '../response.js';

const router = Router();

// ─── search3 (ID3-based search) ────────────────────────────────────────────

async function handleSearch3(req: import('express').Request, res: import('express').Response) {
  const query = (req.query.query as string) || '';

  if (!query) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "query" is missing');
    return;
  }

  const artistCount = Math.min(parseInt(req.query.artistCount as string) || 20, 100);
  const artistOffset = parseInt(req.query.artistOffset as string) || 0;
  const albumCount = Math.min(parseInt(req.query.albumCount as string) || 20, 100);
  const albumOffset = parseInt(req.query.albumOffset as string) || 0;
  const songCount = Math.min(parseInt(req.query.songCount as string) || 20, 100);
  const songOffset = parseInt(req.query.songOffset as string) || 0;

  const userId = req.subsonicUser?.id;

  const [artists, albums, tracks] = await Promise.all([
    prisma.artist.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      take: artistCount,
      skip: artistOffset,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        musicbrainzId: true,
        _count: { select: { albums: true } },
        ...(userId
          ? { starredArtists: { where: { userId }, take: 1 } }
          : {}),
      },
    }),
    prisma.album.findMany({
      where: { title: { contains: query, mode: 'insensitive' } },
      take: albumCount,
      skip: albumOffset,
      include: {
        artist: { select: { id: true, name: true } },
        _count: { select: { tracks: true } },
        tracks: { select: { duration: true } },
        ...(userId
          ? { starredAlbums: { where: { userId }, take: 1 } }
          : {}),
      },
    }),
    prisma.track.findMany({
      where: { title: { contains: query, mode: 'insensitive' } },
      take: songCount,
      skip: songOffset,
      include: {
        artist: { select: { id: true, name: true } },
        album: { select: { id: true, title: true, coverUrl: true, year: true, genre: true } },
        ...(userId
          ? { starredTracks: { where: { userId }, take: 1 } }
          : {}),
      },
    }),
  ]);

  const suffix = (format: string) => format?.replace('.', '') || 'mp3';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg',
    opus: 'audio/opus', m4a: 'audio/mp4', wav: 'audio/wav',
  };

  sendResponse(req, res, {
    searchResult3: {
      artist: artists.map((a) => {
        const starred = (a as unknown as { starredArtists?: { starredAt: Date }[] }).starredArtists?.[0];
        return {
          id: a.id,
          name: a.name,
          coverArt: a.imageUrl ? a.id : undefined,
          albumCount: a._count.albums,
          ...(starred ? { starred: starred.starredAt.toISOString() } : {}),
        };
      }),
      album: albums.map((al) => {
        const totalDuration = al.tracks.reduce((sum, t) => sum + t.duration, 0);
        const starred = (al as unknown as { starredAlbums?: { starredAt: Date }[] }).starredAlbums?.[0];
        return {
          id: al.id,
          name: al.title,
          artist: al.artist.name,
          artistId: al.artist.id,
          coverArt: al.id,
          songCount: al._count.tracks,
          duration: Math.round(totalDuration),
          created: al.createdAt.toISOString(),
          year: al.year ?? undefined,
          genre: al.genre ?? undefined,
          ...(starred ? { starred: starred.starredAt.toISOString() } : {}),
        };
      }),
      song: tracks.map((t) => {
        const s = suffix(t.format);
        const starred = (t as unknown as { starredTracks?: { starredAt: Date }[] }).starredTracks?.[0];
        const albumData = t.album as { id: string; title: string; coverUrl: string | null; year?: number | null; genre?: string | null } | null;
        return {
          id: t.id,
          parent: albumData?.id ?? t.artist?.id ?? '',
          isDir: false,
          title: t.title,
          album: albumData?.title,
          artist: t.artist?.name,
          track: t.trackNumber,
          discNumber: t.discNumber,
          year: albumData?.year ?? undefined,
          genre: albumData?.genre ?? undefined,
          coverArt: albumData?.id,
          size: Number(t.fileSize),
          contentType: mimeMap[s] || 'application/octet-stream',
          suffix: s,
          duration: Math.round(t.duration),
          bitRate: t.bitrate ?? undefined,
          path: t.filePath.replace(/^\/music\//, ''),
          isVideo: false,
          type: 'music',
          created: t.createdAt.toISOString(),
          albumId: albumData?.id,
          artistId: t.artist?.id,
          ...(starred ? { starred: starred.starredAt.toISOString() } : {}),
        };
      }),
    },
  });
}

router.get('/search3', handleSearch3);
router.post('/search3', handleSearch3);

// search2 — alias for search3 (older API version)
router.get('/search2', handleSearch3);
router.post('/search2', handleSearch3);

export default router;
