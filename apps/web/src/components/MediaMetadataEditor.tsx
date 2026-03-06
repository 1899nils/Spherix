import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  X, Loader2, FileText, Image as ImageIcon, Info,
  Music, AlignLeft, Lock, Search, Upload, Film, Tv, Headphones,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MediaMetadataEditorProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'album' | 'track' | 'movie' | 'series' | 'episode' | 'audiobook';
  id: string;
  initialData: Record<string, unknown>;
  onOpenMusicBrainz?: () => void;
}

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'general' | 'artwork' | 'lyrics' | 'info';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ALBUM_TABS: Tab[] = [
  { id: 'general', label: 'Allgemein', icon: FileText },
  { id: 'artwork', label: 'Artwork',   icon: ImageIcon },
  { id: 'info',    label: 'Info',      icon: Info },
];

const TRACK_TABS: Tab[] = [
  { id: 'general', label: 'Allgemein', icon: Music },
  { id: 'lyrics',  label: 'Lyrics',    icon: AlignLeft },
  { id: 'info',    label: 'Info',      icon: Info },
];

const MOVIE_TABS: Tab[] = [
  { id: 'general', label: 'Allgemein', icon: Film },
  { id: 'info',    label: 'Info',      icon: Info },
];

const SERIES_TABS: Tab[] = [
  { id: 'general', label: 'Allgemein', icon: Tv },
  { id: 'info',    label: 'Info',      icon: Info },
];

const EPISODE_TABS: Tab[] = [
  { id: 'general', label: 'Allgemein', icon: Film },
  { id: 'info',    label: 'Info',      icon: Info },
];

const AUDIOBOOK_TABS: Tab[] = [
  { id: 'general', label: 'Allgemein', icon: Headphones },
  { id: 'info',    label: 'Info',      icon: Info },
];

function getTabsForType(type: MediaMetadataEditorProps['type']): Tab[] {
  switch (type) {
    case 'album':     return ALBUM_TABS;
    case 'track':     return TRACK_TABS;
    case 'movie':     return MOVIE_TABS;
    case 'series':    return SERIES_TABS;
    case 'episode':   return EPISODE_TABS;
    case 'audiobook': return AUDIOBOOK_TABS;
  }
}

// ── Field label with optional lock icon ──────────────────────────────────────

function FieldLabel({ label, locked }: { label: string; locked?: boolean }) {
  return (
    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
      {label}
      {locked && (
        <Lock className="h-3 w-3 text-muted-foreground/40" aria-label="Automatisch befüllt" />
      )}
    </label>
  );
}

// ── Reusable field components ─────────────────────────────────────────────────

function TextField({ label, value, onChange, locked, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  locked?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel label={label} locked={locked} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function NumberField({ label, value, onChange, locked }: {
  label: string; value: string; onChange: (v: string) => void; locked?: boolean;
}) {
  return (
    <div>
      <FieldLabel label={label} locked={locked} />
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground truncate">
        {value || '–'}
      </div>
    </div>
  );
}

function TextareaField({ label, value, onChange, rows = 6 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div className="flex flex-col flex-1">
      <FieldLabel label={label} />
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="flex-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />
    </div>
  );
}

// ── Album tab panels ──────────────────────────────────────────────────────────

function AlbumGeneralTab({ form, onChange, isLocked }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
  isLocked: boolean;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel"    value={form.title ?? ''}      onChange={v => onChange('title', v)}      locked={isLocked} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Künstler" value={form.artistName ?? ''} onChange={v => onChange('artistName', v)} />
        <NumberField label="Jahr"   value={form.year ?? ''}       onChange={v => onChange('year', v)}       locked={isLocked} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Genre"   value={form.genre ?? ''}      onChange={v => onChange('genre', v)}      locked={isLocked} />
        <TextField label="Label"   value={form.label ?? ''}      onChange={v => onChange('label', v)}      locked={isLocked} />
      </div>
      <TextField label="Land"  value={form.country ?? ''}    onChange={v => onChange('country', v)} />
    </div>
  );
}

function AlbumArtworkTab({ albumId, coverUrl, onCoverUploaded }: {
  albumId: string;
  coverUrl: string;
  onCoverUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('cover', file);
      return fetch(`/api/albums/${albumId}/cover`, { method: 'POST', body: fd });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['album', albumId] });
      onCoverUploaded();
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Cover preview */}
      <div className="h-48 w-48 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
        {coverUrl ? (
          <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
        ) : (
          <div className="text-muted-foreground text-sm">Kein Cover</div>
        )}
      </div>

      {/* Upload button */}
      <div className="flex flex-col items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Cover hochladen
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG, WebP · max. 5 MB</p>
        {uploadMutation.isError && (
          <p className="text-xs text-red-500">Fehler beim Hochladen</p>
        )}
        {uploadMutation.isSuccess && (
          <p className="text-xs text-green-500">Cover erfolgreich aktualisiert</p>
        )}
      </div>
    </div>
  );
}

