import express from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

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

router.get("/:id/nominees", (req, res) => {
  const data = getData();
  const keys = Object.keys(data);
  const id = parseInt(req.params.id);

  if (isNaN(id) || id < 1 || id > keys.length) {
    return res.status(404).json({ message: "Category not found" });
  }

  const categoryKey = keys[id - 1];
  const categoryData = data[categoryKey];

  const nominees = categoryData.nominees.map(n => ({
    id: n.Nominee,
    name: n.Nominee,
    publisher: n.Publisher,
    image: n.Image,
    description: n.Description,
    genre: n.Genre,
    Winner: n.Winner
  }));

  res.json(nominees);
});

export default router;
