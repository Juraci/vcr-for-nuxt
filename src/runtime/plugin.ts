// src/runtime/plugin.ts
import type { NuxtApp } from '#app';
import { defineNuxtPlugin, useRuntimeConfig } from '#app';

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
  setup(nuxtApp: NuxtApp) {
    const runtimeConfig = useRuntimeConfig();
    const vcr = runtimeConfig.public.vcr as { record: boolean; playback: boolean } | undefined;
    const vcrRecord = vcr?.record ?? false;
    const vcrPlayback = vcr?.playback ?? false;

    // Bail out early — zero overhead when VCR is inactive.
    if (!vcrRecord && !vcrPlayback) return;

    // Capture the original fetch *before* wrapping so postCassette and
    // the cassette loader can use the real network fetch.
    const originalFetch = globalThis.fetch;

    // Cassette store — populated async after the GET resolves.
    let graphqlCassettes: Record<string, unknown> = {};
    let restCassettes: Record<string, unknown> = {};

    if (vcrPlayback) {
      originalFetch('/api/_cassettes')
        .then((res) => res.json())
        .then(
          (body: {
            cassettes: {
              graphql: Record<string, unknown>;
              rest: Record<string, unknown>;
            };
          }) => {
            graphqlCassettes = body.cassettes?.graphql ?? {};
            restCassettes = body.cassettes?.rest ?? {};
          },
        )
        .catch(() => {
          // dev endpoint not available — playback silently disabled
        });
    }

    // ── fetch wrapper ──────────────────────────────────────────────────────
    globalThis.fetch = function vcrFetch(input: RequestInfo | URL, init?: RequestInit) {
      const url = input instanceof Request ? input.url : String(input);
      const isGraphql = url.includes('/graphql');
      const method = (init?.method ?? 'GET').toUpperCase();

      let operationName: string | null = null;
      let label = url;

      if (isGraphql && typeof init?.body === 'string') {
        try {
          const body = JSON.parse(init.body);
          if (body.operationName) {
            operationName = body.operationName;
            label = `${url} (${operationName})`;
          }
        } catch {
          // non-JSON body — skip
        }
      }

      // GraphQL playback
      if (
        isGraphql &&
        vcrPlayback &&
        operationName &&
        graphqlCassettes[operationName] !== undefined
      ) {
        console.log(`v1. [vcr][replay] ${label}`);
        return Promise.resolve(
          new Response(JSON.stringify(graphqlCassettes[operationName]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      // REST playback (fetch-based)
      if (!isGraphql && vcrPlayback) {
        const key = methodPrefixedKey(method, url);
        if (restCassettes[key] !== undefined) {
          console.log(`v1. [vcr][replay] ${label}`);
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
      if (isGraphql && vcrRecord && operationName) {
        const opName = operationName;
        responsePromise.then((response) =>
          response
            .clone()
            .json()
            .then((data) => postCassette('graphql', opName, data, originalFetch))
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
            .then((data) => postCassette('rest', key, data, originalFetch))
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
          postCassette('rest', key, response.data, originalFetch).catch(() => {});
          return response;
        },
      );
    }
  },
});
