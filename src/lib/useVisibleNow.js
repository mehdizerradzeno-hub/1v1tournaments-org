import { useEffect, useState } from 'react';

import { startVisibilityAwarePolling } from './visibilityPoller.js';

export function useVisibleNow(refreshMs = 1000) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(
    () => startVisibilityAwarePolling(() => setNowMs(Date.now()), refreshMs),
    [refreshMs],
  );

  return nowMs;
}
