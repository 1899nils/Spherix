-- CreateTable
CREATE TABLE "podcasts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "feed_url" TEXT NOT NULL,
    "website_url" TEXT,
    "itunes_id" TEXT,
    "last_fetched_at" TIMESTAMP(3),
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "podcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "podcast_episodes" (
    "id" TEXT NOT NULL,
    "podcast_id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audio_url" TEXT NOT NULL,
    "image_url" TEXT,
    "duration" INTEGER,
    "file_size" BIGINT,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "podcast_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "podcasts_feed_url_key" ON "podcasts"("feed_url");

-- CreateIndex
CREATE UNIQUE INDEX "podcasts_itunes_id_key" ON "podcasts"("itunes_id");

-- CreateIndex
CREATE INDEX "podcasts_title_idx" ON "podcasts"("title");

-- CreateIndex
CREATE UNIQUE INDEX "podcast_episodes_podcast_id_guid_key" ON "podcast_episodes"("podcast_id", "guid");

-- CreateIndex
CREATE INDEX "podcast_episodes_podcast_id_idx" ON "podcast_episodes"("podcast_id");

-- AddForeignKey
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_podcast_id_fkey" FOREIGN KEY ("podcast_id") REFERENCES "podcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
