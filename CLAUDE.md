# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # Build the module (outputs to dist/)
npm run dev     # Start playground dev server for manual smoke testing
npm test        # Run unit + integration tests via Vitest
```

To run a single test file:
```bash
npx vitest run test/cassettes-post.test.ts
```

There is a lint script configured.

## Architecture

**vcr-for-nuxt** is a Nuxt 3/4 module that records real HTTP responses to disk (cassettes) and replays them offline — similar to Ruby's VCR gem.

### How It Works

The module has three layers that work together:

**1. Module (`src/module.ts`)**
Reads `VCR_RECORD`, `VCR_PLAYBACK`, and `VCR_EPISODE` env vars at build time. Exposes `runtimeConfig.public.vcr` (record/playback flags, client-readable), `runtimeConfig.vcrCassettesDir`, and `runtimeConfig.vcrEpisode` (server-only, used as a fallback). Enables Nuxt + Nitro `experimental.asyncContext` so the Nitro plugin's `useEvent()` resolves inside SSR fetches. Registers the universal plugin, the Nitro server plugin, and two Nitro server routes only when VCR is active — zero overhead otherwise.

**2. Client Plugin (`src/runtime/plugin.ts`)**
Client-only `globalThis.fetch` wrapping (and optionally Axios on both sides). On every request:
- Detects GraphQL by URL pattern, keyed by `graphqlCassetteKey(operationName, variables)` (see below)
- Keys REST cassettes as `{METHOD}_{normalized_path}` (e.g. `GET_api_v1_users_1`)
- **Playback:** Looks up in-memory cassette store loaded at plugin init via `GET /api/_cassettes` (the GET handler uses the request cookie/header so the right episode lands in the client store).
- **Record:** Lets real request through, clones response JSON, POSTs to `POST /api/_cassettes`

Axios SSR recording stays in this plugin because `$axios` is per-request-injected; the plugin captures `useRequestEvent()` during its per-request setup and passes the resolved episode to `writeCassette` directly.

Keying helpers (`urlToFilename`, `methodPrefixedKey`) live in `src/runtime/shared/fetch-interceptor.ts` and are re-exported from `plugin.ts` for backward-compatible test imports.

**2a. Shared Fetch Interceptor (`src/runtime/shared/fetch-interceptor.ts`)**
Pure module (no Nuxt/Nitro imports). Exports `createVcrFetch(opts)` which builds the wrapper used by both the client plugin and the server-side Nitro plugin, plus `urlToFilename` and `methodPrefixedKey`. The returned function is named `vcrFetch` so tests can assert `window.fetch.name === 'vcrFetch'`.

**2b. Nitro Server Plugin (`src/runtime/server/plugins/vcr.ts`)**
Installs `globalThis.fetch = vcrFetch` **exactly once** per Nitro process. On each fetch call it reads the current request via Nitro's `useEvent()` (ALS-backed by unctx) and resolves the active episode from that event's cookie/header. This avoids the stacking-wrapper race the old per-request Nuxt SSR path had when different requests asked for different episodes concurrently.

**2a. GraphQL Key Utility (`src/runtime/graphql-key.ts`)**
Pure module (no Nuxt imports) — usable in the plugin, server routes, and test/e2e files.
- `graphqlCassetteKey(body?)` — accepts a raw `BodyInit | null` request body string. Resolves the operation name from `parsed.operationName` first; if absent, falls back to extracting it via regex from `parsed.query`. Returns null if no name can be determined. When variables are absent or empty, returns the bare operation name; when variables are present, returns `{operationName}__{djb2Hash(sortedVariablesJson)}` (e.g. `getCountryQuery__f252ef04`). This allows the same operation called with different variables to be stored and replayed independently.
- `sortObjectKeys(obj)` — recursively sorts object keys before serialization so variable order does not affect the hash.
- `djb2Hash(str)` — pure-JS djb2 hash producing an 8-character hex string; no external dependencies, runs in browser and Node.

**3. Server Routes (`src/runtime/server/api/`)**
- `_cassettes.get.ts` — Thin handler; delegates to `loadEpisodeCassettes()` from utils. 404s outside development mode.
- `_cassettes.post.ts` — Thin handler; validates key (regex `[\w-]+`), delegates to `writeCassette()` from utils. 400s if `VCR_RECORD !== 'true'`, 404s outside development mode.

**4. Server Utils (`src/runtime/server/utils/`)**
- `episode.ts` — `resolveEpisodeName(event?)`: precedence is cookie (`vcr-episode`) → header (`x-vcr-episode`) → `VCR_EPISODE` env var → `dd-mm-yyyy` date fallback. Every candidate is validated against `EPISODE_NAME_REGEX` (exported); invalid values are silently skipped so a malformed cookie never crashes the dev server.
- `cassette-cache.ts` — `getEpisodeCassettes(cassettesDir, episode)`: thin cache layer over `loadEpisodeCassettes`. Module-scope `Map` keyed by `${cassettesDir}::${episode}`; no invalidation (record and playback are mutually exclusive). Exposes `__resetCassetteCacheForTests()` for unit tests.
- `cassettes.ts` — Pure FS functions: `loadDir`, `loadEpisodeCassettes`, `writeCassette`. No Nitro imports — directly testable.

### Cassette Storage

Cassettes are grouped into **episodes** — named snapshots. The active episode is resolved per request by `resolveEpisodeName(event)`: `vcr-episode` cookie → `x-vcr-episode` header → `VCR_EPISODE` env var → today's date (`dd-mm-yyyy`). E2E tools can switch scenarios per test by setting the cookie (`context.addCookies` in Playwright, `cy.setCookie` in Cypress) without restarting the dev server.

```
.cassettes/
  episodes/
    my-episode-01/
      graphql/{operationName}.json              # no variables — keyed by bare operationName
      graphql/{operationName}__{hash}.json      # with variables — hash of sorted variables JSON
      rest/{METHOD}_{path}.json                 # e.g. GET_todos_1.json
      index.js                                  # generated once; exports { graphql, rest }
