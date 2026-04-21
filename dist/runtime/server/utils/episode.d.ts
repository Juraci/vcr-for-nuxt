import { type H3Event } from 'h3';
export declare const EPISODE_NAME_REGEX: RegExp;
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
export declare function resolveEpisodeName(event?: H3Event): string;
