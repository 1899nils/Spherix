-- Add configurable media paths to user_settings
-- These allow changing scan paths from the Settings UI instead of .env files
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "music_path" TEXT;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "video_path" TEXT;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "audiobook_path" TEXT;
