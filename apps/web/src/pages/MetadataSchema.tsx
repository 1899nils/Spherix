import { useState } from 'react';
import type React from 'react';

// ============================================================
// CORE METADATA SCHEMA - Unified Media Server Concept v1.1
// Sources: Plex, Jellyfin, Audiobookshelf
// ============================================================
const SCHEMA = {
  libraryTypes: [
    'movies', 'tvshows', 'music', 'musicvideos', 'audiobooks', 'podcasts', 'videos',
  ],
  ratingAgencies: {
    film: ['FSK', 'MPAA', 'BBFC', 'USK', 'DEJUS'],
    tv:   ['FSK', 'TV-MA', 'TV-14', 'TV-PG', 'TV-G', 'TV-Y7', 'TV-Y'],
  },
  providers: {
    movies:      ['TheMovieDB', 'IMDb', 'OMDb', 'Fanart.tv'],
    tvshows:     ['TheMovieDB', 'TheTVDB', 'IMDb', 'Fanart.tv'],
    music:       ['MusicBrainz', 'LastFM', 'Spotify', 'Deezer', 'Discogs'],
    musicvideos: ['TheMovieDB', 'MusicBrainz', 'Fanart.tv'],
    audiobooks:  ['Audible (Audnexus)', 'Google Books', 'OpenLibrary', 'iTunes', 'Custom Provider API'],
    podcasts:    ['PodcastIndex', 'RSS Feed (direkt)'],
    videos:      ['TheMovieDB', 'Local only'],
  } as Record<string, string[]>,
  imageTypes: {
    movies:     ['poster', 'backdrop', 'logo', 'thumb', 'banner', 'clearart', 'discart'],
    tvshows:    ['poster', 'backdrop', 'logo', 'thumb', 'banner', 'season-poster', 'season-banner', 'episode-thumb'],
    music:      ['cover', 'artist-photo', 'artist-backdrop', 'disc', 'logo'],
    audiobooks: ['cover', 'author-photo'],
    podcasts:   ['cover', 'episode-thumb'],
    videos:     ['thumb', 'backdrop'],
  } as Record<string, string[]>,
};

interface FieldDef {
  id: string;
  label: string;
  type: string;
  required: boolean;
  plex: boolean;
  jf: boolean;
  abs: boolean;
  description: string;
}

