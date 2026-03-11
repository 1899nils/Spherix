-- Add listen_progress to podcast_episodes
ALTER TABLE "podcast_episodes" ADD COLUMN "listen_progress" INTEGER;
