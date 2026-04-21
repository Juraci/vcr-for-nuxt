// e2e/dynamic-episode-record.spec.ts
//
// Mirrors dynamic-episode-playback.spec.ts but for recording: one dev server
// running in VCR_RECORD mode, each test selects its target episode via the
// `vcr-episode` cookie, and upstream responses are mocked with a unique
// `crypto.randomUUID()` seed per episode so the cassettes on disk prove
// which episode received which recording.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { startDevServer, stopDevServer } from './helpers/server';
import { graphqlCassetteKey } from '../src/runtime/graphql-key';

const CASSETTES_DIR = join(process.cwd(), '.cassettes');
const EPISODES_ROOT = join(CASSETTES_DIR, 'episodes');

const REST_RESPONSE = {
  userId: 1,
  id: 1,
  title: 'delectus aut autem',
  completed: false,
};

const GRAPHQL_RESPONSE_BR = {
  data: {
    country: {
      native: 'Brasil',
      capital: 'Brasília',
      emoji: '🇧🇷',
      currency: 'BRL',
      languages: [{ code: 'pt', name: 'Portuguese' }],
      name: 'Brazil',
    },
  },
};

const GRAPHQL_RESPONSE_US = {
  data: {
    country: {
      native: 'United States',
      capital: 'Washington D.C.',
      emoji: '🇺🇸',
      currency: 'USD,USN,USS',
      languages: [{ code: 'en', name: 'English' }],
      name: 'United States',
    },
  },
};

const NAMELESS_GRAPHQL_QUERY = `query getMyCountry($code: ID!) {
  country(code: $code) {
    name
    native
    capital
    emoji
    currency
    languages {
      code
      name
    }
  }
}`;

const EPISODES = ['dynamic-record-a', 'dynamic-record-b'] as const;

let server: ChildProcess;

test.beforeAll(async () => {
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
  // Deliberately omit VCR_EPISODE — the cookie is the only episode signal.
  server = await startDevServer({ VCR_RECORD: 'true' });
});

test.afterAll(async () => {
  await stopDevServer(server);
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
});

for (const episode of EPISODES) {
  test(`episode "${episode}" is selected by cookie and records client cassettes`, async ({
    page,
    context,
    baseURL,
  }) => {
    const seedId = crypto.randomUUID();
    const episodeDir = join(EPISODES_ROOT, episode);

    // Stub the upstream APIs so each episode's recorded cassettes carry a
    // unique seedId the final assertions can verify.
    await page.route('https://jsonplaceholder.typicode.com/todos/1', (route) =>
      route.fulfill({ json: { ...REST_RESPONSE, userId: seedId } }),
    );
    await page.route('https://countries.trevorblades.com/graphql', (route) => {
      const postData = route.request().postDataJSON();
      if (postData.variables?.code === 'BR') {
        return route.fulfill({
          json: {
            ...GRAPHQL_RESPONSE_BR,
            data: { country: { ...GRAPHQL_RESPONSE_BR.data.country, currency: seedId } },
          },
        });
      }
      if (postData.variables?.code === 'US') {
        return route.fulfill({
          json: {
            ...GRAPHQL_RESPONSE_US,
            data: { country: { ...GRAPHQL_RESPONSE_US.data.country, currency: seedId } },
          },
        });
      }
    });

    await context.addCookies([
      { name: 'vcr-episode', value: episode, url: baseURL ?? 'http://localhost:3000' },
    ]);

    await page.goto('/');
    await page.waitForFunction(() => window.fetch.name === 'vcrFetch', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Fetch REST' }).click();
    await expect(page.locator('[data-test-rest-data]')).toBeVisible();

    await page.getByRole('button', { name: 'Fetch GraphQL with US variable' }).click();
    await expect(page.locator('[data-test-graphql-data="United States"]')).toBeVisible();

    await page.getByRole('button', { name: 'Fetch GraphQL with BR variable' }).click();
    await expect(page.locator('[data-test-graphql-data="Brasil"]')).toBeVisible();

    await page.getByRole('button', { name: 'GraphQL without operationName' }).click();
    await expect(page.locator('[data-test-graphql-data="United States"]')).toBeVisible();

    const brKey = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCountryQuery', variables: { code: 'BR' } }),
    ) as string;
    const usKey = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCountryQuery', variables: { code: 'US' } }),
    ) as string;
    const ssrBrKey = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCountryQuerySsr', variables: { code: 'BR' } }),
    ) as string;
    const namelessKey = graphqlCassetteKey(
      JSON.stringify({ query: NAMELESS_GRAPHQL_QUERY, variables: { code: 'US' } }),
    ) as string;

    // Every cassette must land in THIS episode's directory.
    expect(existsSync(join(episodeDir, 'rest', 'GET_todos_1.json'))).toBe(true);
    expect(existsSync(join(episodeDir, 'graphql', `${brKey}.json`))).toBe(true);
    expect(existsSync(join(episodeDir, 'graphql', `${usKey}.json`))).toBe(true);
    expect(existsSync(join(episodeDir, 'graphql', `${ssrBrKey}.json`))).toBe(true);
    expect(existsSync(join(episodeDir, 'graphql', `${namelessKey}.json`))).toBe(true);

    // REST cassette content — userId must be this episode's seedId.
    const restCassette = JSON.parse(
      readFileSync(join(episodeDir, 'rest', 'GET_todos_1.json'), 'utf-8'),
    );
    expect(restCassette).toEqual({ GET_todos_1: { ...REST_RESPONSE, userId: seedId } });

    // GraphQL (BR) — currency must be this episode's seedId.
    const brCassette = JSON.parse(
      readFileSync(join(episodeDir, 'graphql', `${brKey}.json`), 'utf-8'),
    );
    expect(brCassette).toEqual({
      [brKey]: {
        ...GRAPHQL_RESPONSE_BR,
        data: { country: { ...GRAPHQL_RESPONSE_BR.data.country, currency: seedId } },
      },
    });

    // GraphQL (US) — currency must be this episode's seedId.
    const usCassette = JSON.parse(
      readFileSync(join(episodeDir, 'graphql', `${usKey}.json`), 'utf-8'),
    );
    expect(usCassette).toEqual({
      [usKey]: {
        ...GRAPHQL_RESPONSE_US,
        data: { country: { ...GRAPHQL_RESPONSE_US.data.country, currency: seedId } },
      },
    });

    // GraphQL without operationName — same US data, currency = seedId.
    const namelessCassette = JSON.parse(
      readFileSync(join(episodeDir, 'graphql', `${namelessKey}.json`), 'utf-8'),
    );
    expect(namelessCassette).toEqual({
      [namelessKey]: {
        ...GRAPHQL_RESPONSE_US,
        data: { country: { ...GRAPHQL_RESPONSE_US.data.country, currency: seedId } },
      },
    });

    // SSR GraphQL hits the real API (page.route only intercepts browser-side
    // traffic), so the recorded cassette carries the live response. Same
    // limitation as record.spec.ts — we still assert the file exists in the
    // right episode directory, which is the load-bearing claim for dynamic
    // recording.
    const ssrBrCassette = JSON.parse(
      readFileSync(join(episodeDir, 'graphql', `${ssrBrKey}.json`), 'utf-8'),
    );
    expect(ssrBrCassette).toEqual({ [ssrBrKey]: GRAPHQL_RESPONSE_BR });
  });
}
