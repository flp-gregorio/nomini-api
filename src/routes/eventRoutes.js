import express from "express";
import prisma from "../prismaClient.js";

const router = express.Router();

// Singleton ID for the event config row
const EVENT_CONFIG_ID = 1;

// GET /event - Returns the current event date, or null if TBA
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
// Body: { adminKey: string, eventDate: string | null }
router.post("/", async (req, res) => {
  const { adminKey, eventDate } = req.body;

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ message: "Invalid Admin Key" });
  }

  try {
    // eventDate can be an ISO date string or null (TBA)
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
