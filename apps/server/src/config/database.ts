import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient();

export async function connectDatabase(retries = 10, delayMs = 2000): Promise<void> {
  if (!env.databaseUrl) {
    console.error('DATABASE_URL is not set in environment variables');
    process.exit(1);
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$connect();
      console.log('Connected to PostgreSQL');
      return;
    } catch (error) {
      if (attempt === retries) {
        console.error(`Database connection failed after ${retries} attempts:`, error);
        process.exit(1);
      }
      console.warn(`Database connection attempt ${attempt}/${retries} failed, retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
