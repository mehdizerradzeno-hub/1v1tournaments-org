import { useSyncExternalStore } from 'react';

let hydrated = false;
let hydrationScheduled = false;
const listeners = new Set();

function emitHydrated() {
  if (hydrated) {
    return;
  }

  hydrated = true;
  hydrationScheduled = false;
  listeners.forEach((listener) => listener());
}

function scheduleHydrated() {
  if (hydrated || hydrationScheduled || typeof window === 'undefined') {
    return;
  }

  hydrationScheduled = true;

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => emitHydrated());
    return;
  }

  window.setTimeout(() => emitHydrated(), 0);
}

function subscribe(callback) {
  listeners.add(callback);
  scheduleHydrated();

  return () => listeners.delete(callback);
}

export function useHydrated() {
  return useSyncExternalStore(subscribe, () => hydrated, () => false);
}
