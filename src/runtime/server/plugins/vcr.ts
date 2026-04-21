// src/runtime/server/plugins/vcr.ts
import { resolve } from 'node:path';
import { defineNitroPlugin } from 'nitropack/runtime/plugin';
import { useEvent, useRuntimeConfig } from 'nitropack/runtime';
import { createVcrFetch, type CassetteStore } from '../../shared/fetch-interceptor';
import { getEpisodeCassettes } from '../utils/cassette-cache';
import { writeCassette } from '../utils/cassettes';
import { resolveEpisodeName } from '../utils/episode';

export default defineNitroPlugin(() => {
  const vcrRecord = process.env.VCR_RECORD === 'true';
  const vcrPlayback = process.env.VCR_PLAYBACK === 'true';

  // No-op when VCR is inactive — costs nothing per request.
  if (!vcrRecord && !vcrPlayback) return;

  const config = useRuntimeConfig();
  const cassettesDir = resolve(
    process.cwd(),
    (config.vcrCassettesDir as string | undefined) ?? '.cassettes',
  );

  // Capture the real fetch exactly once — before we replace the global. This
  // avoids the per-request wrapper-stacking race the old Nuxt plugin had.
  const originalFetch = globalThis.fetch.bind(globalThis);

  // Fallback when fetch is called outside a request (Nitro boot, background
  // jobs) — playback misses cleanly through to the network and recording is
  // skipped for those paths.
  const emptyStore: CassetteStore = { graphql: {}, rest: {} };

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
        // Outside a request context or disk write failed — never break the app.
      }
    },
    playback: vcrPlayback,
    record: vcrRecord,
  });
});
