-- CreateTable
CREATE TABLE "Winner" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "nominee" TEXT NOT NULL,

    CONSTRAINT "Winner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventConfig" (
    "id" SERIAL NOT NULL,
    "eventDate" TIMESTAMP(3),

    CONSTRAINT "EventConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Winner_category_key" ON "Winner"("category");
