import express from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { eventCache, setPublicCacheHeaders } from "../utils/cache.js";

const router = express.Router();

const EVENT_CONFIG_ID = 1;

export async function getEventConfig() {
  return eventCache.getOrSet("eventConfig", async () => {
    const config = await prisma.eventConfig.findUnique({
      where: { id: EVENT_CONFIG_ID },
    });
    return { eventDate: config?.eventDate ?? null };
  });
}

// GET /event - Public, returns the current event date or null (TBA)
router.get("/", async (req, res) => {
  try {
    const payload = await getEventConfig();
    setPublicCacheHeaders(res, 30, 120);
    res.json(payload);
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

    eventCache.invalidate();

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
