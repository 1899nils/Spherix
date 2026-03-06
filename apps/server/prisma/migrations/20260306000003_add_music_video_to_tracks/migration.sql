-- Add music video fields to tracks table
ALTER TABLE "tracks" ADD COLUMN "music_video_url" TEXT;
ALTER TABLE "tracks" ADD COLUMN "music_video_source" TEXT;
ALTER TABLE "tracks" ADD COLUMN "music_video_checked_at" TIMESTAMP;
