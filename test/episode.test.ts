// test/episode.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveEpisodeName } from '../src/runtime/server/utils/episode';

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
    // Verify the format is always two digits for day and month
    const result = resolveEpisodeName();
    const [day, month] = result.split('-');
    expect(day).toHaveLength(2);
    expect(month).toHaveLength(2);
  });

  it('returns VCR_EPISODE even when it looks like a date', () => {
    process.env.VCR_EPISODE = '01-01-2025';
    expect(resolveEpisodeName()).toBe('01-01-2025');
  });
});
