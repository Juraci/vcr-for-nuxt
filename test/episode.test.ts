// test/episode.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import { EPISODE_NAME_REGEX, resolveEpisodeName } from '../src/runtime/server/utils/episode';

/**
 * Build a minimal H3Event-shaped fake with the header/cookie values required
 * by h3's getCookie/getHeader helpers. Only the pieces those helpers read are
 * populated — no IncomingMessage stubbing needed.
 */
function fakeEvent({
  cookie,
  headers,
}: {
  cookie?: string;
  headers?: Record<string, string>;
} = {}): H3Event {
  const req = {
    headers: { ...(headers ?? {}), ...(cookie ? { cookie } : {}) },
  };
  return { node: { req }, web: undefined } as unknown as H3Event;
}

describe('resolveEpisodeName', () => {
  let originalEpisode: string | undefined;

  beforeEach(() => {
    originalEpisode = process.env.VCR_EPISODE;
  });

  afterEach(() => {
    if (originalEpisode === undefined) {
      delete process.env.VCR_EPISODE;
    } else {
      process.env.VCR_EPISODE = originalEpisode;
    }
  });

  describe('without an event', () => {
    it('returns VCR_EPISODE when set', () => {
      process.env.VCR_EPISODE = 'my-episode-01';
      expect(resolveEpisodeName()).toBe('my-episode-01');
    });

    it('returns dd-mm-yyyy date when VCR_EPISODE is not set', () => {
      delete process.env.VCR_EPISODE;
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      expect(resolveEpisodeName()).toBe(`${day}-${month}-${year}`);
    });

    it('zero-pads single-digit day and month', () => {
      delete process.env.VCR_EPISODE;
      const result = resolveEpisodeName();
      const [day, month] = result.split('-');
      expect(day).toHaveLength(2);
      expect(month).toHaveLength(2);
    });

    it('returns VCR_EPISODE even when it looks like a date', () => {
      process.env.VCR_EPISODE = '01-01-2025';
      expect(resolveEpisodeName()).toBe('01-01-2025');
    });

    it('falls through to the date fallback when VCR_EPISODE is invalid', () => {
      process.env.VCR_EPISODE = '../escape';
      const result = resolveEpisodeName();
      expect(result).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    });
  });

  describe('with a request event', () => {
    beforeEach(() => {
      delete process.env.VCR_EPISODE;
    });

    it('prefers the vcr-episode cookie over env and date', () => {
      process.env.VCR_EPISODE = 'from-env';
      const event = fakeEvent({ cookie: 'vcr-episode=from-cookie' });
      expect(resolveEpisodeName(event)).toBe('from-cookie');
    });

    it('prefers the cookie over the x-vcr-episode header', () => {
      const event = fakeEvent({
        cookie: 'vcr-episode=from-cookie',
        headers: { 'x-vcr-episode': 'from-header' },
      });
      expect(resolveEpisodeName(event)).toBe('from-cookie');
    });

    it('falls back to the x-vcr-episode header when the cookie is absent', () => {
      process.env.VCR_EPISODE = 'from-env';
      const event = fakeEvent({ headers: { 'x-vcr-episode': 'from-header' } });
      expect(resolveEpisodeName(event)).toBe('from-header');
    });

    it('falls back to VCR_EPISODE when neither cookie nor header is present', () => {
      process.env.VCR_EPISODE = 'from-env';
      const event = fakeEvent();
      expect(resolveEpisodeName(event)).toBe('from-env');
    });

    it('silently rejects an invalid cookie value and falls through', () => {
      process.env.VCR_EPISODE = 'from-env';
      const event = fakeEvent({ cookie: 'vcr-episode=../escape' });
      expect(resolveEpisodeName(event)).toBe('from-env');
    });

    it('silently rejects an invalid header value and falls through', () => {
      process.env.VCR_EPISODE = 'from-env';
      const event = fakeEvent({ headers: { 'x-vcr-episode': 'has spaces' } });
      expect(resolveEpisodeName(event)).toBe('from-env');
    });

    it('silently rejects an empty cookie value and falls through', () => {
      process.env.VCR_EPISODE = 'from-env';
      const event = fakeEvent({ cookie: 'vcr-episode=' });
      expect(resolveEpisodeName(event)).toBe('from-env');
    });
  });
});

describe('EPISODE_NAME_REGEX', () => {
  it('accepts typical episode names', () => {
    expect(EPISODE_NAME_REGEX.test('integration-tests-playback')).toBe(true);
    expect(EPISODE_NAME_REGEX.test('scenario_1')).toBe(true);
    expect(EPISODE_NAME_REGEX.test('EP01')).toBe(true);
    expect(EPISODE_NAME_REGEX.test('01-01-2025')).toBe(true);
  });

  it('rejects path traversal attempts', () => {
    expect(EPISODE_NAME_REGEX.test('../escape')).toBe(false);
    expect(EPISODE_NAME_REGEX.test('..')).toBe(false);
    expect(EPISODE_NAME_REGEX.test('foo/bar')).toBe(false);
    expect(EPISODE_NAME_REGEX.test('.hidden')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(EPISODE_NAME_REGEX.test('')).toBe(false);
  });

  it('rejects strings longer than 64 characters', () => {
    expect(EPISODE_NAME_REGEX.test('a'.repeat(64))).toBe(true);
    expect(EPISODE_NAME_REGEX.test('a'.repeat(65))).toBe(false);
  });

  it('rejects whitespace and special characters', () => {
    expect(EPISODE_NAME_REGEX.test('has spaces')).toBe(false);
    expect(EPISODE_NAME_REGEX.test('semi;colon')).toBe(false);
    expect(EPISODE_NAME_REGEX.test('with\nnewline')).toBe(false);
  });
});
