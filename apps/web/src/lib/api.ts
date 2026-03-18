const API_BASE = '/api';

/** Cached CSRF token — fetched lazily on the first mutating request. */
let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${API_BASE}/csrf-token`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch CSRF token');
  const data = (await res.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
}

/** Invalidate the cached CSRF token (e.g. after session changes). */
export function invalidateCsrfToken() {
  csrfToken = null;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (MUTATING_METHODS.has(method)) {
    headers['x-csrf-token'] = await getCsrfToken();
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  // If the CSRF token has expired, refresh and retry once
  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    if (body?.error?.toLowerCase().includes('csrf') || body?.error?.toLowerCase().includes('invalid')) {
      csrfToken = null;
      headers['x-csrf-token'] = await getCsrfToken();
      const retry = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        ...options,
        headers,
      });
      if (!retry.ok) {
        const retryError = await retry.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
        throw new Error(retryError.error || `HTTP ${retry.status}`);
      }
      return retry.json() as Promise<T>;
    }
    throw new Error(body?.error || `HTTP ${res.status}`);
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
