// src/module.ts
import {
  addPlugin,
  addServerHandler,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit';

export interface ModuleOptions {
  /** Enable cassette recording. Defaults to VCR_RECORD env var. */
  record: boolean;
  /** Enable cassette playback. Defaults to VCR_PLAYBACK env var. */
  playback: boolean;
  /** Directory where cassette files are stored. Default: '.cassettes' */
  cassettesDir: string;
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'vcr-for-nuxt',
    configKey: 'vcr',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    record: process.env.VCR_RECORD === 'true',
    playback: process.env.VCR_PLAYBACK === 'true',
    cassettesDir: '.cassettes',
  },
  setup(options, nuxt) {
    const { record, playback, cassettesDir } = options;

    // Expose flags to the universal plugin via public runtimeConfig so the
    // plugin can read them synchronously — no boot GET request needed for flags.
    nuxt.options.runtimeConfig.public.vcr = { record, playback };

    // Expose cassettesDir to Nitro server routes via private runtimeConfig.
    nuxt.options.runtimeConfig.vcrCassettesDir = cassettesDir;

    // Nothing to register when VCR is completely inactive.
    if (!record && !playback) return;

    const { resolve } = createResolver(import.meta.url);

    addPlugin(resolve('./runtime/plugin'));

    addServerHandler({
      route: '/api/_cassettes',
      method: 'get',
      handler: resolve('./runtime/server/api/_cassettes.get'),
    });

    addServerHandler({
      route: '/api/_cassettes',
      method: 'post',
      handler: resolve('./runtime/server/api/_cassettes.post'),
    });
  },
});
