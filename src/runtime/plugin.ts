// src/runtime/plugin.ts
import type { NuxtApp } from '#app';
import { defineNuxtPlugin, useRequestEvent, useRuntimeConfig } from '#app';
import {
  createVcrFetch,
  methodPrefixedKey,
  urlToFilename,
  type CassetteStore,
} from './shared/fetch-interceptor';

// Re-exported so existing tests that import from '../src/runtime/plugin' keep working.
export { urlToFilename, methodPrefixedKey };

async function postCassetteViaHttp(
  type: 'graphql' | 'rest',
  key: string,
  data: unknown,
  fetchFn: typeof fetch,
): Promise<void> {
  try {
    await fetchFn('/api/_cassettes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, key, data }),
    });
  } catch {
    // server route unavailable — skip silently
  }
}

export default defineNuxtPlugin({
  name: 'vcr-for-nuxt',
  async setup(nuxtApp: NuxtApp) {
    const runtimeConfig = useRuntimeConfig();
    const vcr = runtimeConfig.public.vcr as { record: boolean; playback: boolean } | undefined;
    const vcrRecord = vcr?.record ?? false;
    const vcrPlayback = vcr?.playback ?? false;

    // Bail out early — zero overhead when VCR is inactive.
    if (!vcrRecord && !vcrPlayback) return;

    // Server-side fetch interception is owned by the Nitro plugin (installed
    // once per process with AsyncLocalStorage-backed per-request episodes).
    // This Nuxt plugin only wires up the client fetch wrapper and — for both
    // client and server — the optional axios adapter path.

    // Cassettes the client-side wrappers (fetch + axios) read from. On SSR
    // this stays empty and the Nitro plugin handles fetch; axios SSR loads
    // its own episode-scoped store below.
    const clientStore: CassetteStore = { graphql: {}, rest: {} };
    const originalFetch = globalThis.fetch;

    if (import.meta.client) {
      if (vcrPlayback) {
        try {
          const res = await originalFetch('/api/_cassettes');
          const body = (await res.json()) as { cassettes: CassetteStore };
          clientStore.graphql = body.cassettes?.graphql ?? {};
          clientStore.rest = body.cassettes?.rest ?? {};
        } catch {
          // dev endpoint not available — playback silently disabled
        }
      }

      globalThis.fetch = createVcrFetch({
        originalFetch,
        getCassettes: () => clientStore,
        recordCassette: (type, key, data) => {
          void postCassetteViaHttp(type, key, data, originalFetch);
        },
        playback: vcrPlayback,
        record: vcrRecord,
      });
    }

    // ── Axios interception ─────────────────────────────────────────────────
    // Conditional: only wire up if $axios is provided by the consuming app.
    // Runs on both server and client. `$axios` is injected per-request, so
    // mutating `defaults.adapter` here is safe across concurrent SSR requests.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $axios = (nuxtApp as any).$axios;
    if (!$axios) return;

    // Per-SSR-request episode resolution (cookie/header/env/date). `useRequestEvent`
    // returns the current request's H3Event, which this setup closes over for
    // all subsequent axios adapter/onResponse invocations within the request.
    const ssrEvent = import.meta.server ? useRequestEvent() : undefined;
    const cassettesDir = runtimeConfig.vcrCassettesDir as string | undefined;

    let serverRestStore: Record<string, unknown> = {};
    if (import.meta.server && vcrPlayback && cassettesDir) {
      const { resolveEpisodeName } = await import('./server/utils/episode');
      const { getEpisodeCassettes } = await import('./server/utils/cassette-cache');
      const episode = resolveEpisodeName(ssrEvent);
      serverRestStore = getEpisodeCassettes(cassettesDir, episode).rest;
    }

    async function recordAxios(type: 'rest', key: string, data: unknown) {
      if (import.meta.server && cassettesDir) {
        const { resolveEpisodeName } = await import('./server/utils/episode');
        const { writeCassette } = await import('./server/utils/cassettes');
        writeCassette(cassettesDir, resolveEpisodeName(ssrEvent), type, key, data);
        return;
      }
      await postCassetteViaHttp(type, key, data, originalFetch);
    }

    const originalAdapter = $axios.defaults.adapter;

    $axios.defaults.adapter = async (config: {
      baseURL?: string;
      url?: string;
      method?: string;
      [key: string]: unknown;
    }) => {
      const baseURL = config.baseURL ?? '';
      const url = config.url ?? '';
      const fullUrl = url.startsWith('http') ? url : `${baseURL}${url}`;
      const method = (config.method ?? 'get').toUpperCase();
      const key = methodPrefixedKey(method, fullUrl);
      const store = import.meta.server ? serverRestStore : clientStore.rest;

      if (vcrPlayback && store[key] !== undefined) {
        console.log(`[vcr][replay] ${fullUrl}`);
        return {
          data: store[key],
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config,
          request: {},
        };
      }
      return originalAdapter(config);
    };

    $axios.onResponse(
      (response: {
        config: { baseURL?: string; url?: string; method?: string };
        headers: Record<string, string>;
        data: unknown;
      }) => {
        if (!vcrRecord) return response;
        const contentType = response.headers['content-type'] ?? '';
        if (!contentType.includes('application/json')) return response;
        const baseURL = response.config.baseURL ?? '';
        const url = response.config.url ?? '';
        const fullUrl = url.startsWith('http') ? url : `${baseURL}${url}`;
        const method = (response.config.method ?? 'get').toUpperCase();
        const key = methodPrefixedKey(method, fullUrl);
        recordAxios('rest', key, response.data).catch(() => {});
        return response;
      },
    );
  },
});
