export default defineNuxtConfig({
  modules: ['../src/module'],
  vcr: {
    record: process.env.VCR_RECORD === 'true',
    playback: process.env.VCR_PLAYBACK === 'true',
    cassettesDir: '.cassettes',
    // episode defaults to VCR_EPISODE env var, then dd-mm-yyyy
    // e.g. VCR_EPISODE=my-feature nuxi dev
  },
});
