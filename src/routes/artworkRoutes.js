import express from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  discoverAllNominees,
  discoverArtworkForTitle,
  getUniqueNomineesForYear,
} from "../services/artworkDiscoveryService.js";
import {
  getAssetsForGame,
  isSteamGridDbConfigured,
  searchGames,
  SteamGridDbError,
} from "../services/steamgriddbService.js";
import { isIgdbConfigured } from "../services/igdbService.js";
import { catalogCache, setPrivateNoStoreHeaders } from "../utils/cache.js";

const router = express.Router();

const ALLOWED_TYPES = new Set(["grid", "hero", "logo", "manual"]);

function isValidImageUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/imgs/")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function handleError(res, error, fallbackMessage) {
  if (error instanceof SteamGridDbError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage });
}

// All /artwork routes require authenticated admin access
router.use(authMiddleware, adminMiddleware, (req, res, next) => {
  setPrivateNoStoreHeaders(res);
  next();
});

// GET /artwork/status — reports provider configuration without exposing credentials
router.get("/status", (req, res) => {
  res.json({
    steamGridDbConfigured: isSteamGridDbConfigured(),
    igdbConfigured: isIgdbConfigured(),
  });
});

// GET /artwork/nominees?year=2026 — unique nominees and saved artwork references
router.get("/nominees", async (req, res) => {
  try {
    const { year, nominees } = await getUniqueNomineesForYear(req.query.year);
    const withArtwork = nominees.filter((n) => Boolean(n.artwork?.imageUrl)).length;
    res.json({
      year,
      nominees,
      summary: {
        totalUnique: nominees.length,
        withApprovedArtwork: withArtwork,
        pending: nominees.length - withArtwork,
      },
    });
  } catch (error) {
    handleError(res, error, "Failed to load nominees for artwork management");
  }
});

// POST /artwork/discover — runs SteamGridDB discovery across missing or selected nominees
router.post("/discover", async (req, res) => {
  try {
    const { year, names, forceRefresh, types } = req.body ?? {};
    const payload = await discoverAllNominees({
      year,
      names,
      forceRefresh: Boolean(forceRefresh),
      types: Array.isArray(types) ? types : ["grid", "hero", "logo"],
    });
    res.json(payload);
  } catch (error) {
    handleError(res, error, "Artwork discovery failed");
  }
});

// GET /artwork/search?query=...&types=grid,hero,logo — manual SteamGridDB title search
router.get("/search", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    return res.status(400).json({ message: "Search query is required" });
  }

  const types =
    typeof req.query.types === "string"
      ? req.query.types.split(",").map((t) => t.trim())
      : ["grid", "hero", "logo"];

  try {
    const forceRefresh = req.query.forceRefresh === "true";
    const result = await discoverArtworkForTitle(query, {
      types,
      forceRefresh,
    });
    // Also provide raw autocomplete matches in case title differed significantly
    if (!result.matchedGame) {
      const rawMatches = await searchGames(query, { forceRefresh });
      const topRaw = rawMatches[0];
      if (topRaw && result.suggestions.length === 0) {
        result.suggestions = rawMatches.slice(0, 6).map((g) => ({
          id: g.id,
          name: g.name,
          releaseDate: g.release_date ?? null,
          verified: Boolean(g.verified),
          matchScore: 0,
          matchConfidence: "review",
        }));
      }
    }
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to search SteamGridDB");
  }
});

// GET /artwork/game/:gameId/assets — fetch candidates for a specific SteamGridDB game ID
router.get("/game/:gameId/assets", async (req, res) => {
  const gameId = parseInt(req.params.gameId, 10);
  if (isNaN(gameId)) {
    return res.status(400).json({ message: "Invalid SteamGridDB game ID" });
  }

  const types =
    typeof req.query.types === "string"
      ? req.query.types.split(",").map((t) => t.trim())
      : ["grid", "hero", "logo"];

  try {
    const assets = await getAssetsForGame(gameId, {
      types,
      forceRefresh: req.query.forceRefresh === "true",
    });
    res.json({ gameId, candidates: assets });
  } catch (error) {
    handleError(res, error, "Failed to load assets for SteamGridDB game");
  }
});

