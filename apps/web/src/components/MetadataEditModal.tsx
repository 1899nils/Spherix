import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, X, Search } from 'lucide-react';

interface MetadataEditModalProps {
  type: 'track' | 'album' | 'artist';
  id: string;
  initialData: Record<string, unknown>;
  onClose: () => void;
  onOpenMusicBrainz?: () => void;
}

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea';
}

const FIELDS: Record<string, FieldConfig[]> = {
  track: [
    { key: 'title', label: 'Titel', type: 'text' },
    { key: 'trackNumber', label: 'Track-Nr.', type: 'number' },
    { key: 'discNumber', label: 'Disc-Nr.', type: 'number' },
    { key: 'lyrics', label: 'Lyrics', type: 'textarea' },
  ],
  album: [
    { key: 'title', label: 'Titel', type: 'text' },
    { key: 'year', label: 'Jahr', type: 'number' },
    { key: 'genre', label: 'Genre', type: 'text' },
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'country', label: 'Land', type: 'text' },
  ],
  artist: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'biography', label: 'Biografie', type: 'textarea' },
  ],
};

export function MetadataEditModal({ type, id, initialData, onClose, onOpenMusicBrainz }: MetadataEditModalProps) {
  const queryClient = useQueryClient();
  const fields = FIELDS[type];

  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      data[field.key] = initialData[field.key] ?? (field.type === 'number' ? '' : '');
    }
    return data;
  });

  const endpoint = type === 'track' ? `/tracks/${id}` :
    type === 'album' ? `/albums/${id}` : `/artists/${id}`;

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(endpoint, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [type, id] });
      queryClient.invalidateQueries({ queryKey: [`${type}s`] });
      if (type === 'track') {
        queryClient.invalidateQueries({ queryKey: ['tracks'] });
      }
      onClose();
    },
  });

  const handleChange = (key: string, value: string, fieldType: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: fieldType === 'number' ? (value === '' ? null : parseInt(value, 10)) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const changes: Record<string, unknown> = {};
    for (const field of fields) {
      const newVal = formData[field.key];
      const oldVal = initialData[field.key];
      if (newVal !== oldVal) {
        changes[field.key] = newVal;
      }
    }
    if (Object.keys(changes).length > 0) {
      mutation.mutate(changes);
    } else {
      onClose();
    }
  };

  const typeLabel = type === 'track' ? 'Track' : type === 'album' ? 'Album' : 'Künstler';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">{typeLabel}-Metadaten bearbeiten</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor={field.key}>
                  {field.label}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={field.key}
                    value={String(formData[field.key] ?? '')}
                    onChange={(e) => handleChange(field.key, e.target.value, field.type)}
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                ) : (
                  <input
                    id={field.key}
                    type={field.type}
                    value={String(formData[field.key] ?? '')}
                    onChange={(e) => handleChange(field.key, e.target.value, field.type)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            ))}

            {/* MusicBrainz Search */}
            {type === 'album' && onOpenMusicBrainz && (
              <div className="pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={onOpenMusicBrainz}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Mit MusicBrainz verknüpfen
                </Button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Speichern
            </Button>
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500 px-6 pb-4">
              Fehler: {mutation.error.message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
