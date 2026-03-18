-- AlterTable: add MDBList API key to user settings
ALTER TABLE "user_settings" ADD COLUMN "mdblist_api_key" TEXT;

-- AlterTable: add ratings scheduling fields to movies
ALTER TABLE "movies" ADD COLUMN "ratings_updated_at" TIMESTAMP(3);
ALTER TABLE "movies" ADD COLUMN "ratings_next_retry" TIMESTAMP(3);

-- AlterTable: add all rating and scheduling fields to series
ALTER TABLE "series" ADD COLUMN "imdb_id"               TEXT;
ALTER TABLE "series" ADD COLUMN "imdb_rating"           DOUBLE PRECISION;
ALTER TABLE "series" ADD COLUMN "rotten_tomatoes_score" INTEGER;
ALTER TABLE "series" ADD COLUMN "metacritic_score"      INTEGER;
ALTER TABLE "series" ADD COLUMN "trakt_rating"          DOUBLE PRECISION;
ALTER TABLE "series" ADD COLUMN "trakt_votes"           INTEGER;
ALTER TABLE "series" ADD COLUMN "content_rating"        TEXT;
ALTER TABLE "series" ADD COLUMN "ratings_updated_at"    TIMESTAMP(3);
ALTER TABLE "series" ADD COLUMN "ratings_next_retry"    TIMESTAMP(3);

-- CreateTable: daily quota tracking for MDBList API
CREATE TABLE "ratings_daily_quota" (
  "date"       TEXT NOT NULL,
  "used_today" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ratings_daily_quota_pkey" PRIMARY KEY ("date")
);
