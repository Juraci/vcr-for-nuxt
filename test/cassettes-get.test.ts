// test/cassettes-get.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDir, loadEpisodeCassettes } from '../src/runtime/server/utils/cassettes';

describe('loadDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcr-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty object when the directory does not exist', () => {
    expect(loadDir(join(tmpDir, 'nonexistent'))).toEqual({});
  });

  it('merges all JSON files in the directory into a single object', () => {
    writeFileSync(join(tmpDir, 'a.json'), JSON.stringify({ key_a: 1 }));
    writeFileSync(join(tmpDir, 'b.json'), JSON.stringify({ key_b: 2 }));
    expect(loadDir(tmpDir)).toEqual({ key_a: 1, key_b: 2 });
  });

  it('ignores non-JSON files', () => {
    writeFileSync(join(tmpDir, 'index.js'), 'export default {}');
    writeFileSync(join(tmpDir, 'data.json'), JSON.stringify({ ok: true }));
    expect(loadDir(tmpDir)).toEqual({ ok: true });
  });
});

describe('loadEpisodeCassettes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcr-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeEpisodeCassette(
    episode: string,
    type: 'graphql' | 'rest',
    filename: string,
    data: unknown,
  ) {
    const dir = join(tmpDir, 'episodes', episode, type);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), JSON.stringify(data));
  }

  it('loads graphql cassettes from the correct episode dir', () => {
    writeEpisodeCassette('ep-01', 'graphql', 'MyQuery.json', { MyQuery: { data: {} } });
    const { graphql } = loadEpisodeCassettes(tmpDir, 'ep-01');
    expect(graphql).toEqual({ MyQuery: { data: {} } });
  });

  it('loads rest cassettes from the correct episode dir', () => {
    writeEpisodeCassette('ep-01', 'rest', 'GET_users.json', { GET_users: [{ id: 1 }] });
    const { rest } = loadEpisodeCassettes(tmpDir, 'ep-01');
    expect(rest).toEqual({ GET_users: [{ id: 1 }] });
  });

  it('returns empty objects when the episode dir does not exist', () => {
    const result = loadEpisodeCassettes(tmpDir, 'no-such-episode');
    expect(result).toEqual({ graphql: {}, rest: {} });
  });

  it('does not load cassettes from a different episode', () => {
    writeEpisodeCassette('ep-01', 'rest', 'GET_users.json', { GET_users: [{ id: 1 }] });
    writeEpisodeCassette('ep-02', 'rest', 'GET_posts.json', { GET_posts: [] });

    const ep1 = loadEpisodeCassettes(tmpDir, 'ep-01');
    expect(ep1.rest).toHaveProperty('GET_users');
    expect(ep1.rest).not.toHaveProperty('GET_posts');
  });

  it('merges multiple cassette files within a type', () => {
    writeEpisodeCassette('ep-01', 'rest', 'GET_users.json', { GET_users: [] });
    writeEpisodeCassette('ep-01', 'rest', 'POST_users.json', { POST_users: { id: 2 } });
    const { rest } = loadEpisodeCassettes(tmpDir, 'ep-01');
    expect(rest).toHaveProperty('GET_users');
    expect(rest).toHaveProperty('POST_users');
  });
});
