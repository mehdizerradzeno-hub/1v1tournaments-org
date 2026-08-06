import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    const frame = window.requestAnimationFrame(() => callback());
    return () => window.cancelAnimationFrame(frame);
  }

  return () => {};
}

export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