const FIELDS: Record<string, FieldDef[]> = {
  shared: [
    { id: 'title',           label: 'Titel',               type: 'string',   required: true,  plex: true,  jf: true,  abs: true,  description: 'Primärer Anzeigename' },
    { id: 'original_title',  label: 'Originaltitel',       type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Titel in Originalsprache' },
    { id: 'sort_title',      label: 'Sortiertitel',        type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: "Für alphabetische Sortierung (z.B. 'Matrix, The')" },
    { id: 'subtitle',        label: 'Untertitel',          type: 'string',   required: false, plex: false, jf: false, abs: true,  description: 'Untertitel / Zusatztitel (ABS: aus Dateiname geparst)' },
    { id: 'overview',        label: 'Beschreibung',        type: 'text',     required: false, plex: true,  jf: true,  abs: true,  description: 'Handlungszusammenfassung oder Inhaltsbeschreibung' },
    { id: 'year',            label: 'Erscheinungsjahr',    type: 'number',   required: true,  plex: true,  jf: true,  abs: true,  description: 'Produktionsjahr / Erscheinungsjahr' },
    { id: 'date_added',      label: 'Hinzugefügt am',      type: 'datetime', required: true,  plex: true,  jf: true,  abs: true,  description: 'Zeitpunkt des Hinzufügens zur Bibliothek' },
    { id: 'date_modified',   label: 'Zuletzt geändert',    type: 'datetime', required: true,  plex: true,  jf: true,  abs: true,  description: 'Letztes Metadaten-Update' },
    { id: 'genres',          label: 'Genres',              type: 'tags',     required: false, plex: true,  jf: true,  abs: true,  description: 'Genrezuordnungen (mehrfach möglich)' },
    { id: 'tags',            label: 'Tags',                type: 'tags',     required: false, plex: true,  jf: true,  abs: true,  description: 'Benutzerdefinierte Schlagwörter' },
    { id: 'community_rating',label: 'Community-Bewertung', type: 'float',    required: false, plex: true,  jf: true,  abs: false, description: 'Externe Bewertung (0–10, z.B. IMDb-Score)' },
    { id: 'critic_rating',   label: 'Kritiker-Bewertung',  type: 'float',    required: false, plex: false, jf: true,  abs: false, description: 'Kritikerbewertung (0–100, z.B. Metascore)' },
    { id: 'user_rating',     label: 'Eigene Bewertung',    type: 'float',    required: false, plex: true,  jf: true,  abs: false, description: 'Vom Benutzer vergeben (0–10)' },
    { id: 'content_rating',  label: 'Altersfreigabe',      type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'FSK, MPAA, PEGI etc.' },
    { id: 'language',        label: 'Sprache (Inhalt)',    type: 'string',   required: false, plex: true,  jf: true,  abs: true,  description: 'ISO 639-1 Code (de, en, fr...)' },
    { id: 'provider_ids',    label: 'Externe IDs',         type: 'map',      required: false, plex: true,  jf: true,  abs: true,  description: 'IDs bei externen Datenbanken (IMDb, TMDb, Audible ASIN...)' },
    { id: 'images',          label: 'Bilder',              type: 'images',   required: false, plex: true,  jf: true,  abs: true,  description: 'Cover, Poster, Backdrop etc.' },
    { id: 'locked',          label: 'Metadaten gesperrt',  type: 'bool',     required: false, plex: true,  jf: true,  abs: true,  description: 'Verhindert automatische Überschreibung beim Scan' },
  ],
  movies: [
    { id: 'studio',          label: 'Studio',              type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Produzierendes Studio' },
    { id: 'collection',      label: 'Kollektion',          type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Zugehörige Filmreihe (MCU, Bond...)' },
    { id: 'collection_index',label: 'Position in Reihe',  type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Reihenfolge innerhalb der Kollektion' },
    { id: 'runtime',         label: 'Laufzeit (min)',      type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Filmlänge in Minuten' },
    { id: 'people',          label: 'Personen',            type: 'people',   required: false, plex: true,  jf: true,  abs: false, description: 'Regisseur, Cast, Produzenten, Autoren...' },
    { id: 'country',         label: 'Produktionsland',     type: 'tags',     required: false, plex: true,  jf: true,  abs: false, description: 'ISO 3166-1 Ländercodes' },
    { id: 'trailer_url',     label: 'Trailer-URL',         type: 'url',      required: false, plex: true,  jf: true,  abs: false, description: 'Lokaler Pfad oder YouTube-URL' },
    { id: 'chapters',        label: 'Kapitel',             type: 'chapters', required: false, plex: true,  jf: true,  abs: false, description: 'Zeitmarken für Kapitelnavigation' },
    { id: 'edition',         label: 'Edition',             type: 'string',   required: false, plex: true,  jf: false, abs: false, description: "Director's Cut, Extended, Theatrical..." },
  ],
  tvshows: [
    { id: 'status',          label: 'Status',              type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Continuing, Ended, Cancelled, Upcoming' },
    { id: 'network',         label: 'Sender/Netzwerk',     type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Ausstrahlender Sender' },
    { id: 'air_time',        label: 'Ausstrahlungszeit',   type: 'string',   required: false, plex: false, jf: true,  abs: false, description: 'Wochentag und Uhrzeit (Montag 20:15)' },
    { id: 'episode_count',   label: 'Episodenanzahl',      type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Gesamtanzahl Episoden (alle Staffeln)' },
    { id: 'season_count',    label: 'Staffelanzahl',       type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Anzahl regulärer Staffeln' },
    { id: 'people',          label: 'Personen',            type: 'people',   required: false, plex: true,  jf: true,  abs: false, description: 'Schöpfer, Produzenten, reguläre Cast...' },
    { id: 'seasons',         label: 'Staffeln',            type: 'seasons',  required: true,  plex: true,  jf: true,  abs: false, description: 'Staffel-Metadaten (verschachtelt)' },
  ],
  season: [
    { id: 'season_number',   label: 'Staffelnummer',       type: 'number',   required: true,  plex: true,  jf: true,  abs: false, description: '0 = Specials/Extras' },
    { id: 'season_name',     label: 'Staffelname',         type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Optionaler Name der Staffel' },
    { id: 'overview',        label: 'Beschreibung',        type: 'text',     required: false, plex: true,  jf: true,  abs: false, description: 'Staffel-Zusammenfassung' },
    { id: 'year',            label: 'Erscheinungsjahr',    type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Produktionsjahr der Staffel' },
    { id: 'images',          label: 'Bilder',              type: 'images',   required: false, plex: true,  jf: true,  abs: false, description: 'Staffelposter, -banner' },
    { id: 'episodes',        label: 'Episoden',            type: 'episodes', required: true,  plex: true,  jf: true,  abs: false, description: 'Episoden-Metadaten' },
  ],
  episode: [
    { id: 'episode_number',  label: 'Episodennummer',      type: 'number',   required: true,  plex: true,  jf: true,  abs: false, description: 'Laufende Nummer innerhalb der Staffel' },
    { id: 'absolute_number', label: 'Abs. Episodennummer', type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Episodennummer über alle Staffeln hinweg' },
    { id: 'title',           label: 'Episodentitel',       type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Titel der einzelnen Episode' },
    { id: 'overview',        label: 'Beschreibung',        type: 'text',     required: false, plex: true,  jf: true,  abs: false, description: 'Inhaltszusammenfassung der Episode' },
    { id: 'air_date',        label: 'Erstausstrahlung',    type: 'date',     required: false, plex: true,  jf: true,  abs: false, description: 'Datum der Erstausstrahlung' },
    { id: 'runtime',         label: 'Laufzeit (min)',      type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Episodenlänge in Minuten' },
    { id: 'images',          label: 'Vorschaubild',        type: 'images',   required: false, plex: true,  jf: true,  abs: false, description: 'Episode-Thumbnail' },
    { id: 'people',          label: 'Personen',            type: 'people',   required: false, plex: true,  jf: true,  abs: false, description: 'Gastdarsteller, Regisseur dieser Episode' },
  ],
  music_album: [
    { id: 'artist',          label: 'Künstler',            type: 'string',   required: true,  plex: true,  jf: true,  abs: false, description: 'Interpretierender Künstler / Band' },
    { id: 'album_artist',    label: 'Albumkünstler',       type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Primärer Albumkünstler (für Compilations)' },
    { id: 'album',           label: 'Album',               type: 'string',   required: true,  plex: true,  jf: true,  abs: false, description: 'Albumname' },
    { id: 'disc_count',      label: 'CD-Anzahl',           type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Anzahl der Scheiben' },
    { id: 'track_count',     label: 'Track-Anzahl',        type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Gesamtanzahl der Titel' },
    { id: 'label',           label: 'Label',               type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Plattenhaus/Vertrieb' },
    { id: 'musicbrainz_id',  label: 'MusicBrainz ID',      type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Eindeutige MusicBrainz Release-GUID' },
    { id: 'release_type',    label: 'Release-Typ',         type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Album, Single, EP, Live, Compilation, Soundtrack...' },
    { id: 'tracks',          label: 'Tracks',              type: 'tracks',   required: true,  plex: true,  jf: true,  abs: false, description: 'Track-Metadaten (verschachtelt)' },
  ],
  music_track: [
    { id: 'track_number',    label: 'Tracknummer',         type: 'number',   required: true,  plex: true,  jf: true,  abs: false, description: 'Position auf der CD/Disc' },
    { id: 'disc_number',     label: 'Disc-Nummer',         type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Bei Mehrdiscalbum: Scheibennummer' },
    { id: 'title',           label: 'Titel',               type: 'string',   required: true,  plex: true,  jf: true,  abs: false, description: 'Songtitel' },
    { id: 'artist',          label: 'Künstler',            type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'Abweichender Trackkünstler (Featured)' },
    { id: 'duration',        label: 'Dauer (ms)',          type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Länge in Millisekunden' },
    { id: 'bpm',             label: 'BPM',                 type: 'number',   required: false, plex: false, jf: true,  abs: false, description: 'Beats per Minute' },
    { id: 'lyrics',          label: 'Lyrics',              type: 'text',     required: false, plex: false, jf: true,  abs: false, description: 'Songtext (plain oder LRC-Format)' },
    { id: 'isrc',            label: 'ISRC',                type: 'string',   required: false, plex: false, jf: true,  abs: false, description: 'International Standard Recording Code' },
  ],
  audiobook: [
    { id: 'title',           label: 'Titel',               type: 'string',   required: true,  plex: false, jf: true,  abs: true,  description: 'Vollständiger Buchtitel' },
    { id: 'subtitle',        label: 'Untertitel',          type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: "Untertitel (ABS: aus Ordnername nach ' - ' geparst)" },
    { id: 'author',          label: 'Autor(en)',           type: 'tags',     required: true,  plex: false, jf: true,  abs: true,  description: 'Mehrere Autoren möglich. ABS: aus übergeordnetem Ordner geparst' },
    { id: 'narrator',        label: 'Sprecher',            type: 'tags',     required: false, plex: false, jf: true,  abs: true,  description: 'ABS: aus Ordnername in {geschweifte Klammern} geparst' },
    { id: 'publisher',       label: 'Verlag / Publisher',  type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'Publizierender Verlag' },
    { id: 'published_year',  label: 'Erscheinungsjahr',    type: 'number',   required: false, plex: false, jf: true,  abs: true,  description: 'ABS: aus Ordnername (YYYY) oder YYYY- geparst' },
    { id: 'published_date',  label: 'Erscheinungsdatum',   type: 'date',     required: false, plex: false, jf: true,  abs: true,  description: 'Vollständiges Datum YYYY-MM-DD' },
    { id: 'series',          label: 'Buchreihe',           type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'Name der Buchserie. ABS: aus Großelternordner geparst' },
    { id: 'series_sequence', label: 'Band / Position',     type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'Bandnummer (Dezimalzahlen ok: 1, 1.5, 2)' },
    { id: 'asin',            label: 'Audible ASIN',        type: 'string',   required: false, plex: false, jf: false, abs: true,  description: 'Amazon Standard Identification Number' },
    { id: 'isbn',            label: 'ISBN',                type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'ISBN-10 oder ISBN-13' },
    { id: 'description',     label: 'Beschreibung',        type: 'text',     required: false, plex: false, jf: true,  abs: true,  description: 'Klappentext. ABS: alternativ aus desc.txt im Ordner' },
    { id: 'genres',          label: 'Genres',              type: 'tags',     required: false, plex: false, jf: true,  abs: true,  description: 'Mehrfach möglich' },
    { id: 'language',        label: 'Sprache',             type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'ISO 639-1 Code' },
    { id: 'explicit',        label: 'Explizit',            type: 'bool',     required: false, plex: false, jf: false, abs: true,  description: 'Enthält explizite Inhalte' },
    { id: 'abridged',        label: 'Gekürzt',             type: 'bool',     required: false, plex: false, jf: false, abs: true,  description: 'Ungekürzt (Unabridged) vs. Gekürzt (Abridged)' },
    { id: 'duration',        label: 'Gesamtdauer',         type: 'number',   required: false, plex: false, jf: true,  abs: true,  description: 'Laufzeit in Sekunden (über alle Tracks summiert)' },
    { id: 'chapters',        label: 'Kapitel',             type: 'chapters', required: false, plex: false, jf: true,  abs: true,  description: 'ABS: aus Audiodatei (m4b embedded) oder Audnexus API' },
    { id: 'tracks',          label: 'Audio-Tracks',        type: 'tracks',   required: true,  plex: false, jf: true,  abs: true,  description: 'Einzelne Audiodateien' },
  ],
  audiobook_track: [
    { id: 'track_number',    label: 'Track-Nummer',        type: 'number',   required: true,  plex: false, jf: true,  abs: true,  description: 'ABS: aus ID3-Tag oder aus Dateinamen geparst' },
    { id: 'title',           label: 'Tracktitel',          type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'Titel des Tracks / Kapitels' },
    { id: 'duration',        label: 'Dauer (s)',           type: 'number',   required: false, plex: false, jf: true,  abs: true,  description: 'Trackdauer in Sekunden' },
    { id: 'path',            label: 'Dateipfad',           type: 'string',   required: true,  plex: false, jf: true,  abs: true,  description: 'Absoluter Pfad zur Audiodatei' },
    { id: 'codec',           label: 'Codec',               type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'mp3, aac, opus, flac, m4b...' },
    { id: 'bitrate',         label: 'Bitrate (kbps)',      type: 'number',   required: false, plex: false, jf: true,  abs: true,  description: 'Audiobitrate des Tracks' },
    { id: 'embedded_cover',  label: 'Embedded Cover',      type: 'bool',     required: false, plex: false, jf: false, abs: true,  description: 'Ob ein Cover-Bild in der Audiodatei eingebettet ist' },
  ],
  audiobook_chapter: [
    { id: 'id',              label: 'Kapitel-ID',          type: 'number',   required: true,  plex: false, jf: true,  abs: true,  description: 'Laufende Nummer' },
    { id: 'start',           label: 'Startzeit (s)',       type: 'float',    required: true,  plex: false, jf: true,  abs: true,  description: 'Startposition in Sekunden' },
    { id: 'end',             label: 'Endzeit (s)',         type: 'float',    required: true,  plex: false, jf: true,  abs: true,  description: 'Endposition in Sekunden' },
    { id: 'title',           label: 'Kapiteltitel',        type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'Name des Kapitels' },
  ],
  abs_author: [
    { id: 'name',            label: 'Name',                type: 'string',   required: true,  plex: false, jf: false, abs: true,  description: 'Vollständiger Autorenname' },
    { id: 'akas',            label: 'Pseudonyme / AKA',   type: 'tags',     required: false, plex: false, jf: false, abs: true,  description: 'Alternative Namen / Pseudonyme' },
    { id: 'description',     label: 'Biografie',           type: 'text',     required: false, plex: false, jf: false, abs: true,  description: 'Biographische Beschreibung' },
    { id: 'image',           label: 'Autorenfoto',         type: 'image',    required: false, plex: false, jf: false, abs: true,  description: 'Profilfoto des Autors' },
  ],
  podcast: [
    { id: 'feed_url',        label: 'RSS Feed URL',        type: 'url',      required: true,  plex: false, jf: true,  abs: true,  description: 'Podcast RSS-Feed URL (Basis für Auto-Download)' },
    { id: 'author',          label: 'Autor / Podcast-Host',type: 'string',   required: false, plex: false, jf: true,  abs: true,  description: 'Ersteller des Podcasts' },
    { id: 'podcast_type',    label: 'Podcast-Typ',         type: 'string',   required: false, plex: false, jf: false, abs: true,  description: 'episodic (Standard) oder serial (chronologisch)' },
    { id: 'explicit',        label: 'Explizit',            type: 'bool',     required: false, plex: false, jf: false, abs: true,  description: 'Enthält explizite Inhalte laut Feed' },
    { id: 'auto_download',   label: 'Auto-Download',       type: 'bool',     required: false, plex: false, jf: false, abs: true,  description: 'ABS: Neue Episoden automatisch herunterladen' },
    { id: 'episode_count',   label: 'Episodenanzahl',      type: 'number',   required: false, plex: false, jf: true,  abs: true,  description: 'Gesamtanzahl Episoden im Feed' },
  ],
  podcast_episode: [
    { id: 'title',           label: 'Titel',               type: 'string',   required: true,  plex: false, jf: true,  abs: true,  description: 'Episodentitel' },
    { id: 'description',     label: 'Beschreibung',        type: 'text',     required: false, plex: false, jf: true,  abs: true,  description: 'Shownotes / Episodenbeschreibung' },
    { id: 'episode_number',  label: 'Episodennummer',      type: 'number',   required: false, plex: false, jf: true,  abs: true,  description: 'Laufende Episodennummer' },
    { id: 'episode_type',    label: 'Episodentyp',         type: 'string',   required: false, plex: false, jf: false, abs: true,  description: 'full, trailer, bonus' },
    { id: 'pub_date',        label: 'Erscheinungsdatum',   type: 'datetime', required: false, plex: false, jf: true,  abs: true,  description: 'Veröffentlichungsdatum aus RSS pubDate' },
    { id: 'duration',        label: 'Dauer (s)',           type: 'number',   required: false, plex: false, jf: true,  abs: true,  description: 'Episodendauer in Sekunden' },
    { id: 'explicit',        label: 'Explizit',            type: 'bool',     required: false, plex: false, jf: false, abs: true,  description: 'Explizit-Flag aus RSS' },
    { id: 'guid',            label: 'RSS GUID',            type: 'string',   required: true,  plex: false, jf: false, abs: true,  description: 'Eindeutiger Identifier des RSS-Items' },
  ],
  playback_state: [
    { id: 'played',          label: 'Abgespielt',          type: 'bool',     required: false, plex: true,  jf: true,  abs: true,  description: 'Als abgespielt/gehört markiert' },
    { id: 'play_count',      label: 'Wiedergabeanzahl',    type: 'number',   required: false, plex: true,  jf: true,  abs: true,  description: 'Wie oft abgespielt' },
    { id: 'current_time',    label: 'Fortschritt (s)',     type: 'float',    required: false, plex: true,  jf: true,  abs: true,  description: 'Aktuelle Position in Sekunden' },
    { id: 'progress',        label: 'Fortschritt (%)',     type: 'float',    required: false, plex: true,  jf: true,  abs: true,  description: '0.0 – 1.0' },
    { id: 'is_finished',     label: 'Abgeschlossen',       type: 'bool',     required: false, plex: true,  jf: true,  abs: true,  description: 'Vollständig abgespielt' },
    { id: 'last_played',     label: 'Zuletzt abgespielt',  type: 'datetime', required: false, plex: true,  jf: true,  abs: true,  description: 'Zeitstempel letzter Wiedergabe' },
    { id: 'favorite',        label: 'Favorit',             type: 'bool',     required: false, plex: true,  jf: true,  abs: false, description: 'Favorit-Markierung' },
    { id: 'bookmarks',       label: 'Lesezeichen',         type: 'array',    required: false, plex: true,  jf: true,  abs: true,  description: 'Benutzerdefinierte Zeitmarken mit Notizen' },
  ],
  media_file: [
    { id: 'path',            label: 'Dateipfad',           type: 'string',   required: true,  plex: true,  jf: true,  abs: true,  description: 'Absoluter Pfad zur Mediendatei' },
    { id: 'container',       label: 'Container',           type: 'string',   required: false, plex: true,  jf: true,  abs: true,  description: 'mkv, mp4, avi, m4b, mp3, flac...' },
    { id: 'size',            label: 'Dateigröße (bytes)',  type: 'number',   required: false, plex: true,  jf: true,  abs: true,  description: 'Dateigröße in Bytes' },
    { id: 'bitrate',         label: 'Bitrate (kbps)',      type: 'number',   required: false, plex: true,  jf: true,  abs: true,  description: 'Gesamtbitrate' },
    { id: 'duration',        label: 'Dauer',               type: 'number',   required: false, plex: true,  jf: true,  abs: true,  description: 'Dauer in Sekunden' },
    { id: 'video_streams',   label: 'Videostreams',        type: 'streams',  required: false, plex: true,  jf: true,  abs: false, description: 'Codec, Auflösung, HDR, Framerate' },
    { id: 'audio_streams',   label: 'Audiostreams',        type: 'streams',  required: false, plex: true,  jf: true,  abs: true,  description: 'Codec, Kanäle, Bitrate, Sprache' },
    { id: 'subtitle_streams',label: 'Untertitelstreams',   type: 'streams',  required: false, plex: true,  jf: true,  abs: false, description: 'Format, Sprache, Forced-Flag' },
  ],
  video_stream: [
    { id: 'codec',           label: 'Codec',               type: 'string',   required: true,  plex: true,  jf: true,  abs: false, description: 'H.264, H.265, AV1, VP9...' },
    { id: 'width',           label: 'Breite (px)',         type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Horizontale Auflösung' },
    { id: 'height',          label: 'Höhe (px)',           type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: 'Vertikale Auflösung' },
    { id: 'aspect_ratio',    label: 'Seitenverhältnis',    type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: '16:9, 2.39:1, 4:3...' },
    { id: 'frame_rate',      label: 'Framerate',           type: 'float',    required: false, plex: true,  jf: true,  abs: false, description: 'Bilder pro Sekunde' },
    { id: 'bit_depth',       label: 'Bittiefe',            type: 'number',   required: false, plex: true,  jf: true,  abs: false, description: '8, 10, 12 Bit' },
    { id: 'hdr_type',        label: 'HDR-Format',          type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'SDR, HDR10, HDR10+, Dolby Vision, HLG' },
    { id: 'color_space',     label: 'Farbraum',            type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'BT.709, BT.2020, P3...' },
  ],
  audio_stream: [
    { id: 'codec',           label: 'Codec',               type: 'string',   required: true,  plex: true,  jf: true,  abs: true,  description: 'AAC, AC3, EAC3, DTS, TrueHD, FLAC, MP3, Opus...' },
    { id: 'codec_profile',   label: 'Codec-Profil',        type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'DTS-HD MA, Atmos, DTS:X...' },
    { id: 'channels',        label: 'Kanäle',              type: 'number',   required: false, plex: true,  jf: true,  abs: true,  description: '2.0, 5.1, 7.1...' },
    { id: 'sample_rate',     label: 'Samplerate (Hz)',     type: 'number',   required: false, plex: true,  jf: true,  abs: true,  description: '44100, 48000, 96000...' },
    { id: 'bit_rate',        label: 'Bitrate (kbps)',      type: 'number',   required: false, plex: true,  jf: true,  abs: true,  description: 'Audiobitrate' },
    { id: 'language',        label: 'Sprache',             type: 'string',   required: false, plex: true,  jf: true,  abs: true,  description: 'ISO 639-2 Code (deu, eng, fra...)' },
    { id: 'default',         label: 'Standardstream',      type: 'bool',     required: false, plex: true,  jf: true,  abs: false, description: 'Wird bei Wiedergabe standardmäßig gewählt' },
  ],
  subtitle_stream: [
    { id: 'codec',           label: 'Format',              type: 'string',   required: true,  plex: true,  jf: true,  abs: false, description: 'SRT, ASS, PGS, DVDSUB, VTT...' },
    { id: 'language',        label: 'Sprache',             type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'ISO 639-2 Code' },
    { id: 'title',           label: 'Stream-Titel',        type: 'string',   required: false, plex: true,  jf: true,  abs: false, description: 'SDH, Forced, Full...' },
    { id: 'forced',          label: 'Erzwungen',           type: 'bool',     required: false, plex: true,  jf: true,  abs: false, description: 'Wird immer eingeblendet' },
    { id: 'default',         label: 'Standard',            type: 'bool',     required: false, plex: true,  jf: true,  abs: false, description: 'Standardmäßig aktiv' },
    { id: 'hearing_impaired',label: 'SDH',                 type: 'bool',     required: false, plex: false, jf: true,  abs: false, description: 'Hörgeschädigten-Untertitel' },
  ],
};

const NAMING: Record<string, { pattern: string; note: string }[]> = {
  movies: [
    { pattern: 'Movie Title (2023).mkv',                           note: 'Basis' },
    { pattern: 'Movie Title (2023) {tmdb-12345}.mkv',              note: 'Mit TMDb ID' },
    { pattern: "Movie Title (2023) {edition-Director's Cut}.mkv",  note: 'Edition-Tag (Plex)' },
  ],
  tvshows: [
    { pattern: 'Show Name/Season 01/Show Name S01E01.mkv',         note: 'Standard' },
    { pattern: 'Show Name/Specials/Show Name S00E01.mkv',          note: 'Specials' },
    { pattern: 'Show Name S01E01E02.mkv',                          note: 'Doppelfolge' },
  ],
  audiobooks: [
    { pattern: 'Author Name/Book Title/audiofiles.m4b',            note: 'Basis (ABS)' },
    { pattern: '2023 - Book Title/file.m4b',                       note: 'Mit Erscheinungsjahr' },
    { pattern: 'Author/Series Name/Book 2 - Title {Narrator}.m4b', note: 'Serie + Band + Sprecher' },
    { pattern: 'Author/Series/Book 1.5 - Title [ASIN].mp3',        note: 'Halbe Bandnummer + ASIN' },
    { pattern: 'cover.jpg  →  Cover-Override',                     note: 'ABS: cover.[jpg|png] im Ordner' },
  ],
  music: [
    { pattern: 'Artist/Album (Year)/01 - Track Title.flac',        note: 'Standard' },
    { pattern: 'Artist/Album (Year)/CD1/01 - Track.flac',          note: 'Mehrdiscalbum' },
  ],
  podcasts: [
    { pattern: 'Podcast Name/episode-title.mp3',                   note: 'ABS: Flat-Struktur (kein Staffelordner)' },
    { pattern: 'Podcast Name/2024-01-15 - Episode Title.mp3',      note: 'Mit Datum' },
  ],
};

const ABS_METADATA_EXAMPLE = `{
  "title": "The Way of Kings",
  "subtitle": "Book One of the Stormlight Archive",
  "authors": ["Brandon Sanderson"],
  "narrators": ["Michael Kramer", "Kate Reading"],
  "series": [
    { "name": "The Stormlight Archive", "sequence": "1" }
  ],
  "genres": ["Fantasy", "Epic Fantasy"],
  "publishedYear": "2010",
  "publisher": "Macmillan Audio",
  "description": "Roshar is a world of stone and storms...",
  "isbn": "9780765326355",
  "asin": "B004H9IYKE",
  "language": "en",
  "explicit": false,
  "abridged": false,
  "chapters": [
    { "id": 0, "start": 0, "end": 3842.5, "title": "Prelude: To Weep" },
    { "id": 1, "start": 3842.5, "end": 7210.0, "title": "Chapter 1: Stormblessed" }
  ]
}`;

const NFO_EXAMPLES: Record<string, string> = {
  movie: `<?xml version="1.0" encoding="UTF-8"?>
<movie>
  <title>The Matrix</title>
  <originaltitle>The Matrix</originaltitle>
  <year>1999</year>
  <plot>Ein Computerhacker entdeckt...</plot>
  <runtime>136</runtime>
  <genre>Action</genre>
  <genre>Science Fiction</genre>
  <studio>Warner Bros.</studio>
  <rating name="imdb" max="10" default="true">
    <value>8.7</value>
    <votes>2000000</votes>
  </rating>
  <uniqueid type="imdb" default="true">tt0133093</uniqueid>
  <uniqueid type="tmdb">603</uniqueid>
  <contentrating country="FSK">16</contentrating>
  <director>Lilly Wachowski</director>
  <actor>
    <n>Keanu Reeves</n>
    <role>Neo</role>
    <order>0</order>
  </actor>
  <lockdata>false</lockdata>
</movie>`,
  episode: `<?xml version="1.0" encoding="UTF-8"?>
<episodedetails>
  <title>Winter is Coming</title>
  <showtitle>Game of Thrones</showtitle>
  <season>1</season>
  <episode>1</episode>
  <aired>2011-04-17</aired>
  <plot>Der Norden des Königreiches...</plot>
  <runtime>62</runtime>
  <uniqueid type="tvdb">3254641</uniqueid>
  <director>Tim Van Patten</director>
  <actor>
    <n>Peter Dinklage</n>
    <role>Tyrion Lannister</role>
    <order>0</order>
  </actor>
</episodedetails>`,
};

// ── UI Helpers ─────────────────────────────────────────────────────────────

type BadgeColor = 'orange' | 'teal' | 'purple' | 'gray' | 'blue';

const badgeStyle = (color: BadgeColor): React.CSSProperties => {
  const cfg: Record<BadgeColor, { bg: string; border: string; text: string }> = {
    orange: { bg: '#fff7ed', border: '#c24400', text: '#c24400' },
    teal:   { bg: '#f0fdfa', border: '#007260', text: '#007260' },
    purple: { bg: '#faf5ff', border: '#5b21b6', text: '#5b21b6' },
    gray:   { bg: '#f9fafb', border: '#6b7280', text: '#6b7280' },
    blue:   { bg: '#eff6ff', border: '#1d4ed8', text: '#1d4ed8' },
  };
  const c = cfg[color];
  return { background: c.bg, border: `1px solid ${c.border}`, color: c.text, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' };
};

const SECTIONS = [
  { id: 'overview',    label: '🗂 Übersicht' },
  { id: 'shared',     label: '⚡ Shared Fields' },
  { id: 'movies',     label: '🎬 Filme' },
  { id: 'tvshows',    label: '📺 Serien' },
  { id: 'music',      label: '🎵 Musik' },
  { id: 'audiobooks', label: '🎧 Hörbücher' },
  { id: 'podcasts',   label: '🎙 Podcasts' },
  { id: 'streams',    label: '📡 Mediadaten' },
  { id: 'naming',     label: '📁 Dateinamen' },
  { id: 'nfo',        label: '📄 NFO / ABS Format' },
  { id: 'providers',  label: '🌐 Metadaten-Quellen' },
];

function CompatBadges({ plex, jf, abs }: { plex: boolean; jf: boolean; abs: boolean }) {
  return (
    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {plex && <span style={badgeStyle('orange')}>Plex</span>}
      {jf   && <span style={badgeStyle('teal')}>Jellyfin</span>}
      {abs  && <span style={badgeStyle('blue')}>ABS</span>}
    </span>
  );
}

function FieldTable({ fields, title }: { fields: FieldDef[]; title?: string }) {
  return (
    <div style={{ marginBottom: 32 }}>
      {title && <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h3>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
              {['Feldname', 'ID', 'Typ', 'Pflicht', 'Kompatibilität', 'Beschreibung'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{f.label}</td>
                <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#6d28d9', fontSize: 12, whiteSpace: 'nowrap' }}>{f.id}</td>
                <td style={{ padding: '7px 10px', color: '#666', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{f.type}</td>
                <td style={{ padding: '7px 10px' }}>
                  {f.required ? <span style={{ color: '#dc2626', fontWeight: 700 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>–</span>}
                </td>
                <td style={{ padding: '7px 10px' }}><CompatBadges plex={f.plex} jf={f.jf} abs={f.abs} /></td>
                <td style={{ padding: '7px 10px', color: '#475569', fontSize: 12, lineHeight: 1.5 }}>{f.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NamingCard({ type }: { type: string }) {
  const examples = NAMING[type];
  if (!examples) return null;
  const labels: Record<string, string> = {
    movies: '🎬 Filme', tvshows: '📺 Serien', audiobooks: '🎧 Hörbücher (Audiobookshelf)',
    music: '🎵 Musik', podcasts: '🎙 Podcasts',
  };
  return (
    <div style={{ marginBottom: 24, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: '#0f172a', color: '#94a3b8', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>{labels[type] || type}</div>
      {examples.map((ex, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: i < examples.length - 1 ? '1px solid #f1f5f9' : 'none', background: '#fff' }}>
          <code style={{ background: '#0f172a', color: '#7dd3fc', padding: '3px 10px', borderRadius: 5, fontSize: 12, flex: 1, wordBreak: 'break-all' }}>{ex.pattern}</code>
          <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 200 }}>{ex.note}</span>
        </div>
      ))}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 24, paddingBottom: 12, borderBottom: '2px solid #e2e8f0' }}>{children}</h2>;
}

function Overview() {
  return (
    <div>
      <H2>Einheitliches Metadatenkonzept v1.1</H2>
      <p style={{ color: '#475569', lineHeight: 1.8, marginBottom: 24 }}>
        Dieses Schema vereint die Metadaten-Konzepte von <strong>Plex</strong>, <strong>Jellyfin</strong> und <strong>Audiobookshelf (ABS)</strong> in einem einheitlichen Format.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Bibliothekstypen', val: SCHEMA.libraryTypes.length, icon: '📚' },
          { label: 'Shared Fields',    val: FIELDS.shared.length + FIELDS.playback_state.length, icon: '⚡' },
          { label: 'Hörbuch-Felder',  val: FIELDS.audiobook.length + FIELDS.audiobook_track.length + FIELDS.audiobook_chapter.length, icon: '🎧' },
          { label: 'Podcast-Felder',  val: FIELDS.podcast.length + FIELDS.podcast_episode.length, icon: '🎙' },
          { label: 'Stream-Felder',   val: FIELDS.video_stream.length + FIELDS.audio_stream.length + FIELDS.subtitle_stream.length, icon: '📡' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 26 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{c.val}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Aktive Bibliothekstypen</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {SCHEMA.libraryTypes.map(l => <span key={l} style={{ ...badgeStyle('teal'), fontSize: 13, padding: '5px 12px' }}>{l}</span>)}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Architekturprinzipien</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[
          { t: 'Hierarchisch & Verschachtelt', d: 'Library → Item → Season → Episode → Track. Metadaten erben von übergeordneten Elementen.' },
          { t: 'NFO & ABS-Format',             d: 'Jellyfin/Kodi NFO (XML) und Audiobookshelf metadata.abs (JSON) als Sidecar-Dateien.' },
          { t: 'Provider-Agnostisch',          d: 'Metadaten-Quellen per Bibliothekstyp konfigurierbar und priorisierbar.' },
          { t: 'User-State getrennt',          d: 'Fortschritt, Bookmarks und Bewertungen separat pro Nutzer.' },
          { t: 'Sperr-Mechanismus',            d: 'Felder global oder einzeln sperren (locked) gegen Auto-Überschreibung beim Scan.' },
          { t: 'ABS-Ordner-Parsing',           d: 'Audiobookshelf extrahiert Autor, Serie, Band, Sprecher, ASIN direkt aus Ordner- und Dateinamen.' },
        ].map(p => (
          <div key={p.t} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f172a', fontSize: 14 }}>{p.t}</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{p.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AudiobooksSection() {
  const [tab, setTab] = useState('fields');
  const tabs = [
    { id: 'fields',   label: 'Metadaten-Felder' },
    { id: 'tracks',   label: 'Track-Felder' },
    { id: 'chapters', label: 'Kapitel-Felder' },
    { id: 'author',   label: 'Autoren-Entität (ABS)' },
    { id: 'absfile',  label: 'metadata.abs Beispiel' },
  ];
  return (
    <div>
      <H2>🎧 Hörbücher (Audiobookshelf-Integration)</H2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 14px', background: tab === t.id ? '#0f172a' : '#f1f5f9',
            color: tab === t.id ? '#7dd3fc' : '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'fields'   && <FieldTable fields={FIELDS.audiobook} />}
      {tab === 'tracks'   && <FieldTable fields={FIELDS.audiobook_track} />}
      {tab === 'chapters' && <FieldTable fields={FIELDS.audiobook_chapter} />}
      {tab === 'author'   && <>
        <p style={{ color: '#475569', marginBottom: 16, fontSize: 14 }}>ABS verwaltet Autoren als eigene Entität mit Profil, Foto und verlinkten Büchern.</p>
        <FieldTable fields={FIELDS.abs_author} />
      </>}
      {tab === 'absfile'  && <>
        <p style={{ color: '#475569', marginBottom: 16, fontSize: 14 }}>Die <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>metadata.abs</code> Datei liegt neben den Audiodateien und wird von ABS als persistenter Cache verwendet.</p>
        <pre style={{ background: '#0f172a', color: '#7dd3fc', padding: 20, borderRadius: 10, fontSize: 12, overflow: 'auto', lineHeight: 1.7 }}>{ABS_METADATA_EXAMPLE}</pre>
      </>}
    </div>
  );
}

function NFOSection() {
  const [tab, setTab] = useState('movie');
  return (
    <div>
      <H2>Metadaten-Datei-Formate</H2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['movie', '🎬 Film NFO'], ['episode', '📺 Episoden NFO'], ['absfile', '🎧 metadata.abs']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: '7px 14px', background: tab === id ? '#0f172a' : '#f1f5f9', color: tab === id ? '#7dd3fc' : '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{label}</button>
        ))}
      </div>
      <pre style={{ background: '#0f172a', color: '#7dd3fc', padding: 20, borderRadius: 10, fontSize: 12, overflow: 'auto', lineHeight: 1.7 }}>
        {tab === 'absfile' ? ABS_METADATA_EXAMPLE : NFO_EXAMPLES[tab]}
      </pre>
    </div>
  );
}

function ProvidersSection() {
  return (
    <div>
      <H2>Metadaten-Quellen</H2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 32 }}>
        {Object.entries(SCHEMA.providers).map(([type, providers]) => {
          const icons: Record<string, string> = { movies: '🎬', tvshows: '📺', music: '🎵', musicvideos: '🎥', audiobooks: '🎧', podcasts: '🎙', videos: '📹' };
          return (
            <div key={type} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12, color: '#0f172a' }}>{icons[type]} {type}</div>
              {providers.map((p, i) => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < providers.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ width: 20, height: 20, background: '#0f172a', color: '#7dd3fc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: '#334155' }}>{p}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#0f172a' }}>Bilderquellen pro Typ</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {Object.entries(SCHEMA.imageTypes).map(([type, imgs]) => (
          <div key={type} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: '#0f172a', fontSize: 13 }}>{type}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {imgs.map(img => <span key={img} style={{ ...badgeStyle('teal'), fontSize: 11 }}>{img}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetadataSchema() {
  const [active, setActive] = useState('overview');

  return (
    <div style={{ display: 'flex', fontFamily: "'Segoe UI',system-ui,sans-serif", minHeight: '100vh', background: '#f8fafc' }}>
      {/* Sidebar */}
      <div style={{ width: 230, background: '#0f172a', minHeight: '100vh', padding: '24px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #1e293b', marginBottom: 8 }}>
          <div style={{ color: '#7dd3fc', fontSize: 16, fontWeight: 800 }}>MediaMeta</div>
          <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>Unified Metadata Schema v1.1</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <span style={badgeStyle('orange')}>Plex</span>
            <span style={badgeStyle('teal')}>Jellyfin</span>
            <span style={badgeStyle('blue')}>ABS</span>
          </div>
        </div>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '9px 20px',
            background: active === s.id ? '#1e293b' : 'transparent',
            color: active === s.id ? '#7dd3fc' : '#94a3b8',
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active === s.id ? 700 : 400,
            borderLeft: active === s.id ? '3px solid #7dd3fc' : '3px solid transparent',
          }}>{s.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '32px 40px', maxWidth: 1200, overflowY: 'auto' }}>
        {active === 'overview'    && <Overview />}
        {active === 'shared'     && <><H2>Gemeinsame Felder (alle Typen)</H2><FieldTable fields={FIELDS.shared} /><FieldTable fields={FIELDS.playback_state} title="Wiedergabestatus & Fortschritt (user-spezifisch)" /></>}
        {active === 'movies'     && <><H2>Filmbibliothek</H2><FieldTable fields={FIELDS.movies} /></>}
        {active === 'tvshows'    && <><H2>Serien / TV Shows</H2><FieldTable fields={FIELDS.tvshows} /><FieldTable fields={FIELDS.season} title="Staffel-Felder" /><FieldTable fields={FIELDS.episode} title="Episoden-Felder" /></>}
        {active === 'music'      && <><H2>Musikbibliothek</H2><FieldTable fields={FIELDS.music_album} title="Album-Felder" /><FieldTable fields={FIELDS.music_track} title="Track-Felder" /></>}
        {active === 'audiobooks' && <AudiobooksSection />}
        {active === 'podcasts'   && <><H2>Podcasts</H2><FieldTable fields={FIELDS.podcast} title="Podcast-Felder" /><FieldTable fields={FIELDS.podcast_episode} title="Podcast-Episoden-Felder" /></>}
        {active === 'streams'    && <><H2>Mediadaten & Streams</H2><FieldTable fields={FIELDS.media_file} title="Datei-Metadaten" /><FieldTable fields={FIELDS.video_stream} title="Videostream" /><FieldTable fields={FIELDS.audio_stream} title="Audiostream" /><FieldTable fields={FIELDS.subtitle_stream} title="Untertitelstream" /></>}
        {active === 'naming'     && <><H2>Datei- und Ordnernamenskonventionen</H2>{Object.keys(NAMING).map(t => <NamingCard key={t} type={t} />)}</>}
        {active === 'nfo'        && <NFOSection />}
        {active === 'providers'  && <ProvidersSection />}
      </div>
    </div>
  );
}
