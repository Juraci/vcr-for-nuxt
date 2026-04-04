# vcr-for-nuxt

VCR-style HTTP record/playback for Nuxt development. Record real API responses to disk, then replay them offline — no network required.

Works with both `fetch`-based requests (including Apollo/GraphQL) and Axios (`@nuxtjs/axios`).

---

## How it works

- **Record mode** — runs your app normally, but intercepts every HTTP response and saves it as a JSON cassette to disk.
- **Playback mode** — intercepts requests before they go out and returns the saved cassette instead. Zero network traffic.
- **Both off** — the module is completely inert. No overhead, no code loaded.

Cassettes are stored as plain JSON files, split by type:

```
.cassettes/
  graphql/
    MyQuery.json          ← keyed by GraphQL operationName
  rest/
    GET_api_v1_users.json ← keyed by METHOD_path
    POST_api_v1_users.json
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
VCR_RECORD=true nuxi dev
```

Cassettes are written to `.cassettes/` in your project root (one file per unique request).

### Replay

Start with `VCR_PLAYBACK=true`. Requests are intercepted and served from disk. No network calls go out.

```sh
VCR_PLAYBACK=true nuxi dev
```

The terminal will log each replayed request:

```
[vcr][replay] https://api.example.com/v1/users (MyQuery)
[vcr][replay] GET https://api.example.com/v1/profile
```

### Commit cassettes to version control

```sh
git add .cassettes/
git commit -m "chore: record cassettes for offline dev"
```

Teammates can then run `VCR_PLAYBACK=true nuxi dev` without needing API access or credentials.

---

## Configuration

Options can be set via environment variables (recommended) or in `nuxt.config.ts`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `VCR_RECORD` | `false` | Enable cassette recording |
| `VCR_PLAYBACK` | `false` | Enable cassette playback |

### `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['vcr-for-nuxt'],

  vcr: {
    record: process.env.VCR_RECORD === 'true',   // default
    playback: process.env.VCR_PLAYBACK === 'true', // default
    cassettesDir: '.cassettes',                    // where cassettes are stored
  },
})
```

All options are optional. The env var defaults are applied automatically — you only need `vcr` config if you want to change `cassettesDir` or override the flags in code.

---

## Cassette format

### GraphQL

Keyed by `operationName`. The cassette stores the full response body:

```json
{
  "MyQuery": {
    "data": {
      "user": { "id": "1", "name": "Jane" }
    }
  }
}
```

### REST

Keyed by `{METHOD}_{path}`, where the path is normalized (slashes and special characters replaced with `_`):

| Request | Cassette file |
|---|---|
| `GET /api/v1/users` | `GET_api_v1_users.json` |
| `POST /api/v1/users` | `POST_api_v1_users.json` |
| `GET /api/v1/users?page=2` | `GET_api_v1_users_page_2.json` |

Only JSON responses (`content-type: application/json`) are recorded for REST.

---

## Axios support

If your app uses `@nuxtjs/axios`, responses through `$axios` are intercepted automatically — no extra configuration needed. The module detects `$axios` at runtime and only wires up interception if it's present.

---

## Caveats

- **Record and playback are mutually exclusive.** Don't set both to `true` simultaneously — you'll record and serve from disk at the same time, which produces unexpected results.
- **GraphQL requires `operationName`.** Requests without an `operationName` in the body are passed through and not recorded. Ensure your GraphQL client sets it (Apollo does by default).
- **Cassettes load asynchronously.** On first render, a request that arrives before cassettes finish loading from disk will hit the real network. This is a one-time startup race and resolves immediately after.
- **Dev only.** The `GET /api/_cassettes` and `POST /api/_cassettes` server routes return 404 outside `development` mode. The module is safe to deploy — it simply does nothing in production.

---

## Requirements

- Nuxt 3 or 4
- Node.js 18+
