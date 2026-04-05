// test/cassettes-post.test.ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeCassette } from '../src/runtime/server/utils/cassettes';

describe('writeCassette', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcr-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a REST cassette to episodes/<episode>/rest/<key>.json', () => {
    writeCassette(tmpDir, 'ep-01', 'rest', 'GET_api_v1_users', { id: 1 });

    const filePath = join(tmpDir, 'episodes', 'ep-01', 'rest', 'GET_api_v1_users.json');
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(content).toEqual({ GET_api_v1_users: { id: 1 } });
  });

  it('writes a GraphQL cassette to episodes/<episode>/graphql/<key>.json', () => {
    writeCassette(tmpDir, 'ep-01', 'graphql', 'GetUser', { data: { user: { id: '1' } } });

    const filePath = join(tmpDir, 'episodes', 'ep-01', 'graphql', 'GetUser.json');
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(content).toEqual({ GetUser: { data: { user: { id: '1' } } } });
  });

  it('creates index.js at the episode root on first write', () => {
    writeCassette(tmpDir, 'ep-01', 'rest', 'GET_todos', []);

    const indexPath = join(tmpDir, 'episodes', 'ep-01', 'index.js');
    const content = readFileSync(indexPath, 'utf8');
    expect(content).toContain('export default cassettes');
    expect(content).toContain('graphql');
    expect(content).toContain('rest');
  });

  it('does not overwrite index.js on subsequent writes', () => {
    writeCassette(tmpDir, 'ep-01', 'rest', 'GET_todos', []);
    const indexPath = join(tmpDir, 'episodes', 'ep-01', 'index.js');
    const firstContent = readFileSync(indexPath, 'utf8');

    writeCassette(tmpDir, 'ep-01', 'rest', 'GET_posts', []);
    const secondContent = readFileSync(indexPath, 'utf8');

    expect(firstContent).toBe(secondContent);
  });

  it('scopes cassettes to their episode — different episodes do not share files', () => {
    writeCassette(tmpDir, 'ep-01', 'rest', 'GET_users', { ep: 1 });
    writeCassette(tmpDir, 'ep-02', 'rest', 'GET_users', { ep: 2 });

    const ep1 = JSON.parse(
      readFileSync(join(tmpDir, 'episodes', 'ep-01', 'rest', 'GET_users.json'), 'utf8'),
    );
    const ep2 = JSON.parse(
      readFileSync(join(tmpDir, 'episodes', 'ep-02', 'rest', 'GET_users.json'), 'utf8'),
    );

    expect(ep1.GET_users).toEqual({ ep: 1 });
    expect(ep2.GET_users).toEqual({ ep: 2 });
  });

  it('overwrites an existing cassette file when the same key is written again', () => {
    writeCassette(tmpDir, 'ep-01', 'rest', 'GET_todos', { old: true });
    writeCassette(tmpDir, 'ep-01', 'rest', 'GET_todos', { new: true });

    const filePath = join(tmpDir, 'episodes', 'ep-01', 'rest', 'GET_todos.json');
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(content.GET_todos).toEqual({ new: true });
  });

  it('creates nested episode directories automatically', () => {
    // Should not throw even when the path doesn't exist yet
    expect(() =>
      writeCassette(tmpDir, 'brand-new-episode', 'graphql', 'MyQuery', {}),
    ).not.toThrow();
  });
});
