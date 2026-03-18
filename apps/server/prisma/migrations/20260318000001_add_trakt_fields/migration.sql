-- AlterTable: add Trakt Client ID to user settings
ALTER TABLE "user_settings" ADD COLUMN "trakt_client_id" TEXT;

-- AlterTable: add Trakt community rating and vote count to movies
ALTER TABLE "movies" ADD COLUMN "trakt_rating" DOUBLE PRECISION;
ALTER TABLE "movies" ADD COLUMN "trakt_votes"  INTEGER;
