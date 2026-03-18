import { doubleCsrf } from 'csrf-csrf';
import { env } from '../config/env.js';

export const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.sessionSecret,
  getSessionIdentifier: (req) => {
    const session = (req as unknown as { session?: { userId?: string } }).session;
    return session?.userId ?? req.ip ?? 'anonymous';
  },
  cookieName: 'spherix.csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.nodeEnv === 'production',
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});
