// Auto-generated — do not edit manually.
// Loads all cassettes for this episode.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(globalThis._importMeta_.url));
const cassettes = { graphql: {}, rest: {} };

for (const file of readdirSync(join(__dirname, 'graphql')).filter((f) => f.endsWith('.json'))) {
  Object.assign(cassettes.graphql, JSON.parse(readFileSync(join(__dirname, 'graphql', file), 'utf8')));
}
for (const file of readdirSync(join(__dirname, 'rest')).filter((f) => f.endsWith('.json'))) {
  Object.assign(cassettes.rest, JSON.parse(readFileSync(join(__dirname, 'rest', file), 'utf8')));
}

export default cassettes;
