import { defineNuxtPlugin, useRequestEvent, useRuntimeConfig } from "#app";
import {
  createVcrFetch,
  methodPrefixedKey,
  urlToFilename
} from "./shared/fetch-interceptor.js";
export { urlToFilename, methodPrefixedKey };
async function postCassetteViaHttp(type, key, data, fetchFn) {
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
    const clientStore = { graphql: {}, rest: {} };
    const originalFetch = globalThis.fetch;
    if (import.meta.client) {
      if (vcrPlayback) {
        try {
          const res = await originalFetch("/api/_cassettes");
          const body = await res.json();
          clientStore.graphql = body.cassettes?.graphql ?? {};
          clientStore.rest = body.cassettes?.rest ?? {};
        } catch {
        }
      }
      globalThis.fetch = createVcrFetch({
        originalFetch,
        getCassettes: () => clientStore,
        recordCassette: (type, key, data) => {
          void postCassetteViaHttp(type, key, data, originalFetch);
        },
        playback: vcrPlayback,
        record: vcrRecord
      });
    }
    const $axios = nuxtApp.$axios;
    if (!$axios) return;
    const ssrEvent = import.meta.server ? useRequestEvent() : void 0;
    const cassettesDir = runtimeConfig.vcrCassettesDir;
    let serverRestStore = {};
    if (import.meta.server && vcrPlayback && cassettesDir) {
      const { resolveEpisodeName } = await import("./server/utils/episode.js");
      const { getEpisodeCassettes } = await import("./server/utils/cassette-cache.js");
      const episode = resolveEpisodeName(ssrEvent);
      serverRestStore = getEpisodeCassettes(cassettesDir, episode).rest;
    }
    async function recordAxios(type, key, data) {
      if (import.meta.server && cassettesDir) {
        const { resolveEpisodeName } = await import("./server/utils/episode.js");
        const { writeCassette } = await import("./server/utils/cassettes.js");
        writeCassette(cassettesDir, resolveEpisodeName(ssrEvent), type, key, data);
        return;
      }
      await postCassetteViaHttp(type, key, data, originalFetch);
    }
    const originalAdapter = $axios.defaults.adapter;
    $axios.defaults.adapter = async (config) => {
      const baseURL = config.baseURL ?? "";
      const url = config.url ?? "";
      const fullUrl = url.startsWith("http") ? url : `${baseURL}${url}`;
      const method = (config.method ?? "get").toUpperCase();
      const key = methodPrefixedKey(method, fullUrl);
      const store = import.meta.server ? serverRestStore : clientStore.rest;
      if (vcrPlayback && store[key] !== void 0) {
        console.log(`[vcr][replay] ${fullUrl}`);
        return {
          data: store[key],
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
        recordAxios("rest", key, response.data).catch(() => {
        });
        return response;
      }
    );
  }
});
