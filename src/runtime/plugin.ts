// src/runtime/plugin.ts
import type { NuxtApp } from '#app';
import { defineNuxtPlugin, useRuntimeConfig } from '#app';
import { graphqlCassetteKey } from './graphql-key';

export function urlToFilename(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return path
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function methodPrefixedKey(method: string, url: string): string {
  return `${method.toUpperCase()}_${urlToFilename(url)}`;
}

async function postCassette(
  type: 'graphql' | 'rest',
  key: string,
  data: unknown,
  fetchFn: typeof fetch,
  serverWriteOpts?: { cassettesDir: string; episode: string },
): Promise<void> {
  if (serverWriteOpts) {
    const { writeCassette } = await import('./server/utils/cassettes');
    await writeCassette(serverWriteOpts.cassettesDir, serverWriteOpts.episode, type, key, data);
    return;
  }
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

    // Capture the original fetch *before* wrapping so postCassette and
    // the cassette loader can use the real network fetch.
    const originalFetch = globalThis.fetch;

    // Cassette store — populated before fetch wrapper is installed.
    let graphqlCassettes: Record<string, unknown> = {};
    let restCassettes: Record<string, unknown> = {};

    if (vcrPlayback) {
      if (import.meta.server) {
        // On the server, load cassettes directly from disk — no HTTP roundtrip
        // needed and relative URLs would fail in the Node.js process anyway.
        const { loadEpisodeCassettes } = await import('./server/utils/cassettes');
        const cassettesDir = runtimeConfig.vcrCassettesDir as string;
        const episode = runtimeConfig.vcrEpisode as string;
        try {
          const loaded = await loadEpisodeCassettes(cassettesDir, episode);
          graphqlCassettes = loaded.graphql;
          restCassettes = loaded.rest;
        } catch {
          // cassettes dir missing or unreadable — playback silently disabled
        }
      } else {
        // On the client, fetch cassettes via the dev API endpoint.
        try {
          const res = await originalFetch('/api/_cassettes');
          const body = (await res.json()) as {
            cassettes: {
              graphql: Record<string, unknown>;
              rest: Record<string, unknown>;
            };
          };
          graphqlCassettes = body.cassettes?.graphql ?? {};
          restCassettes = body.cassettes?.rest ?? {};
        } catch {
          // dev endpoint not available — playback silently disabled
        }
      }
    }

    // On the server, pass write options so postCassette bypasses HTTP.
    const serverWriteOpts =
      import.meta.server && vcrRecord
        ? {
            cassettesDir: runtimeConfig.vcrCassettesDir as string,
            episode: runtimeConfig.vcrEpisode as string,
          }
        : undefined;

    // ── fetch wrapper ──────────────────────────────────────────────────────
    globalThis.fetch = function vcrFetch(input: RequestInfo | URL, init?: RequestInit) {
      const url = input instanceof Request ? input.url : String(input);
      const isGraphql = url.includes('/graphql');
      const method = (init?.method ?? 'GET').toUpperCase();

      const gqlKey = isGraphql ? graphqlCassetteKey(init?.body) : null;
      const label = gqlKey ? `${url} (${gqlKey})` : url;

      // GraphQL playback
      if (gqlKey && vcrPlayback) {
        if (graphqlCassettes[gqlKey] !== undefined) {
          console.log(`[vcr][replay] ${label}`);
          return Promise.resolve(
            new Response(JSON.stringify(graphqlCassettes[gqlKey]), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
      }

      // REST playback (fetch-based)
      if (!isGraphql && vcrPlayback) {
        const key = methodPrefixedKey(method, url);
        if (restCassettes[key] !== undefined) {
          console.log(`[vcr][replay] ${label}`);
          return Promise.resolve(
            new Response(JSON.stringify(restCassettes[key]), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
      }

      const responsePromise = originalFetch(input, init);

      // GraphQL recording
      if (gqlKey && vcrRecord) {
        responsePromise.then((response) =>
          response
            .clone()
            .json()
            .then((data) => postCassette('graphql', gqlKey, data, originalFetch, serverWriteOpts))
            .catch(() => {}),
        );
      }

      // REST recording (fetch-based, JSON only)
      if (!isGraphql && vcrRecord) {
        const key = methodPrefixedKey(method, url);
        responsePromise.then((response) => {
          const contentType = response.headers.get('content-type') ?? '';
          if (!contentType.includes('application/json')) return;
          response
            .clone()
            .json()
            .then((data) => postCassette('rest', key, data, originalFetch, serverWriteOpts))
            .catch(() => {});
        });
      }

      return responsePromise;
    };

    // ── Axios interception ─────────────────────────────────────────────────
    // Conditional: only wire up if $axios is provided by the consuming app.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $axios = (nuxtApp as any).$axios;
    if ($axios) {
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

        if (vcrPlayback && restCassettes[key] !== undefined) {
          console.log(`[vcr][replay] ${fullUrl}`);
          return {
            data: restCassettes[key],
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
          postCassette('rest', key, response.data, originalFetch, serverWriteOpts).catch(() => {});
          return response;
        },
      );
    }
  },
});
