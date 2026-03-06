import { useState, useEffect } from 'react';
import { Video, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { TrackWithRelations } from '@musicserver/shared';

interface MusicVideoIndicatorProps {
  track: TrackWithRelations;
  onSwitchToVideo?: () => void;
  isPlayingVideo?: boolean;
}

interface MusicVideoData {
  url: string;
  source: string;
  title?: string;
}

export function MusicVideoIndicator({ 
  track, 
  onSwitchToVideo,
  isPlayingVideo = false 
}: MusicVideoIndicatorProps) {
  const [videoData, setVideoData] = useState<MusicVideoData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Check if track has a music video on mount
  useEffect(() => {
    if (track.musicVideoUrl && track.musicVideoSource) {
      setVideoData({
        url: track.musicVideoUrl,
        source: track.musicVideoSource,
      });
    }
  }, [track.musicVideoUrl, track.musicVideoSource]);

  const searchForVideo = async (force = false) => {
    setIsLoading(true);
    try {
      const response = await api.get<{ data: MusicVideoData }>(
        `/tracks/${track.id}/musicvideo${force ? '?refresh=true' : ''}`
      );
      setVideoData(response.data);
    } catch {
      // No video found
      setVideoData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // If no video data yet, don't show anything (search is done via album menu or metadata editor)
  if (!videoData && !isLoading) {
    return null;
  }

  if (isLoading) {
    return (
      <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
    );
  }

  if (!videoData) {
    return null;
  }

  return (
    <div 
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Video Indicator */}
      <button
        onClick={() => onSwitchToVideo?.()}
        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
          isPlayingVideo 
            ? 'bg-red-600 text-white' 
            : 'bg-muted/50 hover:bg-muted text-foreground'
        }`}
      >
        <Video className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Video</span>
      </button>

      {/* Tooltip with actions */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-lg shadow-lg p-3 z-50">
          <p className="text-xs text-muted-foreground mb-2">
            Quelle: {videoData.source === 'musicbrainz' ? 'MusicBrainz' : 
                     videoData.source === 'youtube' ? 'YouTube' : videoData.source}
          </p>
          <div className="flex gap-2">
            <a
              href={videoData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
            >
              <ExternalLink className="h-3 w-3" />
              Öffnen
            </a>
            <button
              onClick={() => searchForVideo(true)}
              className="flex items-center justify-center gap-1 px-2 py-1.5 border rounded text-xs hover:bg-muted"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
