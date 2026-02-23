import { Router } from 'express';
import {
  searchRelease,
  getReleaseById,
  searchArtist,
  getArtistById,
  searchRecording,
  getCoverArtUrl,
  matchAlbum,
} from '../services/musicbrainz/index.js';

const router: Router = Router();

// ─── Release (Album) search & lookup ────────────────────────────────────────

router.get('/releases', async (req, res, next) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const data = await searchRelease(query, limit, offset);
    res.json({ data: data.releases, total: data.count, offset: data.offset });
  } catch (error) {
    next(error);
  }
});

router.get('/releases/:mbid', async (req, res, next) => {
  try {
    const release = await getReleaseById(req.params.mbid);
    const coverUrl = await getCoverArtUrl(req.params.mbid);
    res.json({ data: { ...release, coverArtUrl: coverUrl } });
  } catch (error) {
    next(error);
  }
});

// ─── Artist search & lookup ─────────────────────────────────────────────────

router.get('/artists', async (req, res, next) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const data = await searchArtist(query, limit, offset);
    res.json({ data: data.artists, total: data.count, offset: data.offset });
  } catch (error) {
    next(error);
  }
});

router.get('/artists/:mbid', async (req, res, next) => {
  try {
    const artist = await getArtistById(req.params.mbid);
    res.json({ data: artist });
  } catch (error) {
    next(error);
  }
});

// ─── Recording (Track) search ───────────────────────────────────────────────

router.get('/recordings', async (req, res, next) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const data = await searchRecording(query, limit, offset);
    res.json({ data: data.recordings, total: data.count, offset: data.offset });
  } catch (error) {
    next(error);
  }
});

// ─── Cover Art ──────────────────────────────────────────────────────────────

router.get('/cover/:mbid', async (req, res, next) => {
  try {
    const url = await getCoverArtUrl(req.params.mbid);
    if (!url) {
      res.status(404).json({ error: 'No cover art found for this release' });
      return;
    }
    res.json({ data: { url } });
  } catch (error) {
    next(error);
  }
});

// ─── Album Matching ─────────────────────────────────────────────────────────

router.post('/match', async (req, res, next) => {
  try {
    const { title, artistName, year, trackCount } = req.body;
    if (!title || !artistName) {
      res.status(400).json({ error: '"title" and "artistName" are required' });
      return;
    }
    const result = await matchAlbum({
      title,
      artistName,
      year: year ?? null,
      trackCount: trackCount ?? null,
    });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