function AlbumInfoTab({ form, onOpenMusicBrainz }: {
  form: Record<string, string>;
  onOpenMusicBrainz?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Tracks gesamt" value={form.totalTracks ?? ''} />
        <ReadonlyField label="Discs gesamt"  value={form.totalDiscs ?? ''} />
      </div>
      <ReadonlyField label="MusicBrainz ID" value={form.musicbrainzId ?? ''} />
      {onOpenMusicBrainz && (
        <Button type="button" variant="outline" className="w-full" onClick={onOpenMusicBrainz}>
          <Search className="h-4 w-4 mr-2" />
          Mit MusicBrainz verknüpfen
        </Button>
      )}
      <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/70">Hinweis</p>
        <p>Felder mit <Lock className="h-3 w-3 inline" /> wurden automatisch beim Scan befüllt. Sie können trotzdem manuell überschrieben werden.</p>
      </div>
    </div>
  );
}

// ── Track tab panels ──────────────────────────────────────────────────────────

function CheckboxField({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
      />
      <label className="text-sm text-foreground">{label}</label>
    </div>
  );
}

function TrackGeneralTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel"   value={form.title ?? ''}       onChange={v => onChange('title', v)} />
      <TextField label="Künstler" value={form.artistName ?? ''} onChange={v => onChange('artistName', v)} />
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Track-Nr." value={form.trackNumber ?? ''} onChange={v => onChange('trackNumber', v)} />
        <NumberField label="Disc-Nr."  value={form.discNumber ?? ''}  onChange={v => onChange('discNumber', v)} />
      </div>
      <CheckboxField 
        label="Explicit (unangemessene Inhalte)" 
        checked={form.explicit === 'true'} 
        onChange={v => onChange('explicit', String(v))} 
      />
    </div>
  );
}

function TrackLyricsTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <TextareaField label="Lyrics" value={form.lyrics ?? ''} onChange={v => onChange('lyrics', v)} rows={14} />
    </div>
  );
}

