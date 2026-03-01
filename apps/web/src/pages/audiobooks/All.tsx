import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { Library } from 'lucide-react';
import type { Audiobook } from '@musicserver/shared';

interface AudiobooksResponse {
  data: Audiobook[];
  total: number;
}

export function AudiobooksAll() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['audiobooks'],
    queryFn: () => api.get<AudiobooksResponse>('/audiobooks?pageSize=100&sort=title'),
  });

  const books = data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Alle Hörbücher</h1>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-square rounded-lg bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Library className="h-12 w-12 opacity-30" />
          <p>Keine Hörbücher gefunden</p>
          <p className="text-xs opacity-60">Starte einen Scan unter Einstellungen → Bibliothek</p>
        </div>
      )}

      {!isLoading && books.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {books.map((book) => (
            <MediaCard
              key={book.id}
              title={book.title}
              subtitle={book.author ?? undefined}
              year={book.year}
              imageUrl={book.coverPath}
              progress={
                book.duration && book.listenProgress
                  ? book.listenProgress / book.duration
                  : undefined
              }
              aspect="square"
              fallbackIcon={<Library className="h-12 w-12" />}
              onClick={() => navigate(`/audiobooks/${book.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
