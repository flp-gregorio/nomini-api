const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_BASE_URL = "https://api.igdb.com/v4";
const REQUEST_TIMEOUT_MS = 10000;

let cachedToken = null;
let tokenExpiresAt = 0;

export function isIgdbConfigured() {
  return Boolean(
    process.env.IGDB_CLIENT_ID?.trim() &&
      process.env.IGDB_CLIENT_SECRET?.trim()
  );
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const clientId = process.env.IGDB_CLIENT_ID?.trim();
  const clientSecret = process.env.IGDB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const url = `${TWITCH_TOKEN_URL}?client_id=${encodeURIComponent(
    clientId
  )}&client_secret=${encodeURIComponent(
    clientSecret
  )}&grant_type=client_credentials`;

  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`IGDB auth failed (${response.status})`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

export async function searchIgdbCovers(title) {
  if (!isIgdbConfigured()) return [];

  const token = await getAccessToken();
  if (!token) return [];

  const sanitized = title.replace(/"/g, '\\"');
  const query = `search "${sanitized}"; fields name,cover.image_id,cover.width,cover.height; where cover != null; limit 5;`;

  const response = await fetch(`${IGDB_BASE_URL}/games`, {
    method: "POST",
    headers: {
      "Client-ID": process.env.IGDB_CLIENT_ID.trim(),
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
      Accept: "application/json",
    },
    body: query,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    return [];
  }

  const games = await response.json();
  if (!Array.isArray(games)) return [];

  return games
    .filter((g) => g.cover?.image_id)
    .map((g) => ({
      provider: "igdb",
      providerGameId: g.id,
      gameName: g.name,
      imageId: null,
      imageUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${g.cover.image_id}.jpg`,
      thumbUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`,
      type: "grid",
      width: g.cover.width ? g.cover.width * 2 : null,
      height: g.cover.height ? g.cover.height * 2 : null,
    }));
}
