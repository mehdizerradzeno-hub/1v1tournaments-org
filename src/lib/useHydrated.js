import { useEffect, useState } from 'react';

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let idleId = 0;
    let timeoutId = 0;
    let frameId = 0;

    const markHydrated = () => {
      frameId = window.requestAnimationFrame(() => {
        setHydrated(true);
      });
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(markHydrated, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(markHydrated, 250);
    }

    return () => {
      if (idleId && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return hydrated;
}
