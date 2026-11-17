import express from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { catalogCache, setPublicCacheHeaders } from "../utils/cache.js";

const router = express.Router();

const ARTWORK_SELECT = {
  name: true,
  provider: true,
  providerGameId: true,
  imageId: true,
  imageUrl: true,
  type: true,
  width: true,
  height: true,
};

function formatArtwork(savedArtwork) {
  if (!savedArtwork) return null;
  return {
    provider: savedArtwork.provider,
    providerGameId: savedArtwork.providerGameId,
    imageId: savedArtwork.imageId,
    imageUrl: savedArtwork.imageUrl,
    type: savedArtwork.type,
    width: savedArtwork.width,
    height: savedArtwork.height,
  };
}

function formatNominee(nominee, winningNomineeName, savedArtwork) {
  return {
    id: nominee.name,
    name: nominee.name,
    publisher: nominee.publisher,
    image: savedArtwork ? savedArtwork.imageUrl : nominee.image,
    description: nominee.description,
    genre: nominee.genre,
    Winner: winningNomineeName ? nominee.name === winningNomineeName : false,
    artwork: formatArtwork(savedArtwork),
  };
}

export async function getActiveYear() {
  return catalogCache.getOrSet("activeYear", async () => {
    const latest = await prisma.category.findFirst({
      orderBy: { year: "desc" },
      select: { year: true },
    });
    return latest ? latest.year : new Date().getFullYear();
  });
}

async function fetchDistinctYears() {
  return catalogCache.getOrSet("years", async () => {
    const results = await prisma.category.findMany({
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    });
    return results.map((r) => r.year);
  });
}

// Safe wrapper for optional tables if migrations haven't been run in an environment
async function safeQuery(promise, fallback = []) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

// GET /categories/years — returns all distinct years available
router.get("/years", async (req, res) => {
  try {
    const years = await fetchDistinctYears();
    setPublicCacheHeaders(res, 60, 300);
    res.json(years);
  } catch (error) {
    console.error("Error fetching years:", error);
    res.status(500).json({ message: "Failed to fetch years" });
  }
});

// GET /categories/winners — consolidated winners payload for a year (or latest year)
router.get("/winners", async (req, res) => {
  const rawYear = req.query.year;
  const parsedYear = rawYear ? parseInt(rawYear, 10) : null;
  if (rawYear && isNaN(parsedYear)) {
    return res.status(400).json({ message: "Invalid year parameter" });
  }

  try {
    const cacheKey = `winners:${parsedYear ?? "latest"}`;
    const payload = await catalogCache.getOrSet(cacheKey, async () => {
      const years = await fetchDistinctYears();
      const targetYear =
        parsedYear ?? (years.length > 0 ? years[0] : new Date().getFullYear());

      const [categories, winners] = await Promise.all([
        prisma.category.findMany({
          where: { year: targetYear },
          orderBy: { id: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            weight: true,
            year: true,
          },
        }),
        safeQuery(
          prisma.winner.findMany({
            where: { year: targetYear },
            select: { category: true, nominee: true },
          })
        ),
      ]);

      const winnerByCategory = new Map(
        winners.map((w) => [w.category, w.nominee])
      );
      const winnerNames = [...new Set(winners.map((w) => w.nominee))];
      const categoryIds = categories.map((c) => c.id);

      let nomineeMap = new Map();
      let artworkMap = new Map();

      if (winnerNames.length > 0 && categoryIds.length > 0) {
        const [winningNominees, artworks] = await Promise.all([
          prisma.nominee.findMany({
            where: {
              categoryId: { in: categoryIds },
              name: { in: winnerNames },
            },
          }),
          safeQuery(
            prisma.gameArtwork.findMany({
              where: { name: { in: winnerNames } },
              select: ARTWORK_SELECT,
            })
          ),
        ]);

        nomineeMap = new Map(
          winningNominees.map((n) => [`${n.categoryId}:${n.name}`, n])
        );
        artworkMap = new Map(artworks.map((a) => [a.name, a]));
      }

      const items = categories.map((cat) => {
        const winningName = winnerByCategory.get(cat.title) ?? null;
        const nomineeRow = winningName
          ? nomineeMap.get(`${cat.id}:${winningName}`) ?? null
          : null;
        const savedArtwork = nomineeRow
          ? artworkMap.get(nomineeRow.name)
          : null;

        return {
          category: cat,
          winnerNominee: nomineeRow
            ? formatNominee(nomineeRow, winningName, savedArtwork)
            : null,
        };
      });

      return {
        year: targetYear,
        years,
        categories: items,
      };
    });

    setPublicCacheHeaders(res, 30, 120);
    res.json(payload);
  } catch (error) {
    console.error("Error fetching winners:", error);
    res.status(500).json({ message: "Failed to fetch winners" });
  }
});

