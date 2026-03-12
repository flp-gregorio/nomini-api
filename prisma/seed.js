import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const YEAR = 2025;

async function main() {
  const dataPath = path.join(__dirname, "src/data.json");
  const rawData = fs.readFileSync(dataPath, "utf-8");
  const data = JSON.parse(rawData);

  console.log(`Seeding ${Object.keys(data).length} categories for year ${YEAR}...`);

  for (const [categoryTitle, categoryData] of Object.entries(data)) {
    // Skip empty categories like "Voting Complete"
    if (!categoryData.nominees || categoryData.nominees.length === 0) {
      console.log(`  Skipping empty category: ${categoryTitle}`);
      continue;
    }

    // Upsert category
    const category = await prisma.category.upsert({
      where: {
        title_year: { title: categoryTitle, year: YEAR },
      },
      update: {
        description: categoryData.description || null,
        weight: categoryData.weight || 1,
      },
      create: {
        title: categoryTitle,
        description: categoryData.description || null,
        weight: categoryData.weight || 1,
        year: YEAR,
      },
    });

    console.log(`  Category: ${category.title} (id: ${category.id})`);

    // Delete existing nominees for this category to avoid duplicates on re-run
    await prisma.nominee.deleteMany({
      where: { categoryId: category.id },
    });

    // Create all nominees
    for (const nom of categoryData.nominees) {
      await prisma.nominee.create({
        data: {
          name: nom.Nominee,
          publisher: nom.Publisher || null,
          genre: nom.Genre || null,
          description: nom.Description || null,
          image: nom.Image || null,
          categoryId: category.id,
        },
      });
    }

    console.log(`    -> ${categoryData.nominees.length} nominees seeded`);
  }

  console.log("\nSeed complete!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
