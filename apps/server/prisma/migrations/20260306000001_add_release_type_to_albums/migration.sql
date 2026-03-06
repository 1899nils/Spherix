-- Add releaseType field to albums table
ALTER TABLE "albums" ADD COLUMN "release_type" TEXT DEFAULT 'Album';
