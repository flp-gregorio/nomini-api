import express from "express";
import prisma from "../prismaClient.js";

const router = express.Router();

const EVENT_CONFIG_ID = 1;

async function getActiveYear() {
  const latest = await prisma.category.findFirst({
    orderBy: { year: "desc" },
    select: { year: true },
  });
  return latest ? latest.year : new Date().getFullYear();
}

const checkVotingOpen = async (req, res, next) => {
  try {
    const config = await prisma.eventConfig.findUnique({
      where: { id: EVENT_CONFIG_ID },
    });

    if (config?.eventDate && new Date() >= new Date(config.eventDate)) {
      return res
        .status(403)
        .json({ message: "Voting has closed as the event has started." });
    }
    next();
  } catch (error) {
    console.error("Error checking event config:", error);
    res.status(500).json({ message: "Failed to verify voting status" });
  }
};

// --------------------------------------------------------
// GET /votes/user
// Get ALL votes for the currently logged-in user (active season by default)
// --------------------------------------------------------
router.get("/user", async (req, res) => {
  try {
    const targetYear = req.query.year
      ? parseInt(req.query.year, 10)
      : await getActiveYear();

    // Debug: Check who is asking
    console.log(`Fetching votes for User ID: ${req.userId} (year: ${targetYear})`);

    const votes = await prisma.vote.findMany({
      where: { userId: Number(req.userId), year: targetYear },
    });

    console.log("Votes found in DB:", votes.length);
    // Send response
    res.json(votes);
  } catch (error) {
    console.error("Error fetching user votes:", error);
    res.status(500).json({ message: "Error fetching user votes" });
  }
});

// --------------------------------------------------------
// GET /votes/stats
// Returns the vote count for every nominee in every category (active season by default)
// --------------------------------------------------------
router.get("/stats", async (req, res) => {
  try {
    const targetYear = req.query.year
      ? parseInt(req.query.year, 10)
      : await getActiveYear();

    const results = await prisma.vote.groupBy({
      by: ["category", "nominee"],
      where: { year: targetYear },
      _count: {
        _all: true,
      },
    });

    const stats = {};

    results.forEach((group) => {
      const { category, nominee, _count } = group;

      if (!stats[category]) {
        stats[category] = [];
      }

      stats[category].push({
        nominee,
        count: _count._all,
      });
    });

    Object.keys(stats).forEach((category) => {
      stats[category].sort((a, b) => b.count - a.count);
    });

    res.json(stats);
  } catch (error) {
    console.error("Stats Error:", error);
    res.status(500).json({ message: "Failed to fetch statistics" });
  }
});

// --------------------------------------------------------
// POST /votes
// Cast a vote (Create)
// --------------------------------------------------------
router.post("/", checkVotingOpen, async (req, res) => {
  const { category, nominee } = req.body;

  if (!category || !nominee) {
    return res
      .status(400)
      .json({ message: "Category and Nominee are required" });
  }

  try {
    const activeYear = await getActiveYear();
    const vote = await prisma.vote.create({
      data: {
        category,
        nominee,
        year: activeYear,
        userId: Number(req.userId),
      },
    });

    res.status(201).json({ message: "Vote cast successfully", vote });
  } catch (error) {
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({ message: "You have already voted in this category." });
    }
    console.error("Vote Error:", error);
    res.status(500).json({ message: "Failed to cast vote" });
  }
});

// --------------------------------------------------------
// PUT /votes/:id
// Update a vote
// --------------------------------------------------------
router.put("/:id", checkVotingOpen, async (req, res) => {
  const { id } = req.params;
  const { nominee } = req.body;

  if (!nominee) {
    return res.status(400).json({ message: "New nominee is required" });
  }

  try {
    const activeYear = await getActiveYear();
    const result = await prisma.vote.updateMany({
      where: {
        id: Number(id),
        userId: Number(req.userId),
        year: activeYear,
      },
      data: {
        nominee,
      },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Vote not found or unauthorized." });
    }

    res.json({ message: "Vote updated successfully" });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: "Failed to update vote" });
  }
});

// --------------------------------------------------------
// DELETE /votes/:id
// Remove a vote
// --------------------------------------------------------
router.delete("/:id", checkVotingOpen, async (req, res) => {
  const { id } = req.params;

  try {
    const activeYear = await getActiveYear();
    const result = await prisma.vote.deleteMany({
      where: {
        id: Number(id),
        userId: Number(req.userId),
        year: activeYear,
      },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Vote not found or unauthorized." });
    }

    res.json({ message: "Vote deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Failed to delete vote" });
  }
});

export default router;