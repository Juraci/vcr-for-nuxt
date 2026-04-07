import { test, expect } from '@playwright/test';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { startDevServer, stopDevServer } from './helpers/server';

const EPISODE_NAME = 'integration-tests-playback';
const CASSETTES_DIR = join(process.cwd(), '.cassettes');
const EPISODE_DIR = join(CASSETTES_DIR, 'episodes', EPISODE_NAME);

const COUNTRY_DATA = {
  native: 'Brasil',
  capital: 'Brasília',
  emoji: '🇧🇷',
  currency: 'BRL',
  languages: [{ code: 'pt', name: 'Portuguese' }],
  name: 'Brazil',
};

const TODO_DATA = {
  userId: 1,
  id: 1,
  title: 'delectus aut autem',
  completed: false,
};

function seedCassettes(seedId: string) {
  rmSync(CASSETTES_DIR, { recursive: true, force: true });
  mkdirSync(join(EPISODE_DIR, 'graphql'), { recursive: true });
  mkdirSync(join(EPISODE_DIR, 'rest'), { recursive: true });

  writeFileSync(
    join(EPISODE_DIR, 'graphql', 'getCountryQueryX.json'),
    JSON.stringify({
      getCountryQuery: { data: { country: { ...COUNTRY_DATA, currency: seedId } } },
    }),
  );

  // Needed so the SSR call (server-side useAsyncData) is served from cassette
  writeFileSync(
    join(EPISODE_DIR, 'graphql', 'getCountryQuerySsr.json'),
    JSON.stringify({
      getCountryQuerySsr: { data: { country: { ...COUNTRY_DATA, currency: seedId } } },
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

  await page.getByRole('button', { name: 'Fetch REST' }).click();
  await page.getByRole('button', { name: 'Fetch GraphQL' }).click();

  const restText = await page.locator('[data-test-rest-data]').innerText();
  expect(JSON.parse(restText)).toEqual({ ...TODO_DATA, userId: seedId });

  const graphqlText = await page.locator('[data-test-graphql-data]').innerText();
  expect(JSON.parse(graphqlText)).toEqual({
    data: { country: { ...COUNTRY_DATA, currency: seedId } },
  });

  expect(externalRequests).toHaveLength(0);
});
