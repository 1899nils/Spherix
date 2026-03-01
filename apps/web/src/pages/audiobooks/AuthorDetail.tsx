import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Library } from 'lucide-react';
import type { Audiobook } from '@musicserver/shared';

interface AudiobooksResponse {
  data: Audiobook[];
  total: number;
}

export function AuthorDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const decodedName = name ? decodeURIComponent(name) : '';

  const { data, isLoading } = useQuery({
    queryKey: ['audiobooks-by-author', decodedName],
    queryFn: () =>
      api.get<AudiobooksResponse>(`/audiobooks?author=${encodeURIComponent(decodedName)}&pageSize=100`),
    enabled: !!decodedName,
  });

  const books = data?.data ?? [];

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground hover:text-white"
        onClick={() => navigate('/audiobooks/authors')}
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Autoren
      </Button>

      <h1 className="text-2xl font-bold">{decodedName}</h1>

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

      {!isLoading && books.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {books.map((book) => (
            <MediaCard
              key={book.id}
              title={book.title}
              year={book.year}
              imageUrl={book.coverPath}
              progress={book.duration && book.listenProgress ? book.listenProgress / book.duration : undefined}
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
