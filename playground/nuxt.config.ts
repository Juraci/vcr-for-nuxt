export default defineNuxtConfig({
  modules: ['../src/module'],
  vcr: {
    record: process.env.VCR_RECORD === 'true',
    playback: process.env.VCR_PLAYBACK === 'true',
    cassettesDir: '.cassettes',
  },
});
