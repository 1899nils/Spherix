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

  const VolumeIcon = isMuted || volume === 0
    ? VolumeX
    : volume < 0.5
      ? Volume1
      : Volume2;

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;

  return (
    <footer className="h-20 bg-player text-player-foreground border-t border-border flex items-center px-4 gap-4 shrink-0">
      {/* Left: Track Info */}
      <div className="flex items-center gap-3 w-[30%] min-w-0">
        {currentTrack ? (
          <>
            {/* Cover */}
            <div className="h-12 w-12 rounded bg-muted shrink-0 overflow-hidden">
              {currentTrack.album?.coverUrl ? (
                <img
                  src={currentTrack.album.coverUrl}
                  alt={currentTrack.album.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                  ♪
                </div>
              )}
            </div>
            {/* Title / Artist */}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentTrack.artist.name}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Kein Track ausgewählt</p>
        )}
      </div>

      {/* Center: Controls + Seekbar */}
      <div className="flex flex-col items-center gap-1 w-[40%] max-w-[600px]">
        {/* Buttons */}
        <div className="flex items-center gap-1">
          <Tooltip content={isShuffled ? 'Shuffle aus' : 'Shuffle an'}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleShuffle}
            >
              <Shuffle className={`h-4 w-4 ${isShuffled ? 'text-primary' : ''}`} />
            </Button>
          </Tooltip>

          <Tooltip content="Zurück">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={prev}
              disabled={!currentTrack}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={togglePlay}
            disabled={!currentTrack}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>

          <Tooltip content="Weiter">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={next}
              disabled={!currentTrack}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip content={`Wiederholen: ${repeatMode}`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={cycleRepeat}
            >
              <RepeatIcon className={`h-4 w-4 ${repeatMode !== 'off' ? 'text-primary' : ''}`} />
            </Button>
          </Tooltip>
        </div>

        {/* Seekbar */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-[11px] text-muted-foreground w-10 text-right tabular-nums">
            {formatDuration(seek)}
          </span>
          <Slider
            value={seek}
            max={duration || 1}
            onChange={seekTo}
            className="flex-1"
          />
          <span className="text-[11px] text-muted-foreground w-10 tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end gap-2 w-[30%]">
        <Tooltip content={isMuted ? 'Ton an' : 'Stumm'}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleMute}
          >
            <VolumeIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Slider
          value={isMuted ? 0 : volume}
          max={1}
          onChange={setVolume}
          className="w-24"
        />
      </div>
    </footer>
  );
}
