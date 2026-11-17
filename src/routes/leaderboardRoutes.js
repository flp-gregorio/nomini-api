import express from "express";
import prisma from "../prismaClient.js";
import { setPrivateNoStoreHeaders } from "../utils/cache.js";

const router = express.Router();

// GET /leaderboard — returns scored leaderboard
// ?year=XXXX → filter to categories of that year only
// No year param → global (all years combined)
router.get("/", async (req, res) => {
  setPrivateNoStoreHeaders(res);
  try {
    const rawYear = req.query.year;
    const year = rawYear ? parseInt(rawYear, 10) : null;
    if (rawYear && isNaN(year)) {
      return res.status(400).json({ message: "Invalid year parameter" });
    }

    const [users, winnersData, categories] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          votes: {
            where: year ? { year } : undefined,
            select: {
              category: true,
              nominee: true,
              year: true,
            },
          },
        },
      }),
      prisma.winner
        .findMany({
          where: year ? { year } : {},
          select: { category: true, nominee: true, year: true },
        })
        .catch((winnerErr) => {
          console.warn("Winner table not available:", winnerErr.message);
          return [];
        }),
      prisma.category
        .findMany({
          where: year ? { year } : {},
          select: { title: true, weight: true, year: true },
        })
        .catch(() => []),
    ]);

    const winnersMap = new Map();
    winnersData.forEach((w) => {
      winnersMap.set(`${w.year}:${w.category}`, w.nominee);
    });

    const categoryWeights = new Map();
    categories.forEach((c) => {
      categoryWeights.set(`${c.year}:${c.title}`, c.weight);
    });

    const leaderboard = users.map((user) => {
      let totalPoints = 0;

      user.votes.forEach((vote) => {
        const key = `${vote.year}:${vote.category}`;
        const winningNomineeName = winnersMap.get(key);

        if (winningNomineeName && winningNomineeName === vote.nominee) {
          totalPoints += categoryWeights.get(key) || 1;
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