import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { AlbumWithRelations, PaginatedResponse } from '@musicserver/shared';
import { Disc3, Merge, X, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

function AlbumCard({
  album,
  selectable,
  selected,
  onToggle,
}: {
  album: AlbumWithRelations;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const inner = (
    <div
      className={`group flex flex-col rounded-lg bg-muted/30 p-3 transition-colors relative
        ${selectable ? 'cursor-pointer hover:bg-muted/60' : 'hover:bg-muted/60'}
        ${selected ? 'ring-2 ring-primary bg-primary/10' : ''}
      `}
      onClick={selectable ? () => onToggle(album.id) : undefined}
    >
      {/* Selection indicator */}
      {selectable && (
        <div
          className={`absolute top-2 right-2 h-5 w-5 rounded border-2 flex items-center justify-center z-10 transition-colors
            ${selected ? 'bg-primary border-primary' : 'border-white/40 bg-black/30'}
          `}
        >
          {selected && <span className="text-white text-xs font-bold">✓</span>}
        </div>
      )}

      {/* Cover */}
      <div className="aspect-square rounded-md overflow-hidden bg-muted mb-3">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={album.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <Disc3 className="h-12 w-12" />
          </div>
        )}
      </div>

      {/* Info */}
      <p className="font-medium text-sm truncate">{album.title}</p>
      <p className="text-xs text-muted-foreground truncate">
        {album.artist.name}
        {album.year && <span> &middot; {album.year}</span>}
      </p>
    </div>
  );

  // Wrap in Link only when not in select mode
  if (!selectable) {
    return <Link to={`/albums/${album.id}`}>{inner}</Link>;
  }
  return inner;
}

function MergeDialog({
  albums,
  targetId,
  onTargetChange,
  onConfirm,
  onCancel,
  isPending,
}: {
  albums: AlbumWithRelations[];
  targetId: string;
  onTargetChange: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Alben zusammenführen</h2>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Alle Tracks der ausgewählten Alben werden in das <strong>Zielalbum</strong> verschoben.
          Die anderen Alben werden danach gelöscht.
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">Zielalbum wählen:</p>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {albums.map((a) => (
              <label
                key={a.id}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors
                  ${targetId === a.id ? 'bg-primary/15 border border-primary/40' : 'hover:bg-muted/50 border border-transparent'}
                `}
              >
                <input
                  type="radio"
                  name="target"
                  value={a.id}
                  checked={targetId === a.id}
                  onChange={() => onTargetChange(a.id)}
                  className="accent-primary"
                />
                <div className="h-8 w-8 rounded overflow-hidden bg-muted shrink-0">
                  {a.coverUrl ? (
                    <img src={a.coverUrl} alt={a.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Disc3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.artist.name}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            <Merge className="h-4 w-4 mr-2" />
            {isPending ? 'Zusammenführen…' : 'Zusammenführen'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Albums() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['albums'],
    queryFn: () => api.get<PaginatedResponse<AlbumWithRelations>>('/albums?pageSize=100'),
  });

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');

  const mergeMutation = useMutation({
    mutationFn: ({ targetId, sourceIds }: { targetId: string; sourceIds: string[] }) =>
      api.post('/albums/merge', { targetId, sourceIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['albums'] });
      setShowMergeDialog(false);
      setSelectMode(false);
      setSelected(new Set());
    },
  });

  const albums = data?.data ?? [];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelected(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const openMergeDialog = () => {
    const firstId = [...selected][0];
    setMergeTargetId(firstId);
    setShowMergeDialog(true);
  };

  const confirmMerge = () => {
    const sourceIds = [...selected].filter((id) => id !== mergeTargetId);
    mergeMutation.mutate({ targetId: mergeTargetId, sourceIds });
  };

  const selectedAlbums = albums.filter((a) => selected.has(a.id));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Alben</h1>
          <p className="text-muted-foreground mt-1">
            {albums.length > 0 ? `${albums.length} Alben` : 'Alle Alben'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectMode ? (
            <>
              <span className="text-sm text-muted-foreground">
                {selected.size} ausgewählt
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={openMergeDialog}
                disabled={selected.size < 2}
              >
                <Merge className="h-4 w-4 mr-2" />
                Zusammenführen
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                <X className="h-4 w-4 mr-1" />
                Abbrechen
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={enterSelectMode} disabled={albums.length < 2}>
              <CheckSquare className="h-4 w-4 mr-2" />
              Auswählen
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Lade Alben...</div>
      ) : albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Disc3 className="h-12 w-12 mb-4" />
          <p>Keine Alben gefunden</p>
          <p className="text-sm mt-1">Scanne eine Bibliothek in den Einstellungen</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {albums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              selectable={selectMode}
              selected={selected.has(album.id)}
              onToggle={toggleSelect}
            />
          ))}
        </div>
      )}

      {showMergeDialog && (
        <MergeDialog
          albums={selectedAlbums}
          targetId={mergeTargetId}
          onTargetChange={setMergeTargetId}
          onConfirm={confirmMerge}
          onCancel={() => setShowMergeDialog(false)}
          isPending={mergeMutation.isPending}
        />
      )}
    </div>
  );
}
