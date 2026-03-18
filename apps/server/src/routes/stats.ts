import { Router } from 'express';
import { prisma } from '../config/database.js';

const router: Router = Router();

// ── GET /api/stats ────────────────────────────────────────────────────────────
// Returns library statistics for the authenticated user.

router.get('/', async (req, res, next) => {
  try {
    const userId = (req.session as unknown as Record<string, unknown>).userId as string;

    const [
      trackCount,
      albumCount,
      artistCount,
      playlistCount,
      movieCount,
      seriesCount,
      audiobookCount,
      podcastCount,
      topArtists,
      topAlbums,
      recentPlays,
      playHistoryByDay,
    ] = await Promise.all([
      prisma.track.count(),
      prisma.album.count(),
      prisma.artist.count(),
      prisma.playlist.count({ where: { userId } }),
      prisma.movie.count(),
      prisma.series.count(),
      prisma.audiobook.count(),
      prisma.podcast.count(),

      // Top 5 most played artists for this user
      prisma.playHistory.groupBy({
        by: ['trackId'],
        where: { userId },
        _count: { trackId: true },
        orderBy: { _count: { trackId: 'desc' } },
        take: 50,
      }).then(async (rows) => {
        const trackIds = rows.map((r) => r.trackId);
        const tracks = await prisma.track.findMany({
          where: { id: { in: trackIds } },
          select: {
            id: true,
            album: {
              select: {
                artist: { select: { id: true, name: true, imageUrl: true } },
              },
            },
          },
        });

        const artistCounts = new Map<string, { id: string; name: string; imageUrl: string | null; plays: number }>();
        for (const row of rows) {
          const track = tracks.find((t) => t.id === row.trackId);
          const artist = track?.album?.artist;
          if (!artist) continue;
          const existing = artistCounts.get(artist.id);
          if (existing) {
            existing.plays += row._count.trackId;
          } else {
            artistCounts.set(artist.id, { ...artist, plays: row._count.trackId });
          }
        }

        return Array.from(artistCounts.values())
          .sort((a, b) => b.plays - a.plays)
          .slice(0, 5);
      }),

      // Top 5 most played albums for this user
      prisma.playHistory.groupBy({
        by: ['trackId'],
        where: { userId },
        _count: { trackId: true },
        orderBy: { _count: { trackId: 'desc' } },
        take: 50,
      }).then(async (rows) => {
        const trackIds = rows.map((r) => r.trackId);
        const tracks = await prisma.track.findMany({
          where: { id: { in: trackIds } },
          select: {
            id: true,
            album: { select: { id: true, title: true, coverUrl: true, artist: { select: { name: true } } } },
          },
        });

        const albumCounts = new Map<string, { id: string; title: string; coverUrl: string | null; artist: string; plays: number }>();
        for (const row of rows) {
          const track = tracks.find((t) => t.id === row.trackId);
          const album = track?.album;
          if (!album) continue;
          const existing = albumCounts.get(album.id);
          if (existing) {
            existing.plays += row._count.trackId;
          } else {
            albumCounts.set(album.id, {
              id: album.id,
              title: album.title,
              coverUrl: album.coverUrl,
              artist: album.artist?.name ?? 'Unbekannt',
              plays: row._count.trackId,
            });
          }
        }

        return Array.from(albumCounts.values())
          .sort((a, b) => b.plays - a.plays)
          .slice(0, 5);
      }),

      // Last 10 played tracks
      prisma.playHistory.findMany({
        where: { userId },
        orderBy: { playedAt: 'desc' },
        take: 10,
        select: {
          playedAt: true,
          track: {
            select: {
              id: true,
              title: true,
              duration: true,
              album: {
                select: {
                  id: true,
                  title: true,
                  coverUrl: true,
                  artist: { select: { name: true } },
                },
              },
            },
          },
        },
      }),

      // Play counts per day for the last 30 days
      prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT
          DATE_TRUNC('day', "playedAt") AS day,
          CAST(COUNT(*) AS INTEGER) AS count
        FROM "PlayHistory"
        WHERE "userId" = ${userId}
          AND "playedAt" >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', "playedAt")
        ORDER BY day ASC
      `,
    ]);

    res.json({
      data: {
        library: {
          tracks: trackCount,
          albums: albumCount,
          artists: artistCount,
          playlists: playlistCount,
          movies: movieCount,
          series: seriesCount,
          audiobooks: audiobookCount,
          podcasts: podcastCount,
        },
        topArtists,
        topAlbums,
        recentPlays: recentPlays.map((p) => ({
          playedAt: p.playedAt.toISOString(),
          track: p.track,
        })),
        playHistoryByDay: playHistoryByDay.map((r) => ({
          day: new Date(r.day).toISOString().split('T')[0],
          count: r.count,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
