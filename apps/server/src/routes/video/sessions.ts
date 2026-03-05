import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { getTranscodeJob } from '../../services/streaming/transcode.service.js';
import { logger } from '../../config/logger.js';

const router: Router = Router();

// In-memory store for active streaming sessions
interface StreamSession {
  id: string;
  userId: string;
  userName: string;
  mediaType: 'movie' | 'episode';
  mediaId: string;
  mediaTitle: string;
  mediaPoster?: string | null;
  device: string;
  browser: string;
  ip: string;
  state: 'playing' | 'paused' | 'buffering';
  position: number;
  duration: number;
  quality: {
    video: string;
    audio: string;
  };
  transcodeInfo?: {
    transcodeJobId?: string;
    videoDecision: 'direct' | 'transcode' | 'copy';
    audioDecision: 'direct' | 'transcode' | 'copy';
    videoCodec: string;
    audioCodec: string;
    bandwidth: number;
  };
  startedAt: Date;
  lastActivity: Date;
}

const activeSessions = new Map<string, StreamSession>();

/**
 * Generate unique session ID
 */
export function createSessionId(userId: string, mediaId: string): string {
  return `${userId}_${mediaId}_${Date.now()}`;
}

/**
 * Register a new streaming session
 */
export function registerSession(session: Omit<StreamSession, 'id' | 'startedAt' | 'lastActivity'>): string {
  const id = createSessionId(session.userId, session.mediaId);
  
  activeSessions.set(id, {
    ...session,
    id,
    startedAt: new Date(),
    lastActivity: new Date(),
  });
  
  logger.info(`New streaming session: ${id} - ${session.mediaTitle} on ${session.device}`);
  return id;
}

/**
 * Update session state
 */
export function updateSession(sessionId: string, updates: Partial<StreamSession>): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  
  Object.assign(session, updates, { lastActivity: new Date() });
  return true;
}

/**
 * End a streaming session
 */
export function endSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  
  logger.info(`Ending streaming session: ${sessionId}`);
  activeSessions.delete(sessionId);
  return true;
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): StreamSession[] {
  const now = Date.now();
  const sessions: StreamSession[] = [];
  
  for (const [id, session] of activeSessions.entries()) {
    // Remove stale sessions (no activity for 5 minutes)
    if (now - session.lastActivity.getTime() > 5 * 60 * 1000) {
      activeSessions.delete(id);
      continue;
    }
    sessions.push(session);
  }
  
  return sessions;
}

/**
 * GET /api/video/sessions
 * Get all active streaming sessions
 */
router.get('/', async (req, res) => {
  try {
    const sessions = getActiveSessions();
    
    // Enhance with transcode progress if applicable
    const enhancedSessions = sessions.map(session => {
      if (session.transcodeInfo?.transcodeJobId) {
        const job = getTranscodeJob(session.transcodeInfo.transcodeJobId);
        if (job) {
          return {
            ...session,
            transcodeProgress: job.progress,
            transcodeStatus: job.status,
          };
        }
      }
      return session;
    });
    
    res.json({ 
      data: {
        sessions: enhancedSessions,
        count: enhancedSessions.length,
      }
    });
  } catch (error) {
    logger.error('Failed to get sessions', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/video/sessions/stats
 * Get streaming statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const sessions = getActiveSessions();
    
    const stats = {
      totalSessions: sessions.length,
      directPlayCount: sessions.filter(s => 
        s.transcodeInfo?.videoDecision === 'direct' && 
        s.transcodeInfo?.audioDecision === 'direct'
      ).length,
      transcodeCount: sessions.filter(s => 
        s.transcodeInfo?.videoDecision === 'transcode' || 
        s.transcodeInfo?.audioDecision === 'transcode'
      ).length,
      totalBandwidth: sessions.reduce((sum, s) => sum + (s.transcodeInfo?.bandwidth || 0), 0),
      byDevice: sessions.reduce((acc, s) => {
        acc[s.device] = (acc[s.device] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
    
    res.json({ data: stats });
  } catch (error) {
    logger.error('Failed to get session stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/video/sessions/:id/kill
 * Kill a streaming session (admin only)
 */
router.post('/:id/kill', async (req, res) => {
  try {
    const { id } = req.params;
    
    // TODO: Add admin check
    const success = endSession(id);
    
    if (!success) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    res.json({ data: { success: true } });
  } catch (error) {
    logger.error(`Failed to kill session ${req.params.id}`, { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
export { activeSessions, StreamSession };
