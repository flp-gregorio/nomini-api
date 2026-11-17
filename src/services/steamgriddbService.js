const STEAMGRIDDB_BASE_URL = "https://www.steamgriddb.com/api/v2";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 10000;

const PORTRAIT_DIMENSIONS = "600x900,342x482,660x930";

const cache = new Map();

export class SteamGridDbError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "SteamGridDbError";
    this.statusCode = statusCode;
  }
}

export function isSteamGridDbConfigured() {
  return Boolean(process.env.STEAMGRIDDB_API_KEY?.trim());
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function sgdbFetch(path, { forceRefresh = false } = {}) {
  const apiKey = process.env.STEAMGRIDDB_API_KEY?.trim();
  if (!apiKey) {
    throw new SteamGridDbError(
      "STEAMGRIDDB_API_KEY is not configured on the backend.",
      503
    );
  }

  const cacheKey = `sgdb:${path}`;
  if (!forceRefresh) {
    const cached = getCached(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const response = await fetch(`${STEAMGRIDDB_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    let errorDetail = `SteamGridDB request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (Array.isArray(errBody?.errors) && errBody.errors.length > 0) {
        errorDetail = errBody.errors.join(", ");
      }
    } catch {
      // Ignore JSON parse failure on non-JSON error responses
    }
    const status =
      response.status === 401 || response.status === 403
        ? 502
        : response.status === 404
        ? 404
        : response.status === 429
        ? 429
        : 502;
    throw new SteamGridDbError(errorDetail, status);
  }

  const payload = await response.json();
  if (!payload?.success) {
    throw new SteamGridDbError(
      Array.isArray(payload?.errors)
        ? payload.errors.join(", ")
        : "SteamGridDB returned an unsuccessful response",
      502
    );
  }

  const data = payload.data ?? [];
  setCached(cacheKey, data);
  return data;
}

export async function searchGames(term, options = {}) {
  const cleaned = term?.trim();
  if (!cleaned) return [];

  try {
    const games = await sgdbFetch(
      `/search/autocomplete/${encodeURIComponent(cleaned)}`,
      options
    );
    return Array.isArray(games) ? games : [];
  } catch (error) {
    if (error instanceof SteamGridDbError && error.statusCode === 404) {
      return [];
    }
    throw error;
  }
}

function normalizeAsset(item, gameId, type) {
  return {
    provider: "steamgriddb",
    providerGameId: Number(gameId),
    imageId: item.id,
    imageUrl: item.url,
    thumbUrl: item.thumb || item.url,
    type,
    width: item.width ?? null,
    height: item.height ?? null,
    mime: item.mime ?? null,
    style: item.style ?? null,
    score: item.score ?? 0,
    isPortrait: Boolean(item.width && item.height && item.height > item.width),
  };
}

function sortGridCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    // Prefer portrait grids (ideal for aspect-[4/5] nominee cards), especially 600x900
    const aExact600 = a.width === 600 && a.height === 900 ? 1 : 0;
    const bExact600 = b.width === 600 && b.height === 900 ? 1 : 0;
    if (aExact600 !== bExact600) return bExact600 - aExact600;

    const aPortrait = a.isPortrait ? 1 : 0;
    const bPortrait = b.isPortrait ? 1 : 0;
    if (aPortrait !== bPortrait) return bPortrait - aPortrait;

    return (b.score ?? 0) - (a.score ?? 0);
  });
}

async function fetchAssetType(gameId, type, options = {}) {
  try {
    if (type === "grid") {
      // First query portrait dimensions specifically
      let raw = await sgdbFetch(
        `/grids/game/${gameId}?dimensions=${PORTRAIT_DIMENSIONS}&types=static&nsfw=false&humor=false`,
        options
      );
      // Fallback to any static grid if standard portrait dimensions returned empty
      if (!Array.isArray(raw) || raw.length === 0) {
        raw = await sgdbFetch(
          `/grids/game/${gameId}?types=static&nsfw=false&humor=false`,
          options
        );
      }
      const normalized = (raw || []).map((item) =>
        normalizeAsset(item, gameId, "grid")
      );
      return sortGridCandidates(normalized).slice(0, 12);
    }

    if (type === "hero") {
      const raw = await sgdbFetch(
        `/heroes/game/${gameId}?types=static&nsfw=false&humor=false`,
        options
      );
      return (raw || [])
        .map((item) => normalizeAsset(item, gameId, "hero"))
        .slice(0, 8);
    }

    if (type === "logo") {
      const raw = await sgdbFetch(
        `/logos/game/${gameId}?types=static&nsfw=false&humor=false`,
        options
      );
      return (raw || [])
        .map((item) => normalizeAsset(item, gameId, "logo"))
        .slice(0, 8);
    }

    return [];
  } catch (error) {
    if (error instanceof SteamGridDbError && error.statusCode === 404) {
      return [];
    }
    throw error;
  }
}

export async function getAssetsForGame(
  gameId,
  { types = ["grid", "hero", "logo"], forceRefresh = false } = {}
) {
  const validTypes = types.filter((t) =>
    ["grid", "hero", "logo"].includes(t)
  );
  const requested = validTypes.length > 0 ? validTypes : ["grid"];

  const entries = await Promise.all(
    requested.map(async (type) => {
      const items = await fetchAssetType(gameId, type, { forceRefresh });
      return [type, items];
    })
  );

  const result = { grids: [], heroes: [], logos: [] };
  for (const [type, items] of entries) {
    if (type === "grid") result.grids = items;
    if (type === "hero") result.heroes = items;
    if (type === "logo") result.logos = items;
  }
  return result;
}
