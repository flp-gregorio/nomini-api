import express from "express";
import prisma from "../prismaClient.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        votes: true,
      },
    });

    // Fetch winners from DB
    let winnersMap = {};
    try {
      const winnersData = await prisma.winner.findMany();
      winnersData.forEach((w) => {
        winnersMap[w.category] = w.nominee;
      });
    } catch (winnerErr) {
      console.warn("Winner table not available:", winnerErr.message);
    }

    // Fetch all categories with their weights
    let categoryWeights = {};
    try {
      const categories = await prisma.category.findMany({
        select: { title: true, weight: true },
      });
      categories.forEach((c) => {
        categoryWeights[c.title] = c.weight;
      });
    } catch {
      // If Category table doesn't exist yet, use default weight of 1
    }

    const leaderboard = users.map((user) => {
      let totalPoints = 0;

      user.votes.forEach((vote) => {
        const categoryKey = vote.category;
        const winningNomineeName = winnersMap[categoryKey];

        if (winningNomineeName && winningNomineeName === vote.nominee) {
          totalPoints += categoryWeights[categoryKey] || 1;
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