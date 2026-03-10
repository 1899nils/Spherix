import { Router } from 'express';
import { prisma } from '../config/database.js';

const router: Router = Router();

async function getUserId(req: any): Promise<string | null> {
  if (req.session?.userId) return req.session.userId as string;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Recently Played ─────────────────────────────────────────────────────────

async function getRecentlyPlayed(userId: string) {
  const [recentHistory, recentPlaylists, radioStations] = await Promise.all([
    prisma.playHistory.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      take: 100,
      select: {
        playedAt: true,
        track: {
          select: {
            album: {
              select: { id: true, title: true, coverUrl: true, artist: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.playlist.findMany({
      where: { userId, lastPlayedAt: { not: null } },
      orderBy: { lastPlayedAt: 'desc' },
      take: 4,
      select: { id: true, name: true, coverUrl: true, lastPlayedAt: true, _count: { select: { tracks: true } } },
    }),
    prisma.radioStation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, name: true, logoUrl: true, createdAt: true, url: true },
    }),
  ]);

  // Deduplicate albums, keep most recent
  const seenAlbums = new Map<string, {
    type: 'album'; id: string; title: string; subtitle: string;
    coverUrl: string | null; playedAt: Date;
  }>();
  for (const ph of recentHistory) {
    const album = ph.track.album;
    if (album && !seenAlbums.has(album.id)) {
      seenAlbums.set(album.id, {
        type: 'album',
        id: album.id,
        title: album.title,
        subtitle: album.artist.name,
        coverUrl: album.coverUrl,
        playedAt: ph.playedAt,
      });
    }
    if (seenAlbums.size >= 6) break;
  }

  const items: Array<{
    type: 'album' | 'playlist' | 'radio';
    id: string;
    title: string;
    subtitle: string;
    coverUrl: string | null;
    playedAt: Date;
    url?: string; // for radio
  }> = [
    ...Array.from(seenAlbums.values()),
    ...recentPlaylists.map(p => ({
      type: 'playlist' as const,
      id: p.id,
      title: p.name,
      subtitle: `${p._count.tracks} ${p._count.tracks === 1 ? 'Song' : 'Songs'}`,
      coverUrl: p.coverUrl,
      playedAt: p.lastPlayedAt!,
    })),
    ...radioStations.map(r => ({
      type: 'radio' as const,
      id: r.id,
      title: r.name,
      subtitle: 'Radio',
      coverUrl: r.logoUrl,
      playedAt: r.createdAt,
      url: r.url,
    })),
  ];

  items.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  return items.slice(0, 8);
}

// ─── Top Artists ──────────────────────────────────────────────────────────────

async function getTopArtists(userId: string) {
  const history = await prisma.playHistory.findMany({
    where: { userId },
    select: {
      track: { select: { artist: { select: { id: true, name: true, imageUrl: true } } } },
    },
    take: 300,
  });

  if (history.length === 0) {
    // Fallback: artists with most tracks in library
    const artists = await prisma.artist.findMany({
      where: { tracks: { some: {} } },
      include: { _count: { select: { tracks: true } } },
      orderBy: { tracks: { _count: 'desc' } },
      take: 8,
    });
    return artists.map(a => ({ id: a.id, name: a.name, imageUrl: a.imageUrl, playCount: a._count.tracks }));
  }

  const artistMap = new Map<string, { id: string; name: string; imageUrl: string | null; count: number }>();
  for (const ph of history) {
    const { id, name, imageUrl } = ph.track.artist;
    const existing = artistMap.get(id);
    if (existing) { existing.count++; }
    else { artistMap.set(id, { id, name, imageUrl, count: 1 }); }
  }

  return Array.from(artistMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map(a => ({ id: a.id, name: a.name, imageUrl: a.imageUrl, playCount: a.count }));
}

// ─── Auto-generated Playlists (Mixes) ────────────────────────────────────────

const MIX_COLORS = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#e11d48', '#0ea5e9'];

async function getAutoPlaylists(userId: string) {
  const mixes: Array<{
    id: string; name: string; description: string;
    coverColor: string; coverUrl: string | null; trackIds: string[];
  }> = [];

  const history = await prisma.playHistory.findMany({
    where: { userId },
    select: {
      trackId: true,
      track: { select: { artistId: true, artist: { select: { name: true } } } },
    },
    orderBy: { playedAt: 'desc' },
    take: 500,
  });

  if (history.length >= 5) {
    // ── Lieblings-Mix: top 30 most-played tracks
    const trackCounts = new Map<string, number>();
    for (const ph of history) {
      trackCounts.set(ph.trackId, (trackCounts.get(ph.trackId) ?? 0) + 1);
    }
    const topTrackIds = Array.from(trackCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([id]) => id);

    if (topTrackIds.length >= 5) {
      mixes.push({
        id: 'top-played',
        name: 'Lieblings-Mix',
        description: 'Deine meistgehörten Songs',
        coverColor: '#e11d48',
        coverUrl: null,
        trackIds: shuffleArray(topTrackIds),
      });
    }

    // ── Per-artist mixes: up to 3 mixes for top 3 artists
    const artistData = new Map<string, { name: string; count: number; heardIds: Set<string> }>();
    for (const ph of history) {
      const { artistId, artist } = ph.track;
      const existing = artistData.get(artistId);
      if (existing) { existing.count++; existing.heardIds.add(ph.trackId); }
      else { artistData.set(artistId, { name: artist.name, count: 1, heardIds: new Set([ph.trackId]) }); }
    }

    const topArtists = Array.from(artistData.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);

    for (let i = 0; i < topArtists.length; i++) {
      const [artistId, data] = topArtists[i];
      const allArtistTracks = await prisma.track.findMany({
        where: { artistId },
        select: { id: true },
        take: 50,
      });

      if (allArtistTracks.length < 3) continue;

      const heardIds = Array.from(data.heardIds);
      const unheardIds = allArtistTracks.map(t => t.id).filter(id => !data.heardIds.has(id));
      const mixIds = shuffleArray([
        ...shuffleArray(heardIds).slice(0, 15),
        ...shuffleArray(unheardIds).slice(0, 15),
      ]).slice(0, 25);

      // Build description: this artist + next top artist
      const nextArtist = topArtists[i + 1]?.[1].name;
      const description = nextArtist ? `${data.name}, ${nextArtist} und mehr` : data.name;

      mixes.push({
        id: `artist-mix-${artistId}`,
        name: `Dein Mix ${i + 1}`,
        description,
        coverColor: MIX_COLORS[i] ?? MIX_COLORS[0],
        coverUrl: null,
        trackIds: mixIds,
      });
    }
  }

  // ── Neu entdeckt: tracks not yet played by this user
  const unplayedTracks = await prisma.track.findMany({
    where: { playHistory: { none: { userId } } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  if (unplayedTracks.length >= 5) {
    mixes.push({
      id: 'new-discovery',
      name: 'Neu entdeckt',
      description: 'Songs, die du noch nicht gehört hast',
      coverColor: '#0891b2',
      coverUrl: null,
      trackIds: shuffleArray(unplayedTracks.map(t => t.id)),
    });
  }

  return mixes;
}

// ─── "Für Dich" playlists ────────────────────────────────────────────────────

async function getForYouPlaylists(userId: string) {
  const playlists = await prisma.playlist.findMany({
    where: { userId },
    include: { _count: { select: { tracks: true } } },
    orderBy: [{ isPinned: 'desc' }, { lastPlayedAt: 'desc' }, { createdAt: 'desc' }],
    take: 8,
  });
  return playlists.map(p => ({
    id: p.id,
    name: p.name,
    coverUrl: p.coverUrl,
    trackCount: p._count.tracks,
    isPinned: p.isPinned,
  }));
}

// ─── New Additions ────────────────────────────────────────────────────────────

async function getNewAdditions() {
  const albums = await prisma.album.findMany({
    include: { artist: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  return albums.map(a => ({
    id: a.id,
    title: a.title,
    artist: a.artist.name,
    coverUrl: a.coverUrl,
    year: a.year,
  }));
}

// ─── New Podcast Episodes ─────────────────────────────────────────────────────

async function getNewPodcastEpisodes() {
  // Get all subscribed podcasts
  const podcasts = await prisma.podcast.findMany({
    select: {
      id: true,
      title: true,
      imageUrl: true,
      episodes: {
        orderBy: { publishedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          title: true,
          description: true,
          audioUrl: true,
          imageUrl: true,
          duration: true,
          publishedAt: true,
        },
      },
    },
  });

  // One latest episode per podcast, sorted by publishedAt
  return podcasts
    .flatMap(p =>
      p.episodes.map(ep => ({
        episodeId: ep.id,
        episodeTitle: ep.title,
        episodeDescription: ep.description,
        audioUrl: ep.audioUrl,
        episodeImageUrl: ep.imageUrl,
        duration: ep.duration,
        publishedAt: ep.publishedAt,
        podcastId: p.id,
        podcastTitle: p.title,
        podcastImageUrl: p.imageUrl,
      })),
    )
    .sort((a, b) =>
      (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, 10);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/summary', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const [recentlyPlayed, topArtists, autoPlaylists, forYouPlaylists, newAdditions, newPodcastEpisodes] =
      await Promise.all([
        getRecentlyPlayed(userId),
        getTopArtists(userId),
        getAutoPlaylists(userId),
        getForYouPlaylists(userId),
        getNewAdditions(),
        getNewPodcastEpisodes(),
      ]);

    res.json({ username: user?.username ?? '', recentlyPlayed, topArtists, autoPlaylists, forYouPlaylists, newAdditions, newPodcastEpisodes });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Resolve trackIds → full TrackWithRelations for playback */
router.post('/resolve-tracks', async (req, res) => {
  try {
    const { trackIds } = req.body as { trackIds?: string[] };
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      res.status(400).json({ error: 'trackIds array required' });
      return;
    }

    const tracks = await prisma.track.findMany({
      where: { id: { in: trackIds } },
      include: {
        artist: { select: { id: true, name: true } },
        album: { select: { id: true, title: true, coverUrl: true, year: true, label: true } },
      },
    });

    // Preserve requested order
    const map = new Map(tracks.map(t => [t.id, t]));
    const ordered = trackIds
      .map(id => map.get(id))
      .filter((t): t is NonNullable<typeof t> => t != null)
      .map(t => ({ ...t, fileSize: t.fileSize.toString() }));

    res.json({ data: ordered });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
