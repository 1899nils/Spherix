-- AlterTable: add Letterboxd score (0–5 scale) to movies and series
ALTER TABLE "movies" ADD COLUMN "letterboxd_score" DOUBLE PRECISION;
ALTER TABLE "series" ADD COLUMN "letterboxd_score" DOUBLE PRECISION;
