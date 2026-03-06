-- Add YouTube API key to user_settings table
ALTER TABLE "user_settings" ADD COLUMN "youtube_api_key" TEXT;
