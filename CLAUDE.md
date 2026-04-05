# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # Build the module (outputs to dist/)
npm run dev     # Start playground dev server for manual smoke testing
npm test        # Run unit tests via Vitest
```

To run a single test file:
```bash
npx vitest run test/filename.test.ts
```

There is no lint script configured yet.

## Architecture

**vcr-for-nuxt** is a Nuxt 3/4 module that records real HTTP responses to disk (cassettes) and replays them offline — similar to Ruby's VCR gem.

### How It Works

The module has three layers that work together:

**1. Module (`src/module.ts`)**
Reads `VCR_RECORD` and `VCR_PLAYBACK` env vars at build time, exposes them via `runtimeConfig.public.vcr` (client-readable), and `runtimeConfig.vcrCassettesDir` (server-only). Registers the universal plugin and two Nitro server routes only when VCR is active — zero overhead otherwise.

**2. Client Plugin (`src/runtime/plugin.ts`)**
Wraps `globalThis.fetch` (and optionally Axios). On every request:
- Detects GraphQL by URL pattern, keyed by `operationName`
- Keys REST cassettes as `{METHOD}_{normalized_path}` (e.g. `GET_api_v1_users_1`)
- **Playback:** Looks up in-memory cassette store loaded at plugin init via `GET /api/_cassettes`
- **Record:** Lets real request through, clones response JSON, POSTs to `POST /api/_cassettes`

URL normalization (`urlToFilename`) strips protocol/host, converts slashes and query params to underscores, collapses multiple underscores.

**3. Server Routes (`src/runtime/server/api/`)**
- `_cassettes.get.ts` — Loads all JSON files from `.cassettes/graphql/` and `.cassettes/rest/`, returns them as a single object. 404s outside development mode.
- `_cassettes.post.ts` — Validates key (regex: `[\w-]+` to prevent path traversal), writes JSON to appropriate subdirectory. 400s if `VCR_RECORD !== 'true'`, 404s outside development mode.

### Cassette Storage

```
.cassettes/
  graphql/{operationName}.json   # keyed by GraphQL operationName
  rest/{METHOD}_{path}.json      # e.g. GET_todos_1.json
```

Cassette files are committed to git and used in playback mode.

### Key Constraints

- **Record and playback are mutually exclusive** — don't set both `VCR_RECORD=true` and `VCR_PLAYBACK=true` simultaneously.
- **Async load race** — cassettes load asynchronously at plugin init. Requests arriving before load completes hit real network (one-time startup race in playback mode).
- **GraphQL requires `operationName`** — requests without it are passed through unrecorded. Apollo sets this by default.
- **Development-only** — all `/_cassettes` endpoints return 404 in non-development mode; safe to deploy.

### Testing

Tests live in `test/` and use Vitest with a Node environment. The mock at `test/__mocks__/app-stub.ts` provides a minimal `#app` stub so Nuxt composables resolve in unit tests. Currently only URL normalization logic is unit-tested; the plugin and server routes are tested manually via the playground.
