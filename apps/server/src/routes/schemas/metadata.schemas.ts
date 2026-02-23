import { z } from 'zod';

export const trackMetadataSchema = z.object({
  title: z.string().min(1).optional(),
  artistName: z.string().min(1).optional(),
  albumName: z.string().min(1).optional(),
  trackNumber: z.number().int().positive().optional(),
  discNumber: z.number().int().positive().optional(),
  year: z.number().int().min(1000).max(9999).optional(),
  genre: z.string().optional(),
  lyrics: z.string().optional(),
});

export const albumMetadataSchema = z.object({
  title: z.string().min(1).optional(),
  artistName: z.string().min(1).optional(),
  year: z.number().int().min(1000).max(9999).optional(),
  genre: z.string().optional(),
  label: z.string().optional(),
  country: z.string().optional(),
  musicbrainzId: z.string().uuid().optional(),
});

export const matchMusicbrainzSchema = z.object({
  musicbrainzReleaseId: z.string().uuid(),
  confirm: z.boolean().default(false),
});

export type TrackMetadataInput = z.infer<typeof trackMetadataSchema>;
export type AlbumMetadataInput = z.infer<typeof albumMetadataSchema>;
export type MatchMusicbrainzInput = z.infer<typeof matchMusicbrainzSchema>;
