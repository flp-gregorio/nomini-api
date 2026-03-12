import express from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// GET /categories/years — returns all distinct years available
router.get("/years", async (req, res) => {
  try {
    const results = await prisma.category.findMany({
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    });
    res.json(results.map((r) => r.year));
  } catch (error) {
    console.error("Error fetching years:", error);
    res.status(500).json({ message: "Failed to fetch years" });
  }
});

// GET /categories — returns all categories for the latest (or specified) year
router.get("/", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;

    // If no year specified, find the latest year
    let targetYear = year;
    if (!targetYear) {
      const latest = await prisma.category.findFirst({
        orderBy: { year: "desc" },
        select: { year: true },
      });
      targetYear = latest ? latest.year : new Date().getFullYear();
    }

    const categories = await prisma.category.findMany({
      where: { year: targetYear },
      orderBy: { id: "asc" },
    });

    const result = categories.map((cat) => ({
      id: cat.id,
      title: cat.title,
      description: cat.description,
      weight: cat.weight,
      year: cat.year,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// GET /categories/:id/nominees — returns nominees for a specific category
router.get("/:id/nominees", async (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid category ID" });
  }

  try {
    const category = await prisma.category.findUnique({
      where: { id },
      include: { nominees: true },
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Check for winner in the Winner table
    let winnerRecord = null;
    try {
      winnerRecord = await prisma.winner.findUnique({
        where: { category: category.title },
      });
    } catch {
      // Winner table might not exist yet — safe to ignore
    }

    const nominees = category.nominees.map((n) => ({
      id: n.name,
      name: n.name,
      publisher: n.publisher,
      image: n.image,
      description: n.description,
      genre: n.genre,
      Winner: winnerRecord ? n.name === winnerRecord.nominee : false,
    }));

    res.json(nominees);
  } catch (error) {
    console.error("Error fetching nominees:", error);
    res.status(500).json({ message: "Failed to fetch nominees" });
  }
});

// POST /categories/winner — admin sets the winner for a category
// Protected by authMiddleware + adminMiddleware (set in index.js)
router.post("/winner", authMiddleware, adminMiddleware, async (req, res) => {
  const { category, nominee } = req.body;

  if (!category || !nominee) {
    return res.status(400).json({ message: "Category and Nominee are required" });
  }

  try {
    // Verify the category exists
    const cat = await prisma.category.findFirst({
      where: { title: category },
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
      where: { category: category },
      update: { nominee: nominee },
      create: { category: category, nominee: nominee },
    });

    res.json({ message: `Winner set for ${category}: ${nominee}` });
  } catch (err) {
    console.error("Error writing winner to database:", err);
    res.status(500).json({ message: "Failed to save winner" });
  }
});

export default router;
