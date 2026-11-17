import express from "express";
import prisma from "../prismaClient.js";

const router = express.Router();

// GET /leaderboard — returns scored leaderboard
// ?year=XXXX → filter to categories of that year only
// No year param → global (all years combined)
router.get("/", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        votes: true,
      },
    });

    // Fetch winners from DB, optionally filtered by year
    let winnersMap = {};
    try {
      const winnersData = await prisma.winner.findMany({
        where: year ? { year } : {},
      });
      winnersData.forEach((w) => {
        winnersMap[`${w.year}:${w.category}`] = w.nominee;
      });
    } catch (winnerErr) {
      console.warn("Winner table not available:", winnerErr.message);
    }

    // Fetch categories with weights, optionally filtered by year
    let categoryWeights = {};
    try {
      const where = year ? { year } : {};
      const categories = await prisma.category.findMany({
        where,
        select: { title: true, weight: true, year: true },
      });
      categories.forEach((c) => {
        categoryWeights[`${c.year}:${c.title}`] = c.weight;
      });
    } catch {
      // If Category table doesn't exist yet, use default weight of 1
    }

    const leaderboard = users.map((user) => {
      let totalPoints = 0;

      user.votes.forEach((vote) => {
        // If filtering by year, skip votes from other seasons
        if (year && vote.year !== year) return;

        const key = `${vote.year}:${vote.category}`;
        const winningNomineeName = winnersMap[key];

        if (winningNomineeName && winningNomineeName === vote.nominee) {
          totalPoints += categoryWeights[key] || 1;
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