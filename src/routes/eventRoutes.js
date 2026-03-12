import express from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

const EVENT_CONFIG_ID = 1;

// GET /event - Public, returns the current event date or null (TBA)
router.get("/", async (req, res) => {
  try {
    const config = await prisma.eventConfig.findUnique({
      where: { id: EVENT_CONFIG_ID },
    });

    if (!config) {
      return res.json({ eventDate: null });
    }

    res.json({ eventDate: config.eventDate });
  } catch (error) {
    console.error("Error fetching event config:", error);
    res.status(500).json({ message: "Failed to fetch event date" });
  }
});

// POST /event - Admin sets or clears the event date
// Protected by authMiddleware + adminMiddleware (set in index.js)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const { eventDate } = req.body;

  try {
    const parsedDate = eventDate ? new Date(eventDate) : null;

    if (eventDate && isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    await prisma.eventConfig.upsert({
      where: { id: EVENT_CONFIG_ID },
      update: { eventDate: parsedDate },
      create: { id: EVENT_CONFIG_ID, eventDate: parsedDate },
    });

    res.json({
      message: parsedDate
        ? `Event date set to ${parsedDate.toISOString()}`
        : "Event date set to TBA",
      eventDate: parsedDate,
    });
  } catch (error) {
    console.error("Error updating event config:", error);
    res.status(500).json({ message: "Failed to update event date" });
  }
});

export default router;
