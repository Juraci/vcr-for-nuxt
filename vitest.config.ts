import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '#app': new URL('./test/__mocks__/app-stub.ts', import.meta.url).pathname,
    },
  },
});
