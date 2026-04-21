import { loadEpisodeCassettes } from "./cassettes.js";
const cache = /* @__PURE__ */ new Map();
function cacheKey(cassettesDir, episode) {
  return `${cassettesDir}::${episode}`;
}
export function getEpisodeCassettes(cassettesDir, episode) {
  const key = cacheKey(cassettesDir, episode);
  const hit = cache.get(key);
  if (hit) return hit;
  const loaded = loadEpisodeCassettes(cassettesDir, episode);
  cache.set(key, loaded);
  return loaded;
}
export function __resetCassetteCacheForTests() {
  cache.clear();
}
