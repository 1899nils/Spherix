-- AddColumn: originalTitle, releaseDate, studio, network, logoPath to movies and series

ALTER TABLE "movies"
  ADD COLUMN IF NOT EXISTS "original_title" TEXT,
  ADD COLUMN IF NOT EXISTS "release_date"   TEXT,
  ADD COLUMN IF NOT EXISTS "studio"         TEXT,
  ADD COLUMN IF NOT EXISTS "network"        TEXT,
  ADD COLUMN IF NOT EXISTS "logo_path"      TEXT;

ALTER TABLE "series"
  ADD COLUMN IF NOT EXISTS "original_title" TEXT,
  ADD COLUMN IF NOT EXISTS "release_date"   TEXT,
  ADD COLUMN IF NOT EXISTS "studio"         TEXT,
  ADD COLUMN IF NOT EXISTS "network"        TEXT,
  ADD COLUMN IF NOT EXISTS "logo_path"      TEXT;
