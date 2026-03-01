import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users } from 'lucide-react';

interface AuthorsResponse {
  data: Array<{ name: string; count: number }>;
}

export function AudiobooksAuthors() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['audiobook-authors'],
    queryFn: () => api.get<AuthorsResponse>('/audiobooks/authors'),
  });

  const authors = data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Autoren</h1>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && authors.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Users className="h-12 w-12 opacity-30" />
          <p>Keine Autoren gefunden</p>
        </div>
      )}

      {!isLoading && authors.length > 0 && (
        <div className="space-y-1">
          {authors.map((author) => (
            <button
              key={author.name}
              onClick={() => navigate(`/audiobooks/authors/${encodeURIComponent(author.name)}`)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-white/5 transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-section-accent/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-section-accent">
                    {author.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="font-medium group-hover:text-white transition-colors">{author.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {author.count} {author.count === 1 ? 'Hörbuch' : 'Hörbücher'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
