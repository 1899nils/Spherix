import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { Play, Library } from 'lucide-react';
import type { Audiobook } from '@musicserver/shared';

interface ContinueResponse {
  data: Audiobook[];
}

export function AudiobooksContinue() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['audiobooks-continue'],
    queryFn: () => api.get<ContinueResponse>('/audiobooks/continue'),
  });

  const books = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Play className="h-6 w-6 text-section-accent" />
        <h1 className="text-2xl font-bold">Weiterhören</h1>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-square rounded-lg bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Play className="h-12 w-12 opacity-30" />
          <p>Kein aktives Hörbuch</p>
          <p className="text-xs opacity-60">Fang mit einem Hörbuch an!</p>
        </div>
      )}

      {!isLoading && books.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {books.map((book) => (
            <MediaCard
              key={book.id}
              title={book.title}
              subtitle={book.author ?? undefined}
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
