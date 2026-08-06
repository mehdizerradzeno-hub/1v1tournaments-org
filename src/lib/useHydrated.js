import { useSyncExternalStore } from 'react';

let hydrated = false;
let hydrationScheduled = false;
const listeners = new Set();
let releaseLoadListener = null;

function emitHydrated() {
  if (hydrated) {
    return;
  }

  hydrated = true;
  hydrationScheduled = false;
  if (releaseLoadListener) {
    releaseLoadListener();
    releaseLoadListener = null;
  }
  listeners.forEach((listener) => listener());
}

function scheduleHydrated() {
  if (hydrated || hydrationScheduled || typeof window === 'undefined') {
    return;
  }

  hydrationScheduled = true;

  const finishHydration = () => {
    window.setTimeout(() => emitHydrated(), 0);
  };

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    finishHydration();
    return;
  }

  const handleLoad = () => finishHydration();
  window.addEventListener('load', handleLoad, { once: true });
  releaseLoadListener = () => window.removeEventListener('load', handleLoad);
}

function subscribe(callback) {
  listeners.add(callback);
  scheduleHydrated();

  return () => listeners.delete(callback);
}

export function useHydrated() {
  return useSyncExternalStore(subscribe, () => hydrated, () => false);
}
