-- Add addedAt field to playlist_tracks table
ALTER TABLE "playlist_tracks" ADD COLUMN "added_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
