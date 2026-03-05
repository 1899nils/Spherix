import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface SystemStats {
  timestamp: number;
  cpu: {
    load: number; // 0-100
    loadHistory: number[]; // Last 10 readings
    cores: number;
  };
  memory: {
    total: number; // bytes
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    rxSec: number; // bytes/sec
    txSec: number;
    rxTotal: number;
    txTotal: number;
  };
  uptime: number; // seconds
}

// Keep history of CPU load
const cpuLoadHistory: number[] = [];
const MAX_HISTORY = 20;

/**
 * Get current system statistics using Node.js built-ins
 */
export async function getSystemStats(): Promise<SystemStats> {
  try {
    // CPU Load (1 minute average)
    const cpuLoad = os.loadavg()[0]; // 1 minute load average
    const cpuCount = os.cpus().length;
    const cpuPercentage = Math.min(100, Math.round((cpuLoad / cpuCount) * 100));
    
    // Update CPU history
    cpuLoadHistory.push(cpuPercentage);
    if (cpuLoadHistory.length > MAX_HISTORY) {
      cpuLoadHistory.shift();
    }

    // Memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Disk usage (try df command, fallback to zeros)
    let diskStats = { total: 0, used: 0, free: 0, percentage: 0 };
    try {
      const { stdout } = await execAsync('df -k . | tail -1');
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1]) * 1024; // Convert KB to bytes
        const used = parseInt(parts[2]) * 1024;
        const free = parseInt(parts[3]) * 1024;
        diskStats = {
          total,
          used,
          free,
          percentage: Math.round((used / total) * 100),
        };
      }
    } catch {
      // Fallback: use dummy values
      diskStats = { total: 1, used: 0, free: 1, percentage: 0 };
    }

    // Network stats (placeholder - would need platform-specific implementation)
    const networkStats = {
      rxSec: 0,
      txSec: 0,
      rxTotal: 0,
      txTotal: 0,
    };

    return {
      timestamp: Date.now(),
      cpu: {
        load: cpuPercentage,
        loadHistory: [...cpuLoadHistory],
        cores: cpuCount,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: Math.round((usedMem / totalMem) * 100),
      },
      disk: diskStats,
      network: networkStats,
      uptime: os.uptime(),
    };
  } catch (error) {
    logger.error('Failed to get system stats', { error });
    // Return default values on error
    return {
      timestamp: Date.now(),
      cpu: { load: 0, loadHistory: [], cores: os.cpus().length },
      memory: { total: 1, used: 0, free: 1, percentage: 0 },
      disk: { total: 1, used: 0, free: 1, percentage: 0 },
      network: { rxSec: 0, txSec: 0, rxTotal: 0, txTotal: 0 },
      uptime: os.uptime(),
    };
  }
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format uptime to human readable
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