```

`index.js` is written once per episode on the first cassette POST and never overwritten. It can be imported directly in Node.js scripts to access all cassettes for that episode.

### Key Constraints

- **Record and playback are mutually exclusive** — don't set both `VCR_RECORD=true` and `VCR_PLAYBACK=true` simultaneously.
- **Async load race** — cassettes load asynchronously at plugin init. Requests arriving before load completes hit real network (one-time startup race in playback mode).
- **GraphQL requires `operationName`** — requests without it are passed through unrecorded. Apollo sets this by default.
- **Development-only** — all `/_cassettes` endpoints return 404 in non-development mode; safe to deploy.

### Testing

Tests live in `test/` and use Vitest with a Node environment. The mock at `test/__mocks__/app-stub.ts` provides a minimal `#app` stub so Nuxt composables resolve in unit tests.

Integration tests use real temp directories (`os.tmpdir()`) — no mocking of file I/O. The pure functions in `src/runtime/server/utils/cassettes.ts` and `utils/episode.ts` are tested directly to keep Nitro-specific wiring out of the test surface.

End-to-end tests live in `e2e/` and use Playwright against a real dev server spawned by `startDevServer` (see `e2e/helpers/server.ts`). Each spec owns a dev-server lifecycle in `beforeAll`/`afterAll`, so specs must serialize (`workers: 1`). The `dynamic-episode-*.spec.ts` specs deliberately omit `VCR_EPISODE` from `startDevServer` — the per-test `vcr-episode` cookie is the only episode signal, which is exactly the behavior they exist to prove. Set `VCR_E2E_LOG=/tmp/dev.log` before running to pipe the dev server's stdout/stderr to a file for debugging.

| Test file | What it covers |
|---|---|
| `test/filename.test.ts` | URL normalization, method-prefixed key generation, `graphqlCassetteKey` (variables hashing) |
| `test/episode.test.ts` | Episode name resolution (cookie/header/env/date precedence) and `EPISODE_NAME_REGEX` validation |
| `test/cassette-cache.test.ts` | `getEpisodeCassettes` — cache hit/miss, per-episode isolation |
| `test/cassettes-get.test.ts` | `loadDir`, `loadEpisodeCassettes` with real FS |
| `test/cassettes-post.test.ts` | `writeCassette` — file creation, index.js lifecycle, episode isolation |
| `e2e/playback.spec.ts` | Env-driven playback — legacy path, proves `VCR_EPISODE` fallback still works |
| `e2e/record.spec.ts` | Env-driven record — legacy path, proves `VCR_EPISODE` fallback still works |
| `e2e/dynamic-episode-playback.spec.ts` | Cookie-driven playback: one dev server (no `VCR_EPISODE`), two scenarios (`dynamic-scenario-a`/`-b`) each with its own `crypto.randomUUID()` seed threaded as GraphQL `currency` and REST `userId`; SSR + all four playground buttons asserted per scenario |
| `e2e/dynamic-episode-record.spec.ts` | Cookie-driven record: one dev server (no `VCR_EPISODE`), two scenarios (`dynamic-record-a`/`-b`) with `page.route()` stubs carrying per-scenario seedIds; verifies each cassette file lands in its own episode directory and its on-disk content matches the scenario's seedId. SSR GraphQL cassette existence is asserted in the right directory; its content hits the real upstream (same `page.route()` SSR limitation as `record.spec.ts`) |

### Verification

After any change it's critical to always run the following checks:

`nvm use` // set the node to the correct version
`npm install` // should install all packages without errors
`npm run test` // all tests must pass
`npm run test:e2e` // all end 2 end tests must pass
`npm run lint` // there should be no lint errors
`npm run lint:fix` // in case there are easy to fix lint errors
`npx tsc` // there should be no typescript errors
`npm run prepack` // should build without errors
