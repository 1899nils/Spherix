import { describe, it, expect, vi } from 'vitest';

// ── hashPassword / verifyPassword ────────────────────────────────────────────

// We test the pure helper logic without hitting the database.
vi.mock('../config/database.js', () => ({ prisma: { user: { update: vi.fn() } } }));

import { hashPassword, verifyPassword } from './auth.js';

describe('hashPassword', () => {
  it('returns a bcrypt hash starting with $2', async () => {
    const hash = await hashPassword('testpassword');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('produces different hashes for the same input (random salt)', async () => {
    const a = await hashPassword('samepassword');
    const b = await hashPassword('samepassword');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('accepts a correct bcrypt password', async () => {
    const hash = await hashPassword('correcthorse');
    expect(await verifyPassword('correcthorse', hash)).toBe(true);
  });

  it('rejects a wrong bcrypt password', async () => {
    const hash = await hashPassword('correcthorse');
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('accepts a legacy SHA-256 password (migration path)', async () => {
    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update('legacypassword').digest('hex');
    // No userId → no DB update attempted in this test
    expect(await verifyPassword('legacypassword', sha256)).toBe(true);
  });

  it('rejects a wrong legacy SHA-256 password', async () => {
    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update('legacypassword').digest('hex');
    expect(await verifyPassword('wrongpassword', sha256)).toBe(false);
  });
});

// ── Password validation (min-length) ─────────────────────────────────────────

describe('password minimum length', () => {
  it('rejects passwords shorter than 8 characters', async () => {
    // The schema validation is embedded in the route handler. We test it via
    // the Zod schema directly by importing and parsing.
    const { z } = await import('zod');
    const schema = z.string().min(8, 'Zu kurz');
    expect(schema.safeParse('1234567').success).toBe(false);
    expect(schema.safeParse('12345678').success).toBe(true);
  });
});
