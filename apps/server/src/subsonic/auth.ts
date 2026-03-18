import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database.js';
import { sendError, SubsonicError } from './response.js';

/**
 * Extend Express Request with the authenticated Subsonic user.
 */
export interface SubsonicUser {
  id: string;
  username: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      subsonicUser?: SubsonicUser;
    }
  }
}

/**
 * Verify a plain-text password against the stored hash.
 * Supports bcrypt (current) and legacy SHA-256 hashes.
 */
async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  // Bcrypt hash — proper comparison
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(plainPassword, storedHash);
  }

  // Legacy SHA-256 hash (64-char hex)
  const sha256 = crypto.createHash('sha256').update(plainPassword).digest('hex');
  return sha256 === storedHash;
}

/**
 * Subsonic API authentication middleware.
 *
 * Supports:
 * - Plain password: u=user&p=password
 * - Hex-encoded password: u=user&p=enc:hexstring
 * - Token+salt auth: u=user&t=token&s=salt (token = md5(password + salt))
 *
 * Note: Token+salt auth (MD5) is only supported for legacy SHA-256 stored passwords
 * because bcrypt is not reversible and cannot be used to recompute md5(password+salt).
 * Clients using token auth need to re-authenticate after a password rehash.
 */
export async function subsonicAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Parameters can be in query string or body (POST)
  const params = { ...req.query, ...req.body } as Record<string, string>;

  const username = params.u;
  const password = params.p;
  const token = params.t;
  const salt = params.s;

  if (!username) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "u" is missing');
    return;
  }

  // Look up user
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, isAdmin: true, passwordHash: true },
  });

  if (!user) {
    sendError(req, res, SubsonicError.WRONG_CREDENTIALS, 'Wrong username or password');
    return;
  }

  let authenticated = false;

  if (password) {
    // Plain or hex-encoded password
    let plainPassword = password;
    if (password.startsWith('enc:')) {
      plainPassword = Buffer.from(password.slice(4), 'hex').toString('utf-8');
    }
    authenticated = await verifyPassword(plainPassword, user.passwordHash);
  } else if (token && salt) {
    // Token-based auth: token = md5(password + salt)
    // Only supported for legacy SHA-256 stored hashes.
    // For bcrypt-stored passwords this auth method cannot be used — clients must use plain password.
    if (!user.passwordHash.startsWith('$2')) {
      const expectedToken = crypto
        .createHash('md5')
        .update(user.passwordHash + salt)
        .digest('hex');
      authenticated = expectedToken === token;
    }
  } else {
    sendError(
      req,
      res,
      SubsonicError.MISSING_PARAMETER,
      'Required parameter "p" or "t"+"s" is missing',
    );
    return;
  }

  if (!authenticated) {
    sendError(req, res, SubsonicError.WRONG_CREDENTIALS, 'Wrong username or password');
    return;
  }

  req.subsonicUser = {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
  };

  next();
}
