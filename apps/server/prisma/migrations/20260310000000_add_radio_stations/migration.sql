-- CreateTable
CREATE TABLE "radio_stations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radio_stations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radio_stations_user_id_idx" ON "radio_stations"("user_id");

-- AddForeignKey
ALTER TABLE "radio_stations" ADD CONSTRAINT "radio_stations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
