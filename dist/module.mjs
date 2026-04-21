import { defineNuxtModule, createResolver, addPlugin, addServerPlugin, addServerHandler } from '@nuxt/kit';

const module$1 = defineNuxtModule({
  meta: {
    name: "vcr-for-nuxt",
    configKey: "vcr",
    compatibility: { nuxt: ">=3.0.0" }
  },
  defaults: {
    record: process.env.VCR_RECORD === "true",
    playback: process.env.VCR_PLAYBACK === "true",
    cassettesDir: ".cassettes",
    episode: process.env.VCR_EPISODE ?? ""
  },
  setup(options, nuxt) {
    const allowedEnvs = ["development", "test"];
    if (!allowedEnvs.includes(process.env.NODE_ENV ?? "")) return;
    const { record, playback, cassettesDir, episode } = options;
    nuxt.options.runtimeConfig.public.vcr = { record, playback };
    nuxt.options.runtimeConfig.vcrCassettesDir = cassettesDir;
    nuxt.options.runtimeConfig.vcrEpisode = episode;
    if (!record && !playback) return;
    nuxt.options.experimental = nuxt.options.experimental ?? {};
    nuxt.options.experimental.asyncContext = true;
    const nuxtOpts = nuxt.options;
    nuxtOpts.nitro = nuxtOpts.nitro ?? {};
    nuxtOpts.nitro.experimental = nuxtOpts.nitro.experimental ?? {};
    nuxtOpts.nitro.experimental.asyncContext = true;
    const { resolve } = createResolver(import.meta.url);
    addPlugin(resolve("./runtime/plugin"));
    addServerPlugin(resolve("./runtime/server/plugins/vcr"));
    addServerHandler({
      route: "/api/_cassettes",
      method: "get",
      handler: resolve("./runtime/server/api/_cassettes.get")
    });
    addServerHandler({
      route: "/api/_cassettes",
      method: "post",
      handler: resolve("./runtime/server/api/_cassettes.post")
    });
  }
});

export { module$1 as default };
