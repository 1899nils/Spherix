import si from 'systeminformation';
import { logger } from '../config/logger.js';

export interface SystemStats {
  timestamp: number;
  cpu: {
    load: number; // 0-100
    loadHistory: number[]; // Last 10 readings
    temperature?: number;
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
 * Get current system statistics
 */
export async function getSystemStats(): Promise<SystemStats> {
  try {
    const [cpu, mem, disk, network, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.time(),
    ]);

    // Update CPU history
    cpuLoadHistory.push(cpu.currentLoad);
    if (cpuLoadHistory.length > MAX_HISTORY) {
      cpuLoadHistory.shift();
    }

    // Get main disk (where data is stored)
    const mainDisk = disk.find(d => d.fs === '/') || disk[0] || {
      size: 0,
      used: 0,
      available: 0,
      use: 0,
    };

    // Network stats (first interface or aggregate)
    const net = Array.isArray(network) ? network[0] : network;

    return {
      timestamp: Date.now(),
      cpu: {
        load: Math.round(cpu.currentLoad),
        loadHistory: [...cpuLoadHistory],
        cores: cpu.cpus.length,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        percentage: Math.round((mem.used / mem.total) * 100),
      },
      disk: {
        total: mainDisk.size,
        used: mainDisk.used,
        free: mainDisk.available,
        percentage: Math.round(mainDisk.use),
      },
      network: {
        rxSec: net.rx_sec || 0,
        txSec: net.tx_sec || 0,
        rxTotal: net.rx_bytes || 0,
        txTotal: net.tx_bytes || 0,
      },
      uptime: time.uptime,
    };
  } catch (error) {
    logger.error('Failed to get system stats', { error });
    throw error;
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
