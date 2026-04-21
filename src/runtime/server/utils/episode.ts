// src/runtime/server/utils/episode.ts
import { getCookie, getHeader, type H3Event } from 'h3';

// Episode names land on the filesystem as directory names. This regex rejects
// path traversal (`../`), absolute paths, hidden dot-files, whitespace, and
// anything that isn't a filesystem-friendly identifier. 64 chars is plenty for
// scenario names without risking ENAMETOOLONG on unusual filesystems.
export const EPISODE_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function datePart(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}

function take(candidate: string | undefined | null): string | null {
  if (!candidate) return null;
  return EPISODE_NAME_REGEX.test(candidate) ? candidate : null;
}

/**
 * Resolves the active episode name.
 *
 * Precedence (first valid match wins):
 *   1. `vcr-episode` cookie on the request (when an event is provided)
 *   2. `x-vcr-episode` header on the request (when an event is provided)
 *   3. `VCR_EPISODE` environment variable
 *   4. Today's date as `dd-mm-yyyy`
 *
 * Invalid candidates (failing `EPISODE_NAME_REGEX`) are silently skipped so a
 * malformed cookie from a browser never crashes the dev server.
 */
export function resolveEpisodeName(event?: H3Event): string {
  if (event) {
    const fromCookie = take(getCookie(event, 'vcr-episode'));
    if (fromCookie) return fromCookie;

    const fromHeader = take(getHeader(event, 'x-vcr-episode'));
    if (fromHeader) return fromHeader;
  }

  const fromEnv = take(process.env.VCR_EPISODE);
  if (fromEnv) return fromEnv;

  return datePart();
}
