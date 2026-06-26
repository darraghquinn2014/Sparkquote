/**
 * WatermelonDB startup polyfill.
 *
 * WatermelonDB's internal performance tracking assumes a browser-like
 * `window.performance.now` with a `.bind` method. Hermes (React Native's
 * engine) doesn't provide that, causing a startup crash:
 *   TypeError: window.performance.now.bind is not a function
 *
 * This must be imported BEFORE any WatermelonDB import (handled by importing
 * it first in database.ts).
 */
if (typeof window !== 'undefined' && window.performance) {
  const originalNow = window.performance.now;
  if (typeof originalNow === 'function' && typeof originalNow.bind !== 'function') {
    const now = (): number => originalNow.call(window.performance);
    window.performance.now = now as typeof window.performance.now;
  }
}

export {}; // ensure this file is treated as a module
