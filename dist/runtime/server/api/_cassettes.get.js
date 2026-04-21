import { resolve } from "node:path";
import { useRuntimeConfig } from "nitropack/runtime";
import { createError, defineEventHandler } from "h3";
import { getEpisodeCassettes } from "../utils/cassette-cache.js";
import { resolveEpisodeName } from "../utils/episode.js";
export default defineEventHandler((event) => {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    throw createError({ statusCode: 404 });
  }
  const config = useRuntimeConfig(event);
  const cassettesDir = resolve(
    process.cwd(),
    config.vcrCassettesDir ?? ".cassettes"
  );
  const playback = process.env.VCR_PLAYBACK === "true";
  const cassettes = playback ? getEpisodeCassettes(cassettesDir, resolveEpisodeName(event)) : { graphql: {}, rest: {} };
  return { cassettes };
});
