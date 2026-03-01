-- CreateTable: genres
CREATE TABLE "genres" (
    "id"   TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable: movies
CREATE TABLE "movies" (
    "id"             TEXT      NOT NULL,
    "title"          TEXT      NOT NULL,
    "sort_title"     TEXT,
    "year"           INTEGER,
    "runtime"        INTEGER,
    "overview"       TEXT,
    "poster_path"    TEXT,
    "backdrop_path"  TEXT,
    "file_path"      TEXT      NOT NULL,
    "file_size"      BIGINT,
    "codec"          TEXT,
    "resolution"     TEXT,
    "watched"        BOOLEAN   NOT NULL DEFAULT false,
    "watch_progress" INTEGER,
    "added_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: series
CREATE TABLE "series" (
    "id"             TEXT      NOT NULL,
    "title"          TEXT      NOT NULL,
    "sort_title"     TEXT,
    "year"           INTEGER,
    "overview"       TEXT,
    "poster_path"    TEXT,
    "backdrop_path"  TEXT,
    "added_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateTable: seasons
CREATE TABLE "seasons" (
    "id"        TEXT    NOT NULL,
    "number"    INTEGER NOT NULL,
    "series_id" TEXT    NOT NULL,
    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable: episodes
CREATE TABLE "episodes" (
    "id"             TEXT      NOT NULL,
    "title"          TEXT      NOT NULL,
    "number"         INTEGER   NOT NULL,
    "season_id"      TEXT      NOT NULL,
    "overview"       TEXT,
    "runtime"        INTEGER,
    "file_path"      TEXT      NOT NULL,
    "file_size"      BIGINT,
    "codec"          TEXT,
    "resolution"     TEXT,
    "thumbnail_path" TEXT,
    "watched"        BOOLEAN   NOT NULL DEFAULT false,
    "watch_progress" INTEGER,
    "added_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audiobooks
CREATE TABLE "audiobooks" (
    "id"              TEXT      NOT NULL,
    "title"           TEXT      NOT NULL,
    "sort_title"      TEXT,
    "author"          TEXT,
    "narrator"        TEXT,
    "year"            INTEGER,
    "duration"        INTEGER,
    "overview"        TEXT,
    "cover_path"      TEXT,
    "file_path"       TEXT,
    "listen_progress" INTEGER,
    "added_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audiobooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audiobook_chapters
CREATE TABLE "audiobook_chapters" (
    "id"           TEXT    NOT NULL,
    "title"        TEXT    NOT NULL,
    "number"       INTEGER NOT NULL,
    "audiobook_id" TEXT    NOT NULL,
    "start_time"   INTEGER NOT NULL,
    "end_time"     INTEGER,
    "file_path"    TEXT,
    CONSTRAINT "audiobook_chapters_pkey" PRIMARY KEY ("id")
);

-- Many-to-many join tables (Prisma implicit)
-- Genre <A> - <B> Movie   (Genre comes before Movie alphabetically)
CREATE TABLE "_MovieGenres" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- Genre <A> - <B> Series  (Genre comes before Series alphabetically)
CREATE TABLE "_SeriesGenres" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- Audiobook <A> - <B> Genre  (Audiobook comes before Genre alphabetically)
CREATE TABLE "_AudiobookGenres" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key"                        ON "genres"("name");
CREATE UNIQUE INDEX "movies_file_path_key"                   ON "movies"("file_path");
CREATE        INDEX "movies_title_idx"                       ON "movies"("title");
CREATE        INDEX "movies_year_idx"                        ON "movies"("year");
CREATE        INDEX "movies_added_at_idx"                    ON "movies"("added_at");
CREATE        INDEX "series_title_idx"                       ON "series"("title");
CREATE        INDEX "series_year_idx"                        ON "series"("year");
CREATE UNIQUE INDEX "seasons_series_id_number_key"           ON "seasons"("series_id", "number");
CREATE        INDEX "seasons_series_id_idx"                  ON "seasons"("series_id");
CREATE UNIQUE INDEX "episodes_file_path_key"                 ON "episodes"("file_path");
CREATE UNIQUE INDEX "episodes_season_id_number_key"          ON "episodes"("season_id", "number");
CREATE        INDEX "episodes_season_id_idx"                 ON "episodes"("season_id");
CREATE        INDEX "audiobooks_title_idx"                   ON "audiobooks"("title");
CREATE        INDEX "audiobooks_author_idx"                  ON "audiobooks"("author");
CREATE UNIQUE INDEX "audiobook_chapters_audiobook_id_number_key" ON "audiobook_chapters"("audiobook_id", "number");
CREATE        INDEX "audiobook_chapters_audiobook_id_idx"    ON "audiobook_chapters"("audiobook_id");

CREATE UNIQUE INDEX "_MovieGenres_AB_unique"     ON "_MovieGenres"("A", "B");
CREATE        INDEX "_MovieGenres_B_index"        ON "_MovieGenres"("B");
CREATE UNIQUE INDEX "_SeriesGenres_AB_unique"    ON "_SeriesGenres"("A", "B");
CREATE        INDEX "_SeriesGenres_B_index"       ON "_SeriesGenres"("B");
CREATE UNIQUE INDEX "_AudiobookGenres_AB_unique" ON "_AudiobookGenres"("A", "B");
CREATE        INDEX "_AudiobookGenres_B_index"    ON "_AudiobookGenres"("B");

-- AddForeignKey
ALTER TABLE "seasons"
    ADD CONSTRAINT "seasons_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "episodes"
    ADD CONSTRAINT "episodes_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audiobook_chapters"
    ADD CONSTRAINT "audiobook_chapters_audiobook_id_fkey"
    FOREIGN KEY ("audiobook_id") REFERENCES "audiobooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- _MovieGenres: A = genres.id, B = movies.id
ALTER TABLE "_MovieGenres"
    ADD CONSTRAINT "_MovieGenres_A_fkey"
    FOREIGN KEY ("A") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_MovieGenres"
    ADD CONSTRAINT "_MovieGenres_B_fkey"
    FOREIGN KEY ("B") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- _SeriesGenres: A = genres.id, B = series.id
ALTER TABLE "_SeriesGenres"
    ADD CONSTRAINT "_SeriesGenres_A_fkey"
    FOREIGN KEY ("A") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_SeriesGenres"
    ADD CONSTRAINT "_SeriesGenres_B_fkey"
    FOREIGN KEY ("B") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- _AudiobookGenres: A = audiobooks.id, B = genres.id
ALTER TABLE "_AudiobookGenres"
    ADD CONSTRAINT "_AudiobookGenres_A_fkey"
    FOREIGN KEY ("A") REFERENCES "audiobooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_AudiobookGenres"
    ADD CONSTRAINT "_AudiobookGenres_B_fkey"
    FOREIGN KEY ("B") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;
