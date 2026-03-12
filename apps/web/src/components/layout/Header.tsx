import { useState, useRef, useEffect } from 'react';
import { Search, Settings as SettingsIcon, User, LogOut, KeyRound, Shield } from 'lucide-react';
import { StatusDashboard } from '@/components/video/StatusDashboard';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((s) => s.user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('Passwörter stimmen nicht überein'); return; }
    if (next.length < 4) { setError('Mindestens 4 Zeichen erforderlich'); return; }
    setLoading(true);
    try {
      // Verify current password by re-authenticating
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user?.username, password: current }),
      });
      if (!loginRes.ok) { setError('Aktuelles Passwort ist falsch'); setLoading(false); return; }

      const res = await fetch(`/api/auth/users/${user?.id}/password`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: next }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Fehler beim Speichern');
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch {
      setError('Netzwerkfehler');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-4">Passwort ändern</h3>
        {success ? (
          <p className="text-green-400 text-sm text-center py-4">Passwort erfolgreich geändert!</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {(
              [
                { label: 'Aktuelles Passwort', value: current, setter: setCurrent },
                { label: 'Neues Passwort', value: next, setter: setNext },
                { label: 'Wiederholen', value: confirm, setter: setConfirm },
              ] as const
            ).map(({ label, value, setter }) => (
              <div key={label}>
                <label className="block text-xs text-white/50 mb-1">{label}</label>
                <input
                  type="password"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                />
              </div>
            ))}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onClose}>
                Abbrechen
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1 bg-white text-black hover:bg-white/90"
                disabled={loading}
              >
                {loading ? 'Speichern…' : 'Speichern'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="h-16 flex items-center justify-between px-8 bg-background/50 backdrop-blur-md sticky top-0 z-40">
        <div className="w-1/4"></div>

        {/* Center: Search */}
        <div className="flex-1 max-w-xl relative text-white">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Suche nach Künstlern, Alben oder Songs..."
            className="w-full bg-white/5 border border-white/10 pl-10 h-10 rounded-full focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-sm placeholder:text-muted-foreground"
          />
        </div>

        {/* Right: Status, Settings, User menu */}
        <div className="w-1/4 flex justify-end items-center gap-3">
          <StatusDashboard />

          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-white/10 rounded-full"
            onClick={() => navigate('/settings')}
          >
            <SettingsIcon className="h-5 w-5 text-muted-foreground hover:text-white transition-colors" />
          </Button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3 h-9 rounded-full hover:bg-white/10 transition-colors"
            >
              <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-white/70" />
              </div>
              <span className="text-sm text-white/70 max-w-[120px] truncate hidden sm:block">
                {user?.username}
              </span>
              {user?.isAdmin && (
                <Shield className="h-3 w-3 text-amber-400/70 hidden sm:block shrink-0" />
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-medium text-white truncate">{user?.username}</p>
                  <p className="text-xs text-white/40 truncate">{user?.email}</p>
                  {user?.isAdmin && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-amber-400/80 bg-amber-400/10 rounded px-1.5 py-0.5">
                      <Shield className="h-2.5 w-2.5" /> Admin
                    </span>
                  )}
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setMenuOpen(false); setShowChangePassword(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <KeyRound className="h-4 w-4" />
                    Passwort ändern
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Abmelden
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}
