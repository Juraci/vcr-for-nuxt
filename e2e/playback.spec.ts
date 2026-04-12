import { test, expect } from '@playwright/test';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { startDevServer, stopDevServer } from './helpers/server';
import { graphqlCassetteKey } from '../src/runtime/graphql-key';

const EPISODE_NAME = 'integration-tests-playback';
const CASSETTES_DIR = join(process.cwd(), '.cassettes');
const EPISODE_DIR = join(CASSETTES_DIR, 'episodes', EPISODE_NAME);

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
  languages: [
    {
      code: 'en',
      name: 'English',
    },
  ],
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

function seedCassettes(seedId: string) {
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
  mkdirSync(join(EPISODE_DIR, 'graphql'), { recursive: true });
  mkdirSync(join(EPISODE_DIR, 'rest'), { recursive: true });

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
    join(EPISODE_DIR, 'graphql', `${brKey}.json`),
    JSON.stringify({ [brKey]: { data: { country: { ...COUNTRY_DATA_BR, currency: seedId } } } }),
  );

  writeFileSync(
    join(EPISODE_DIR, 'graphql', `${usKey}.json`),
    JSON.stringify({ [usKey]: { data: { country: { ...COUNTRY_DATA_US, currency: seedId } } } }),
  );

  writeFileSync(
    join(EPISODE_DIR, 'graphql', `${ssrBrKey}.json`),
    JSON.stringify({
      [ssrBrKey]: { data: { country: { ...COUNTRY_DATA_BR, currency: seedId } } },
    }),
  );

  writeFileSync(
    join(EPISODE_DIR, 'graphql', `${namelessKey}.json`),
    JSON.stringify({
      [namelessKey]: { data: { country: { ...COUNTRY_DATA_US, currency: seedId } } },
    }),
  );

  writeFileSync(
    join(EPISODE_DIR, 'rest', 'GET_nuxt_builds_meta_dev_json.json'),
    JSON.stringify({
      GET_nuxt_builds_meta_dev_json: {
        id: 'dev',
        timestamp: 1775512359102,
        prerendered: [],
      },
    }),
  );

  writeFileSync(
    join(EPISODE_DIR, 'rest', 'GET_todos_1.json'),
    JSON.stringify({
      GET_todos_1: { ...TODO_DATA, userId: seedId },
    }),
  );
}

let server: ChildProcess;
let seedId: string = '';

test.beforeAll(async () => {
  seedId = crypto.randomUUID();
  seedCassettes(seedId);
  server = await startDevServer({
    VCR_PLAYBACK: 'true',
    VCR_EPISODE: EPISODE_NAME,
  });
});

test.afterAll(async () => {
  await stopDevServer(server);
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
});

test('serves responses from cassettes without hitting real network', async ({ page }) => {
  const externalRequests: string[] = [];
  let graphqlLocator: ReturnType<typeof page.locator>;
  let graphqlText: string;

  page.on('request', (req) => {
    const url = req.url();
    if (
      url.includes('jsonplaceholder.typicode.com') ||
      url.includes('countries.trevorblades.com')
    ) {
      externalRequests.push(url);
    }
  });

  await page.goto('/');
  // Wait until the VCR plugin has installed its fetch wrapper — confirms hydration is done
  await page.waitForFunction(() => window.fetch.name === 'vcrFetch', { timeout: 30_000 });

  // Verify REST API call playback
  await page.getByRole('button', { name: 'Fetch REST' }).click();
  const restText = await page.locator('[data-test-rest-data]').innerText();
  expect(JSON.parse(restText)).toEqual({ ...TODO_DATA, userId: seedId });

  // Verify GraphQL API call playback for US variable
  await page.getByRole('button', { name: 'Fetch GraphQL with US variable' }).click();
  graphqlLocator = page.locator('[data-test-graphql-data]');
  await expect(graphqlLocator).toContainText('United States');
  graphqlText = await graphqlLocator.innerText();
  expect(JSON.parse(graphqlText)).toEqual({
    data: { country: { ...COUNTRY_DATA_US, currency: seedId } },
  });

  // Verify GraphQL API call playback for BR variable
  await page.getByRole('button', { name: 'Fetch GraphQL with BR variable' }).click();
  graphqlLocator = page.locator('[data-test-graphql-data]');
  await expect(graphqlLocator).toContainText('Brasil');
  graphqlText = await graphqlLocator.innerText();
  expect(JSON.parse(graphqlText)).toEqual({
    data: { country: { ...COUNTRY_DATA_BR, currency: seedId } },
  });

  // Verify GraphQL API without operationName playback for US variable
  await page.getByRole('button', { name: 'GraphQL without operationName' }).click();
  graphqlLocator = page.locator('[data-test-graphql-data]');
  await expect(graphqlLocator).toContainText('United States');
  graphqlText = await graphqlLocator.innerText();
  expect(JSON.parse(graphqlText)).toEqual({
    data: { country: { ...COUNTRY_DATA_US, currency: seedId } },
  });

  // Verify GraphQL API call playback for SSR BR variable
  graphqlLocator = page.locator('[data-test-ssr-graphql-data]');
  await expect(graphqlLocator).toContainText('Brasil');
  graphqlText = await graphqlLocator.innerText();
  expect(JSON.parse(graphqlText)).toEqual({
    data: { country: { ...COUNTRY_DATA_BR, currency: seedId } },
  });

  expect(externalRequests).toHaveLength(0);
});
