-- AlterTable: add tmdb_api_key to user_settings
ALTER TABLE "user_settings" ADD COLUMN "tmdb_api_key" TEXT;

-- AlterTable: add tmdb_id and rating to movies
ALTER TABLE "movies" ADD COLUMN "tmdb_id" INTEGER;
ALTER TABLE "movies" ADD COLUMN "rating" DOUBLE PRECISION;

-- AlterTable: add tmdb_id and rating to series
ALTER TABLE "series" ADD COLUMN "tmdb_id" INTEGER;
ALTER TABLE "series" ADD COLUMN "rating" DOUBLE PRECISION;
