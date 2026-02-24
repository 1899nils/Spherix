import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { sendResponse, sendError, SubsonicError } from '../response.js';
import type { SubsonicObj } from '../response.js';

const router = Router();

// ─── Helper: format a track as a Subsonic "child" / "song" ─────────────────

interface TrackRow {
  id: string;
  title: string;
  trackNumber: number;
  discNumber: number;
  duration: number;
  filePath: string;
  fileSize: bigint;
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  musicbrainzId: string | null;
  createdAt: Date;
  artist?: { id: string; name: string } | null;
  album?: { id: string; title: string; coverUrl: string | null } | null;
  starredTracks?: { starredAt: Date }[];
}

function formatSong(track: TrackRow, _userId?: string): SubsonicObj {
  const suffix = track.format?.replace('.', '') || 'mp3';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    aiff: 'audio/aiff',
  };
  const starred = track.starredTracks?.[0]?.starredAt;

  return {
    id: track.id,
    parent: track.album?.id ?? track.artist?.id ?? '',
    isDir: false,
    title: track.title,
    album: track.album?.title,
    artist: track.artist?.name,
    track: track.trackNumber,
    discNumber: track.discNumber,
    year: undefined, // filled from album if available
    coverArt: track.album?.id,
    size: Number(track.fileSize),
    contentType: mimeMap[suffix] || 'application/octet-stream',
    suffix,
    duration: Math.round(track.duration),
    bitRate: track.bitrate ?? undefined,
    path: track.filePath.replace(/^\/music\//, ''),
    isVideo: false,
    type: 'music',
    created: track.createdAt.toISOString(),
    albumId: track.album?.id,
    artistId: track.artist?.id,
    ...(starred ? { starred: starred.toISOString() } : {}),
    ...(track.musicbrainzId ? { musicBrainzId: track.musicbrainzId } : {}),
  };
}

// ─── getMusicFolders ────────────────────────────────────────────────────────

async function handleGetMusicFolders(req: import('express').Request, res: import('express').Response) {
  const libraries = await prisma.library.findMany({ orderBy: { name: 'asc' } });

  sendResponse(req, res, {
    musicFolders: {
      musicFolder: libraries.map((lib) => ({
        id: lib.id,
        name: lib.name,
      })),
    },
  });
}

router.get('/getMusicFolders', handleGetMusicFolders);
router.post('/getMusicFolders', handleGetMusicFolders);

// ─── getIndexes ─────────────────────────────────────────────────────────────

async function handleGetIndexes(req: import('express').Request, res: import('express').Response) {
  const artists = await prisma.artist.findMany({
    orderBy: { sortName: 'asc' },
    select: {
      id: true,
      name: true,
      sortName: true,
      _count: { select: { albums: true } },
    },
  });

  // Group by first letter
  const indexMap = new Map<string, SubsonicObj[]>();
  for (const artist of artists) {
    const sortKey = (artist.sortName || artist.name).toUpperCase();
    const letter = /^[A-Z]/.test(sortKey) ? sortKey[0] : '#';

    if (!indexMap.has(letter)) indexMap.set(letter, []);
    indexMap.get(letter)!.push({
      id: artist.id,
      name: artist.name,
      albumCount: artist._count.albums,
    });
  }

  const indexes: SubsonicObj[] = [];
  for (const [letter, artists] of [...indexMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    indexes.push({
      name: letter,
      artist: artists,
    });
  }

  sendResponse(req, res, {
    indexes: {
      lastModified: Date.now(),
      ignoredArticles: 'The El La Les',
      index: indexes,
    },
  });
}

router.get('/getIndexes', handleGetIndexes);
router.post('/getIndexes', handleGetIndexes);

// ─── getMusicDirectory ──────────────────────────────────────────────────────

async function handleGetMusicDirectory(req: import('express').Request, res: import('express').Response) {
  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const userId = req.subsonicUser?.id;

  // Try as album first
  const album = await prisma.album.findUnique({
    where: { id },
    include: {
      artist: { select: { id: true, name: true } },
      tracks: {
        include: {
          artist: { select: { id: true, name: true } },
          album: { select: { id: true, title: true, coverUrl: true } },
          ...(userId
            ? { starredTracks: { where: { userId }, take: 1 } }
            : {}),
        },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      },
    },
  });

  if (album) {
    sendResponse(req, res, {
      directory: {
        id: album.id,
        parent: album.artist.id,
        name: album.title,
        artist: album.artist.name,
        artistId: album.artist.id,
        coverArt: album.id,
        playCount: 0,
        child: album.tracks.map((t) => ({
          ...formatSong(t as TrackRow, userId),
          year: album.year ?? undefined,
          genre: album.genre ?? undefined,
        })),
      },
    });
    return;
  }

  // Try as artist
  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      albums: {
        include: {
          artist: { select: { id: true, name: true } },
          _count: { select: { tracks: true } },
        },
        orderBy: { year: 'desc' },
      },
    },
  });

  if (artist) {
    sendResponse(req, res, {
      directory: {
        id: artist.id,
        name: artist.name,
        child: artist.albums.map((al) => ({
          id: al.id,
          parent: artist.id,
          isDir: true,
          title: al.title,
          album: al.title,
          artist: al.artist.name,
          year: al.year ?? undefined,
          genre: al.genre ?? undefined,
          coverArt: al.id,
          artistId: artist.id,
          created: al.createdAt.toISOString(),
        })),
      },
    });
    return;
  }

  sendError(req, res, SubsonicError.NOT_FOUND, 'Directory not found');
}

