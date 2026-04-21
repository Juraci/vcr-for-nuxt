// src/runtime/shared/fetch-interceptor.ts
import { graphqlCassetteKey } from '../graphql-key';

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

export interface CassetteStore {
  graphql: Record<string, unknown>;
  rest: Record<string, unknown>;
}

export interface InterceptorOptions {
  originalFetch: typeof fetch;
  /**
   * Resolved on every request. On the client this returns a static object
   * loaded once at plugin init; on the server it reads from AsyncLocalStorage
   * so each SSR request sees its own episode.
   */
  getCassettes: () => CassetteStore;
  /**
   * Fire-and-forget recording side-effect. The interceptor never awaits the
   * returned promise — implementations should swallow their own errors.
   */
  recordCassette: (type: 'graphql' | 'rest', key: string, data: unknown) => void;
  playback: boolean;
  record: boolean;
}

/**
 * Builds the `globalThis.fetch` replacement. The returned function is named
 * `vcrFetch` so tests can assert the wrapper is installed via
 * `window.fetch.name === 'vcrFetch'`.
 */
export function createVcrFetch(opts: InterceptorOptions): typeof fetch {
  const { originalFetch, getCassettes, recordCassette, playback, record } = opts;

  return function vcrFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : String(input);
    const isGraphql = url.includes('/graphql');
    const method = (init?.method ?? 'GET').toUpperCase();

    const gqlKey = isGraphql ? graphqlCassetteKey(init?.body) : null;
    const label = gqlKey ? `${url} (${gqlKey})` : url;

    const cassettes = getCassettes();

    if (gqlKey && playback) {
      const hit = cassettes.graphql[gqlKey];
      if (hit !== undefined) {
        console.log(`[vcr][replay] ${label}`);
        return Promise.resolve(
          new Response(JSON.stringify(hit), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
    }

    if (!isGraphql && playback) {
      const key = methodPrefixedKey(method, url);
      const hit = cassettes.rest[key];
      if (hit !== undefined) {
        console.log(`[vcr][replay] ${label}`);
        return Promise.resolve(
          new Response(JSON.stringify(hit), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
    }

    const responsePromise = originalFetch(input, init);

    if (gqlKey && record) {
      responsePromise.then((response) =>
        response
          .clone()
          .json()
          .then((data) => recordCassette('graphql', gqlKey, data))
          .catch(() => {}),
      );
    }

    if (!isGraphql && record) {
      const key = methodPrefixedKey(method, url);
      responsePromise.then((response) => {
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) return;
        response
          .clone()
          .json()
          .then((data) => recordCassette('rest', key, data))
          .catch(() => {});
      });
    }

    return responsePromise;
  };
}
