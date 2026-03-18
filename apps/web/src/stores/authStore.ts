import { create } from 'zustand';
import { invalidateCsrfToken } from '@/lib/api';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  fetchMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  fetchMe: async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        set({ user: data.data, isLoading: false });
      } else {
        set({ user: null, isLoading: false });
      }
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  login: async (username, password) => {
    // Login uses raw fetch — no CSRF token needed for pre-auth endpoints.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login fehlgeschlagen');
    }
    // Seed the CSRF token now that a session exists.
    invalidateCsrfToken();
    set({ user: data.data });
  },

  logout: async () => {
    // Logout is also pre-auth (just destroys the session) — raw fetch is fine.
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    invalidateCsrfToken();
    set({ user: null });
  },
}));
