# vcr-for-nuxt

VCR-style HTTP record/playback for Nuxt development. Record real API responses to disk, then replay them offline — no network required.

Works with both `fetch`-based requests (including Apollo/GraphQL) and Axios (`@nuxtjs/axios`).

---

## How it works

- **Record mode** — runs your app normally, but intercepts every HTTP response and saves it as a JSON cassette to disk.
- **Playback mode** — intercepts requests before they go out and returns the saved cassette instead. Zero network traffic.
- **Both off** — the module is completely inert. No overhead, no code loaded.

Cassettes are grouped into **episodes** — named snapshots stored under `.cassettes/episodes/`. The active episode is set via `VCR_EPISODE`; if omitted it defaults to today's date (`dd-mm-yyyy`).

```
.cassettes/
  episodes/
    my-episode-01/
      graphql/
        MyQuery.json              ← no variables: keyed by operationName
        MyQuery__f252ef04.json    ← with variables: operationName + hash of variables
      rest/
        GET_api_v1_users.json ← keyed by METHOD_path
        POST_api_v1_users.json
      index.js                ← generated once; exports { graphql, rest }
```

---

## Installation

```sh
npm install vcr-for-nuxt --save-dev
# or
yarn add -D vcr-for-nuxt
```

Register the module in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['vcr-for-nuxt'],
})
```

> The module is completely inert unless `VCR_RECORD=true` or `VCR_PLAYBACK=true` is set. Safe to leave in your config permanently.

---

## Usage

### Record

Start your dev server with `VCR_RECORD=true`. Use your app normally — every JSON response is saved to disk.

```sh
VCR_RECORD=true VCR_EPISODE=my-feature nuxi dev
```

Cassettes are written to `.cassettes/episodes/my-feature/` in your project root (one file per unique request). When `VCR_EPISODE` is omitted, cassettes go into a directory named after today's date (e.g. `05-04-2026`).

### Replay

Start with `VCR_PLAYBACK=true` and the same episode name used during recording. Requests are intercepted and served from disk. No network calls go out.

```sh
VCR_PLAYBACK=true VCR_EPISODE=my-feature nuxi dev
```

The terminal will log each replayed request:

```
[vcr][replay] https://api.example.com/v1/users (MyQuery)
[vcr][replay] GET https://api.example.com/v1/profile
```

### Commit cassettes to version control

```sh
git add .cassettes/
git commit -m "chore: record cassettes for my-feature episode"
```

Teammates can then run `VCR_PLAYBACK=true VCR_EPISODE=my-feature nuxi dev` without needing API access or credentials.

---

## Configuration

Options can be set via environment variables (recommended) or in `nuxt.config.ts`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `VCR_RECORD` | `false` | Enable cassette recording |
| `VCR_PLAYBACK` | `false` | Enable cassette playback |
| `VCR_EPISODE` | today's `dd-mm-yyyy` | Episode name for grouping cassettes |

### `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['vcr-for-nuxt'],

  vcr: {
    record: process.env.VCR_RECORD === 'true',    // default
    playback: process.env.VCR_PLAYBACK === 'true', // default
    cassettesDir: '.cassettes',                    // where episodes are stored
    episode: process.env.VCR_EPISODE ?? '',        // '' = use date fallback at runtime
  },
})
```

All options are optional. The env var defaults are applied automatically — you only need `vcr` config if you want to change `cassettesDir` or override the flags in code.

---

## Cassette format

### GraphQL

Cassettes are keyed by `operationName`. When the request includes GraphQL variables, a deterministic hash of those variables is appended to the key — so the same operation called with different variables produces separate cassettes.

**No variables** — key is the bare `operationName`, file is `{operationName}.json`:

```json
{
  "MyQuery": {
    "data": {
      "user": { "id": "1", "name": "Jane" }
    }
  }
}
```

**With variables** — key is `{operationName}__{hash}`, file is `{operationName}__{hash}.json`. For example, `getCountryQuery` called with `{ "code": "BR" }` and `{ "code": "US" }` produces two files:

```
graphql/getCountryQuery__f252ef04.json   ← variables: { code: "BR" }
graphql/getCountryQuery__f25de732.json   ← variables: { code: "US" }
```

Each file stores the full response body under its key:

```json
{
  "getCountryQuery__f252ef04": {
    "data": {
      "country": { "name": "Brazil", "capital": "Brasília" }
    }
  }
}
```

Variable key order does not matter — `{ code: "BR", lang: "pt" }` and `{ lang: "pt", code: "BR" }` hash identically.

### REST

Keyed by `{METHOD}_{path}`, where the path is normalized (slashes and special characters replaced with `_`):

| Request | Cassette file |
|---|---|
| `GET /api/v1/users` | `GET_api_v1_users.json` |
| `POST /api/v1/users` | `POST_api_v1_users.json` |
| `GET /api/v1/users?page=2` | `GET_api_v1_users_page_2.json` |

Only JSON responses (`content-type: application/json`) are recorded for REST.

### Episode `index.js`

Each episode directory contains an auto-generated `index.js` that you can import directly in Node.js scripts to load all cassettes for that episode:

```js
import cassettes from './.cassettes/episodes/my-feature/index.js';
// cassettes.graphql → { MyQuery: { data: ... }, ... }
// cassettes.rest    → { GET_api_v1_users: [...], ... }
```

The file is written once (on the first cassette POST) and never overwritten — safe to commit and edit manually if needed.

---

## Axios support

If your app uses `@nuxtjs/axios`, responses through `$axios` are intercepted automatically — no extra configuration needed. The module detects `$axios` at runtime and only wires up interception if it's present.

---

## Caveats

- **Record and playback are mutually exclusive.** Don't set both to `true` simultaneously — you'll record and serve from disk at the same time, which produces unexpected results.
- **GraphQL key resolution.** The module first reads `operationName` from the request body. If it is absent, it falls back to extracting the name from the `query` string via regex (e.g. `query getMyCountry(...)`). Requests where neither yields a name are passed through and not recorded. Setting `operationName` explicitly (Apollo does by default) is always the most reliable approach.
- **GraphQL variable hashing is opaque.** Cassette filenames include a short djb2 hash of the variables (e.g. `getCountryQuery__f252ef04.json`). The hash is stable and deterministic — the same variables always produce the same filename — but not human-readable. If you need to inspect or edit a cassette for a specific variable set, record it once and locate the file by its timestamp or by the variable values inside the JSON.
- **Cassettes load asynchronously.** On first render, a request that arrives before cassettes finish loading from disk will hit the real network. This is a one-time startup race and resolves immediately after.
- **Dev only.** The `GET /api/_cassettes` and `POST /api/_cassettes` server routes return 404 outside `development` mode. The module is safe to deploy — it simply does nothing in production.

---

## Requirements

- Nuxt 3 or 4
- Node.js 18+
