// src/runtime/server/api/_cassettes.get.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createError, defineEventHandler, useRuntimeConfig } from 'h3';

function loadDir(dir: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!existsSync(dir)) return result;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    Object.assign(result, JSON.parse(readFileSync(join(dir, file), 'utf8')));
  }
  return result;
}

export default defineEventHandler((event) => {
  if (process.env.NODE_ENV !== 'development') {
    throw createError({ statusCode: 404 });
  }

  const config = useRuntimeConfig(event);
  const cassettesDir =
    (config.vcrCassettesDir as string | undefined) ?? '.cassettes';
  const cwd = process.cwd();

  const playback = process.env.VCR_PLAYBACK === 'true';

  // Only read disk when playback is active — skip the I/O otherwise.
  const cassettes = playback
    ? {
        graphql: loadDir(resolve(cwd, cassettesDir, 'graphql')),
        rest: loadDir(resolve(cwd, cassettesDir, 'rest')),
      }
    : { graphql: {}, rest: {} };

  return { cassettes };
});
