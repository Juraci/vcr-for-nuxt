export declare function urlToFilename(url: string): string;
export declare function methodPrefixedKey(method: string, url: string): string;
export interface CassetteStore {
    graphql: Record<string, unknown>;
    rest: Record<string, unknown>;
}
export interface InterceptorOptions {
    originalFetch: typeof fetch;
    /**
     * Resolved on every request. On the client this returns a static object
     * loaded once at plugin init; on the server it reads from AsyncLocalStorage
     * so each SSR request sees its own episode.
     */
    getCassettes: () => CassetteStore;
    /**
     * Fire-and-forget recording side-effect. The interceptor never awaits the
     * returned promise — implementations should swallow their own errors.
     */
    recordCassette: (type: 'graphql' | 'rest', key: string, data: unknown) => void;
    playback: boolean;
    record: boolean;
}
/**
 * Builds the `globalThis.fetch` replacement. The returned function is named
 * `vcrFetch` so tests can assert the wrapper is installed via
 * `window.fetch.name === 'vcrFetch'`.
 */
export declare function createVcrFetch(opts: InterceptorOptions): typeof fetch;
