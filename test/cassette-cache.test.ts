// test/cassette-cache.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetCassetteCacheForTests,
  getEpisodeCassettes,
} from '../src/runtime/server/utils/cassette-cache';

function seed(root: string, episode: string, type: 'graphql' | 'rest', payload: unknown) {
  const dir = join(root, 'episodes', episode, type);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'entry.json'), JSON.stringify(payload));
}

describe('getEpisodeCassettes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcr-cache-'));
    __resetCassetteCacheForTests();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads cassettes from disk on the first call', () => {
    seed(tmpDir, 'ep-01', 'rest', { GET_users: [{ id: 1 }] });
    const result = getEpisodeCassettes(tmpDir, 'ep-01');
    expect(result.rest).toEqual({ GET_users: [{ id: 1 }] });
    expect(result.graphql).toEqual({});
  });

  it('returns the cached object on subsequent calls for the same episode', () => {
    seed(tmpDir, 'ep-01', 'rest', { GET_users: [] });
    const first = getEpisodeCassettes(tmpDir, 'ep-01');
    const second = getEpisodeCassettes(tmpDir, 'ep-01');
    expect(second).toBe(first);
  });

  it('does not re-read disk after caching even if new files are added', () => {
    seed(tmpDir, 'ep-01', 'rest', { GET_users: [{ id: 1 }] });
    const first = getEpisodeCassettes(tmpDir, 'ep-01');

    // Add a new cassette after the first load.
    seed(tmpDir, 'ep-01', 'rest', { GET_posts: [] });
    const second = getEpisodeCassettes(tmpDir, 'ep-01');

    // Still the first snapshot — cache is authoritative for the process lifetime.
    expect(second).toBe(first);
    expect(second.rest).not.toHaveProperty('GET_posts');
  });

  it('isolates cache entries per episode', () => {
    seed(tmpDir, 'ep-01', 'rest', { GET_users: [{ id: 1 }] });
    seed(tmpDir, 'ep-02', 'rest', { GET_users: [{ id: 2 }] });

    const ep01 = getEpisodeCassettes(tmpDir, 'ep-01');
    const ep02 = getEpisodeCassettes(tmpDir, 'ep-02');

    expect(ep01).not.toBe(ep02);
    expect(ep01.rest).toEqual({ GET_users: [{ id: 1 }] });
    expect(ep02.rest).toEqual({ GET_users: [{ id: 2 }] });
  });

  it('returns empty objects when the episode directory does not exist', () => {
    const result = getEpisodeCassettes(tmpDir, 'never-seeded');
    expect(result).toEqual({ graphql: {}, rest: {} });
  });
});
