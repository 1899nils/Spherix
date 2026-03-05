import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useState, useCallback } from 'react';
import type { MediaStreamInfo, TranscodeStatus } from '@musicserver/shared';

interface UseStreamingOptions {
  type: 'movie' | 'episode';
  id: string;
  enabled?: boolean;
}

interface UseStreamingReturn {
  streamInfo: MediaStreamInfo | null;
  isLoading: boolean;
  error: Error | null;
  transcodeStatus: TranscodeStatus | null;
  isTranscoding: boolean;
  actualStreamUrl: string | null;
  refetch: () => void;
}

/**
 * Detect client capabilities for video playback
 */
function detectClientCapabilities() {
  const video = document.createElement('video');
  
  const videoCodecs: string[] = [];
  const audioCodecs: string[] = [];
  
  // Video codec detection
  if (video.canPlayType('video/mp4; codecs="avc1.42E01E"')) videoCodecs.push('h264');
  if (video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"')) videoCodecs.push('hevc');
  if (video.canPlayType('video/webm; codecs="vp9"')) videoCodecs.push('vp9');
  if (video.canPlayType('video/webm; codecs="av01.0.00M.08"')) videoCodecs.push('av1');
  
  // Audio codec detection
  if (video.canPlayType('audio/mp4; codecs="mp4a.40.2"')) audioCodecs.push('aac');
  if (video.canPlayType('audio/webm; codecs="opus"')) audioCodecs.push('opus');
  if (video.canPlayType('audio/mpeg')) audioCodecs.push('mp3');
  
  // Screen resolution
  const maxResolution = {
    width: window.screen.width * window.devicePixelRatio,
    height: window.screen.height * window.devicePixelRatio,
  };
  
  // Estimate bitrate based on connection
  const connection = (navigator as any).connection;
  const maxBitrate = connection?.downlink 
    ? Math.min(connection.downlink * 1000000, 20000000) // Mbps to bps, max 20Mbps
    : 8000000; // Default 8Mbps

  return {
    videoCodecs,
    audioCodecs,
    maxResolution,
    maxBitrate,
    containerFormats: ['mp4', 'webm'],
  };
}

/**
 * Hook for managing video streaming with automatic transcoding detection
 */
export function useStreaming({ type, id, enabled = true }: UseStreamingOptions): UseStreamingReturn {
  const [transcodeStatus, setTranscodeStatus] = useState<TranscodeStatus | null>(null);
  const [actualStreamUrl, setActualStreamUrl] = useState<string | null>(null);

  // Fetch stream info
  const {
    data: streamInfoData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stream-info', type, id],
    queryFn: async () => {
      const caps = detectClientCapabilities();
      
      const res = await api.get<{ data: MediaStreamInfo }>(
        `/video/stream/info/${type}/${id}`
      );
      return res.data;
    },
    enabled: enabled && !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const streamInfo = streamInfoData || null;

  // Poll transcode status if needed
  useEffect(() => {
    if (!streamInfo || streamInfo.directPlay) {
      setActualStreamUrl(streamInfo?.streamUrl || null);
      return;
    }

    // If transcoding is needed, poll for status
    const checkStatus = async () => {
      try {
        // Extract job ID from stream URL or check status
        const res = await api.get<{ data: TranscodeStatus }>(
          `/video/stream/job/${type}_${id}/status`
        );
        setTranscodeStatus(res.data);

        if (res.data.status === 'completed') {
          setActualStreamUrl(streamInfo.streamUrl);
        }
      } catch (err) {
        // Job might not exist yet, that's ok
      }
    };

    // Check immediately
    checkStatus();

    // Then poll every 2 seconds
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [streamInfo, type, id]);

  const isTranscoding = !!streamInfo && !streamInfo.directPlay && !actualStreamUrl;

  return {
    streamInfo,
    isLoading,
    error: error as Error | null,
    transcodeStatus,
    isTranscoding,
    actualStreamUrl,
    refetch,
  };
}

/**
 * Hook for HLS.js integration (for transcoded streams)
 */
export function useHlsPlayer() {
  const [hlsInstance] = useState<any>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check native HLS support (Safari)
    const video = document.createElement('video');
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';
    
    if (nativeHls) {
      setIsSupported(true);
      return;
    }

    // Check for hls.js support
    // Note: In a real implementation, you'd import hls.js here
    // import Hls from 'hls.js';
    // setIsSupported(Hls.isSupported());
    setIsSupported(true); // Assume supported for now
  }, []);

  const attachMedia = useCallback((videoElement: HTMLVideoElement, src: string) => {
    // Native HLS (Safari)
    const video = videoElement;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return () => { video.src = ''; };
    }

    // hls.js for other browsers
    // In real implementation:
    // const hls = new Hls();
    // hls.loadSource(src);
    // hls.attachMedia(video);
    // setHlsInstance(hls);
    // return () => hls.destroy();
    
    // For now, fallback to native
    video.src = src;
    return () => { video.src = ''; };
  }, []);

  return { isSupported, attachMedia, hlsInstance };
}
