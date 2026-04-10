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
  it('returns null when body is undefined', () => {
    expect(graphqlCassetteKey(undefined)).toBeNull();
  });

  it('returns null when body is null', () => {
    expect(graphqlCassetteKey(null)).toBeNull();
  });

  it('returns null when body is not a string', () => {
    expect(graphqlCassetteKey(42 as unknown as BodyInit)).toBeNull();
  });

  it('returns null when body is not valid JSON', () => {
    expect(graphqlCassetteKey('not-json')).toBeNull();
  });

  it('returns null when body has no operationName', () => {
    expect(graphqlCassetteKey(JSON.stringify({ query: '{ foo }' }))).toBeNull();
  });

  it('returns null when operationName is an empty string', () => {
    expect(graphqlCassetteKey(JSON.stringify({ operationName: '' }))).toBeNull();
  });

  it('returns bare operationName when no variables', () => {
    expect(
      graphqlCassetteKey(JSON.stringify({ operationName: 'getCountryQuery' })),
    ).toBe('getCountryQuery');
  });

  it('returns bare operationName for empty variables object', () => {
    expect(
      graphqlCassetteKey(JSON.stringify({ operationName: 'getCountryQuery', variables: {} })),
    ).toBe('getCountryQuery');
  });

  it('returns bare operationName for null variables', () => {
    expect(
      graphqlCassetteKey(JSON.stringify({ operationName: 'getCountryQuery', variables: null })),
    ).toBe('getCountryQuery');
  });

  it('appends double-underscore hash when variables are present', () => {
    const key = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCountryQuery', variables: { code: 'BR' } }),
    );
    expect(key).toMatch(/^getCountryQuery__[0-9a-f]{8}$/);
  });

  it('produces the same key regardless of variable key order (determinism)', () => {
    const key1 = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getUser', variables: { id: '1', role: 'admin' } }),
    );
    const key2 = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getUser', variables: { role: 'admin', id: '1' } }),
    );
    expect(key1).toBe(key2);
  });

  it('produces different keys for different variable values', () => {
    const brKey = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCountryQuery', variables: { code: 'BR' } }),
    );
    const usKey = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCountryQuery', variables: { code: 'US' } }),
    );
    expect(brKey).not.toBe(usKey);
  });

  it('produces different keys for different operationNames with the same variables', () => {
    const key1 = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCountry', variables: { code: 'BR' } }),
    );
    const key2 = graphqlCassetteKey(
      JSON.stringify({ operationName: 'getCity', variables: { code: 'BR' } }),
    );
    expect(key1).not.toBe(key2);
  });

  it('handles nested and array variables stably', () => {
    const body1 = JSON.stringify({
      operationName: 'listItems',
      variables: { filter: { active: true, ids: [1, 2, 3] } },
    });
    const body2 = JSON.stringify({
      operationName: 'listItems',
      variables: { filter: { ids: [1, 2, 3], active: true } },
    });
    expect(graphqlCassetteKey(body1)).toBe(graphqlCassetteKey(body2));
  });
});
