-- AlterTable: add rating enrichment fields to movies
ALTER TABLE "movies" ADD COLUMN "imdb_id" TEXT;
ALTER TABLE "movies" ADD COLUMN "imdb_rating" DOUBLE PRECISION;
ALTER TABLE "movies" ADD COLUMN "rotten_tomatoes_score" INTEGER;
ALTER TABLE "movies" ADD COLUMN "metacritic_score" INTEGER;
ALTER TABLE "movies" ADD COLUMN "content_rating" TEXT;
ALTER TABLE "movies" ADD COLUMN "tagline" TEXT;