router.get('/getMusicDirectory', handleGetMusicDirectory);
router.post('/getMusicDirectory', handleGetMusicDirectory);

// ─── getSong ────────────────────────────────────────────────────────────────

async function handleGetSong(req: import('express').Request, res: import('express').Response) {
  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const userId = req.subsonicUser?.id;

  const track = await prisma.track.findUnique({
    where: { id },
    include: {
      artist: { select: { id: true, name: true } },
      album: { select: { id: true, title: true, coverUrl: true, year: true, genre: true } },
      ...(userId
        ? { starredTracks: { where: { userId }, take: 1 } }
        : {}),
    },
  });

  if (!track) {
    sendError(req, res, SubsonicError.NOT_FOUND, 'Song not found');
    return;
  }

  sendResponse(req, res, {
    song: {
      ...formatSong(track as unknown as TrackRow, userId),
      year: (track.album as { year?: number | null } | null)?.year ?? undefined,
      genre: (track.album as { genre?: string | null } | null)?.genre ?? undefined,
    },
  });
}

router.get('/getSong', handleGetSong);
router.post('/getSong', handleGetSong);

// ─── getArtist (ID3-based) ─────────────────────────────────────────────────

async function handleGetArtist(req: import('express').Request, res: import('express').Response) {
  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const userId = req.subsonicUser?.id;

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      albums: {
        include: {
          _count: { select: { tracks: true } },
          tracks: { select: { duration: true } },
          ...(userId
            ? { starredAlbums: { where: { userId }, take: 1 } }
            : {}),
        },
        orderBy: { year: 'desc' },
      },
      ...(userId
        ? { starredArtists: { where: { userId }, take: 1 } }
        : {}),
    },
  });

  if (!artist) {
    sendError(req, res, SubsonicError.NOT_FOUND, 'Artist not found');
    return;
  }

  const starredArtist = (artist as unknown as { starredArtists?: { starredAt: Date }[] }).starredArtists?.[0];

  sendResponse(req, res, {
    artist: {
      id: artist.id,
      name: artist.name,
      coverArt: artist.imageUrl ? artist.id : undefined,
      albumCount: artist.albums.length,
      ...(starredArtist ? { starred: starredArtist.starredAt.toISOString() } : {}),
      ...(artist.musicbrainzId ? { musicBrainzId: artist.musicbrainzId } : {}),
      album: artist.albums.map((al) => {
        const totalDuration = al.tracks.reduce((sum, t) => sum + t.duration, 0);
        const starredAlbum = (al as unknown as { starredAlbums?: { starredAt: Date }[] }).starredAlbums?.[0];
        return {
          id: al.id,
          name: al.title,
          artist: artist.name,
          artistId: artist.id,
          coverArt: al.id,
          songCount: al._count.tracks,
          duration: Math.round(totalDuration),
          created: al.createdAt.toISOString(),
          year: al.year ?? undefined,
          genre: al.genre ?? undefined,
          ...(starredAlbum ? { starred: starredAlbum.starredAt.toISOString() } : {}),
        };
      }),
    },
  });
}

