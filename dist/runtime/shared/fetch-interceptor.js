import { graphqlCassetteKey } from "../graphql-key.js";
export function urlToFilename(url) {
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  return path.replace(/[^a-zA-Z0-9-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}
export function methodPrefixedKey(method, url) {
  return `${method.toUpperCase()}_${urlToFilename(url)}`;
}
export function createVcrFetch(opts) {
  const { originalFetch, getCassettes, recordCassette, playback, record } = opts;
  return function vcrFetch(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const isGraphql = url.includes("/graphql");
    const method = (init?.method ?? "GET").toUpperCase();
    const gqlKey = isGraphql ? graphqlCassetteKey(init?.body) : null;
    const label = gqlKey ? `${url} (${gqlKey})` : url;
    const cassettes = getCassettes();
    if (gqlKey && playback) {
      const hit = cassettes.graphql[gqlKey];
      if (hit !== void 0) {
        console.log(`[vcr][replay] ${label}`);
        return Promise.resolve(
          new Response(JSON.stringify(hit), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }
    }
    if (!isGraphql && playback) {
      const key = methodPrefixedKey(method, url);
      const hit = cassettes.rest[key];
      if (hit !== void 0) {
        console.log(`[vcr][replay] ${label}`);
        return Promise.resolve(
          new Response(JSON.stringify(hit), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      }
    }
    const responsePromise = originalFetch(input, init);
    if (gqlKey && record) {
      responsePromise.then(
        (response) => response.clone().json().then((data) => recordCassette("graphql", gqlKey, data)).catch(() => {
        })
      );
    }
    if (!isGraphql && record) {
      const key = methodPrefixedKey(method, url);
      responsePromise.then((response) => {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) return;
        response.clone().json().then((data) => recordCassette("rest", key, data)).catch(() => {
        });
      });
    }
    return responsePromise;
  };
}
