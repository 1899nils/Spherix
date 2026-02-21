import type { Track } from '@musicserver/shared';
import { useEffect, useState } from 'react';

export function App() {
  const [status, setStatus] = useState<string>('Verbinde...');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.status === 'ok' ? 'Verbunden' : 'Fehler'))
      .catch(() => setStatus('Server nicht erreichbar'));
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>MusicServer</h1>
      <p>
        Status: <strong>{status}</strong>
      </p>
      <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>
        Selbst gehosteter Music Server
      </p>
    </div>
  );
}
