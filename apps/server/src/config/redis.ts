import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.redisUrl);

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});
