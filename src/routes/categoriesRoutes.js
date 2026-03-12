import express from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import prisma from "../prismaClient.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getData = () => {
  try {
    const dataPath = path.join(__dirname, "../data.json");
    const rawData = fs.readFileSync(dataPath, "utf-8");
    return JSON.parse(rawData);
  } catch (err) {
    console.error("Error reading data.json:", err.message);
    return {};
  }
};

router.get("/", (req, res) => {
  const data = getData();
  const categories = Object.keys(data).map((key, index) => ({
    id: index + 1,
    title: key,
    description: data[key].description,
  }));
  res.json(categories);
});

router.get("/:id/nominees", async (req, res) => {
  const data = getData();
  const keys = Object.keys(data);
  const id = parseInt(req.params.id);

  if (isNaN(id) || id < 1 || id > keys.length) {
    return res.status(404).json({ message: "Category not found" });
  }

  const categoryKey = keys[id - 1];
  const categoryData = data[categoryKey];

  try {
    const winnerRecord = await prisma.winner.findUnique({
      where: { category: categoryKey },
    });

    const nominees = categoryData.nominees.map(n => ({
      id: n.Nominee,
      name: n.Nominee,
      publisher: n.Publisher,
      image: n.Image,
      description: n.Description,
      genre: n.Genre,
      Winner: winnerRecord ? n.Nominee === winnerRecord.nominee : n.Winner
    }));

    res.json(nominees);
  } catch (error) {
    console.error("Error fetching nominees:", error);
    res.status(500).json({ message: "Failed to fetch nominees" });
  }
});

router.post("/winner", async (req, res) => {
  const { category, nominee, adminKey } = req.body;

  // Simple Admin Key Check
  // TODO: Move this to environment variable for better security
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ message: "Invalid Admin Key" });
  }

  if (!category || !nominee) {
    return res.status(400).json({ message: "Category and Nominee are required" });
  }

  const data = getData();

  if (!data[category]) {
    return res.status(404).json({ message: "Category not found" });
  }

  // Check if the nominee exists in the category
  const nomineeExists = data[category].nominees.some(n => n.Nominee === nominee);
  if (!nomineeExists) {
    return res.status(404).json({ message: "Nominee not found in this category" });
  }

  // Update or insert winner in the database
  try {
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
