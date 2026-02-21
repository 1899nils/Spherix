import { ListMusic } from 'lucide-react';

export function Playlists() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Playlists</h1>
        <p className="text-muted-foreground mt-1">Deine Playlists</p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ListMusic className="h-12 w-12 mb-4" />
        <p>Noch keine Playlists vorhanden</p>
        <p className="text-sm mt-1">Erstelle deine erste Playlist</p>
      </div>
    </div>
  );
}
