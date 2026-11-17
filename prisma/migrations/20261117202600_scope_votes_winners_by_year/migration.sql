-- DropIndex
DROP INDEX IF EXISTS "Vote_userId_category_key";

-- DropIndex
DROP INDEX IF EXISTS "Winner_category_key";

-- AlterTable
ALTER TABLE "Vote" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 2025;

-- AlterTable
ALTER TABLE "Winner" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 2025;

-- CreateIndex
CREATE UNIQUE INDEX "Vote_userId_category_year_key" ON "Vote"("userId", "category", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_category_year_key" ON "Winner"("category", "year");
