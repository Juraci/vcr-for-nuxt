import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { graphqlCassetteKey } from "./graphql-key.js";
export function urlToFilename(url) {
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  return path.replace(/[^a-zA-Z0-9-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}
export function methodPrefixedKey(method, url) {
  return `${method.toUpperCase()}_${urlToFilename(url)}`;
}
async function postCassette(type, key, data, fetchFn, serverWriteOpts) {
  if (serverWriteOpts) {
    const { writeCassette } = await import("./server/utils/cassettes.js");
    await writeCassette(serverWriteOpts.cassettesDir, serverWriteOpts.episode, type, key, data);
    return;
  }
  try {
    await fetchFn("/api/_cassettes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, key, data })
    });
  } catch {
  }
}
export default defineNuxtPlugin({
  name: "vcr-for-nuxt",
  async setup(nuxtApp) {
    const runtimeConfig = useRuntimeConfig();
    const vcr = runtimeConfig.public.vcr;
    const vcrRecord = vcr?.record ?? false;
    const vcrPlayback = vcr?.playback ?? false;
    if (!vcrRecord && !vcrPlayback) return;
    const originalFetch = globalThis.fetch;
    let graphqlCassettes = {};
    let restCassettes = {};
    if (vcrPlayback) {
      if (import.meta.server) {
        const { loadEpisodeCassettes } = await import("./server/utils/cassettes.js");
        const cassettesDir = runtimeConfig.vcrCassettesDir;
        const episode = runtimeConfig.vcrEpisode;
        try {
          const loaded = await loadEpisodeCassettes(cassettesDir, episode);
          graphqlCassettes = loaded.graphql;
          restCassettes = loaded.rest;
        } catch {
        }
      } else {
        try {
          const res = await originalFetch("/api/_cassettes");
          const body = await res.json();
          graphqlCassettes = body.cassettes?.graphql ?? {};
          restCassettes = body.cassettes?.rest ?? {};
        } catch {
        }
      }
    }
    const serverWriteOpts = import.meta.server && vcrRecord ? {
      cassettesDir: runtimeConfig.vcrCassettesDir,
      episode: runtimeConfig.vcrEpisode
    } : void 0;
    globalThis.fetch = function vcrFetch(input, init) {
      const url = input instanceof Request ? input.url : String(input);
      const isGraphql = url.includes("/graphql");
      const method = (init?.method ?? "GET").toUpperCase();
      let operationName = null;
      let variables = null;
      let label = url;
      if (isGraphql && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body);
          if (body.operationName) {
            operationName = body.operationName;
            variables = body.variables ?? null;
            label = `${url} (${operationName})`;
          }
        } catch {
        }
      }
      if (isGraphql && vcrPlayback && operationName) {
        const gqlKey = graphqlCassetteKey(operationName, variables);
        if (graphqlCassettes[gqlKey] !== void 0) {
          console.log(`[vcr][replay] ${label}`);
          return Promise.resolve(
            new Response(JSON.stringify(graphqlCassettes[gqlKey]), {
              status: 200,
              headers: { "content-type": "application/json" }
            })
          );
        }
      }
      if (!isGraphql && vcrPlayback) {
        const key = methodPrefixedKey(method, url);
        if (restCassettes[key] !== void 0) {
          console.log(`[vcr][replay] ${label}`);
          return Promise.resolve(
            new Response(JSON.stringify(restCassettes[key]), {
              status: 200,
              headers: { "content-type": "application/json" }
            })
          );
        }
      }
      const responsePromise = originalFetch(input, init);
      if (isGraphql && vcrRecord && operationName) {
        const gqlKey = graphqlCassetteKey(operationName, variables);
        responsePromise.then(
          (response) => response.clone().json().then((data) => postCassette("graphql", gqlKey, data, originalFetch, serverWriteOpts)).catch(() => {
          })
        );
      }
      if (!isGraphql && vcrRecord) {
        const key = methodPrefixedKey(method, url);
        responsePromise.then((response) => {
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("application/json")) return;
          response.clone().json().then((data) => postCassette("rest", key, data, originalFetch, serverWriteOpts)).catch(() => {
          });
        });
      }
      return responsePromise;
    };
    const $axios = nuxtApp.$axios;
    if ($axios) {
      const originalAdapter = $axios.defaults.adapter;
      $axios.defaults.adapter = async (config) => {
        const baseURL = config.baseURL ?? "";
        const url = config.url ?? "";
        const fullUrl = url.startsWith("http") ? url : `${baseURL}${url}`;
        const method = (config.method ?? "get").toUpperCase();
        const key = methodPrefixedKey(method, fullUrl);
        if (vcrPlayback && restCassettes[key] !== void 0) {
          console.log(`[vcr][replay] ${fullUrl}`);
          return {
            data: restCassettes[key],
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            config,
            request: {}
          };
        }
        return originalAdapter(config);
      };
      $axios.onResponse(
        (response) => {
          if (!vcrRecord) return response;
          const contentType = response.headers["content-type"] ?? "";
          if (!contentType.includes("application/json")) return response;
          const baseURL = response.config.baseURL ?? "";
          const url = response.config.url ?? "";
          const fullUrl = url.startsWith("http") ? url : `${baseURL}${url}`;
          const method = (response.config.method ?? "get").toUpperCase();
          const key = methodPrefixedKey(method, fullUrl);
          postCassette("rest", key, response.data, originalFetch, serverWriteOpts).catch(() => {
          });
          return response;
        }
      );
    }
  }
});
