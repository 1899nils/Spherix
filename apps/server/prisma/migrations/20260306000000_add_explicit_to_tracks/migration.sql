-- Add explicit field to tracks table
ALTER TABLE "tracks" ADD COLUMN "explicit" BOOLEAN NOT NULL DEFAULT false;
