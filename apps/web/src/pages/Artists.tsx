import { Mic2 } from 'lucide-react';

export function Artists() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Künstler</h1>
        <p className="text-muted-foreground mt-1">Alle Künstler</p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Mic2 className="h-12 w-12 mb-4" />
        <p>Noch keine Künstler vorhanden</p>
        <p className="text-sm mt-1">Scanne eine Bibliothek um Künstler zu laden</p>
      </div>
    </div>
  );
}
