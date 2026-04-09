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

test('records cassettes for REST and GraphQL button clicks', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Fetch GraphQL with BR variable' }).click();
  await page.getByRole('button', { name: 'Fetch GraphQL with US variable' }).click();

  // Allow time for the plugin to POST cassettes to the server route
  await page.waitForTimeout(1000);

  const brKey = graphqlCassetteKey('getCountryQuery', { code: 'BR' });
  const usKey = graphqlCassetteKey('getCountryQuery', { code: 'US' });

  expect(existsSync(join(EPISODE_DIR, 'rest', 'GET_todos_1.json'))).toBe(true);
  expect(existsSync(join(EPISODE_DIR, 'graphql', `${brKey}.json`))).toBe(true);
  expect(existsSync(join(EPISODE_DIR, 'graphql', `${usKey}.json`))).toBe(true);

  const restCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'rest', 'GET_todos_1.json'), 'utf-8'),
  );
  expect(restCassette).toEqual({ GET_todos_1: { ...REST_RESPONSE, userId: seedId } });

  const brCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'graphql', `${brKey}.json`), 'utf-8'),
  );
  expect(brCassette).toEqual({
    [brKey]: {
      ...GRAPHQL_RESPONSE_BR,
      data: { country: { ...GRAPHQL_RESPONSE_BR.data.country, currency: seedId } },
    },
  });

  const usCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'graphql', `${usKey}.json`), 'utf-8'),
  );
  expect(usCassette).toEqual({
    [usKey]: {
      ...GRAPHQL_RESPONSE_US,
      data: { country: { ...GRAPHQL_RESPONSE_US.data.country, currency: seedId } },
    },
  });
});