// PUT /artwork/select — persist an approved artwork reference for a unique nominee name
router.put("/select", async (req, res) => {
  const {
    name,
    provider,
    providerGameId,
    imageId,
    imageUrl,
    type = "grid",
    width,
    height,
  } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Nominee name is required" });
  }
  if (!isValidImageUrl(imageUrl)) {
    return res.status(400).json({
      message: "Valid imageUrl (http://, https://, or /imgs/...) is required",
    });
  }
  if (!provider || typeof provider !== "string") {
    return res.status(400).json({ message: "Artwork provider is required" });
  }

  const cleanName = name.trim();
  const cleanUrl = imageUrl.trim();
  const cleanType = ALLOWED_TYPES.has(type) ? type : "grid";

  try {
    const saved = await prisma.gameArtwork.upsert({
      where: { name: cleanName },
      update: {
        provider: provider.trim(),
        providerGameId:
          providerGameId !== null && providerGameId !== undefined
            ? Number(providerGameId)
            : null,
        imageId:
          imageId !== null && imageId !== undefined ? Number(imageId) : null,
        imageUrl: cleanUrl,
        type: cleanType,
        width: width !== null && width !== undefined ? Number(width) : null,
        height: height !== null && height !== undefined ? Number(height) : null,
      },
      create: {
        name: cleanName,
        provider: provider.trim(),
        providerGameId:
          providerGameId !== null && providerGameId !== undefined
            ? Number(providerGameId)
            : null,
        imageId:
          imageId !== null && imageId !== undefined ? Number(imageId) : null,
        imageUrl: cleanUrl,
        type: cleanType,
        width: width !== null && width !== undefined ? Number(width) : null,
        height: height !== null && height !== undefined ? Number(height) : null,
      },
    });

    catalogCache.invalidate();

    res.json({
      message: `Saved artwork for ${cleanName}`,
      artwork: saved,
    });
  } catch (error) {
    handleError(res, error, "Failed to save selected artwork");
  }
});

// POST /artwork/bulk-select — persist multiple approved artwork selections at once
router.post("/bulk-select", async (req, res) => {
  const { items } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items array is required" });
  }

  const validItems = items.filter(
    (item) =>
      item?.name &&
      typeof item.name === "string" &&
      item?.provider &&
      isValidImageUrl(item?.imageUrl)
  );

  if (validItems.length === 0) {
    return res.status(400).json({ message: "No valid artwork items provided" });
  }

  try {
    const saved = await prisma.$transaction(
      validItems.map((item) => {
        const cleanName = item.name.trim();
        const cleanUrl = item.imageUrl.trim();
        const cleanType = ALLOWED_TYPES.has(item.type) ? item.type : "grid";
        return prisma.gameArtwork.upsert({
          where: { name: cleanName },
          update: {
            provider: String(item.provider).trim(),
            providerGameId:
              item.providerGameId != null ? Number(item.providerGameId) : null,
            imageId: item.imageId != null ? Number(item.imageId) : null,
            imageUrl: cleanUrl,
            type: cleanType,
            width: item.width != null ? Number(item.width) : null,
            height: item.height != null ? Number(item.height) : null,
          },
          create: {
            name: cleanName,
            provider: String(item.provider).trim(),
            providerGameId:
              item.providerGameId != null ? Number(item.providerGameId) : null,
            imageId: item.imageId != null ? Number(item.imageId) : null,
            imageUrl: cleanUrl,
            type: cleanType,
            width: item.width != null ? Number(item.width) : null,
            height: item.height != null ? Number(item.height) : null,
          },
        });
      })
    );

    catalogCache.invalidate();

    res.json({
      message: `Saved artwork for ${saved.length} nominees`,
      count: saved.length,
      artworks: saved,
    });
  } catch (error) {
    handleError(res, error, "Failed to bulk save artwork");
  }
});

// DELETE /artwork/:name — remove saved artwork override for a nominee
router.delete("/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name || "").trim();
  if (!name) {
    return res.status(400).json({ message: "Nominee name is required" });
  }

  try {
    await prisma.gameArtwork.deleteMany({
      where: { name },
    });
    catalogCache.invalidate();
    res.json({ message: `Cleared artwork override for ${name}` });
  } catch (error) {
    handleError(res, error, "Failed to remove artwork override");
  }
});

export default router;
