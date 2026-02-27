-- AlterTable: add lastfm_api_key and lastfm_api_secret to user_settings
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "lastfm_api_key" TEXT;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "lastfm_api_secret" TEXT;

-- AlterTable: add missing playlist fields
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "cover_url" TEXT;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "is_pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "last_played_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "playlists_is_pinned_last_played_at_idx" ON "playlists"("is_pinned", "last_played_at");
