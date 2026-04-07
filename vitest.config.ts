import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts'],
  },
  resolve: {
    alias: {
      '#app': new URL('./test/__mocks__/app-stub.ts', import.meta.url).pathname,
    },
  },
});
