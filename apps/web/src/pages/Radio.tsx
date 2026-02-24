import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio as RadioIcon, Play, Signal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlayerStore, type RadioStation } from '@/stores/playerStore';
import { useUIStore } from '@/stores/uiStore';

interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  votes: number;
  clickcount: number;
}

export function Radio() {
  const { playStream, currentTrack, isPlaying } = usePlayerStore();
  const radioRegion = useUIStore((state) => state.radioRegion);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const { data: stations, isLoading } = useQuery({
    queryKey: ['radio-stations', radioRegion],
    queryFn: async () => {
      const url = radioRegion && radioRegion !== 'Alle' 
        ? `https://de1.api.radio-browser.info/json/stations/bystate/${encodeURIComponent(radioRegion)}`
        : 'https://de1.api.radio-browser.info/json/stations/bycountry/germany';
        
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch radio stations');
      const data: RadioBrowserStation[] = await res.json();
      // Sort by clicks and take top 100
      return data
        .sort((a, b) => b.clickcount - a.clickcount)
        .slice(0, 100);
    },
  });

  const handlePlay = (s: RadioBrowserStation) => {
    const station: RadioStation = {
      id: s.stationuuid,
      name: s.name,
      url: s.url_resolved,
      favicon: s.favicon,
      isRadio: true,
    };
    playStream(station);
  };

  const handleImageError = (uuid: string) => {
    setFailedImages((prev) => new Set(prev).add(uuid));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Radio</h1>
          <p className="text-muted-foreground mt-1">
            {radioRegion && radioRegion !== 'Alle' ? `Live-Sender aus ${radioRegion}` : 'Live-Sender aus Deutschland'}
          </p>
        </div>
        <div className="h-12 w-12 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20 shadow-lg shadow-pink-500/5">
          <RadioIcon className="h-6 w-6 text-pink-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
        {isLoading ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-2xl border border-white/5" />
          ))
        ) : (
          stations?.map((station) => {
            const isCurrent = !!(currentTrack && 'id' in currentTrack && currentTrack.id === station.stationuuid);
            const isThisPlaying = !!(isCurrent && isPlaying);
            const hasImageFailed = failedImages.has(station.stationuuid);

            return (
              <div 
                key={station.stationuuid}
                className={`group relative bg-[#1c1c1e] p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/50 ${
                  isCurrent ? 'border-pink-500/50 bg-pink-500/5' : 'border-white/5 hover:bg-white/5'
                }`}
              >
                <div className="aspect-square rounded-xl overflow-hidden mb-4 relative shadow-inner bg-black/20 flex items-center justify-center border border-white/5">
                  {station.favicon && !hasImageFailed ? (
                    <img 
                      src={station.favicon} 
                      alt={station.name} 
                      className="w-2/3 h-2/3 object-contain transition-transform duration-500 group-hover:scale-110"
                      onError={() => handleImageError(station.stationuuid)}
                    />
                  ) : (
                    <div className="text-zinc-700 font-bold text-4xl">📻</div>
                  )}
                  
                  {/* Play Overlay */}
                  <div className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center ${
                    isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <Button 
                      variant="secondary" 
                      size="icon" 
                      className={`rounded-full h-14 w-14 shadow-2xl transition-transform active:scale-90 ${
                        isCurrent ? 'bg-pink-500 text-white hover:bg-pink-400' : 'bg-white text-black hover:bg-white/90'
                      }`}
                      onClick={() => handlePlay(station)}
                    >
                      {isThisPlaying ? (
                        <Signal className="h-7 w-7 animate-bounce" />
                      ) : (
                        <Play className="h-7 w-7 fill-current ml-1" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 min-w-0">
                  <h3 className={`font-bold text-sm truncate ${isCurrent ? 'text-pink-400' : 'text-white'}`}>
                    {station.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate uppercase tracking-wider font-semibold">
                    {station.tags.split(',')[0] || 'Radio'}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
