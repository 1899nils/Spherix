-- AlterTable: add RT Audience Score and FSK rating to movies
ALTER TABLE "movies" ADD COLUMN "rotten_tomatoes_audience_score" INTEGER;
ALTER TABLE "movies" ADD COLUMN "fsk_rating" TEXT;

-- AlterTable: add RT Audience Score and FSK rating to series
ALTER TABLE "series" ADD COLUMN "rotten_tomatoes_audience_score" INTEGER;
ALTER TABLE "series" ADD COLUMN "fsk_rating" TEXT;
