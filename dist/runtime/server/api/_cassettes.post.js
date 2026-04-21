import { resolve } from "node:path";
import { useRuntimeConfig } from "nitropack/runtime";
import { createError, defineEventHandler, readBody } from "h3";
import { writeCassette } from "../utils/cassettes.js";
import { resolveEpisodeName } from "../utils/episode.js";
export default defineEventHandler(async (event) => {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    throw createError({ statusCode: 404 });
  }
  if (process.env.VCR_RECORD !== "true") {
    return { recorded: false, reason: "recording disabled" };
  }
  const { type, key, data } = await readBody(event);
  if (!/^[\w-]+$/.test(key)) {
    throw createError({ statusCode: 400, message: "Invalid cassette key" });
  }
  if (type !== "graphql" && type !== "rest") {
    throw createError({ statusCode: 400, message: "Invalid cassette type" });
  }
  const config = useRuntimeConfig(event);
  const cassettesDir = resolve(
    process.cwd(),
    config.vcrCassettesDir ?? ".cassettes"
  );
  writeCassette(cassettesDir, resolveEpisodeName(event), type, key, data);
  return { recorded: true };
});
