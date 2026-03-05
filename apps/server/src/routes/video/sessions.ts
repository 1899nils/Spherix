import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { getTranscodeJob, getHlsPlaylistPath } from '../../services/streaming/transcode.service.js';
import { getSystemStats, formatBytes, formatUptime } from '../../services/systemStats.service.js';
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

// Transcode queue item
interface TranscodeQueueItem {
  id: string;
  mediaId: string;
  mediaType: 'movie' | 'episode';
  mediaTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt: Date;
  estimatedCompletion?: Date;
}

// Session history (keep last 100)
interface SessionHistoryItem {
  id: string;
  userName: string;
  mediaTitle: string;
  mediaType: 'movie' | 'episode';
  device: string;
  startedAt: Date;
  endedAt: Date;
  duration: number; // how long it played
  decision: 'direct' | 'transcode';
}

const activeSessions = new Map<string, StreamSession>();
const transcodeQueue: TranscodeQueueItem[] = [];
const sessionHistory: SessionHistoryItem[] = [];
const MAX_HISTORY = 100;

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
 * End a streaming session and add to history
 */
export function endSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  
  // Add to history
  const historyItem: SessionHistoryItem = {
    id: sessionId,
    userName: session.userName,
    mediaTitle: session.mediaTitle,
    mediaType: session.mediaType,
    device: session.device,
    startedAt: session.startedAt,
    endedAt: new Date(),
    duration: session.position,
    decision: session.transcodeInfo?.videoDecision === 'transcode' ? 'transcode' : 'direct',
  };
  
  sessionHistory.unshift(historyItem);
  if (sessionHistory.length > MAX_HISTORY) {
    sessionHistory.pop();
  }
  
  logger.info(`Ending streaming session: ${sessionId}`);
  activeSessions.delete(sessionId);
  return true;
}

/**
 * Add transcode job to queue
 */
export function addTranscodeQueue(item: Omit<TranscodeQueueItem, 'startedAt'>): void {
  transcodeQueue.push({
    ...item,
    startedAt: new Date(),
  });
}

/**
 * Update transcode queue item
 */
export function updateTranscodeQueue(id: string, updates: Partial<TranscodeQueueItem>): boolean {
  const item = transcodeQueue.find(q => q.id === id);
  if (!item) return false;
  
  Object.assign(item, updates);
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
 * Get all active streaming sessions with system stats
 */
router.get('/', async (req, res) => {
  try {
    const [sessions, systemStats] = await Promise.all([
      Promise.resolve(getActiveSessions()),
      getSystemStats().catch(() => null),
    ]);
    
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
    
    // Get transcode queue
    const activeQueue = transcodeQueue.filter(q => q.status === 'pending' || q.status === 'processing');
    
    res.json({ 
      data: {
        sessions: enhancedSessions,
        count: enhancedSessions.length,
        system: systemStats ? {
          cpu: {
            load: systemStats.cpu.load,
            cores: systemStats.cpu.cores,
          },
          memory: {
            used: formatBytes(systemStats.memory.used),
            total: formatBytes(systemStats.memory.total),
            percentage: systemStats.memory.percentage,
          },
          uptime: formatUptime(systemStats.uptime),
        } : null,
        transcodeQueue: activeQueue.map(q => ({
          id: q.id,
          mediaTitle: q.mediaTitle,
          status: q.status,
          progress: q.progress,
        })),
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
 * GET /api/video/sessions/history
 * Get session history
 */
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const history = sessionHistory.slice(0, limit);
    
    res.json({ 
      data: {
        history,
        total: sessionHistory.length,
      }
    });
  } catch (error) {
    logger.error('Failed to get session history', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/video/sessions/system
 * Get detailed system stats
 */
router.get('/system', async (req, res) => {
  try {
    const stats = await getSystemStats();
    
    res.json({
      data: {
        cpu: {
          load: stats.cpu.load,
          loadHistory: stats.cpu.loadHistory,
          cores: stats.cpu.cores,
        },
        memory: {
          used: formatBytes(stats.memory.used),
          total: formatBytes(stats.memory.total),
          free: formatBytes(stats.memory.free),
          percentage: stats.memory.percentage,
        },
        disk: {
          used: formatBytes(stats.disk.used),
          total: formatBytes(stats.disk.total),
          free: formatBytes(stats.disk.free),
          percentage: stats.disk.percentage,
        },
        network: {
          rxSec: formatBytes(stats.network.rxSec) + '/s',
          txSec: formatBytes(stats.network.txSec) + '/s',
        },
        uptime: formatUptime(stats.uptime),
      }
    });
  } catch (error) {
    logger.error('Failed to get system stats', { error });
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
export { activeSessions, sessionHistory, transcodeQueue, StreamSession };
