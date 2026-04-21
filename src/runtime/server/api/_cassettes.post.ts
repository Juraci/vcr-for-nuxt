// src/runtime/server/api/_cassettes.post.ts
import { resolve } from 'node:path';
import { useRuntimeConfig } from 'nitropack/runtime';
import { createError, defineEventHandler, readBody } from 'h3';
import { writeCassette } from '../utils/cassettes';
import { resolveEpisodeName } from '../utils/episode';

export default defineEventHandler(async (event) => {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
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
  const cassettesDir = resolve(
    process.cwd(),
    (config.vcrCassettesDir as string | undefined) ?? '.cassettes',
  );

  writeCassette(cassettesDir, resolveEpisodeName(event), type, key, data);

  return { recorded: true };
});
