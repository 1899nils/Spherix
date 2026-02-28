import { Router } from 'express';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

const router: Router = Router();

// ─── Minimal RSS parser ──────────────────────────────────────────────────────

/** Extract text from a simple XML tag (handles CDATA) */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*?))<\\/${tag}>`,
    'i',
  );
  const m = xml.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? '').trim() || null;
}

/** Extract an attribute value from a self-closing or open tag */
function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  return xml.match(re)?.[1]?.trim() || null;
}

/** Parse HH:MM:SS or MM:SS or raw seconds → integer seconds */
function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const parts = raw.trim().split(':').map(Number);
  if (parts.some(isNaN)) {
    const s = parseInt(raw, 10);
    return isNaN(s) ? null : s;
  }
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? null;
}

interface ParsedChannel {
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
}

interface ParsedEpisode {
  guid: string;
  title: string;
  description: string | null;
  audioUrl: string;
  imageUrl: string | null;
  duration: number | null;
  fileSize: bigint | null;
  publishedAt: Date | null;
}

function parseRssFeed(xml: string): { channel: ParsedChannel; episodes: ParsedEpisode[] } {
  // Strip XML declaration / namespaces that could confuse simple regex
  const clean = xml.replace(/\r\n/g, '\n');

  // Channel-level info (everything before first <item>)
  const channelPart = clean.split(/<item[\s>]/i)[0] ?? clean;

  const title = extractTag(channelPart, 'title') ?? 'Unknown Podcast';
  const author =
    extractTag(channelPart, 'itunes:author') ??
    extractTag(channelPart, 'author') ??
    null;
  const description =
    extractTag(channelPart, 'itunes:summary') ??
    extractTag(channelPart, 'description') ??
    null;
  const websiteUrl = extractTag(channelPart, 'link') ?? null;

  // Image: <itunes:image href="..."> preferred, then <image><url>...
  const imageUrl =
    extractAttr(channelPart, 'itunes:image', 'href') ??
    extractTag(channelPart, 'url') ??
    null;

  // Items
  const itemMatches = [...clean.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)];
  const episodes: ParsedEpisode[] = [];

  for (const match of itemMatches) {
    const item = match[1];
    if (!item) continue;

    const audioUrl = extractAttr(item, 'enclosure', 'url');
    if (!audioUrl) continue; // must have audio

    const rawGuid = extractTag(item, 'guid') ?? audioUrl;
    const episodeTitle = extractTag(item, 'title') ?? 'Untitled Episode';
    const desc =
      extractTag(item, 'itunes:summary') ??
      extractTag(item, 'description') ??
      null;
    const epImage = extractAttr(item, 'itunes:image', 'href') ?? null;

    const rawDuration = extractTag(item, 'itunes:duration');
    const duration = parseDuration(rawDuration);

    const rawLength = extractAttr(item, 'enclosure', 'length');
    const fileSize = rawLength ? BigInt(parseInt(rawLength, 10) || 0) : null;

    const rawDate = extractTag(item, 'pubDate');
    const publishedAt = rawDate ? new Date(rawDate) : null;

    episodes.push({
      guid: rawGuid,
      title: episodeTitle,
      description: desc,
      audioUrl,
      imageUrl: epImage,
      duration,
      fileSize: fileSize && fileSize > 0n ? fileSize : null,
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
    });
  }

  return {
    channel: { title, author, description, imageUrl, websiteUrl },
    episodes,
  };
}

async function fetchAndParseFeed(feedUrl: string): Promise<{ channel: ParsedChannel; episodes: ParsedEpisode[] }> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Spherix/1.0 Podcast Client' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();
  return parseRssFeed(xml);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** List all subscribed podcasts */
router.get('/', async (req, res, next) => {
  try {
    const podcasts = await prisma.podcast.findMany({
      orderBy: { subscribedAt: 'desc' },
      include: { _count: { select: { episodes: true } } },
    });

    res.json({
      data: podcasts.map((p) => ({
        id: p.id,
        title: p.title,
        author: p.author,
        description: p.description,
        imageUrl: p.imageUrl,
        feedUrl: p.feedUrl,
        websiteUrl: p.websiteUrl,
        itunesId: p.itunesId,
        lastFetchedAt: p.lastFetchedAt?.toISOString() ?? null,
        subscribedAt: p.subscribedAt.toISOString(),
        episodeCount: p._count.episodes,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/** Search iTunes Podcast directory */
router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const url = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(q)}&limit=20&entity=podcast`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`iTunes API error: ${r.status}`);

    const json = await r.json() as { results: Record<string, unknown>[] };
    res.json({ data: json.results ?? [] });
  } catch (error) {
    next(error);
  }
});

