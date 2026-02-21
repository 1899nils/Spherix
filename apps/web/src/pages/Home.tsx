import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Music2, Disc3, Mic2, Clock } from 'lucide-react';

interface HealthStatus {
  status: string;
  services: { database: string; redis: string };
}

export function Home() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthStatus>('/health'),
    refetchInterval: 30000,
  });

  const stats = [
    { icon: Music2, label: 'Tracks', value: '—' },
    { icon: Disc3, label: 'Alben', value: '—' },
    { icon: Mic2, label: 'Künstler', value: '—' },
    { icon: Clock, label: 'Zuletzt gespielt', value: '—' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Willkommen</h1>
        <p className="text-muted-foreground mt-1">
          Dein selbst gehosteter Music Server
        </p>
      </div>

      {/* Server Status */}
      <div className="flex items-center gap-2 text-sm">
        <div
          className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className="text-muted-foreground">
          Server: {health?.status === 'ok' ? 'Verbunden' : 'Nicht erreichbar'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card p-4 space-y-2"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span className="text-sm">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
