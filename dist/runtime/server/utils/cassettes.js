import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
export function loadDir(dir) {
  const result = {};
  if (!existsSync(dir)) return result;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    Object.assign(result, JSON.parse(readFileSync(join(dir, file), "utf8")));
  }
  return result;
}
export function loadEpisodeCassettes(cassettesDir, episode) {
  const episodeDir = resolve(cassettesDir, "episodes", episode);
  return {
    graphql: loadDir(join(episodeDir, "graphql")),
    rest: loadDir(join(episodeDir, "rest"))
  };
}
const EPISODE_INDEX_JS = `// Auto-generated \u2014 do not edit manually.
// Loads all cassettes for this episode.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const cassettes = { graphql: {}, rest: {} };

for (const file of readdirSync(join(import.meta.dirname, 'graphql')).filter((f) => f.endsWith('.json'))) {
  Object.assign(cassettes.graphql, JSON.parse(readFileSync(join(import.meta.dirname, 'graphql', file), 'utf8')));
}
for (const file of readdirSync(join(import.meta.dirname, 'rest')).filter((f) => f.endsWith('.json'))) {
  Object.assign(cassettes.rest, JSON.parse(readFileSync(join(import.meta.dirname, 'rest', file), 'utf8')));
}

export default cassettes;
`;
export function writeCassette(cassettesDir, episode, type, key, data) {
  const episodeDir = resolve(cassettesDir, "episodes", episode);
  const typeDir = join(episodeDir, type);
  const filePath = join(typeDir, `${key}.json`);
  mkdirSync(typeDir, { recursive: true });
  writeFileSync(filePath, JSON.stringify({ [key]: data }, null, 2));
  const indexPath = join(episodeDir, "index.js");
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, EPISODE_INDEX_JS);
  }
}
