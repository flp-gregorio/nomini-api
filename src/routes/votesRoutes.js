import express from "express";
import prisma from "../prismaClient.js";

const router = express.Router();

// TODO: Update this to the actual event start time
const EVENT_START_TIME = new Date("2025-12-11T21:30:00-03:00");

const checkVotingOpen = (req, res, next) => {
  if (new Date() >= EVENT_START_TIME) {
    return res
      .status(403)
      .json({ message: "Voting has closed as the event has started." });
  }
  next();
};

// --------------------------------------------------------
// GET /votes/user
// Get ALL votes for the currently logged-in user
// --------------------------------------------------------
router.get("/user", async (req, res) => {
  try {
    // Debug: Check who is asking
    console.log(`Fetching votes for User ID: ${req.userId}`);

    const votes = await prisma.vote.findMany({
      where: { userId: Number(req.userId) },
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
// Returns the vote count for every nominee in every category
// --------------------------------------------------------
router.get("/stats", async (req, res) => {
  try {
    const results = await prisma.vote.groupBy({
      by: ["category", "nominee"],
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
    const vote = await prisma.vote.create({
      data: {
        category,
        nominee,
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
    const result = await prisma.vote.updateMany({
      where: {
        id: Number(id),
        userId: Number(req.userId),
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
    const result = await prisma.vote.deleteMany({
      where: {
        id: Number(id),
        userId: Number(req.userId),
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