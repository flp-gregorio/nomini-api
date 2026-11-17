-- CreateTable
CREATE TABLE "GameArtwork" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerGameId" INTEGER,
    "imageId" INTEGER,
    "imageUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'grid',
    "width" INTEGER,
    "height" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameArtwork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameArtwork_name_key" ON "GameArtwork"("name");
