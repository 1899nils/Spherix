import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import {
  X,
  Search,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Disc3,
  AlertCircle,
} from 'lucide-react';

// ─── Types matching the backend responses ────────────────────────────────────

interface MBArtistCredit {
  name: string;
  joinphrase: string;
}

interface MBMedia {
  position: number;
  format?: string;
  'track-count': number;
}

interface MBRelease {
  id: string;
  title: string;
  status?: string;
  date?: string;
  country?: string;
  'artist-credit'?: MBArtistCredit[];
  'label-info'?: Array<{ 'catalog-number'?: string; label?: { name: string } }>;
  media?: MBMedia[];
  score?: number;
}

interface MatchCandidate {
  release: MBRelease;
  confidence: number;
  reasons: string[];
}

interface MatchResult {
  query: { title: string; artistName: string; year?: number | null; trackCount?: number | null };
  candidates: MatchCandidate[];
  autoMatch: MatchCandidate | null;
}

interface ChangeField {
  from: string | number | null;
  to: string | number | null;
}

interface PreviewData {
  preview: boolean;
  applied?: boolean;
  changes: {
    album: Record<string, ChangeField>;
    tracks: Array<{
      discNumber: number;
      trackNumber: number;
      title: string;
      duration: number | null;
      musicbrainzId: string;
    }>;
  };
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface MusicBrainzLinkModalProps {
  albumId: string;
  albumTitle: string;
  artistName: string;
  musicbrainzId?: string | null;
  onClose: () => void;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ReleaseArtist({ release }: { release: MBRelease }) {
  const credits = release['artist-credit'];
  if (!credits?.length) return <span className="text-muted-foreground">Unbekannter Künstler</span>;
  return <span>{credits.map((c) => c.name + (c.joinphrase || '')).join('')}</span>;
}

function ReleaseInfo({ release }: { release: MBRelease }) {
  const year = release.date?.slice(0, 4);
  const trackCount = release.media?.reduce((sum, m) => sum + m['track-count'], 0);
  const format = release.media?.[0]?.format;
  return (
    <span className="text-xs text-muted-foreground">
      {[year, trackCount && `${trackCount} Tracks`, format, release.country]
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 90
      ? 'bg-green-500/15 text-green-400 border-green-500/30'
      : confidence >= 70
        ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
        : 'bg-red-500/15 text-red-400 border-red-500/30';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {Math.round(confidence)}%
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type View = 'candidates' | 'preview' | 'success';

export function MusicBrainzLinkModal({
  albumId,
  albumTitle,
  artistName,
  musicbrainzId,
  onClose,
}: MusicBrainzLinkModalProps) {
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>('candidates');
  const [manualQuery, setManualQuery] = useState('');
  const [isManualSearching, setIsManualSearching] = useState(false);
  const [manualResults, setManualResults] = useState<MBRelease[] | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  // ─── Auto-search for candidates ──────────────────────────────────────────

  const {
    data: candidatesData,
    isLoading: candidatesLoading,
    error: candidatesError,
  } = useQuery({
    queryKey: ['musicbrainz-candidates', albumId],
    queryFn: () =>
      api.get<{ data: MatchResult }>(`/albums/${albumId}/musicbrainz-candidates`),
  });

  const candidates = candidatesData?.data;

  // ─── Preview mutation ────────────────────────────────────────────────────

  const previewMutation = useMutation({
    mutationFn: (releaseId: string) =>
      api.post<{ data: PreviewData }>(`/albums/${albumId}/match-musicbrainz`, {
        musicbrainzReleaseId: releaseId,
        confirm: false,
      }),
    onSuccess: (data, releaseId) => {
      setSelectedReleaseId(releaseId);
      setPreviewData(data.data);
      setView('preview');
    },
  });

  // ─── Apply mutation ──────────────────────────────────────────────────────

  const applyMutation = useMutation({
    mutationFn: (releaseId: string) =>
      api.post<{ data: PreviewData }>(`/albums/${albumId}/match-musicbrainz`, {
        musicbrainzReleaseId: releaseId,
        confirm: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['album', albumId] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      setView('success');
    },
  });

  // ─── Manual search ──────────────────────────────────────────────────────

  const handleManualSearch = async () => {
    const q = manualQuery.trim();
    if (!q) return;
    setIsManualSearching(true);
    try {
      const res = await api.get<{ data: MBRelease[]; total: number }>(
        `/musicbrainz/releases?q=${encodeURIComponent(q)}&limit=10`,
      );
      setManualResults(res.data);
    } catch {
      setManualResults([]);
    } finally {
      setIsManualSearching(false);
    }
  };

  const handleSelectRelease = (releaseId: string) => {
    previewMutation.mutate(releaseId);
  };

  // ─── Render helpers ─────────────────────────────────────────────────────

  const renderCandidateCard = (candidate: MatchCandidate, isAutoMatch: boolean) => (
    <button
      key={candidate.release.id}
      type="button"
      onClick={() => handleSelectRelease(candidate.release.id)}
      disabled={previewMutation.isPending}
      className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
        isAutoMatch ? 'border-primary/40 bg-primary/5' : 'border-border'
      } ${previewMutation.isPending ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{candidate.release.title}</span>
            <ConfidenceBadge confidence={candidate.confidence} />
            {isAutoMatch && (
              <span className="text-xs text-primary font-medium">Empfohlen</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            <ReleaseArtist release={candidate.release} />
          </p>
          <ReleaseInfo release={candidate.release} />
          {candidate.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {candidate.reasons.map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </button>
  );

  const renderManualResultCard = (release: MBRelease) => (
    <button
      key={release.id}
      type="button"
      onClick={() => handleSelectRelease(release.id)}
      disabled={previewMutation.isPending}
      className={`w-full text-left p-3 rounded-lg border border-border transition-colors hover:bg-muted/50 ${
        previewMutation.isPending ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{release.title}</p>
          <p className="text-sm text-muted-foreground truncate">
            <ReleaseArtist release={release} />
          </p>
          <ReleaseInfo release={release} />
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {release.score !== undefined && (
            <span className="text-xs text-muted-foreground">{release.score}%</span>
          )}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </button>
  );

  // ─── Change display ─────────────────────────────────────────────────────

  const FIELD_LABELS: Record<string, string> = {
    title: 'Titel',
    artistName: 'Künstler',
    year: 'Jahr',
    genre: 'Genre',
    label: 'Label',
    country: 'Land',
    totalDiscs: 'Discs',
    coverUrl: 'Cover',
    musicbrainzId: 'MusicBrainz ID',
  };

  const renderChangeRow = (key: string, change: ChangeField) => {
    const fromStr = change.from != null ? String(change.from) : '–';
    const toStr = change.to != null ? String(change.to) : '–';
    const isChanged = fromStr !== toStr;
    if (!isChanged) return null;

    // Truncate long URLs for display
    const displayFrom =
      key === 'coverUrl' || key === 'musicbrainzId'
        ? fromStr.length > 30
          ? fromStr.slice(0, 30) + '…'
          : fromStr
        : fromStr;
    const displayTo =
      key === 'coverUrl' || key === 'musicbrainzId'
        ? toStr.length > 30
          ? toStr.slice(0, 30) + '…'
          : toStr
        : toStr;

    return (
      <div key={key} className="grid grid-cols-[100px_1fr_auto_1fr] gap-2 items-center text-sm py-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          {FIELD_LABELS[key] || key}
        </span>
        <span className="truncate text-red-400/80 line-through">{displayFrom}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="truncate text-green-400">{displayTo}</span>
      </div>
    );
  };

  // ─── View: Candidates ───────────────────────────────────────────────────

  const renderCandidatesView = () => (
    <>
      {/* Current status */}
      {musicbrainzId && (
        <div className="flex items-center gap-2 px-6 py-2 bg-primary/5 border-b border-border text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">
            Bereits verknüpft: <code className="text-xs">{musicbrainzId}</code>
          </span>
          <a
            href={`https://musicbrainz.org/release/${musicbrainzId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-primary hover:underline text-xs flex items-center gap-1"
          >
            Öffnen <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
        {/* Auto-search results */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Disc3 className="h-4 w-4" />
            Automatische Suche
            <span className="text-xs font-normal text-muted-foreground">
              für „{albumTitle}" von {artistName}
            </span>
          </h3>

          {candidatesLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Suche in MusicBrainz...
            </div>
          )}

          {candidatesError && (
            <div className="flex items-center gap-2 text-sm text-red-400 py-2">
              <AlertCircle className="h-4 w-4" />
              Fehler bei der automatischen Suche
            </div>
          )}

          {candidates && candidates.candidates.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              Keine automatischen Treffer gefunden. Versuche die manuelle Suche.
            </p>
          )}

          {candidates && candidates.candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.autoMatch && renderCandidateCard(candidates.autoMatch, true)}
              {candidates.candidates
                .filter((c) => c.release.id !== candidates.autoMatch?.release.id)
                .map((c) => renderCandidateCard(c, false))}
            </div>
          )}
        </div>

        {/* Manual search */}
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Search className="h-4 w-4" />
            Manuelle Suche
          </h3>

          <div className="flex gap-2">
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              placeholder="Album, Künstler oder MusicBrainz-ID eingeben..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleManualSearch}
              disabled={isManualSearching || !manualQuery.trim()}
            >
              {isManualSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {manualResults !== null && (
            <div className="mt-3 space-y-2">
              {manualResults.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">Keine Ergebnisse gefunden.</p>
              )}
              {manualResults.map(renderManualResultCard)}
            </div>
          )}
        </div>
      </div>

      {/* Loading overlay for preview */}
      {previewMutation.isPending && (
        <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Lade Vorschau...
          </div>
        </div>
      )}
    </>
  );

  // ─── View: Preview ──────────────────────────────────────────────────────

  const renderPreviewView = () => {
    if (!previewData) return null;
    const albumChanges = previewData.changes.album;
    const trackChanges = previewData.changes.tracks;
    const hasAlbumChanges = Object.entries(albumChanges).some(
      ([, c]) => String(c.from ?? '–') !== String(c.to ?? '–'),
    );

    return (
      <>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Album changes */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Album-Änderungen</h3>
            {hasAlbumChanges ? (
              <div className="rounded-lg border border-border p-3 space-y-0.5">
                {Object.entries(albumChanges).map(([key, change]) =>
                  renderChangeRow(key, change),
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Keine Album-Änderungen.</p>
            )}
          </div>

          {/* Track changes */}
          {trackChanges.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">
                Tracks von MusicBrainz ({trackChanges.length})
              </h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[40px_1fr_70px] gap-2 px-3 py-1.5 text-xs text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                  <span>#</span>
                  <span>Titel</span>
                  <span className="text-right">Dauer</span>
                </div>
                {trackChanges.map((t, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[40px_1fr_70px] gap-2 px-3 py-1.5 text-sm border-b border-border last:border-0"
                  >
                    <span className="text-muted-foreground tabular-nums">
                      {t.discNumber > 1 ? `${t.discNumber}.` : ''}
                      {t.trackNumber}
                    </span>
                    <span className="truncate">{t.title}</span>
                    <span className="text-right text-muted-foreground tabular-nums">
                      {t.duration ? formatDuration(t.duration) : '–'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewMutation.isError && (
            <p className="text-sm text-red-500">
              Fehler beim Laden der Vorschau: {previewMutation.error.message}
            </p>
          )}

          {applyMutation.isError && (
            <p className="text-sm text-red-500">
              Fehler beim Anwenden: {applyMutation.error.message}
            </p>
          )}
        </div>

        {/* Preview footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setView('candidates');
              setPreviewData(null);
              setSelectedReleaseId(null);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
          <div className="flex items-center gap-2">
            <a
              href={`https://musicbrainz.org/release/${selectedReleaseId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              MusicBrainz <ExternalLink className="h-3 w-3" />
            </a>
            <Button
              type="button"
              size="sm"
              onClick={() => selectedReleaseId && applyMutation.mutate(selectedReleaseId)}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Änderungen übernehmen
            </Button>
          </div>
        </div>
      </>
    );
  };

  // ─── View: Success ──────────────────────────────────────────────────────

  const renderSuccessView = () => (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-12">
      <CheckCircle2 className="h-12 w-12 text-primary" />
      <div className="text-center">
        <h3 className="text-lg font-semibold">Erfolgreich verknüpft</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Das Album wurde mit MusicBrainz verknüpft und die Metadaten wurden aktualisiert.
        </p>
      </div>
      <Button onClick={onClose} size="sm">
        Schließen
      </Button>
    </div>
  );

  // ─── Main render ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded bg-[#BA478F]/15 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-[#BA478F]">MB</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">
                {view === 'preview' ? 'Vorschau der Änderungen' : 'MusicBrainz-Verknüpfung'}
              </h2>
              {view === 'candidates' && (
                <p className="text-xs text-muted-foreground truncate">
                  Album mit MusicBrainz-Datenbank abgleichen
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        {view === 'candidates' && renderCandidatesView()}
        {view === 'preview' && renderPreviewView()}
        {view === 'success' && renderSuccessView()}
      </div>
    </div>
  );
}
