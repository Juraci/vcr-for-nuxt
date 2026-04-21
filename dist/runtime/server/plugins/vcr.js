import { resolve } from "node:path";
import { defineNitroPlugin } from "nitropack/runtime/plugin";
import { useEvent, useRuntimeConfig } from "nitropack/runtime";
import { createVcrFetch } from "../../shared/fetch-interceptor.js";
import { getEpisodeCassettes } from "../utils/cassette-cache.js";
import { writeCassette } from "../utils/cassettes.js";
import { resolveEpisodeName } from "../utils/episode.js";
export default defineNitroPlugin(() => {
  const vcrRecord = process.env.VCR_RECORD === "true";
  const vcrPlayback = process.env.VCR_PLAYBACK === "true";
  if (!vcrRecord && !vcrPlayback) return;
  const config = useRuntimeConfig();
  const cassettesDir = resolve(
    process.cwd(),
    config.vcrCassettesDir ?? ".cassettes"
  );
  const originalFetch = globalThis.fetch.bind(globalThis);
  const emptyStore = { graphql: {}, rest: {} };
  globalThis.fetch = createVcrFetch({
    originalFetch,
    getCassettes: () => {
      try {
        const event = useEvent();
        const episode = resolveEpisodeName(event);
        return vcrPlayback ? getEpisodeCassettes(cassettesDir, episode) : emptyStore;
      } catch {
        return emptyStore;
      }
    },
    recordCassette: (type, key, data) => {
      try {
        const event = useEvent();
        const episode = resolveEpisodeName(event);
        writeCassette(cassettesDir, episode, type, key, data);
      } catch {
      }
    },
    playback: vcrPlayback,
    record: vcrRecord
  });
});
