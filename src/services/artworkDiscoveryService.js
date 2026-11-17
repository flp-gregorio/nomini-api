import prisma from "../prismaClient.js";
import {
  getAssetsForGame,
  isSteamGridDbConfigured,
  searchGames,
  SteamGridDbError,
} from "./steamgriddbService.js";
import { isIgdbConfigured, searchIgdbCovers } from "./igdbService.js";

const ROMAN_TO_ARABIC = new Map([
  ["ii", "2"],
  ["iii", "3"],
  ["iv", "4"],
  ["v", "5"],
  ["vi", "6"],
  ["vii", "7"],
  ["viii", "8"],
  ["ix", "9"],
  ["x", "10"],
  ["xi", "11"],
  ["xii", "12"],
  ["xiii", "13"],
  ["xiv", "14"],
  ["xv", "15"],
]);

const EDITION_PATTERNS = [
  /\bgame of the year edition\b/gi,
  /\bdefinitive edition\b/gi,
  /\bdeluxe edition\b/gi,
  /\bremastered\b/gi,
  /\brevamped\b/gi,
  /\bresynced\b/gi,
  /\bcomplete edition\b/gi,
  /\bedition\b/gi,
];

function stripParentheticalQualifiers(title) {
  return title.replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

export function normalizeTitle(rawTitle) {
  if (!rawTitle) return "";
  const base = rawTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return base
    .split(" ")
    .map((token) => ROMAN_TO_ARABIC.get(token) ?? token)
    .join(" ");
}

function stripEditions(normalizedTitle) {
  let out = normalizedTitle;
  for (const pattern of EDITION_PATTERNS) {
    out = out.replace(pattern, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function extractNumbers(normalizedTitle) {
  return normalizedTitle.match(/\b\d+\b/g) ?? [];
}

function extractMainSubtitle(rawTitle) {
  const idx = rawTitle.search(/[:\-–—]/);
  if (idx <= 0) return null;
  return rawTitle.slice(0, idx).trim();
}

export function scoreGameMatch(queryTitle, candidateTitle) {
  const cleanQuery = stripParentheticalQualifiers(queryTitle);
  const normQuery = normalizeTitle(cleanQuery);
  const normCandidate = normalizeTitle(candidateTitle);

  if (!normQuery || !normCandidate) {
    return { score: 0, confidence: "none" };
  }

  // Exact match after normalization & roman/arabic conversion
  if (normQuery === normCandidate) {
    return { score: 100, confidence: "exact" };
  }

  const queryNoEd = stripEditions(normQuery);
  const candNoEd = stripEditions(normCandidate);

  if (queryNoEd && queryNoEd === candNoEd) {
    return { score: 94, confidence: "exact" };
  }

  // Guard against sequel/number mismatches (e.g. "Resident Evil" vs "Resident Evil 4")
  const queryNums = extractNumbers(queryNoEd);
  const candNums = extractNumbers(candNoEd);
  const sameNumbers =
    queryNums.length === candNums.length &&
    queryNums.every((n, i) => n === candNums[i]);

  if (!sameNumbers && (queryNums.length > 0 || candNums.length > 0)) {
    // Allow minor mismatch only if one has extra trailing year like "(2026)" already handled
    return { score: 25, confidence: "none" };
  }

  // Subtitle/prefix match when sequel numbers align
  const queryMain = normalizeTitle(extractMainSubtitle(cleanQuery) || "");
  const candMain = normalizeTitle(extractMainSubtitle(candidateTitle) || "");
  if (
    (queryMain && queryMain === candNoEd) ||
    (candMain && candMain === queryNoEd)
  ) {
    return { score: 86, confidence: "high" };
  }

  // Token overlap (Jaccard)
  const qTokens = new Set(queryNoEd.split(" ").filter(Boolean));
  const cTokens = new Set(candNoEd.split(" ").filter(Boolean));
  let intersection = 0;
  for (const t of qTokens) {
    if (cTokens.has(t)) intersection++;
  }
  const union = new Set([...qTokens, ...cTokens]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  if (jaccard >= 0.8) {
    return { score: Math.round(70 + jaccard * 18), confidence: "high" };
  }
  if (jaccard >= 0.55) {
    return { score: Math.round(50 + jaccard * 25), confidence: "review" };
  }

  return { score: Math.round(jaccard * 45), confidence: "none" };
}

function buildSearchVariants(title) {
  const variants = [];
  const stripped = stripParentheticalQualifiers(title).trim();
  if (stripped) variants.push(stripped);

  const normalizedChars = stripped
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'");
  if (normalizedChars && !variants.includes(normalizedChars)) {
    variants.push(normalizedChars);
  }

  // Try without colon/subtitle only as a fallback search query (still strictly scored against full title!)
  const mainPart = extractMainSubtitle(normalizedChars);
  if (mainPart && mainPart.length >= 4 && !variants.includes(mainPart)) {
    variants.push(mainPart);
  }

  return variants;
}

export async function discoverArtworkForTitle(
  title,
  { types = ["grid", "hero", "logo"], forceRefresh = false } = {}
) {
  const variants = buildSearchVariants(title);
  const rawGamesById = new Map();

  for (const variant of variants) {
    const results = await searchGames(variant, { forceRefresh });
    for (const game of results) {
      if (!rawGamesById.has(game.id)) {
        rawGamesById.set(game.id, game);
      }
    }
    // Stop querying additional variants if we already found an exact match
    const hasExact = [...rawGamesById.values()].some(
      (g) => scoreGameMatch(title, g.name).confidence === "exact"
    );
    if (hasExact) break;
  }

  const scored = [...rawGamesById.values()]
    .map((game) => {
      const { score, confidence } = scoreGameMatch(title, game.name);
      return {
        id: game.id,
        name: game.name,
        releaseDate: game.release_date ?? null,
        verified: Boolean(game.verified),
        matchScore: score,
        matchConfidence: confidence,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  const topMatch = scored[0] ?? null;
  const isConfidentMatch =
    topMatch &&
    (topMatch.matchConfidence === "exact" ||
      topMatch.matchConfidence === "high");
  const isReviewMatch = topMatch && topMatch.matchConfidence === "review";

  const matchedGame = isConfidentMatch || isReviewMatch ? topMatch : null;
  const suggestions = scored.slice(0, 6);

  let candidates = { grids: [], heroes: [], logos: [], igdb: [] };

  if (matchedGame) {
    candidates = {
      ...(await getAssetsForGame(matchedGame.id, { types, forceRefresh })),
      igdb: [],
    };
  }

  // Optional IGDB fallback if configured and SteamGridDB yielded no portrait grids
  if (isIgdbConfigured() && candidates.grids.length === 0) {
    try {
      const igdbResults = await searchIgdbCovers(
        stripParentheticalQualifiers(title)
      );
      candidates.igdb = igdbResults.filter(
        (item) => scoreGameMatch(title, item.gameName).score >= 70
      );
    } catch {
      // Keep IGDB fallback non-fatal
    }
  }

  const recommendedCandidate =
    candidates.grids[0] ??
    candidates.igdb[0] ??
    candidates.heroes[0] ??
    candidates.logos[0] ??
    null;

  const status = !matchedGame
    ? "not_found"
    : matchedGame.matchConfidence === "review"
    ? "needs_review"
    : "matched";

  return {
    name: title,
    status,
    matchConfidence: matchedGame?.matchConfidence ?? "none",
    matchedGame,
    suggestions,
    candidates,
    recommendedCandidate,
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => consume()
  );
  await Promise.all(workers);
  return results;
}

export async function getUniqueNomineesForYear(year) {
  let targetYear = year ? parseInt(year, 10) : null;
  if (!targetYear) {
    const latest = await prisma.category.findFirst({
      orderBy: { year: "desc" },
      select: { year: true },
    });
    targetYear = latest ? latest.year : new Date().getFullYear();
  }

  const categories = await prisma.category.findMany({
    where: { year: targetYear },
    include: { nominees: true },
    orderBy: { id: "asc" },
  });

  const nomineeMap = new Map();
  for (const cat of categories) {
    for (const nom of cat.nominees) {
      const existing = nomineeMap.get(nom.name);
      if (existing) {
        if (!existing.categories.includes(cat.title)) {
          existing.categories.push(cat.title);
        }
        if (!existing.existingLocalImage && nom.image) {
          existing.existingLocalImage = nom.image;
        }
      } else {
        nomineeMap.set(nom.name, {
          name: nom.name,
          publisher: nom.publisher,
          genre: nom.genre,
          existingLocalImage: nom.image,
          categories: [cat.title],
        });
      }
    }
  }

  const uniqueNames = [...nomineeMap.keys()];
  const savedArtworks = await prisma.gameArtwork.findMany({
    where: { name: { in: uniqueNames } },
  });
  const artworkMap = new Map(savedArtworks.map((a) => [a.name, a]));

  const nominees = uniqueNames.map((name) => {
    const item = nomineeMap.get(name);
    const saved = artworkMap.get(name) ?? null;
    return {
      ...item,
      artwork: saved
        ? {
            provider: saved.provider,
            providerGameId: saved.providerGameId,
            imageId: saved.imageId,
            imageUrl: saved.imageUrl,
            type: saved.type,
            width: saved.width,
            height: saved.height,
            updatedAt: saved.updatedAt,
          }
        : null,
    };
  });

  return {
    year: targetYear,
    nominees,
  };
}

export async function discoverAllNominees({
  year,
  names,
  forceRefresh = false,
  types = ["grid", "hero", "logo"],
} = {}) {
  if (!isSteamGridDbConfigured()) {
    throw new SteamGridDbError(
      "STEAMGRIDDB_API_KEY is not configured in the backend environment.",
      503
    );
  }

  const { year: targetYear, nominees } = await getUniqueNomineesForYear(year);

  const requestedSet =
    Array.isArray(names) && names.length > 0 ? new Set(names) : null;

  const targets = nominees.filter((item) => {
    if (requestedSet && !requestedSet.has(item.name)) return false;
    if (!forceRefresh && !requestedSet && item.artwork?.imageUrl) {
      return false; // Skip nominees that already have approved artwork
    }
    return true;
  });

  let errorsCount = 0;
  const results = await runWithConcurrency(targets, 3, async (item) => {
    try {
      return await discoverArtworkForTitle(item.name, {
        types,
        forceRefresh,
      });
    } catch (error) {
      errorsCount++;
      return {
        name: item.name,
        status: "error",
        error: error.message,
        matchConfidence: "none",
        matchedGame: null,
        suggestions: [],
        candidates: { grids: [], heroes: [], logos: [], igdb: [] },
        recommendedCandidate: null,
      };
    }
  });

  return {
    year: targetYear,
    results,
    meta: {
      totalUnique: nominees.length,
      processed: targets.length,
      skippedExisting: nominees.length - targets.length,
      errors: errorsCount,
    },
  };
}
