import * as _nuxt_schema from '@nuxt/schema';

interface ModuleOptions {
    /** Enable cassette recording. Defaults to VCR_RECORD env var. */
    record: boolean;
    /** Enable cassette playback. Defaults to VCR_PLAYBACK env var. */
    playback: boolean;
    /** Directory where cassette files are stored. Default: '.cassettes' */
    cassettesDir: string;
    /** Episode name for grouping cassettes. Defaults to VCR_EPISODE env var, then dd-mm-yyyy. */
    episode: string;
}
declare const _default: _nuxt_schema.NuxtModule<ModuleOptions, ModuleOptions, false>;

export { _default as default };
export type { ModuleOptions };
