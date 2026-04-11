import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { startDevServer, stopDevServer } from './helpers/server';
import { graphqlCassetteKey } from '../src/runtime/graphql-key';

const EPISODE_NAME = 'integration-tests-record';
const CASSETTES_DIR = join(process.cwd(), '.cassettes');
const EPISODE_DIR = join(CASSETTES_DIR, 'episodes', EPISODE_NAME);

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
      languages: [
        {
          code: 'en',
          name: 'English',
        },
      ],
      name: 'United States',
    },
  },
};

let server: ChildProcess;

test.beforeAll(async () => {
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
  server = await startDevServer({
    VCR_RECORD: 'true',
    VCR_EPISODE: EPISODE_NAME,
  });
});

test.afterAll(() => stopDevServer(server));

test('records cassettes for REST and GraphQL api calls', async ({ page }) => {
  const seedId: string = crypto.randomUUID();
  await page.route('https://jsonplaceholder.typicode.com/todos/1', (route) =>
    route.fulfill({ json: { ...REST_RESPONSE, userId: seedId } }),
  );
  await page.route('https://countries.trevorblades.com/graphql', (route) => {
    const request = route.request();
    const postData = request.postDataJSON();
    if (postData.variables && postData.variables.code === 'BR') {
      return route.fulfill({
        json: {
          ...GRAPHQL_RESPONSE_BR,
          data: { country: { ...GRAPHQL_RESPONSE_BR.data.country, currency: seedId } },
        },
      });
    } else if (postData.variables && postData.variables.code === 'US') {
      return route.fulfill({
        json: {
          ...GRAPHQL_RESPONSE_US,
          data: { country: { ...GRAPHQL_RESPONSE_US.data.country, currency: seedId } },
        },
      });
    }
  });

  await page.goto('/');
  // Wait until the VCR plugin has installed its fetch wrapper — confirms hydration is done
  await page.waitForFunction(() => window.fetch.name === 'vcrFetch', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Fetch REST' }).click();
  await expect(page.locator('[data-test-rest-data]')).toBeVisible();

  await page.getByRole('button', { name: 'Fetch GraphQL with BR variable' }).click();
  await expect(page.locator('[data-test-graphql-data="Brasil"]')).toBeVisible();

  await page.getByRole('button', { name: 'Fetch GraphQL with US variable' }).click();
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

  // Verify cassette files exist
  expect(existsSync(join(EPISODE_DIR, 'rest', 'GET_todos_1.json'))).toBe(true);
  expect(existsSync(join(EPISODE_DIR, 'graphql', `${brKey}.json`))).toBe(true);
  expect(existsSync(join(EPISODE_DIR, 'graphql', `${usKey}.json`))).toBe(true);
  expect(existsSync(join(EPISODE_DIR, 'graphql', `${ssrBrKey}.json`))).toBe(true);

  // Verify REST cassette content
  const restCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'rest', 'GET_todos_1.json'), 'utf-8'),
  );
  expect(restCassette).toEqual({ GET_todos_1: { ...REST_RESPONSE, userId: seedId } });

  // Verify GraphQL first call cassette content
  const brCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'graphql', `${brKey}.json`), 'utf-8'),
  );
  expect(brCassette).toEqual({
    [brKey]: {
      ...GRAPHQL_RESPONSE_BR,
      data: { country: { ...GRAPHQL_RESPONSE_BR.data.country, currency: seedId } },
    },
  });

  // Verify GraphQL second call cassette content
  const usCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'graphql', `${usKey}.json`), 'utf-8'),
  );
  expect(usCassette).toEqual({
    [usKey]: {
      ...GRAPHQL_RESPONSE_US,
      data: { country: { ...GRAPHQL_RESPONSE_US.data.country, currency: seedId } },
    },
  });

  // Verify GraphQL SSR call cassette content
  // This graphql request is hitting a real API, hence no seed Id
  // This is a limitation I can tolerate for now, mocking this SSR call would require a nodejs server
  const ssrBrCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'graphql', `${ssrBrKey}.json`), 'utf-8'),
  );
  expect(ssrBrCassette).toEqual({ [ssrBrKey]: GRAPHQL_RESPONSE_BR });
});
