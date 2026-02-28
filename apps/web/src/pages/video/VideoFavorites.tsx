import { Heart } from 'lucide-react';

export function VideoFavorites() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
      <Heart className="h-16 w-16 opacity-20" />
      <p className="text-xl font-semibold opacity-40">Favoriten</p>
      <p className="text-sm opacity-30">Dieser Bereich wird bald verfügbar sein</p>
    </div>
  );
}