// GET /categories — returns all categories for the latest (or specified) year
// Optional ?include=nominees embeds nominees, winner flags, and artwork in one response
router.get("/", async (req, res) => {
  try {
    const rawYear = req.query.year;
    const year = rawYear ? parseInt(rawYear, 10) : null;
    if (rawYear && isNaN(year)) {
      return res.status(400).json({ message: "Invalid year parameter" });
    }

    const includeNominees = req.query.include === "nominees";
    const cacheKey = `categories:${year ?? "latest"}:${
      includeNominees ? "full" : "list"
    }`;

    const result = await catalogCache.getOrSet(cacheKey, async () => {
      const targetYear = year ?? (await getActiveYear());

      if (!includeNominees) {
        const categories = await prisma.category.findMany({
          where: { year: targetYear },
          orderBy: { id: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            weight: true,
            year: true,
          },
        });
        return categories;
      }

      const [categories, winners, artworks] = await Promise.all([
        prisma.category.findMany({
          where: { year: targetYear },
          orderBy: { id: "asc" },
          include: {
            nominees: {
              orderBy: { id: "asc" },
            },
          },
        }),
        safeQuery(
          prisma.winner.findMany({
            where: { year: targetYear },
            select: { category: true, nominee: true },
          })
        ),
        safeQuery(
          prisma.gameArtwork.findMany({
            select: ARTWORK_SELECT,
          })
        ),
      ]);

      const winnerByCategory = new Map(
        winners.map((w) => [w.category, w.nominee])
      );
      const artworkMap = new Map(artworks.map((a) => [a.name, a]));

      return categories.map((cat) => {
        const winningName = winnerByCategory.get(cat.title) ?? null;
        return {
          id: cat.id,
          title: cat.title,
          description: cat.description,
          weight: cat.weight,
          year: cat.year,
          nominees: cat.nominees.map((n) =>
            formatNominee(n, winningName, artworkMap.get(n.name))
          ),
        };
      });
    });

    setPublicCacheHeaders(res, 30, 120);
    res.json(result);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// GET /categories/:id/nominees — returns nominees for a specific category
router.get("/:id/nominees", async (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid category ID" });
  }

  try {
    const nominees = await catalogCache.getOrSet(
      `categoryNominees:${id}`,
      async () => {
        const category = await prisma.category.findUnique({
          where: { id },
          include: { nominees: { orderBy: { id: "asc" } } },
        });

        if (!category) {
          return null;
        }

        const nomineeNames = [
          ...new Set(category.nominees.map((n) => n.name)),
        ];

        const [winnerRecord, artworks] = await Promise.all([
          safeQuery(
            prisma.winner.findUnique({
              where: {
                category_year: {
                  category: category.title,
                  year: category.year,
                },
              },
            }),
            null
          ),
          nomineeNames.length > 0
            ? safeQuery(
                prisma.gameArtwork.findMany({
                  where: { name: { in: nomineeNames } },
                  select: ARTWORK_SELECT,
                })
              )
            : Promise.resolve([]),
        ]);

        const artworkMap = new Map(artworks.map((a) => [a.name, a]));
        const winningName = winnerRecord ? winnerRecord.nominee : null;

        return category.nominees.map((n) =>
          formatNominee(n, winningName, artworkMap.get(n.name))
        );
      }
    );

    if (!nominees) {
      return res.status(404).json({ message: "Category not found" });
    }

    setPublicCacheHeaders(res, 30, 120);
    res.json(nominees);
  } catch (error) {
    console.error("Error fetching nominees:", error);
    res.status(500).json({ message: "Failed to fetch nominees" });
  }
});

// POST /categories/winner — admin sets the winner for a category
// Protected by authMiddleware + adminMiddleware
router.post("/winner", authMiddleware, adminMiddleware, async (req, res) => {
  const { category, nominee, year } = req.body;

  if (!category || !nominee) {
    return res.status(400).json({ message: "Category and Nominee are required" });
  }

  try {
    let targetYear = year ? parseInt(year, 10) : null;
    if (!targetYear) {
      targetYear = await getActiveYear();
    }

    // Verify the category exists in the target year
    const cat = await prisma.category.findFirst({
      where: { title: category, year: targetYear },
      include: { nominees: true },
    });

    if (!cat) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Verify the nominee exists in this category
    const nomineeExists = cat.nominees.some((n) => n.name === nominee);
    if (!nomineeExists) {
      return res.status(404).json({ message: "Nominee not found in this category" });
    }

    await prisma.winner.upsert({
      where: {
        category_year: {
          category: category,
          year: targetYear,
        },
      },
      update: { nominee: nominee },
      create: { category: category, nominee: nominee, year: targetYear },
    });

    catalogCache.invalidate();

    res.json({ message: `Winner set for ${category} (${targetYear}): ${nominee}` });
  } catch (err) {
    console.error("Error writing winner to database:", err);
    res.status(500).json({ message: "Failed to save winner" });
  }
});

export default router;
