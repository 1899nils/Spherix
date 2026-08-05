import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';
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
 * Hook for managing video streaming with automatic transcoding detection
 */
export function useStreaming({
  type,
  id,
  enabled = true,
}: UseStreamingOptions): UseStreamingReturn {
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
      const res = await api.get<{ data: MediaStreamInfo }>(`/video/stream/info/${type}/${id}`);
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
          `/video/stream/job/${type}_${id}/status`,
        );
        setTranscodeStatus(res.data);

        if (res.data.status === 'completed') {
          setActualStreamUrl(streamInfo.streamUrl);
        }
      } catch (_err) {
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

// Note: an earlier `useHlsPlayer` stub lived here — it never got past
// "in a real implementation, you'd import hls.js here" placeholder comments,
// was never wired up anywhere, and is superseded by the real hls.js
// integration in components/video/VideoPlayer.tsx. Removed as dead code.
