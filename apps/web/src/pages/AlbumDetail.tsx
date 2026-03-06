import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/playerStore';
import { MediaMetadataEditor } from '@/components/MediaMetadataEditor';
import { MusicBrainzLinkModal } from '@/components/MusicBrainzLinkModal';
import type { AlbumDetail as AlbumDetailType, ApiResponse, TrackWithRelations } from '@musicserver/shared';
import { Play, Pause, Disc3, Pencil, ExternalLink, Heart, Clock } from 'lucide-react';

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [mbOpen, setMbOpen] = useState(false);
  const [editTrackId, setEditTrackId] = useState<string | null>(null);
  const [coverError, setCoverError] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['album', id],
    queryFn: () => api.get<ApiResponse<AlbumDetailType>>(`/albums/${id}`),
    enabled: !!id,
  });

  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  const album = data?.data;

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Album...</div>;
  }

  if (!album) {
    return <div className="text-muted-foreground p-8">Album nicht gefunden</div>;
  }

  const tracks = album.tracks ?? [];
  const totalDuration = tracks.reduce((sum: number, t: TrackWithRelations) => sum + t.duration, 0);
  const totalMins = Math.floor(totalDuration / 60);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handlePlayTrack = (track: TrackWithRelations) => {
    playTrack(track, tracks);
  };

  const isCurrentAlbumPlaying = currentTrack && tracks.some((t: TrackWithRelations) => t.id === currentTrack.id) && isPlaying;

  // Group tracks by disc if multi-disc
  const hasMultipleDiscs = new Set(tracks.map((t: TrackWithRelations) => t.discNumber)).size > 1;

  // Build initialData for the album editor
  const albumEditorData = {
    title:        album.title,
    artistName:   album.artist.name,
    year:         album.year,
    genre:        album.genre,
    label:        album.label,
    country:      album.country,
    coverUrl:     album.coverUrl,
    totalTracks:  album.totalTracks,
    totalDiscs:   album.totalDiscs,
    musicbrainzId: album.musicbrainzId,
  };

  // Build initialData for the selected track editor
  const editTrack = editTrackId ? tracks.find((t: TrackWithRelations) => t.id === editTrackId) : null;
  const trackEditorData = editTrack ? {
    title:        editTrack.title,
    artistName:   editTrack.artist.name,
    trackNumber:  editTrack.trackNumber,
    discNumber:   editTrack.discNumber,
    lyrics:       editTrack.lyrics,
    format:       editTrack.format,
    bitrate:      editTrack.bitrate,
    sampleRate:   editTrack.sampleRate,
    channels:     editTrack.channels,
    duration:     editTrack.duration,
    fileSize:     editTrack.fileSize,
    filePath:     editTrack.filePath,
    musicbrainzId: editTrack.musicbrainzId,
  } : {};

  return (
    <div className="space-y-0">
      {/* Spotify-style Header with Gradient */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/40 via-background/80 to-background pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row gap-6 md:gap-8 p-6 md:p-8 pb-4">
          {/* Large Cover */}
          <div className="h-48 w-48 md:h-56 md:w-56 lg:h-64 lg:w-64 rounded-md overflow-hidden bg-muted shrink-0 shadow-2xl mx-auto md:mx-0">
            {album.coverUrl && !coverError ? (
              <img
                src={album.coverUrl}
                alt={album.title}
                className="h-full w-full object-cover"
                onError={() => setCoverError(true)}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground bg-muted">
                <Disc3 className="h-24 w-24" />
              </div>
            )}
          </div>

          {/* Album Info */}
          <div className="flex flex-col justify-end gap-3 min-w-0 text-center md:text-left">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium hidden md:block">
              Album
            </p>
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight line-clamp-2">
              {album.title}
            </h1>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm text-muted-foreground">
              <Link
                to={`/music/artists/${album.artist.id}`}
                className="font-semibold text-foreground hover:underline"
              >
                {album.artist.name}
              </Link>
              {album.year && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span>{album.year}</span>
                </>
              )}
              <span className="hidden sm:inline">•</span>
              <span>{tracks.length} {tracks.length === 1 ? 'Song' : 'Songs'}</span>
              <span className="hidden sm:inline">•</span>
              <span>{totalMins} Min.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-4 px-6 md:px-8 py-4">
        {/* Big Green Play Button */}
        <button
          onClick={isCurrentAlbumPlaying ? togglePlay : handlePlayAll}
          className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90 hover:scale-105 transition-all flex items-center justify-center shadow-lg"
        >
          {isCurrentAlbumPlaying ? (
            <Pause className="h-7 w-7 text-primary-foreground fill-primary-foreground" />
          ) : (
            <Play className="h-7 w-7 text-primary-foreground fill-primary-foreground ml-0.5" />
          )}
        </button>

        {/* Heart Button */}
        <button className="h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:scale-105 transition-all">
          <Heart className="h-7 w-7" />
        </button>

        {/* More Options */}
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} className="text-muted-foreground">
            <Pencil className="h-4 w-4 mr-2" />
            Bearbeiten
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setMbOpen(true)} className="text-muted-foreground">
            <ExternalLink className="h-4 w-4 mr-2" />
            MusicBrainz
            {album.musicbrainzId && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-primary inline-block" />
            )}
          </Button>
        </div>
      </div>

      {/* Track List */}
      <div className="px-6 md:px-8 pb-8">
        {/* Table Header */}
        <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[50px_1fr_auto_auto] gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border/50">
          <span className="w-8 text-center">#</span>
          <span>Titel</span>
          <span className="hidden md:block text-right w-24"></span>
          <span className="text-right flex items-center justify-end gap-1">
            <Clock className="h-4 w-4" />
          </span>
        </div>

        {/* Tracks */}
        <div className="mt-2">
          {tracks.map((track: TrackWithRelations, index: number) => {
            const isCurrent = currentTrack?.id === track.id;
            const showDiscHeader = hasMultipleDiscs &&
              (index === 0 || tracks[index - 1].discNumber !== track.discNumber);

            return (
              <div key={track.id}>
                {showDiscHeader && (
                  <div className="px-4 py-3 text-sm font-semibold text-muted-foreground mt-4 mb-2">
                    Disc {track.discNumber}
                  </div>
                )}
                <div
                  className={`group grid grid-cols-[auto_1fr_auto] md:grid-cols-[50px_1fr_auto_auto] gap-4 px-4 py-3 text-sm rounded-md hover:bg-white/5 cursor-pointer transition-colors ${isCurrent ? 'text-primary' : ''}`}
                  onClick={() => handlePlayTrack(track)}
                >
                  {/* Track Number / Play Icon */}
                  <span className="w-8 text-center text-muted-foreground flex items-center justify-center">
                    <span className={`group-hover:hidden ${isCurrent ? 'text-primary' : ''}`}>
                      {isCurrent && isPlaying ? (
                        <span className="text-primary">♪</span>
                      ) : (
                        track.trackNumber
                      )}
                    </span>
                    <Play className={`h-4 w-4 hidden group-hover:block ${isCurrent ? 'text-primary' : 'text-foreground'}`} />
                  </span>

                  {/* Title & Artist */}
                  <div className="min-w-0 flex flex-col justify-center">
                    <p className={`truncate font-normal ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                      {track.title}
                    </p>
                    {track.artist.id !== album.artist.id && (
                      <p className="text-xs text-muted-foreground truncate">
                        {track.artist.name}
                      </p>
                    )}
                  </div>

                  {/* Edit Button (desktop) */}
                  <button
                    className="hidden md:flex w-24 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-end"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTrackId(track.id);
                    }}
                    title="Track bearbeiten"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>

                  {/* Duration */}
                  <span className="text-muted-foreground text-right self-center tabular-nums">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Album Info Footer */}
      {(album.label || album.country || album.genre) && (
        <div className="px-6 md:px-8 pb-8 text-xs text-muted-foreground">
          <div className="pt-6 border-t border-border/50 space-y-1">
            {album.year && <p><span className="text-foreground">{album.year}</span> veröffentlicht</p>}
            {album.label && <p>Label: {album.label}</p>}
            {album.country && <p>Land: {album.country}</p>}
            {album.genre && <p>Genre: {album.genre}</p>}
          </div>
        </div>
      )}

      {/* Album Metadata Editor */}
      {editOpen && id && (
        <MediaMetadataEditor
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          type="album"
          id={id}
          initialData={albumEditorData}
          onOpenMusicBrainz={() => {
            setEditOpen(false);
            setMbOpen(true);
          }}
        />
      )}

      {/* Track Metadata Editor */}
      {editTrackId && editTrack && (
        <MediaMetadataEditor
          isOpen={!!editTrackId}
          onClose={() => setEditTrackId(null)}
          type="track"
          id={editTrackId}
          initialData={trackEditorData}
        />
      )}

      {/* MusicBrainz Link Modal */}
      {mbOpen && (
        <MusicBrainzLinkModal
          albumId={album.id}
          albumTitle={album.title}
          artistName={album.artist.name}
          musicbrainzId={album.musicbrainzId}
          onClose={() => setMbOpen(false)}
        />
      )}
    </div>
  );
}