router.get('/getArtist', handleGetArtist);
router.post('/getArtist', handleGetArtist);

// ─── getAlbum (ID3-based) ───────────────────────────────────────────────────

async function handleGetAlbum(req: import('express').Request, res: import('express').Response) {
  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const userId = req.subsonicUser?.id;

  const album = await prisma.album.findUnique({
    where: { id },
    include: {
      artist: { select: { id: true, name: true } },
      tracks: {
        include: {
          artist: { select: { id: true, name: true } },
          album: { select: { id: true, title: true, coverUrl: true } },
          ...(userId
            ? { starredTracks: { where: { userId }, take: 1 } }
            : {}),
        },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      },
      ...(userId
        ? { starredAlbums: { where: { userId }, take: 1 } }
        : {}),
    },
  });

  if (!album) {
    sendError(req, res, SubsonicError.NOT_FOUND, 'Album not found');
    return;
  }

  const totalDuration = album.tracks.reduce((sum, t) => sum + t.duration, 0);
  const starredAlbum = (album as unknown as { starredAlbums?: { starredAt: Date }[] }).starredAlbums?.[0];

  sendResponse(req, res, {
    album: {
      id: album.id,
      name: album.title,
      artist: album.artist.name,
      artistId: album.artist.id,
      coverArt: album.id,
      songCount: album.tracks.length,
      duration: Math.round(totalDuration),
      created: album.createdAt.toISOString(),
      year: album.year ?? undefined,
      genre: album.genre ?? undefined,
      ...(starredAlbum ? { starred: starredAlbum.starredAt.toISOString() } : {}),
      ...(album.musicbrainzId ? { musicBrainzId: album.musicbrainzId } : {}),
      song: album.tracks.map((t) => ({
        ...formatSong(t as TrackRow, userId),
        year: album.year ?? undefined,
        genre: album.genre ?? undefined,
      })),
    },
  });
}

router.get('/getAlbum', handleGetAlbum);
router.post('/getAlbum', handleGetAlbum);

// ─── getArtists (ID3-based — like getIndexes but for ID3 tags) ──────────────

async function handleGetArtists(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;

  const artists = await prisma.artist.findMany({
    orderBy: { sortName: 'asc' },
    select: {
      id: true,
      name: true,
      sortName: true,
      imageUrl: true,
      musicbrainzId: true,
      _count: { select: { albums: true } },
      ...(userId
        ? { starredArtists: { where: { userId }, take: 1 } }
        : {}),
    },
  });

  const indexMap = new Map<string, SubsonicObj[]>();
  for (const artist of artists) {
    const sortKey = (artist.sortName || artist.name).toUpperCase();
    const letter = /^[A-Z]/.test(sortKey) ? sortKey[0] : '#';

    if (!indexMap.has(letter)) indexMap.set(letter, []);

    const starred = (artist as unknown as { starredArtists?: { starredAt: Date }[] }).starredArtists?.[0];
    indexMap.get(letter)!.push({
      id: artist.id,
      name: artist.name,
      coverArt: artist.imageUrl ? artist.id : undefined,
      albumCount: artist._count.albums,
      ...(starred ? { starred: starred.starredAt.toISOString() } : {}),
      ...(artist.musicbrainzId ? { musicBrainzId: artist.musicbrainzId } : {}),
    });
  }

  const indexes: SubsonicObj[] = [];
  for (const [letter, arts] of [...indexMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    indexes.push({ name: letter, artist: arts });
  }

  sendResponse(req, res, {
    artists: {
      ignoredArticles: 'The El La Les',
      index: indexes,
    },
  });
}

router.get('/getArtists', handleGetArtists);
router.post('/getArtists', handleGetArtists);

export default router;
