// src/runtime/server/api/_cassettes.get.ts
import { resolve } from 'node:path';
import { useRuntimeConfig } from 'nitropack/runtime';
import { createError, defineEventHandler } from 'h3';
import { loadEpisodeCassettes } from '../utils/cassettes';
import { resolveEpisodeName } from '../utils/episode';

export default defineEventHandler((event) => {
  if (process.env.NODE_ENV !== 'development') {
    throw createError({ statusCode: 404 });
  }

  const config = useRuntimeConfig(event);
  const cassettesDir = resolve(
    process.cwd(),
    (config.vcrCassettesDir as string | undefined) ?? '.cassettes',
  );

  const playback = process.env.VCR_PLAYBACK === 'true';

  // Only read disk when playback is active — skip the I/O otherwise.
  const cassettes = playback
    ? loadEpisodeCassettes(cassettesDir, resolveEpisodeName())
    : { graphql: {}, rest: {} };

  return { cassettes };
});