/** Get podcast detail with episodes */
router.get('/:id', async (req, res, next) => {
  try {
    const podcast = await prisma.podcast.findUnique({
      where: { id: String(req.params.id) },
      include: {
        _count: { select: { episodes: true } },
        episodes: {
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!podcast) {
      res.status(404).json({ error: 'Podcast not found' });
      return;
    }

    res.json({
      data: {
        id: podcast.id,
        title: podcast.title,
        author: podcast.author,
        description: podcast.description,
        imageUrl: podcast.imageUrl,
        feedUrl: podcast.feedUrl,
        websiteUrl: podcast.websiteUrl,
        itunesId: podcast.itunesId,
        lastFetchedAt: podcast.lastFetchedAt?.toISOString() ?? null,
        subscribedAt: podcast.subscribedAt.toISOString(),
        episodeCount: podcast._count.episodes,
        episodes: podcast.episodes.map((e) => ({
          id: e.id,
          podcastId: e.podcastId,
          guid: e.guid,
          title: e.title,
          description: e.description,
          audioUrl: e.audioUrl,
          imageUrl: e.imageUrl,
          duration: e.duration,
          fileSize: e.fileSize?.toString() ?? null,
          publishedAt: e.publishedAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/** Subscribe to a podcast by feedUrl */
router.post('/subscribe', async (req, res, next) => {
  try {
    const { feedUrl, itunesId } = req.body as { feedUrl?: string; itunesId?: string };
    if (!feedUrl) {
      res.status(400).json({ error: '"feedUrl" is required' });
      return;
    }

    // Already subscribed?
    const existing = await prisma.podcast.findUnique({ where: { feedUrl } });
    if (existing) {
      res.status(409).json({ error: 'Bereits abonniert', podcastId: existing.id });
      return;
    }

    // Fetch and parse RSS feed
    const { channel, episodes } = await fetchAndParseFeed(feedUrl);

    const podcast = await prisma.podcast.create({
      data: {
        title: channel.title,
        author: channel.author,
        description: channel.description,
        imageUrl: channel.imageUrl,
        feedUrl,
        websiteUrl: channel.websiteUrl,
        itunesId: itunesId ?? null,
        lastFetchedAt: new Date(),
        episodes: {
          createMany: {
            data: episodes.map((e) => ({
              guid: e.guid,
              title: e.title,
              description: e.description,
              audioUrl: e.audioUrl,
              imageUrl: e.imageUrl,
              duration: e.duration,
              fileSize: e.fileSize,
              publishedAt: e.publishedAt,
            })),
            skipDuplicates: true,
          },
        },
      },
    });

    logger.info(`Subscribed to podcast: ${channel.title} (${episodes.length} episodes)`);
    res.status(201).json({ data: { id: podcast.id, title: podcast.title } });
  } catch (error) {
    next(error);
  }
});

/** Refresh feed: fetch latest episodes */
router.post('/:id/refresh', async (req, res, next) => {
  try {
    const podcast = await prisma.podcast.findUnique({ where: { id: String(req.params.id) } });
    if (!podcast) {
      res.status(404).json({ error: 'Podcast not found' });
      return;
    }

    const { channel, episodes } = await fetchAndParseFeed(podcast.feedUrl);

    // Upsert episodes by guid
    let newCount = 0;
    for (const ep of episodes) {
      const result = await prisma.podcastEpisode.upsert({
        where: { podcastId_guid: { podcastId: podcast.id, guid: ep.guid } },
        update: {
          title: ep.title,
          description: ep.description,
          audioUrl: ep.audioUrl,
          imageUrl: ep.imageUrl,
          duration: ep.duration,
          fileSize: ep.fileSize,
          publishedAt: ep.publishedAt,
        },
        create: {
          podcastId: podcast.id,
          guid: ep.guid,
          title: ep.title,
          description: ep.description,
          audioUrl: ep.audioUrl,
          imageUrl: ep.imageUrl,
          duration: ep.duration,
          fileSize: ep.fileSize,
          publishedAt: ep.publishedAt,
        },
      });
      if (result) newCount++;
    }

    await prisma.podcast.update({
      where: { id: podcast.id },
      data: {
        title: channel.title,
        author: channel.author,
        description: channel.description,
        imageUrl: channel.imageUrl ?? podcast.imageUrl,
        lastFetchedAt: new Date(),
      },
    });

    res.json({ data: { episodeCount: episodes.length, message: 'Feed aktualisiert' } });
  } catch (error) {
    next(error);
  }
});

/** Unsubscribe (delete podcast + all episodes via cascade) */
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.podcast.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