function TrackInfoTab({ form }: { form: Record<string, string> }) {
  const formatFileSize = (bytes: string) => {
    const n = parseInt(bytes);
    if (!n) return '–';
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDurationMs = (secs: string) => {
    const n = parseFloat(secs);
    if (!n) return '–';
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Format"     value={form.format ?? ''} />
        <ReadonlyField label="Bitrate"    value={form.bitrate ? `${form.bitrate} kbps` : ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Samplerate" value={form.sampleRate ? `${form.sampleRate} Hz` : ''} />
        <ReadonlyField label="Kanäle"     value={form.channels ?? ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Dauer"      value={formatDurationMs(form.duration ?? '')} />
        <ReadonlyField label="Dateigröße" value={formatFileSize(form.fileSize ?? '')} />
      </div>
      <ReadonlyField label="MusicBrainz ID" value={form.musicbrainzId ?? ''} />
      <div>
        <FieldLabel label="Dateipfad" />
        <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {form.filePath || '–'}
        </div>
      </div>
    </div>
  );
}

// ── Movie tab panels ──────────────────────────────────────────────────────────

function MovieGeneralTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel" value={form.title ?? ''} onChange={v => onChange('title', v)} />
      <TextField label="Sortiertitel" value={form.sortTitle ?? ''} onChange={v => onChange('sortTitle', v)} />
      <div className="grid grid-cols-3 gap-4">
        <NumberField label="Jahr"            value={form.year ?? ''}    onChange={v => onChange('year', v)} />
        <NumberField label="Laufzeit (Min.)" value={form.runtime ?? ''} onChange={v => onChange('runtime', v)} />
        <NumberField label="TMDb ID"         value={form.tmdbId ?? ''}  onChange={v => onChange('tmdbId', v)} />
      </div>
      <TextareaField label="Beschreibung" value={form.overview ?? ''} onChange={v => onChange('overview', v)} rows={6} />
      
      {/* Poster & Backdrop URLs */}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Poster URL" value={form.posterPath ?? ''} onChange={v => onChange('posterPath', v)} />
        <TextField label="Backdrop URL" value={form.backdropPath ?? ''} onChange={v => onChange('backdropPath', v)} />
      </div>
      
      {/* Technische Felder */}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Codec" value={form.codec ?? ''} onChange={v => onChange('codec', v)} />
        <TextField label="Auflösung" value={form.resolution ?? ''} onChange={v => onChange('resolution', v)} />
      </div>
      
      {/* Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel label="Gesehen" />
          <select
            value={form.watched ?? 'false'}
            onChange={e => onChange('watched', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="false">Nein</option>
            <option value="true">Ja</option>
          </select>
        </div>
        <NumberField label="Fortschritt (Sek.)" value={form.watchProgress ?? ''} onChange={v => onChange('watchProgress', v)} />
      </div>
    </div>
  );
}

function MovieInfoTab({ form }: { form: Record<string, string> }) {
  const formatFileSize = (bytes: string) => {
    const n = parseInt(bytes);
    if (!n) return '–';
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '–';
    try {
      return new Date(dateStr).toLocaleString('de-DE');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Codec"     value={form.codec ?? ''} />
        <ReadonlyField label="Auflösung" value={form.resolution ?? ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Dateigröße" value={formatFileSize(form.fileSize ?? '')} />
        <ReadonlyField label="TMDb ID" value={form.tmdbId ?? ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Hinzugefügt" value={formatDate(form.addedAt ?? '')} />
        <ReadonlyField label="Aktualisiert" value={formatDate(form.updatedAt ?? '')} />
      </div>
      <div>
        <FieldLabel label="Dateipfad" />
        <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {form.filePath || '–'}
        </div>
      </div>
    </div>
  );
}

// ── Series tab panels ─────────────────────────────────────────────────────────

function SeriesGeneralTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel" value={form.title ?? ''} onChange={v => onChange('title', v)} />
      <TextField label="Sortiertitel" value={form.sortTitle ?? ''} onChange={v => onChange('sortTitle', v)} />
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Jahr" value={form.year ?? ''} onChange={v => onChange('year', v)} />
        <NumberField label="TMDb ID" value={form.tmdbId ?? ''} onChange={v => onChange('tmdbId', v)} />
      </div>
      <TextareaField label="Beschreibung" value={form.overview ?? ''} onChange={v => onChange('overview', v)} rows={6} />
      
      {/* Poster & Backdrop URLs */}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Poster URL" value={form.posterPath ?? ''} onChange={v => onChange('posterPath', v)} />
        <TextField label="Backdrop URL" value={form.backdropPath ?? ''} onChange={v => onChange('backdropPath', v)} />
      </div>
    </div>
  );
}

function SeriesInfoTab({ form }: { form: Record<string, string> }) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '–';
    try {
      return new Date(dateStr).toLocaleString('de-DE');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="TMDb ID" value={form.tmdbId ?? ''} />
        <ReadonlyField label="Staffeln" value={form.seasonCount ?? ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Hinzugefügt" value={formatDate(form.addedAt ?? '')} />
        <ReadonlyField label="Aktualisiert" value={formatDate(form.updatedAt ?? '')} />
      </div>
      <div>
        <FieldLabel label="Poster URL" />
        <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {form.posterPath || '–'}
        </div>
      </div>
      <div>
        <FieldLabel label="Backdrop URL" />
        <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {form.backdropPath || '–'}
        </div>
      </div>
      <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
        <p>Weitere Metadaten werden beim nächsten Scan automatisch aktualisiert.</p>
      </div>
    </div>
  );
}

// ── Episode tab panels ────────────────────────────────────────────────────────

function EpisodeGeneralTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel" value={form.title ?? ''} onChange={v => onChange('title', v)} />
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Folge-Nr."        value={form.number ?? ''}  onChange={v => onChange('number', v)} />
        <NumberField label="Laufzeit (Min.)"  value={form.runtime ?? ''} onChange={v => onChange('runtime', v)} />
      </div>
      <TextareaField label="Beschreibung" value={form.overview ?? ''} onChange={v => onChange('overview', v)} rows={5} />
      
      {/* Technische Felder */}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Codec" value={form.codec ?? ''} onChange={v => onChange('codec', v)} />
        <TextField label="Auflösung" value={form.resolution ?? ''} onChange={v => onChange('resolution', v)} />
      </div>
      
      {/* Thumbnail */}
      <TextField label="Thumbnail URL" value={form.thumbnailPath ?? ''} onChange={v => onChange('thumbnailPath', v)} />
      
      {/* Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel label="Gesehen" />
          <select
            value={form.watched ?? 'false'}
            onChange={e => onChange('watched', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="false">Nein</option>
            <option value="true">Ja</option>
          </select>
        </div>
        <NumberField label="Fortschritt (Sek.)" value={form.watchProgress ?? ''} onChange={v => onChange('watchProgress', v)} />
      </div>
    </div>
  );
}

function EpisodeInfoTab({ form }: { form: Record<string, string> }) {
  const formatFileSize = (bytes: string) => {
    const n = parseInt(bytes);
    if (!n) return '–';
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '–';
    try {
      return new Date(dateStr).toLocaleString('de-DE');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Codec"      value={form.codec ?? ''} />
        <ReadonlyField label="Auflösung"  value={form.resolution ?? ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Dateigröße" value={formatFileSize(form.fileSize ?? '')} />
        <ReadonlyField label="Hinzugefügt" value={formatDate(form.addedAt ?? '')} />
      </div>
      <div>
        <FieldLabel label="Thumbnail URL" />
        <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {form.thumbnailPath || '–'}
        </div>
      </div>
      <div>
        <FieldLabel label="Dateipfad" />
        <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {form.filePath || '–'}
        </div>
      </div>
    </div>
  );
}

// ── Audiobook tab panels ──────────────────────────────────────────────────────

function AudiobookGeneralTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel" value={form.title ?? ''} onChange={v => onChange('title', v)} />
      <div className="grid grid-cols-2 gap-4">
        <TextField   label="Autor" value={form.author ?? ''} onChange={v => onChange('author', v)} />
        <NumberField label="Jahr"  value={form.year ?? ''}   onChange={v => onChange('year', v)} />
      </div>
      <TextField label="Sprecher" value={form.narrator ?? ''} onChange={v => onChange('narrator', v)} />
      <TextareaField label="Beschreibung" value={form.overview ?? ''} onChange={v => onChange('overview', v)} rows={5} />
    </div>
  );
}

function AudiobookInfoTab({ form }: { form: Record<string, string> }) {
  const formatDurationSecs = (secs: string) => {
    const n = parseInt(secs);
    if (!n) return '–';
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  return (
    <div className="space-y-4">
      <ReadonlyField label="Gesamtdauer" value={formatDurationSecs(form.duration ?? '')} />
      <div>
        <FieldLabel label="Dateipfad" />
        <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {form.filePath || '–'}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MediaMetadataEditor({
  isOpen, onClose, type, id, initialData, onOpenMusicBrainz,
}: MediaMetadataEditorProps) {
  const queryClient = useQueryClient();
  const tabs = getTabsForType(type);
  const [activeTab, setActiveTab] = useState<TabId>(tabs[0].id);

  // Flatten initialData to string form for controlled inputs
  const toStr = (v: unknown): string => (v == null ? '' : String(v));
  const [form, setForm] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(initialData)) {
      out[k] = toStr(initialData[k]);
    }
    return out;
  });

  const handleChange = (key: string, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }));
  };

  // Whether the album was auto-enriched via MusicBrainz
  const isLocked = !!(initialData.musicbrainzId);

  // Build payload: only changed fields
  const buildPayload = () => {
    const changes: Record<string, unknown> = {};
    const numericKeys = ['year', 'trackNumber', 'discNumber', 'runtime', 'number', 'tmdbId', 'watchProgress'];
    const booleanKeys = ['watched'];
    for (const k of Object.keys(form)) {
      const newVal = form[k];
      const oldVal = toStr(initialData[k]);
      if (newVal !== oldVal) {
        if (numericKeys.includes(k)) {
          changes[k] = newVal === '' ? null : parseInt(newVal, 10);
        } else if (booleanKeys.includes(k)) {
          changes[k] = newVal === 'true';
        } else {
          changes[k] = newVal === '' ? null : newVal;
        }
      }
    }
    return changes;
  };

  const endpoint =
    type === 'album'     ? `/albums/${id}` :
    type === 'track'     ? `/tracks/${id}` :
    type === 'movie'     ? `/video/movies/${id}` :
    type === 'series'    ? `/video/series/${id}` :
    type === 'episode'   ? `/video/episodes/${id}` :
    `/audiobooks/${id}`;

  const queryKeys: string[][] =
    type === 'album'     ? [['album', id], ['albums']] :
    type === 'track'     ? [['album'], ['tracks']] :
    type === 'movie'     ? [['movie', id], ['movies']] :
    type === 'series'    ? [['series', id]] :
    type === 'episode'   ? [['series']] :
    [['audiobook', id], ['audiobooks']];

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(endpoint, data),
    onSuccess: () => {
      for (const qk of queryKeys) {
        queryClient.invalidateQueries({ queryKey: qk });
      }
      onClose();
    },
  });

  const handleSave = () => {
    const payload = buildPayload();
    if (Object.keys(payload).length > 0) {
      mutation.mutate(payload);
    } else {
      onClose();
    }
  };

  const title = (initialData.title as string) || type;

  const typeLabel =
    type === 'album'     ? 'Album' :
    type === 'track'     ? 'Track' :
    type === 'movie'     ? 'Film' :
    type === 'series'    ? 'Serie' :
    type === 'episode'   ? 'Episode' :
    'Hörbuch';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{typeLabel}-Metadaten</p>
            <h2 className="text-base font-semibold truncate max-w-lg">{title}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body: Sidebar + Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <nav className="w-36 shrink-0 border-r border-border flex flex-col gap-1 p-2 pt-3">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors text-left w-full',
                    activeTab === tab.id
                      ? 'bg-white/10 text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Album tabs */}
            {type === 'album' && activeTab === 'general' && (
              <AlbumGeneralTab form={form} onChange={handleChange} isLocked={isLocked} />
            )}
            {type === 'album' && activeTab === 'artwork' && (
              <AlbumArtworkTab
                albumId={id}
                coverUrl={toStr(initialData.coverUrl)}
                onCoverUploaded={onClose}
              />
            )}
            {type === 'album' && activeTab === 'info' && (
              <AlbumInfoTab form={form} onOpenMusicBrainz={onOpenMusicBrainz} />
            )}

            {/* Track tabs */}
            {type === 'track' && activeTab === 'general' && (
              <TrackGeneralTab form={form} onChange={handleChange} />
            )}
            {type === 'track' && activeTab === 'lyrics' && (
              <TrackLyricsTab form={form} onChange={handleChange} />
            )}
            {type === 'track' && activeTab === 'info' && (
              <TrackInfoTab form={form} />
            )}

            {/* Movie tabs */}
            {type === 'movie' && activeTab === 'general' && (
              <MovieGeneralTab form={form} onChange={handleChange} />
            )}
            {type === 'movie' && activeTab === 'info' && (
              <MovieInfoTab form={form} />
            )}

            {/* Series tabs */}
            {type === 'series' && activeTab === 'general' && (
              <SeriesGeneralTab form={form} onChange={handleChange} />
            )}
            {type === 'series' && activeTab === 'info' && (
              <SeriesInfoTab form={form} />
            )}

            {/* Episode tabs */}
            {type === 'episode' && activeTab === 'general' && (
              <EpisodeGeneralTab form={form} onChange={handleChange} />
            )}
            {type === 'episode' && activeTab === 'info' && (
              <EpisodeInfoTab form={form} />
            )}

            {/* Audiobook tabs */}
            {type === 'audiobook' && activeTab === 'general' && (
              <AudiobookGeneralTab form={form} onChange={handleChange} />
            )}
            {type === 'audiobook' && activeTab === 'info' && (
              <AudiobookInfoTab form={form} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <div className="text-xs text-muted-foreground">
            {isLocked && (type === 'album' || type === 'track') && (
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                MusicBrainz-verknüpft
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Speichern
            </Button>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-xs text-red-500 px-6 pb-3">
            Fehler: {mutation.error instanceof Error ? mutation.error.message : 'Unbekannter Fehler'}
          </p>
        )}
      </div>
    </div>
  );
}
