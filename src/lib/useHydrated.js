import { useEffect, useState } from 'react';

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let frameA = 0;
    let frameB = 0;

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      frameA = window.requestAnimationFrame(() => {
        frameB = window.requestAnimationFrame(() => {
          setHydrated(true);
        });
      });
    } else {
      const timeoutId = setTimeout(() => {
        setHydrated(true);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
      };
    }

    return () => {
      if (frameA) window.cancelAnimationFrame(frameA);
      if (frameB) window.cancelAnimationFrame(frameB);
    };
  }, []);

  return hydrated;
}
