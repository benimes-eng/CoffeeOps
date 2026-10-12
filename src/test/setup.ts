import "@testing-library/jest-dom";
import { webcrypto } from "crypto";

// Polyfill crypto.subtle for jsdom (required on Linux/CI where it's not available)
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    writable: false,
  });
}

// Stub Supabase env vars so tests don't throw on missing config
if (!import.meta.env.VITE_SUPABASE_URL) {
  // @ts-ignore
  import.meta.env.VITE_SUPABASE_URL = "https://placeholder.supabase.co";
}
if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  // @ts-ignore
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY = "placeholder-key";
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
