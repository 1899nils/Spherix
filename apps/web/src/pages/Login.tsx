import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Loader2 } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white tracking-tight">Spherix</h1>
          <p className="text-white/40 text-sm mt-1">Dein persönlicher Medienserver</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">Anmelden</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-1.5" htmlFor="username">
                Benutzername
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-1.5" htmlFor="password">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full h-10 bg-white text-black font-semibold rounded-lg text-sm hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Anmelden
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/20 mt-6">
          Standard: admin / admin
        </p>
      </div>
    </div>
  );
}
