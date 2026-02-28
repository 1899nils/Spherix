import { usePlayerStore, type RadioStation, type PodcastEpisodePlayerItem } from '@/stores/playerStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Shuffle,
  Repeat,
  Repeat1,
  Music2,
  Info,
} from 'lucide-react';

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    seek,
    duration,
    volume,
    isMuted,
    isShuffled,
    repeatMode,
    scrobbleActivity,
    currentRadioTrack,
    togglePlay,
    next,
    prev,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore();

  const { data: lastfmData } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: () => api.get<{ data: { connected: boolean; username: string | null } }>('/lastfm/status'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const lastfmConnected = !!lastfmData?.data?.connected;
  const lastfmUsername = lastfmData?.data?.username;

  const isRadio = !!(currentTrack && 'isRadio' in currentTrack);
  const isPodcast = !!(currentTrack && 'isPodcast' in currentTrack);

  const getQualityLabel = () => {
    if (!currentTrack) return null;
    if ('isRadio' in currentTrack) {
      return (
        <span className="text-[10px] py-0 px-1.5 h-4 bg-pink-500/20 border border-pink-500/30 text-pink-400 font-bold tracking-wider rounded flex items-center">
          LIVE
        </span>
      );
    }
    if ('isPodcast' in currentTrack) {
      return (
        <span className="text-[10px] py-0 px-1.5 h-4 bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold tracking-wider rounded flex items-center">
          PODCAST
        </span>
      );
    }
    const format = currentTrack.format?.toUpperCase();
    const isLossless = ['FLAC', 'ALAC', 'WAV', 'AIFF'].includes(format);
    const isHiRes = currentTrack.sampleRate && currentTrack.sampleRate > 44100;

    return (
      <span className="text-[10px] py-0 px-1.5 h-4 bg-white/10 border border-white/20 text-white font-bold tracking-wider rounded flex items-center">
        {isHiRes ? 'HI-RES' : isLossless ? 'LOSSLESS' : format}
      </span>
    );
  };

  const VolumeIcon = isMuted || volume === 0
    ? VolumeX
    : volume < 0.5
      ? Volume1
      : Volume2;

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <footer className="h-24 liquid-glass rounded-2xl flex items-center px-6 gap-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Left: Track Info */}
        <div className="flex items-center gap-4 w-[35%] min-w-0">
          {currentTrack ? (
            <>
              {/* Cover */}
              <div className="h-16 w-16 rounded-lg bg-muted shrink-0 overflow-hidden shadow-lg border border-white/10 relative group bg-black/20 flex items-center justify-center p-2">
                {'isRadio' in currentTrack ? (
                  currentTrack.favicon ? (
                    <img src={currentTrack.favicon} alt={currentTrack.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="text-2xl">📻</div>
                  )
                ) : 'isPodcast' in currentTrack ? (
                  (currentTrack as PodcastEpisodePlayerItem).imageUrl ? (
                    <img
                      src={(currentTrack as PodcastEpisodePlayerItem).imageUrl!}
                      alt={currentTrack.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-2xl">🎙️</div>
                  )
                ) : (
                  currentTrack.album?.coverUrl ? (
                    <img
                      src={currentTrack.album.coverUrl}
                      alt={currentTrack.album.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                      ♪
                    </div>
                  )
                )}
                {!isRadio && !isPodcast && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Info className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>
              {/* Title / Artist / Meta */}
              <div className="min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate text-white">
                    {isRadio
                      ? (currentRadioTrack?.title ?? (currentTrack as RadioStation).name)
                      : currentTrack.title}
                  </p>
                  {getQualityLabel()}
                </div>
                <div className="flex flex-col">
                  {isRadio ? (
                    <>
                      {currentRadioTrack ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {currentRadioTrack.artist}
                        </p>
                      ) : null}
                      <p className="text-xs text-pink-400 font-medium animate-pulse">
                        {'name' in currentTrack ? currentTrack.name : ''} · Live
                      </p>
                    </>
                  ) : isPodcast ? (
                    <p className="text-xs text-orange-400 truncate">
                      {(currentTrack as PodcastEpisodePlayerItem).podcastTitle}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground truncate hover:text-white transition-colors cursor-pointer">
                        {currentTrack.artist.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 truncate">
                        {currentTrack.album?.title}
                        {currentTrack.album?.year ? ` • ${currentTrack.album.year}` : ''}
                        {currentTrack.album?.label ? ` • ${currentTrack.album.label}` : ''}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">Wähle einen Song</p>
          )}
        </div>

        {/* Center: Controls + Seekbar */}
        <div className="flex flex-col items-center gap-2 w-[40%] max-w-[600px]">
          {/* Buttons */}
          <div className="flex items-center gap-4">
            <Tooltip content={isShuffled ? 'Shuffle aus' : 'Shuffle an'}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-white/10"
                onClick={toggleShuffle}
                disabled={isRadio}
              >
                <Shuffle className={`h-4 w-4 transition-all ${isShuffled ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]' : 'text-muted-foreground'}`} />
              </Button>
            </Tooltip>

            <Tooltip content="Zurück">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 hover:bg-white/10 rounded-full"
                onClick={prev}
                disabled={!currentTrack || isRadio || isPodcast}
              >
                <SkipBack className="h-5 w-5 fill-current" />
              </Button>
            </Tooltip>

            <Button
              variant="secondary"
              size="icon"
              className="h-12 w-12 rounded-full bg-white text-black hover:bg-white/90 transition-transform active:scale-95 shadow-xl"
              onClick={togglePlay}
              disabled={!currentTrack}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 fill-current" />
              ) : (
                <Play className="h-6 w-6 ml-1 fill-current" />
              )}
            </Button>

            <Tooltip content="Weiter">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 hover:bg-white/10 rounded-full"
                onClick={next}
                disabled={!currentTrack || isRadio || isPodcast}
              >
                <SkipForward className="h-5 w-5 fill-current" />
              </Button>
            </Tooltip>

            <Tooltip content={`Wiederholen: ${repeatMode}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-white/10"
                onClick={cycleRepeat}
                disabled={isRadio || isPodcast}
              >
                <RepeatIcon className={`h-4 w-4 transition-all ${repeatMode !== 'off' ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]' : 'text-muted-foreground'}`} />
              </Button>
            </Tooltip>
          </div>

          {/* Seekbar */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[10px] font-medium text-muted-foreground w-10 text-right tabular-nums">
              {isRadio ? 'LIVE' : formatDuration(seek)}
            </span>
            <Slider
              value={isRadio ? 100 : seek}
              max={isRadio ? 100 : (duration || 1)}
              onChange={isRadio ? undefined : seekTo}
              className={`flex-1 ${isRadio ? 'opacity-50 pointer-events-none' : ''}`}
            />
            <span className="text-[10px] font-medium text-muted-foreground w-10 tabular-nums">
              {isRadio ? '∞' : formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Right: Last.fm + Volume */}
        <div className="flex items-center justify-end gap-3 w-[30%]">
          {/* Last.fm status indicator */}
          <Tooltip content={
            scrobbleActivity === 'scrobbled'
              ? `✓ Scrobbled zu Last.fm`
              : scrobbleActivity === 'error'
                ? 'Scrobble fehlgeschlagen'
                : lastfmConnected
                  ? `Last.fm verbunden · ${lastfmUsername}`
                  : 'Last.fm nicht verbunden · Einstellungen öffnen'
          }>
            <div className="relative cursor-default shrink-0">
              <Music2 className={`h-4 w-4 transition-all duration-300 ${
                scrobbleActivity === 'scrobbled'
                  ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.9)]'
                  : scrobbleActivity === 'error'
                    ? 'text-yellow-400/70'
                    : lastfmConnected
                      ? 'text-red-500/60'
                      : 'text-muted-foreground/25'
              }`} />
              {scrobbleActivity === 'scrobbled' && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-green-400 rounded-full" />
              )}
            </div>
          </Tooltip>

          <Tooltip content={isMuted ? 'Ton an' : 'Stumm'}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white/10"
              onClick={toggleMute}
            >
              <VolumeIcon className="h-4 w-4 text-muted-foreground hover:text-white" />
            </Button>
          </Tooltip>
          <Slider
            value={isMuted ? 0 : volume}
            max={1}
            onChange={setVolume}
            className="w-28"
          />
        </div>
      </footer>
    </div>
  );
}
