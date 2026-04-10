export declare function loadDir(dir: string): Record<string, unknown>;
export declare function loadEpisodeCassettes(cassettesDir: string, episode: string): {
    graphql: Record<string, unknown>;
    rest: Record<string, unknown>;
};
export declare function writeCassette(cassettesDir: string, episode: string, type: 'graphql' | 'rest', key: string, data: unknown): void;
