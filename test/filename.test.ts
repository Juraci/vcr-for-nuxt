// test/filename.test.ts
import { describe, expect, it } from 'vitest';

import { methodPrefixedKey, urlToFilename } from '../src/runtime/plugin';
import { graphqlCassetteKey } from '../src/runtime/graphql-key';

describe('urlToFilename', () => {
  it('strips protocol and host', () => {
    expect(urlToFilename('https://api.doximity.com/v1/users')).toBe('v1_users');
  });

  it('handles query params', () => {
    expect(urlToFilename('https://api.doximity.com/v1/users?page=1')).toBe('v1_users_page_1');
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

describe('graphqlCassetteKey', () => {
  it('returns bare operationName when no variables provided', () => {
    expect(graphqlCassetteKey('getCountryQuery')).toBe('getCountryQuery');
  });

  it('returns bare operationName for empty variables object', () => {
    expect(graphqlCassetteKey('getCountryQuery', {})).toBe('getCountryQuery');
  });

  it('returns bare operationName for null variables', () => {
    expect(graphqlCassetteKey('getCountryQuery', null)).toBe('getCountryQuery');
  });

  it('appends double-underscore hash when variables are present', () => {
    const key = graphqlCassetteKey('getCountryQuery', { code: 'BR' });
    expect(key).toMatch(/^getCountryQuery__[0-9a-f]{8}$/);
  });

  it('produces the same key regardless of variable key order (determinism)', () => {
    const key1 = graphqlCassetteKey('getUser', { id: '1', role: 'admin' });
    const key2 = graphqlCassetteKey('getUser', { role: 'admin', id: '1' });
    expect(key1).toBe(key2);
  });

  it('produces different keys for different variable values', () => {
    const brKey = graphqlCassetteKey('getCountryQuery', { code: 'BR' });
    const usKey = graphqlCassetteKey('getCountryQuery', { code: 'US' });
    expect(brKey).not.toBe(usKey);
  });

  it('produces different keys for different operationNames with the same variables', () => {
    const key1 = graphqlCassetteKey('getCountry', { code: 'BR' });
    const key2 = graphqlCassetteKey('getCity', { code: 'BR' });
    expect(key1).not.toBe(key2);
  });

  it('handles nested and array variables stably', () => {
    const vars = { filter: { ids: [1, 2, 3], active: true } };
    expect(graphqlCassetteKey('listItems', vars)).toBe(graphqlCassetteKey('listItems', vars));
  });
});
