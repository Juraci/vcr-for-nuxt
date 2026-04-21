// e2e/dynamic-episode.spec.ts
//
// Proves that a single long-running dev server can switch VCR episodes per
// test by setting the `vcr-episode` cookie before navigating. No server
// restart between scenarios. Each scenario is tagged with its own
// `crypto.randomUUID()` seed, stored on disk as the REST `userId` and the
// GraphQL `currency`, so the assertions catch any cross-episode bleed.
import { test, expect } from '@playwright/test';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { startDevServer, stopDevServer } from './helpers/server';
import { graphqlCassetteKey } from '../src/runtime/graphql-key';

const CASSETTES_DIR = join(process.cwd(), '.cassettes');
const EPISODES_ROOT = join(CASSETTES_DIR, 'episodes');

const COUNTRY_DATA_BR = {
  native: 'Brasil',
  capital: 'Brasília',
  emoji: '🇧🇷',
  currency: 'BRL',
  languages: [{ code: 'pt', name: 'Portuguese' }],
  name: 'Brazil',
};

const COUNTRY_DATA_US = {
  native: 'United States',
  capital: 'Washington D.C.',
  emoji: '🇺🇸',
  currency: 'USD,USN,USS',
  languages: [{ code: 'en', name: 'English' }],
  name: 'United States',
};

const TODO_DATA = {
  userId: 1,
  id: 1,
  title: 'delectus aut autem',
  completed: false,
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

const EPISODES = ['dynamic-scenario-a', 'dynamic-scenario-b'] as const;
type EpisodeName = (typeof EPISODES)[number];

// Each episode gets its own seedId generated at beforeAll time. The seedId
// threads through every cassette so the final assertions can tell which
// episode's cassettes were served.
const seedIds = new Map<EpisodeName, string>();

function seedEpisode(episode: EpisodeName, seedId: string) {
  const dir = join(EPISODES_ROOT, episode);
  mkdirSync(join(dir, 'graphql'), { recursive: true });
  mkdirSync(join(dir, 'rest'), { recursive: true });

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

  writeFileSync(
    join(dir, 'graphql', `${brKey}.json`),
    JSON.stringify({
      [brKey]: { data: { country: { ...COUNTRY_DATA_BR, currency: seedId } } },
    }),
  );
  writeFileSync(
    join(dir, 'graphql', `${usKey}.json`),
    JSON.stringify({
      [usKey]: { data: { country: { ...COUNTRY_DATA_US, currency: seedId } } },
    }),
  );
  writeFileSync(
    join(dir, 'graphql', `${ssrBrKey}.json`),
    JSON.stringify({
      [ssrBrKey]: { data: { country: { ...COUNTRY_DATA_BR, currency: seedId } } },
    }),
  );
  writeFileSync(
    join(dir, 'graphql', `${namelessKey}.json`),
    JSON.stringify({
      [namelessKey]: { data: { country: { ...COUNTRY_DATA_US, currency: seedId } } },
    }),
  );

  writeFileSync(
    join(dir, 'rest', 'GET_todos_1.json'),
    JSON.stringify({ GET_todos_1: { ...TODO_DATA, userId: seedId } }),
  );
  // Playground boot also pings this — not asserted, just seeded so playback
  // doesn't fall through to the network.
  writeFileSync(
    join(dir, 'rest', 'GET_nuxt_builds_meta_dev_json.json'),
    JSON.stringify({
      GET_nuxt_builds_meta_dev_json: { id: 'dev', timestamp: 1775512359102, prerendered: [] },
    }),
  );
}

let server: ChildProcess;

test.beforeAll(async () => {
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
  for (const episode of EPISODES) {
    const seedId = crypto.randomUUID();
    seedIds.set(episode, seedId);
    seedEpisode(episode, seedId);
  }

  // Deliberately omit VCR_EPISODE — the cookie is the only episode signal.
  server = await startDevServer({ VCR_PLAYBACK: 'true' });
});

test.afterAll(async () => {
  await stopDevServer(server);
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
});

for (const episode of EPISODES) {
  test(`episode "${episode}" is selected by cookie and serves SSR + client cassettes`, async ({
    page,
    context,
    baseURL,
  }) => {
    const seedId = seedIds.get(episode)!;
    const externalRequests: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (
        url.includes('jsonplaceholder.typicode.com') ||
        url.includes('countries.trevorblades.com')
      ) {
        externalRequests.push(url);
      }
    });

    await context.addCookies([
      { name: 'vcr-episode', value: episode, url: baseURL ?? 'http://localhost:3000' },
    ]);

    await page.goto('/');
    await page.waitForFunction(() => window.fetch.name === 'vcrFetch', { timeout: 30_000 });

    let graphqlLocator: ReturnType<typeof page.locator>;
    let graphqlText: string;

    // REST — userId carries the seedId.
    await page.getByRole('button', { name: 'Fetch REST' }).click();
    const restText = await page.locator('[data-test-rest-data]').innerText();
    expect(JSON.parse(restText)).toEqual({ ...TODO_DATA, userId: seedId });

    // GraphQL US variable — currency carries the seedId.
    await page.getByRole('button', { name: 'Fetch GraphQL with US variable' }).click();
    graphqlLocator = page.locator('[data-test-graphql-data]');
    await expect(graphqlLocator).toContainText('United States');
    graphqlText = await graphqlLocator.innerText();
    expect(JSON.parse(graphqlText)).toEqual({
      data: { country: { ...COUNTRY_DATA_US, currency: seedId } },
    });

    // GraphQL BR variable — currency carries the seedId.
    await page.getByRole('button', { name: 'Fetch GraphQL with BR variable' }).click();
    graphqlLocator = page.locator('[data-test-graphql-data]');
    await expect(graphqlLocator).toContainText('Brasil');
    graphqlText = await graphqlLocator.innerText();
    expect(JSON.parse(graphqlText)).toEqual({
      data: { country: { ...COUNTRY_DATA_BR, currency: seedId } },
    });

    // GraphQL without operationName — name is extracted from the query string.
    await page.getByRole('button', { name: 'GraphQL without operationName' }).click();
    graphqlLocator = page.locator('[data-test-graphql-data]');
    await expect(graphqlLocator).toContainText('United States');
    graphqlText = await graphqlLocator.innerText();
    expect(JSON.parse(graphqlText)).toEqual({
      data: { country: { ...COUNTRY_DATA_US, currency: seedId } },
    });

    // SSR GraphQL — rendered into the HTML on first paint.
    graphqlLocator = page.locator('[data-test-ssr-graphql-data]');
    await expect(graphqlLocator).toContainText('Brasil');
    graphqlText = await graphqlLocator.innerText();
    expect(JSON.parse(graphqlText)).toEqual({
      data: { country: { ...COUNTRY_DATA_BR, currency: seedId } },
    });

    expect(externalRequests).toHaveLength(0);
  });
}
