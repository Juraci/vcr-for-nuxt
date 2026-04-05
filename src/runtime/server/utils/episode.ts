// src/runtime/server/utils/episode.ts

/**
 * Resolves the active episode name.
 * Uses VCR_EPISODE env var when set, otherwise falls back to dd-mm-yyyy of today.
 */
export function resolveEpisodeName(): string {
  if (process.env.VCR_EPISODE) return process.env.VCR_EPISODE;
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}
