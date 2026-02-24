import type { Request, Response } from 'express';

const API_VERSION = '1.16.1';
const XMLNS = 'http://subsonic.org/restapi';

// ─── Types ──────────────────────────────────────────────────────────────────

type Primitive = string | number | boolean;
type SubsonicValue = Primitive | SubsonicObj | SubsonicObj[];
export interface SubsonicObj {
  [key: string]: SubsonicValue | undefined;
}

// ─── Error codes (Subsonic spec) ────────────────────────────────────────────

export const SubsonicError = {
  GENERIC: 0,
  MISSING_PARAMETER: 10,
  CLIENT_OUTDATED: 20,
  SERVER_OUTDATED: 30,
  WRONG_CREDENTIALS: 40,
  TOKEN_AUTH_NOT_SUPPORTED: 41,
  NOT_AUTHORIZED: 50,
  TRIAL_EXPIRED: 60,
  NOT_FOUND: 70,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFormat(req: Request): 'json' | 'xml' {
  const f = (req.query.f as string)?.toLowerCase();
  return f === 'json' || f === 'jsonp' ? 'json' : 'xml';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Recursively convert a SubsonicObj into an XML string.
 * Simple values become XML attributes; objects/arrays become child elements.
 */
function objToXml(tag: string, obj: SubsonicObj): string {
  const attrs: string[] = [];
  const children: string[] = [];

  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;

    if (Array.isArray(val)) {
      for (const item of val) {
        children.push(objToXml(key, item));
      }
    } else if (typeof val === 'object') {
      children.push(objToXml(key, val));
    } else {
      attrs.push(`${key}="${escapeXml(String(val))}"`);
    }
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  if (children.length === 0) {
    return `<${tag}${attrStr}/>`;
  }
  return `<${tag}${attrStr}>${children.join('')}</${tag}>`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a successful Subsonic response.
 * @param data — key/value pairs to include inside <subsonic-response>.
 */
export function sendResponse(req: Request, res: Response, data: SubsonicObj = {}): void {
  const format = getFormat(req);

  if (format === 'json') {
    res.json({
      'subsonic-response': {
        status: 'ok',
        version: API_VERSION,
        type: 'musicserver',
        serverVersion: '0.1.0',
        openSubsonic: true,
        ...data,
      },
    });
  } else {
    const inner = objToXml('subsonic-response', {
      xmlns: XMLNS,
      status: 'ok',
      version: API_VERSION,
      type: 'musicserver',
      serverVersion: '0.1.0',
      openSubsonic: true,
      ...data,
    });
    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n${inner}`);
  }
}

/**
 * Send a Subsonic error response.
 */
export function sendError(
  req: Request,
  res: Response,
  code: number,
  message: string,
): void {
  const format = getFormat(req);

  if (format === 'json') {
    res.json({
      'subsonic-response': {
        status: 'failed',
        version: API_VERSION,
        type: 'musicserver',
        serverVersion: '0.1.0',
        openSubsonic: true,
        error: { code, message },
      },
    });
  } else {
    const inner = objToXml('subsonic-response', {
      xmlns: XMLNS,
      status: 'failed',
      version: API_VERSION,
      type: 'musicserver',
      serverVersion: '0.1.0',
      openSubsonic: true,
      error: { code, message },
    });
    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n${inner}`);
  }
}
