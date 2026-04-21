export interface EpisodeCassettes {
    graphql: Record<string, unknown>;
    rest: Record<string, unknown>;
}
/**
 * Returns the cassettes for a given episode, reading from disk on the first
 * call and returning the cached entry thereafter.
 *
 * Record and playback are mutually exclusive, so during playback the on-disk
 * cassettes are read-only — no invalidation strategy is needed for the process
 * lifetime. A fresh dev-server restart is the only thing that should reload.
 */
export declare function getEpisodeCassettes(cassettesDir: string, episode: string): EpisodeCassettes;
/** Test-only: clear the cache between test cases. Not part of the public API. */
export declare function __resetCassetteCacheForTests(): void;
