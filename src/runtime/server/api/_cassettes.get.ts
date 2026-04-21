// src/runtime/server/api/_cassettes.get.ts
import { resolve } from 'node:path';
import { useRuntimeConfig } from 'nitropack/runtime';
import { createError, defineEventHandler } from 'h3';
import { getEpisodeCassettes } from '../utils/cassette-cache';
import { resolveEpisodeName } from '../utils/episode';

export default defineEventHandler((event) => {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
    throw createError({ statusCode: 404 });
  }

  const config = useRuntimeConfig(event);
  const cassettesDir = resolve(
    process.cwd(),
    (config.vcrCassettesDir as string | undefined) ?? '.cassettes',
  );

  const playback = process.env.VCR_PLAYBACK === 'true';

  // Only read disk when playback is active — skip the I/O otherwise. Episode
  // is resolved from the incoming request (cookie/header) with fallbacks, and
  // cassettes are cached per-episode for the process lifetime.
  const cassettes = playback
    ? getEpisodeCassettes(cassettesDir, resolveEpisodeName(event))
    : { graphql: {}, rest: {} };

  return { cassettes };
});
