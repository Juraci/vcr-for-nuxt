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
Reads `VCR_RECORD`, `VCR_PLAYBACK`, and `VCR_EPISODE` env vars at build time. Exposes `runtimeConfig.public.vcr` (record/playback flags, client-readable), `runtimeConfig.vcrCassettesDir`, and `runtimeConfig.vcrEpisode` (server-only). Registers the universal plugin and two Nitro server routes only when VCR is active — zero overhead otherwise.

**2. Client Plugin (`src/runtime/plugin.ts`)**
Wraps `globalThis.fetch` (and optionally Axios). On every request:
- Detects GraphQL by URL pattern, keyed by `graphqlCassetteKey(operationName, variables)` (see below)
- Keys REST cassettes as `{METHOD}_{normalized_path}` (e.g. `GET_api_v1_users_1`)
- **Playback:** Looks up in-memory cassette store loaded at plugin init via `GET /api/_cassettes`
- **Record:** Lets real request through, clones response JSON, POSTs to `POST /api/_cassettes`

URL normalization (`urlToFilename`) strips protocol/host, converts slashes and query params to underscores, collapses multiple underscores.

**2a. GraphQL Key Utility (`src/runtime/graphql-key.ts`)**
Pure module (no Nuxt imports) — usable in the plugin, server routes, and test/e2e files.
- `graphqlCassetteKey(body?)` — accepts a raw `BodyInit | null` request body string. Resolves the operation name from `parsed.operationName` first; if absent, falls back to extracting it via regex from `parsed.query`. Returns null if no name can be determined. When variables are absent or empty, returns the bare operation name; when variables are present, returns `{operationName}__{djb2Hash(sortedVariablesJson)}` (e.g. `getCountryQuery__f252ef04`). This allows the same operation called with different variables to be stored and replayed independently.
- `sortObjectKeys(obj)` — recursively sorts object keys before serialization so variable order does not affect the hash.
- `djb2Hash(str)` — pure-JS djb2 hash producing an 8-character hex string; no external dependencies, runs in browser and Node.

**3. Server Routes (`src/runtime/server/api/`)**
- `_cassettes.get.ts` — Thin handler; delegates to `loadEpisodeCassettes()` from utils. 404s outside development mode.
- `_cassettes.post.ts` — Thin handler; validates key (regex `[\w-]+`), delegates to `writeCassette()` from utils. 400s if `VCR_RECORD !== 'true'`, 404s outside development mode.

**4. Server Utils (`src/runtime/server/utils/`)**
- `episode.ts` — `resolveEpisodeName()`: returns `VCR_EPISODE` env var or `dd-mm-yyyy` date fallback.
- `cassettes.ts` — Pure FS functions: `loadDir`, `loadEpisodeCassettes`, `writeCassette`. No Nitro imports — directly testable.

### Cassette Storage

Cassettes are grouped into **episodes** — named snapshots. The active episode comes from `VCR_EPISODE` env var, falling back to today's date (`dd-mm-yyyy`).

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

| Test file | What it covers |
|---|---|
| `test/filename.test.ts` | URL normalization, method-prefixed key generation, `graphqlCassetteKey` (variables hashing) |
| `test/episode.test.ts` | Episode name resolution (env var vs date fallback) |
| `test/cassettes-get.test.ts` | `loadDir`, `loadEpisodeCassettes` with real FS |
| `test/cassettes-post.test.ts` | `writeCassette` — file creation, index.js lifecycle, episode isolation |

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
