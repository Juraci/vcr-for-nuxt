// src/runtime/server/api/_cassettes.post.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useRuntimeConfig } from 'nitropack/runtime';
import { createError, defineEventHandler, readBody } from 'h3';

const CASSETTES_INDEX_JS = `\
// Auto-generated — do not edit manually.
// Dynamically loads all cassettes from this directory at runtime.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cassettes = {};

for (const file of readdirSync(__dirname).filter((f) => f.endsWith('.json'))) {
  Object.assign(cassettes, JSON.parse(readFileSync(join(__dirname, file), 'utf8')));
}

export default cassettes;
`;

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV !== 'development') {
    throw createError({ statusCode: 404 });
  }

  if (process.env.VCR_RECORD !== 'true') {
    return { recorded: false, reason: 'recording disabled' };
  }

  const { type, key, data } = await readBody<{
    type: 'graphql' | 'rest';
    key: string;
    data: unknown;
  }>(event);

  if (!/^[\w-]+$/.test(key)) {
    throw createError({ statusCode: 400, message: 'Invalid cassette key' });
  }
  if (type !== 'graphql' && type !== 'rest') {
    throw createError({ statusCode: 400, message: 'Invalid cassette type' });
  }

  const config = useRuntimeConfig(event);
  const cassettesDir =
    (config.vcrCassettesDir as string | undefined) ?? '.cassettes';

  const dir = resolve(
    process.cwd(),
    cassettesDir,
    type === 'rest' ? 'rest' : 'graphql',
  );
  const filePath = resolve(dir, `${key}.json`);

  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify({ [key]: data }, null, 2));

  // Write index.js once — it auto-discovers new cassettes via readdirSync.
  const indexPath = resolve(dir, 'index.js');
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, CASSETTES_INDEX_JS);
  }

  return { recorded: true };
});
