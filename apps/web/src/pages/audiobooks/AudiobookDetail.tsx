import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAudiobookPlayerStore } from '@/stores/audiobookPlayerStore';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatDuration, formatHoursMinutes } from '@/lib/utils';
import { Play, Pause, ArrowLeft, Library, Headphones } from 'lucide-react';
import type { AudiobookDetail as AudiobookDetailType } from '@musicserver/shared';

interface AudiobookDetailResponse {
  data: AudiobookDetailType;
}

export function AudiobookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentBook, chapterIndex, isPlaying, playBook, togglePlay } =
    useAudiobookPlayerStore();

  const { data, isLoading } = useQuery({
    queryKey: ['audiobook', id],
    queryFn: () => api.get<AudiobookDetailResponse>(`/audiobooks/${id}`),
    enabled: !!id,
  });

  const book = data?.data;
  const isThisBook = currentBook?.id === id;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-white/5 rounded w-1/3" />
        <div className="flex gap-6">
          <div className="h-48 w-48 rounded-xl bg-white/5 shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-white/5 rounded w-2/3" />
            <div className="h-4 bg-white/5 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Library className="h-12 w-12 opacity-30" />
        <p>Hörbuch nicht gefunden</p>
        <Button variant="ghost" onClick={() => navigate('/audiobooks')}>Zurück</Button>
      </div>
    );
  }

  const handlePlay = (chIdx = 0) => {
    playBook(
      {
        id: book.id,
        title: book.title,
        author: book.author,
        coverPath: book.coverPath,
        filePath: book.filePath,
        duration: book.duration,
        chapters: book.chapters ?? [],
      },
      chIdx,
      chIdx === 0 && (book.listenProgress ?? 0) > 0 ? (book.listenProgress ?? 0) : 0,
    );
  };

  const chapters = book.chapters ?? [];
  const hasChapters = chapters.length > 0;

  return (
    <div className="space-y-8">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground hover:text-white"
        onClick={() => navigate('/audiobooks')}
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Hörbücher
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Cover */}
        <div className="shrink-0 w-48 aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-xl">
          {book.coverPath ? (
            <img src={book.coverPath} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
              <Headphones className="h-16 w-16" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4 min-w-0">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
              Hörbuch
            </p>
            <h1 className="text-3xl font-bold">{book.title}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {book.author && <span className="font-medium text-white/70">{book.author}</span>}
            {book.year && (
              <>
                <span className="text-white/20">·</span>
                <span>{book.year}</span>
              </>
            )}
            {book.duration && (
              <>
                <span className="text-white/20">·</span>
                <span>{formatHoursMinutes(book.duration)}</span>
              </>
            )}
            {hasChapters && (
              <>
                <span className="text-white/20">·</span>
                <span>{chapters.length} Kapitel</span>
              </>
            )}
          </div>

          {/* Genres */}
          {book.genres && book.genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {book.genres.map((g) => (
                <span key={g.id} className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                  {g.name}
                </span>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {book.listenProgress != null && book.listenProgress > 0 && book.duration && (
            <div className="space-y-1 max-w-xs">
              <ProgressBar value={book.listenProgress / book.duration} />
              <p className="text-xs text-muted-foreground">
                {formatHoursMinutes(book.listenProgress)} gehört
              </p>
            </div>
          )}

          {/* Play button */}
          <Button
            size="lg"
            className="gap-2 bg-section-accent hover:bg-section-accent/90 text-white shadow-lg"
            onClick={() => (isThisBook ? togglePlay() : handlePlay(0))}
          >
            {isThisBook && isPlaying ? (
              <><Pause className="h-5 w-5 fill-current" /> Pause</>
            ) : (
              <><Play className="h-5 w-5 fill-current" />
                {(book.listenProgress ?? 0) > 60 ? 'Weiterhören' : 'Abspielen'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Chapter list */}
      {hasChapters && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Kapitel</h2>
          <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
            {chapters.map((ch, idx) => {
              const isActive = isThisBook && chapterIndex === idx;
              return (
                <button
                  key={ch.id}
                  onClick={() => (isActive ? togglePlay() : handlePlay(idx))}
                  className={`w-full flex items-center gap-4 px-5 py-3.5 transition-colors group text-left ${
                    isActive ? 'bg-section-accent/10' : 'hover:bg-white/5'
                  }`}
                >
                  {/* Chapter number / play icon */}
                  <div className="w-8 shrink-0 flex items-center justify-center">
                    {isActive ? (
                      isPlaying ? (
                        <Pause className="h-4 w-4 text-section-accent fill-current" />
                      ) : (
                        <Play className="h-4 w-4 text-section-accent fill-current ml-0.5" />
                      )
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground group-hover:hidden">{ch.number}</span>
                        <Play className="h-4 w-4 hidden group-hover:block fill-current ml-0.5" />
                      </>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-section-accent' : ''}`}>
                      {ch.title}
                    </p>
                  </div>

                  {ch.endTime != null && ch.startTime != null && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {formatDuration(ch.endTime - ch.startTime)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
