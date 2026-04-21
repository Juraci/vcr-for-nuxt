// Minimal stub of Nuxt's #app module for use in Vitest.
// Only the exports used by plugin.ts need to be here.
export function defineNuxtPlugin(plugin: unknown) {
  return plugin;
}

export function useRuntimeConfig() {
  return { public: {} };
}

export function useRequestEvent() {
  return undefined;
}
