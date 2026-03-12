import { Router } from 'express';
import { XMLParser } from 'fast-xml-parser';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

const router: Router = Router();

// ─── RSS parser (fast-xml-parser) ────────────────────────────────────────────

/** Parse HH:MM:SS or MM:SS or raw seconds → integer seconds */
function parseDuration(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) {
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  }
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  cdataPropName: '__cdata',
  // Keep array for these tags so single-item feeds still work
  isArray: (name) => name === 'item',
});

function parseRssFeed(xml: string): { channel: ParsedChannel; episodes: ParsedEpisode[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try {
    doc = xmlParser.parse(xml);
  } catch (e) {
    logger.warn('RSS XML parse error, falling back to empty result:', e);
    return { channel: { title: 'Unknown Podcast', author: null, description: null, imageUrl: null, websiteUrl: null }, episodes: [] };
  }

  const channel = doc?.rss?.channel ?? doc?.feed ?? {};

  // Helper: resolve CDATA or plain text nodes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (node: any): string | null => {
    if (!node) return null;
    if (typeof node === 'string' || typeof node === 'number') return String(node).trim() || null;
    if (node.__cdata) return String(node.__cdata).trim() || null;
    if (typeof node === 'object' && '#text' in node) return String(node['#text']).trim() || null;
    return null;
  };

  // Channel metadata
  const title = text(channel.title) ?? 'Unknown Podcast';
  const author = text(channel['itunes:author']) ?? text(channel.author) ?? text(channel['author']) ?? null;
  const description = text(channel['itunes:summary']) ?? text(channel.description) ?? null;

  // Link: may be a string, object with #text, or array
  let websiteUrl: string | null = null;
  if (Array.isArray(channel.link)) {
    websiteUrl = str(channel.link.find((l: unknown) => typeof l === 'string')) ?? null;
  } else {
    websiteUrl = text(channel.link);
  }

  // Image URL: prefer <itunes:image href="...">, then <image><url>
  const itunesImageNode = channel['itunes:image'];
  const imageUrl =
    str(itunesImageNode?.['@_href']) ??
    text(channel.image?.url) ??
    null;

  // Episodes
  const rawItems: unknown[] = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
  const episodes: ParsedEpisode[] = [];

  for (const raw of rawItems) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = raw as any;

    // Audio URL from <enclosure url="...">
    const enclosure = item.enclosure;
    const audioUrl =
      str(enclosure?.['@_url']) ??
      str(Array.isArray(enclosure) ? enclosure[0]?.['@_url'] : null);
    if (!audioUrl) continue;

    const rawGuid = text(item.guid) ?? audioUrl;
    const episodeTitle = text(item.title) ?? 'Untitled Episode';
    const desc = text(item['itunes:summary']) ?? text(item['content:encoded']) ?? text(item.description) ?? null;

    const epImageNode = item['itunes:image'];
    const epImage = str(epImageNode?.['@_href']) ?? null;

    const duration = parseDuration(text(item['itunes:duration']));

    const rawLength = str(enclosure?.['@_length'] ?? (Array.isArray(enclosure) ? enclosure[0]?.['@_length'] : null));
    const fileSizeNum = rawLength ? parseInt(rawLength, 10) : 0;
    const fileSize = fileSizeNum > 0 ? BigInt(fileSizeNum) : null;

    const rawDate = text(item.pubDate) ?? text(item.published);
    const publishedAt = rawDate ? new Date(rawDate) : null;

    episodes.push({
      guid: rawGuid,
      title: episodeTitle,
      description: desc,
      audioUrl,
      imageUrl: epImage,
      duration,
      fileSize,
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
    });
  }

  return { channel: { title, author, description, imageUrl, websiteUrl }, episodes };
}

async function fetchAndParseFeed(feedUrl: string): Promise<{ channel: ParsedChannel; episodes: ParsedEpisode[] }> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Spherix/1.0 Podcast Client' },
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();
  return parseRssFeed(xml);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** List all subscribed podcasts */
router.get('/', async (_req, res, next) => {
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
          listenProgress: e.listenProgress ?? null,
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

/** Proxy podcast audio stream to avoid mixed-content and CORS issues */
router.get('/proxy', async (req, res, next) => {
  try {
    const url = req.query.url as string;
    if (!url || !/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: 'Valid "url" query parameter is required' });
      return;
    }

    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Spherix/1.0 Podcast Client',
        ...(req.headers.range ? { Range: req.headers.range as string } : {}),
      },
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
      return;
    }

    // Forward relevant headers
    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    for (const h of forwardHeaders) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.status(upstream.status);

    if (!upstream.body) {
      res.end();
      return;
    }

    // Stream the body
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        const canContinue = res.write(value);
        if (!canContinue) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
    };
    pump().catch((err) => {
      logger.error('Podcast proxy stream error:', err);
      if (!res.headersSent) next(err);
      else res.end();
    });
  } catch (error) {
    next(error);
  }
});

/** Save playback progress for a podcast episode */
router.post('/episodes/:episodeId/progress', async (req, res, next) => {
  try {
    const { position } = req.body as { position: number };

    if (typeof position !== 'number' || position < 0) {
      res.status(400).json({ error: 'position must be a non-negative number (seconds)' });
      return;
    }

    const episode = await prisma.podcastEpisode.findUnique({
      where: { id: req.params.episodeId },
      select: { id: true },
    });
    if (!episode) { res.status(404).json({ error: 'Episode not found' }); return; }

    await prisma.podcastEpisode.update({
      where: { id: req.params.episodeId },
      data: { listenProgress: Math.floor(position) },
    });

    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
