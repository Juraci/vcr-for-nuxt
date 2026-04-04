// test/filename.test.ts
import { describe, expect, it } from 'vitest';

// Inline implementations for TDD. Replaced with real imports in Task 6.
function urlToFilename(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return path
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function methodPrefixedKey(method: string, url: string): string {
  return `${method.toUpperCase()}_${urlToFilename(url)}`;
}

describe('urlToFilename', () => {
  it('strips protocol and host', () => {
    expect(urlToFilename('https://api.doximity.com/v1/users')).toBe('v1_users');
  });

  it('handles query params', () => {
    expect(urlToFilename('https://api.doximity.com/v1/users?page=1')).toBe(
      'v1_users_page_1',
    );
  });

  it('handles relative paths', () => {
    expect(urlToFilename('/api/v1/users/profile')).toBe('api_v1_users_profile');
  });

  it('collapses consecutive underscores', () => {
    expect(urlToFilename('/api//double')).toBe('api_double');
  });

  it('trims leading and trailing underscores', () => {
    expect(urlToFilename('/some/path/')).toBe('some_path');
  });
});

describe('methodPrefixedKey', () => {
  it('prepends GET', () => {
    expect(methodPrefixedKey('GET', '/api/v1/users')).toBe('GET_api_v1_users');
  });

  it('prepends POST', () => {
    expect(methodPrefixedKey('POST', '/api/v1/users')).toBe('POST_api_v1_users');
  });

  it('upcases method', () => {
    expect(methodPrefixedKey('put', '/api/v1/users/1')).toBe('PUT_api_v1_users_1');
  });

  it('distinguishes GET vs POST to same URL', () => {
    expect(methodPrefixedKey('GET', '/api/v1/users')).not.toBe(
      methodPrefixedKey('POST', '/api/v1/users'),
    );
  });
});
