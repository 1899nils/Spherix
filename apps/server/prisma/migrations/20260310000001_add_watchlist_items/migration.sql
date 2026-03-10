-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album_title" TEXT,
    "cover_url" TEXT,
    "duration" INTEGER,
    "track_id" TEXT,
    "mb_recording_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'radio',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watchlist_items_user_id_idx" ON "watchlist_items"("user_id");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "watchlist_items_user_id_title_artist_key" ON "watchlist_items"("user_id", "title", "artist");

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
