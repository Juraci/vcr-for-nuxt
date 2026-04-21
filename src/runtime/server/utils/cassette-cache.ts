// src/runtime/server/utils/cassette-cache.ts
import { loadEpisodeCassettes } from './cassettes';

export interface EpisodeCassettes {
  graphql: Record<string, unknown>;
  rest: Record<string, unknown>;
}

// Key is `${cassettesDir}::${episode}` so different Nuxt apps sharing this
// module (unlikely in practice, but possible under test) don't collide.
const cache = new Map<string, EpisodeCassettes>();

function cacheKey(cassettesDir: string, episode: string): string {
  return `${cassettesDir}::${episode}`;
}

/**
 * Returns the cassettes for a given episode, reading from disk on the first
 * call and returning the cached entry thereafter.
 *
 * Record and playback are mutually exclusive, so during playback the on-disk
 * cassettes are read-only — no invalidation strategy is needed for the process
 * lifetime. A fresh dev-server restart is the only thing that should reload.
 */
export function getEpisodeCassettes(cassettesDir: string, episode: string): EpisodeCassettes {
  const key = cacheKey(cassettesDir, episode);
  const hit = cache.get(key);
  if (hit) return hit;
  const loaded = loadEpisodeCassettes(cassettesDir, episode);
  cache.set(key, loaded);
  return loaded;
}

/** Test-only: clear the cache between test cases. Not part of the public API. */
export function __resetCassetteCacheForTests(): void {
  cache.clear();
}
