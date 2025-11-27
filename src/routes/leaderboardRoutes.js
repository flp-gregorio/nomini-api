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

router.get("/", async (req, res) => {
  try {
    const staticData = getData();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        votes: true, 
      },
    });

    const leaderboard = users.map((user) => {
      let totalPoints = 0;

      user.votes.forEach((vote) => {
        const categoryKey = vote.category;
        const categoryData = staticData[categoryKey];

        if (categoryData) {
          const winningNominee = categoryData.nominees.find(
            (n) => n.Winner === true || n.winner === true
          );

          if (winningNominee && winningNominee.Nominee === vote.nominee) {
             totalPoints += (categoryData.weight || 1);
          }
        }
      });

      return {
        id: user.id,
        username: user.username,
        points: totalPoints,
      };
    });

    leaderboard.sort((a, b) => b.points - a.points);

    res.json(leaderboard);
  } catch (error) {
    console.error("Leaderboard Error:", error);
    res.status(500).json({ message: "Failed to calculate leaderboard" });
  }
});

export default router;