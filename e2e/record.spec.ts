import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { startDevServer, stopDevServer } from './helpers/server';

const EPISODE_NAME = 'integration-tests-record';
const CASSETTES_DIR = join(process.cwd(), '.cassettes');
const EPISODE_DIR = join(CASSETTES_DIR, 'episodes', EPISODE_NAME);

const REST_RESPONSE = {
  userId: 1,
  id: 1,
  title: 'delectus aut autem',
  completed: false,
};

const GRAPHQL_RESPONSE = {
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
  await page.route('https://countries.trevorblades.com/graphql', (route) =>
    route.fulfill({
      json: {
        ...GRAPHQL_RESPONSE,
        data: { country: { ...GRAPHQL_RESPONSE.data.country, currency: seedId } },
      },
    }),
  );

  await page.goto('/');
  // Wait until the VCR plugin has installed its fetch wrapper — confirms hydration is done
  await page.waitForFunction(() => window.fetch.name === 'vcrFetch', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Fetch REST' }).click();
  await page.getByRole('button', { name: 'Fetch GraphQL' }).click();

  // Allow time for the plugin to POST cassettes to the server route
  await page.waitForTimeout(1000);

  expect(existsSync(join(EPISODE_DIR, 'rest', 'GET_todos_1.json'))).toBe(true);
  expect(existsSync(join(EPISODE_DIR, 'graphql', 'getCountryQuery.json'))).toBe(true);

  const restCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'rest', 'GET_todos_1.json'), 'utf-8'),
  );
  expect(restCassette).toEqual({ GET_todos_1: { ...REST_RESPONSE, userId: seedId } });

  const graphqlCassette = JSON.parse(
    readFileSync(join(EPISODE_DIR, 'graphql', 'getCountryQuery.json'), 'utf-8'),
  );
  expect(graphqlCassette).toEqual({
    getCountryQuery: {
      ...GRAPHQL_RESPONSE,
      data: { country: { ...GRAPHQL_RESPONSE.data.country, currency: seedId } },
    },
  });
});
