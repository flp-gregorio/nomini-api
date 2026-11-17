/**
 * Lightweight in-memory TTL cache with in-flight request coalescing
 * and epoch-guarded invalidation for public, non-user-specific responses.
 */
export function createCache(defaultTtlMs = 60_000) {
  const store = new Map();
  const inFlight = new Map();
  let epoch = 0;

  async function getOrSet(key, loader, ttlMs = defaultTtlMs) {
    const now = Date.now();
    const cached = store.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const pending = inFlight.get(key);
    if (pending) {
      return pending;
    }

    const startEpoch = epoch;
    const promise = (async () => {
      try {
        const value = await loader();
        // Only populate cache if no invalidation occurred while the query was running
        if (epoch === startEpoch) {
          store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
          });
        }
        return value;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise);
    return promise;
  }

  function invalidate(prefix) {
    epoch += 1;
    if (!prefix) {
      store.clear();
      return;
    }
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }
  }

  return { getOrSet, invalidate };
}

export const catalogCache = createCache(60_000);
export const eventCache = createCache(60_000);

export function setPublicCacheHeaders(res, maxAge = 30, swr = 120) {
  res.set(
    "Cache-Control",
    `public, max-age=${maxAge}, stale-while-revalidate=${swr}`
  );
}

export function setPrivateNoStoreHeaders(res) {
  res.set("Cache-Control", "private, no-store");
}
