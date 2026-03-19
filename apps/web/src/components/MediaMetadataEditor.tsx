import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  X, Loader2, FileText, Image as ImageIcon, Info,
  Music, AlignLeft, Lock, Search, Upload, Film, Tv, Headphones,
  Link as LinkIcon,
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

type TabId = 'general' | 'artwork' | 'lyrics' | 'info' | 'images' | 'links';

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
  { id: 'general', label: 'Allgemein',  icon: Film },
  { id: 'images',  label: 'Bilder',     icon: ImageIcon },
  { id: 'links',   label: 'Verknüpfung', icon: LinkIcon },
  { id: 'info',    label: 'Info',       icon: Info },
];

const SERIES_TABS: Tab[] = [
  { id: 'general', label: 'Allgemein',  icon: Tv },
  { id: 'images',  label: 'Bilder',     icon: ImageIcon },
  { id: 'links',   label: 'Verknüpfung', icon: LinkIcon },
  { id: 'info',    label: 'Info',       icon: Info },
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
      {/* Titel */}
      <TextField label="Titel" value={form.title ?? ''} onChange={v => onChange('title', v)} locked={isLocked} />

      {/* Künstler & Release-Typ */}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Künstler" value={form.artistName ?? ''} onChange={v => onChange('artistName', v)} />
        <div>
          <FieldLabel label="Release-Typ" />
          <select
            value={form.releaseType ?? 'Album'}
            onChange={e => onChange('releaseType', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="Album">Album</option>
            <option value="Single">Single</option>
            <option value="EP">EP</option>
            <option value="Live">Live</option>
            <option value="Compilation">Compilation</option>
            <option value="Soundtrack">Soundtrack</option>
            <option value="Remix">Remix</option>
            <option value="Mixtape">Mixtape</option>
            <option value="Bootleg">Bootleg</option>
            <option value="Interview">Interview</option>
            <option value="Spokenword">Spokenword</option>
            <option value="Audiobook">Audiobook</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Jahr & Release-Date */}
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Jahr" value={form.year ?? ''} onChange={v => onChange('year', v)} locked={isLocked} />
        <TextField label="Release-Datum" value={form.releaseDate ?? ''} onChange={v => onChange('releaseDate', v)} placeholder="YYYY-MM-DD" />
      </div>

      {/* CD-Anzahl & Track-Anzahl */}
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="CD-Anzahl" value={form.totalDiscs ?? ''} onChange={v => onChange('totalDiscs', v)} locked={isLocked} />
        <NumberField label="Track-Anzahl" value={form.totalTracks ?? ''} onChange={v => onChange('totalTracks', v)} locked={isLocked} />
      </div>

      {/* Genre & Label */}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Genre" value={form.genre ?? ''} onChange={v => onChange('genre', v)} locked={isLocked} />
        <TextField label="Label" value={form.label ?? ''} onChange={v => onChange('label', v)} locked={isLocked} />
      </div>

      {/* Land & MusicBrainz ID */}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Land" value={form.country ?? ''} onChange={v => onChange('country', v)} />
        <ReadonlyField label="MusicBrainz ID" value={form.musicbrainzId ?? ''} />
      </div>
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
      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4">
        <ReadonlyField label="Tracks gesamt" value={form.totalTracks ?? ''} />
        <ReadonlyField label="Discs gesamt"  value={form.totalDiscs ?? ''} />
      </div>
      
      {/* MusicBrainz */}
      <div className="pt-4 border-t border-border">
        <ReadonlyField label="MusicBrainz ID" value={form.musicbrainzId ?? ''} />
        {onOpenMusicBrainz && (
          <Button type="button" variant="outline" className="w-full mt-4" onClick={onOpenMusicBrainz}>
            <Search className="h-4 w-4 mr-2" />
            Mit MusicBrainz verknüpfen
          </Button>
        )}
      </div>
      
      {/* Hint */}
      <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1 mt-6">
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

  // Extract video ID from URL
  const getVideoId = (url: string) => {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : url.split('/').pop();
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
      
      {/* MusicBrainz ID */}
      <ReadonlyField label="MusicBrainz ID" value={form.musicbrainzId ?? ''} />
      
      {/* Music Video Info */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Musikvideo
        </h4>
        {form.musicVideoUrl ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <ReadonlyField 
                label="Quelle" 
                value={form.musicVideoSource === 'musicbrainz' ? 'MusicBrainz' : 
                       form.musicVideoSource === 'youtube' ? 'YouTube' : 
                       form.musicVideoSource ?? 'Unbekannt'} 
              />
              <ReadonlyField 
                label="Video ID" 
                value={getVideoId(form.musicVideoUrl) ?? '–'} 
              />
            </div>
            <div>
              <FieldLabel label="Video URL" />
              <a 
                href={form.musicVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-primary hover:underline truncate"
              >
                {form.musicVideoUrl}
              </a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Kein Musikvideo verknüpft
          </p>
        )}
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

// ── Movie / Series tab panels ─────────────────────────────────────────────────

const FSK_OPTIONS = ['', 'FSK 0', 'FSK 6', 'FSK 12', 'FSK 16', 'FSK 18'];
const US_RATING_OPTIONS = ['', 'G', 'PG', 'PG-13', 'R', 'NC-17'];

function MovieGeneralTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel" value={form.title ?? ''} onChange={v => onChange('title', v)} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Sortiertitel"   value={form.sortTitle ?? ''}     onChange={v => onChange('sortTitle', v)} />
        <TextField label="Originaltitel"  value={form.originalTitle ?? ''} onChange={v => onChange('originalTitle', v)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <NumberField label="Erscheinungsjahr" value={form.year ?? ''}        onChange={v => onChange('year', v)} />
        <TextField   label="Erscheinungsdatum" value={form.releaseDate ?? ''} onChange={v => onChange('releaseDate', v)} placeholder="YYYY-MM-DD" />
        <NumberField label="Laufzeit (Min.)"  value={form.runtime ?? ''}    onChange={v => onChange('runtime', v)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel label="Altersfreigabe (FSK)" />
          <select
            value={form.fskRating ?? ''}
            onChange={e => onChange('fskRating', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {FSK_OPTIONS.map(o => <option key={o} value={o}>{o || '–'}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="US-Freigabe" />
          <select
            value={form.contentRating ?? ''}
            onChange={e => onChange('contentRating', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {US_RATING_OPTIONS.map(o => <option key={o} value={o}>{o || '–'}</option>)}
          </select>
        </div>
      </div>
      <TextareaField label="Beschreibung" value={form.overview ?? ''} onChange={v => onChange('overview', v)} rows={4} />
      <TextField label="Beschreibung Untertitel (Tagline)" value={form.tagline ?? ''} onChange={v => onChange('tagline', v)} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Studio"     value={form.studio ?? ''}  onChange={v => onChange('studio', v)} />
        <TextField label="Publisher"  value={form.network ?? ''} onChange={v => onChange('network', v)} />
      </div>
    </div>
  );
}

function SeriesGeneralTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Titel" value={form.title ?? ''} onChange={v => onChange('title', v)} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Sortiertitel"  value={form.sortTitle ?? ''}     onChange={v => onChange('sortTitle', v)} />
        <TextField label="Originaltitel" value={form.originalTitle ?? ''} onChange={v => onChange('originalTitle', v)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Erscheinungsjahr"  value={form.year ?? ''}        onChange={v => onChange('year', v)} />
        <TextField   label="Erscheinungsdatum" value={form.releaseDate ?? ''} onChange={v => onChange('releaseDate', v)} placeholder="YYYY-MM-DD" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel label="Altersfreigabe (FSK)" />
          <select
            value={form.fskRating ?? ''}
            onChange={e => onChange('fskRating', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {FSK_OPTIONS.map(o => <option key={o} value={o}>{o || '–'}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="US-Freigabe" />
          <select
            value={form.contentRating ?? ''}
            onChange={e => onChange('contentRating', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {US_RATING_OPTIONS.map(o => <option key={o} value={o}>{o || '–'}</option>)}
          </select>
        </div>
      </div>
      <TextareaField label="Beschreibung" value={form.overview ?? ''} onChange={v => onChange('overview', v)} rows={4} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Studio"    value={form.studio ?? ''}  onChange={v => onChange('studio', v)} />
        <TextField label="Publisher" value={form.network ?? ''} onChange={v => onChange('network', v)} placeholder="Netflix, Disney+ …" />
      </div>
    </div>
  );
}

// ── Image preview component ───────────────────────────────────────────────────

function ImagePreviewField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} />
      <div className="rounded-lg overflow-hidden bg-zinc-900 border border-border flex items-center justify-center" style={{ aspectRatio: label.includes('ster') ? '2/3' : label.includes('Logo') ? '16/5' : '16/9', maxHeight: 180 }}>
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-muted-foreground text-xs">Kein Bild</span>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="URL …"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
      />
    </div>
  );
}

function MediaImagesTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-6">
      <ImagePreviewField label="Plakat (Poster)" value={form.posterPath ?? ''} onChange={v => onChange('posterPath', v)} />
      <ImagePreviewField label="Hintergrundbild (Backdrop)" value={form.backdropPath ?? ''} onChange={v => onChange('backdropPath', v)} />
      <ImagePreviewField label="Logo" value={form.logoPath ?? ''} onChange={v => onChange('logoPath', v)} />
    </div>
  );
}

function MediaLinksTab({ form, onChange }: {
  form: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <NumberField label="TMDb ID" value={form.tmdbId ?? ''} onChange={v => onChange('tmdbId', v)} />
        <TextField   label="IMDb ID" value={form.imdbId ?? ''} onChange={v => onChange('imdbId', v)} placeholder="tt0000000" />
      </div>
      <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground mt-4">
        <p>Anbieter-IDs werden für Bewertungen und externe Links verwendet. Verwende den TMDb-Verlinkungsmanager auf der Detailseite, um Metadaten automatisch zu laden.</p>
      </div>
    </div>
  );
}

// ── Media info tab (ffprobe data) ─────────────────────────────────────────────

interface MediaInfo {
  container: string;
  duration: number;
  size: number;
  video: {
    codec: string; codecLongName: string;
    width: number; height: number;
    fps: number; bitrate: number;
    pixFmt: string; profile?: string; level?: string;
  } | null;
  audio: {
    index: number; codec: string; codecLongName: string;
    language?: string; channels: number;
    sampleRate: number; bitrate: number; default: boolean;
  }[];
  subtitles: {
    index: number; codec: string; language?: string;
    title?: string; default: boolean; forced: boolean;
  }[];
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtBitrate(bps: number): string {
  if (!bps) return '–';
  if (bps < 1_000_000) return `${Math.round(bps / 1000)} kbps`;
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

function getResolutionLabel(w: number, h: number): string {
  if (h >= 2160) return '4K UHD';
  if (h >= 1440) return '1440p (QHD)';
  if (h >= 1080) return '1080p (Full HD)';
  if (h >= 720)  return '720p (HD)';
  if (h >= 480)  return '480p (SD)';
  return `${w}×${h}`;
}

function getChannelLabel(ch: number): string {
  if (ch === 1) return 'Mono';
  if (ch === 2) return 'Stereo';
  if (ch === 6) return '5.1 Surround';
  if (ch === 8) return '7.1 Surround';
  return `${ch} Kanäle`;
}

function getLangLabel(lang?: string): string {
  if (!lang || lang === 'und') return 'Unbekannt';
  const map: Record<string, string> = {
    deu: 'Deutsch', ger: 'Deutsch', eng: 'Englisch', fra: 'Französisch',
    fre: 'Französisch', spa: 'Spanisch', ita: 'Italienisch', jpn: 'Japanisch',
    por: 'Portugiesisch', rus: 'Russisch', zho: 'Chinesisch', chi: 'Chinesisch',
    ara: 'Arabisch', kor: 'Koreanisch', tur: 'Türkisch', nld: 'Niederländisch',
    pol: 'Polnisch', swe: 'Schwedisch', nor: 'Norwegisch', dan: 'Dänisch',
  };
  return map[lang] ?? lang.toUpperCase();
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-36">{label}</span>
      <span className="text-xs text-foreground text-right">{value || '–'}</span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest pt-2 pb-1 border-b border-border mb-1">
      {label}
    </h4>
  );
}

function MovieInfoTab({ mediaId, mediaType }: { mediaId: string; mediaType: 'movie' | 'series' }) {
  const endpoint = mediaType === 'movie'
    ? `/video/movies/${mediaId}/mediainfo`
    : undefined; // series has no single file

  const { data, isLoading, isError } = useQuery<{ data: MediaInfo | null }>({
    queryKey: ['mediainfo', mediaId],
    queryFn:  () => api.get(endpoint!),
    enabled:  !!endpoint,
    staleTime: 5 * 60 * 1000,
  });

  if (mediaType === 'series') {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Medieninfo ist pro Episode verfügbar.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Lade Medieninfo …
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Medieninfo nicht verfügbar (ffprobe nicht gefunden oder Datei fehlt).
      </div>
    );
  }

  const info = data.data;

  return (
    <div className="space-y-4 text-sm">
      {/* Container */}
      <div>
        <SectionHeader label="Datei" />
        <InfoRow label="Container"   value={info.container.toUpperCase()} />
        <InfoRow label="Dauer"       value={fmtDuration(info.duration)} />
        <InfoRow label="Dateigröße"  value={fmtSize(info.size)} />
      </div>

      {/* Video */}
      {info.video && (
        <div>
          <SectionHeader label="Video" />
          <InfoRow label="Codec"       value={info.video.codecLongName || info.video.codec} />
          <InfoRow label="Auflösung"   value={`${info.video.width}×${info.video.height} · ${getResolutionLabel(info.video.width, info.video.height)}`} />
          <InfoRow label="Framerate"   value={`${info.video.fps.toFixed(3).replace(/\.?0+$/, '')} fps`} />
          <InfoRow label="Bitrate"     value={fmtBitrate(info.video.bitrate)} />
          <InfoRow label="Farbformat"  value={info.video.pixFmt} />
          {info.video.profile && <InfoRow label="Profil" value={`${info.video.profile}${info.video.level ? ` · Level ${info.video.level}` : ''}`} />}
        </div>
      )}

      {/* Audio */}
      {info.audio.length > 0 && (
        <div>
          <SectionHeader label="Audio" />
          {info.audio.map((a, i) => (
            <div key={i} className={i > 0 ? 'mt-2 pt-2 border-t border-white/5' : ''}>
              <InfoRow label={`Spur ${i + 1}${a.default ? ' (Standard)' : ''}`} value={getLangLabel(a.language)} />
              <InfoRow label="Codec"   value={a.codecLongName || a.codec} />
              <InfoRow label="Kanäle"  value={getChannelLabel(a.channels)} />
              <InfoRow label="Bitrate" value={fmtBitrate(a.bitrate)} />
              <InfoRow label="Sample"  value={`${a.sampleRate} Hz`} />
            </div>
          ))}
        </div>
      )}

      {/* Subtitles */}
      {info.subtitles.length > 0 && (
        <div>
          <SectionHeader label="Untertitel" />
          {info.subtitles.map((s, i) => (
            <InfoRow
              key={i}
              label={`Spur ${i + 1}${s.default ? ' (Standard)' : ''}${s.forced ? ' · Erzwungen' : ''}`}
              value={`${getLangLabel(s.language)}${s.title ? ` · ${s.title}` : ''} [${s.codec}]`}
            />
          ))}
        </div>
      )}
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
    const numericKeys = ['year', 'trackNumber', 'discNumber', 'runtime', 'number', 'tmdbId', 'watchProgress', 'totalTracks', 'totalDiscs'];
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

      {/* Modal - Fixed size for consistency */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-[900px] h-[650px] flex flex-col">

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
            {type === 'movie' && activeTab === 'images' && (
              <MediaImagesTab form={form} onChange={handleChange} />
            )}
            {type === 'movie' && activeTab === 'links' && (
              <MediaLinksTab form={form} onChange={handleChange} />
            )}
            {type === 'movie' && activeTab === 'info' && (
              <MovieInfoTab mediaId={id} mediaType="movie" />
            )}

            {/* Series tabs */}
            {type === 'series' && activeTab === 'general' && (
              <SeriesGeneralTab form={form} onChange={handleChange} />
            )}
            {type === 'series' && activeTab === 'images' && (
              <MediaImagesTab form={form} onChange={handleChange} />
            )}
            {type === 'series' && activeTab === 'links' && (
              <MediaLinksTab form={form} onChange={handleChange} />
            )}
            {type === 'series' && activeTab === 'info' && (
              <MovieInfoTab mediaId={id} mediaType="series" />
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
          <div className="text-xs text-muted-foreground space-y-0.5">
            {(type === 'album' || type === 'track') && (
              <p className="flex items-center gap-1 text-muted-foreground/70">
                Änderungen werden nur in der Datenbank gespeichert · Audiodateien bleiben unverändert
              </p>
            )}
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
