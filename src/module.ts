// src/module.ts
import {
  addPlugin,
  addServerHandler,
  addServerPlugin,
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
  /** Episode name for grouping cassettes. Defaults to VCR_EPISODE env var, then dd-mm-yyyy. */
  episode: string;
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
    episode: process.env.VCR_EPISODE ?? '',
  },
  setup(options, nuxt) {
    const allowedEnvs = ['development', 'test'];
    if (!allowedEnvs.includes(process.env.NODE_ENV ?? '')) return;

    const { record, playback, cassettesDir, episode } = options;

    // Expose flags to the universal plugin via public runtimeConfig so the
    // plugin can read them synchronously — no boot GET request needed for flags.
    nuxt.options.runtimeConfig.public.vcr = { record, playback };

    // Expose cassettesDir and episode to Nitro server routes via private runtimeConfig.
    nuxt.options.runtimeConfig.vcrCassettesDir = cassettesDir;
    nuxt.options.runtimeConfig.vcrEpisode = episode;

    // Nothing to register when VCR is completely inactive.
    if (!record && !playback) return;

    // Required for the Nitro plugin's useEvent() to retrieve the current H3
    // request from inside the globalThis.fetch wrapper. Without this, the
    // fetch wrapper can't resolve the per-request episode cookie. The Nuxt
    // schema in this version doesn't expose `nitro` on NuxtOptions at the
    // type level, so cast once and set both sides (Nuxt + Nitro).
    nuxt.options.experimental = nuxt.options.experimental ?? {};
    nuxt.options.experimental.asyncContext = true;
    const nuxtOpts = nuxt.options as unknown as {
      nitro?: { experimental?: { asyncContext?: boolean } };
    };
    nuxtOpts.nitro = nuxtOpts.nitro ?? {};
    nuxtOpts.nitro.experimental = nuxtOpts.nitro.experimental ?? {};
    nuxtOpts.nitro.experimental.asyncContext = true;

    const { resolve } = createResolver(import.meta.url);

    addPlugin(resolve('./runtime/plugin'));

    // Nitro plugin: installs the server-side globalThis.fetch wrapper exactly
    // once per Nitro process and threads per-request episode context through
    // AsyncLocalStorage. Without this, concurrent SSR requests with different
    // episodes would race on the process-global fetch.
    addServerPlugin(resolve('./runtime/server/plugins/vcr'));

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
