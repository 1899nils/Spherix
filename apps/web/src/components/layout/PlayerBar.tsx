import { usePlayerStore } from '@/stores/playerStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/utils';
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
} from 'lucide-react';

import { Info } from 'lucide-react';

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
    togglePlay,
    next,
    prev,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore();

  const getQualityLabel = () => {
    if (!currentTrack) return null;
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
              <div className="h-16 w-16 rounded-lg bg-muted shrink-0 overflow-hidden shadow-lg border border-white/10 relative group">
                {currentTrack.album?.coverUrl ? (
                  <img
                    src={currentTrack.album.coverUrl}
                    alt={currentTrack.album.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                    ♪
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Info className="h-5 w-5 text-white" />
                </div>
              </div>
              {/* Title / Artist / Meta */}
              <div className="min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate text-white">
                    {currentTrack.title}
                  </p>
                  {getQualityLabel()}
                </div>
                <div className="flex flex-col">
                  <p className="text-xs text-muted-foreground truncate hover:text-white transition-colors cursor-pointer">
                    {currentTrack.artist.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 truncate">
                    {currentTrack.album?.title} 
                    {/* @ts-ignore - year might be on album from joint object */}
                    {currentTrack.album?.year ? ` • ${currentTrack.album.year}` : ''}
                    {/* @ts-ignore - label might be on album from joint object */}
                    {currentTrack.album?.label ? ` • ${currentTrack.album.label}` : ''}
                  </p>
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
                disabled={!currentTrack}
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
                disabled={!currentTrack}
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
              >
                <RepeatIcon className={`h-4 w-4 transition-all ${repeatMode !== 'off' ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]' : 'text-muted-foreground'}`} />
              </Button>
            </Tooltip>
          </div>

          {/* Seekbar */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[10px] font-medium text-muted-foreground w-10 text-right tabular-nums">
              {formatDuration(seek)}
            </span>
            <Slider
              value={seek}
              max={duration || 1}
              onChange={seekTo}
              className="flex-1"
            />
            <span className="text-[10px] font-medium text-muted-foreground w-10 tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Right: Volume */}
        <div className="flex items-center justify-end gap-3 w-[30%]">
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
