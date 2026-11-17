-- CreateIndex
CREATE INDEX "Category_year_id_idx" ON "Category"("year", "id");

-- CreateIndex
CREATE INDEX "Nominee_categoryId_idx" ON "Nominee"("categoryId");

-- CreateIndex
CREATE INDEX "Vote_userId_year_idx" ON "Vote"("userId", "year");

-- CreateIndex
CREATE INDEX "Vote_year_category_nominee_idx" ON "Vote"("year", "category", "nominee");

-- CreateIndex
CREATE INDEX "Winner_year_idx" ON "Winner"("year");
