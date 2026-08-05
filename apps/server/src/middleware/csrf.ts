import { doubleCsrf } from 'csrf-csrf';
import { env } from '../config/env.js';

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.sessionSecret,
  getSessionIdentifier: (req) => {
    const session = (req as unknown as { session?: { userId?: string } }).session;
    return session?.userId ?? req.ip ?? 'anonymous';
  },
  cookieName: 'spherix.csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    // Same reasoning as the session cookie in index.ts: tying this to
    // NODE_ENV === 'production' broke CSRF validation for every plain-HTTP
    // deployment (the documented default for self-hosted setups like
    // Unraid, where NODE_ENV is still "production") — a Secure cookie is
    // never sent by the browser over HTTP, so the server would always see
    // the CSRF cookie missing and reject every protected request.
    secure: false,
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});
