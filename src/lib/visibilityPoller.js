export function startVisibilityAwarePolling(
  callback,
  intervalMs,
  {
    documentTarget = globalThis.document,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout,
  } = {},
) {
  if (typeof callback !== 'function') {
    throw new TypeError('Polling callback must be a function.');
  }

  const delay = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 15000;
  let stopped = false;
  let running = false;
  let timerId = null;

  function isVisible() {
    return documentTarget?.visibilityState !== 'hidden';
  }

  function clearScheduledRun() {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  function scheduleNextRun() {
    clearScheduledRun();

    if (!stopped && !running && isVisible()) {
      timerId = setTimer(run, delay);
    }
  }

  async function run() {
    clearScheduledRun();

    if (stopped || running || !isVisible()) {
      return;
    }

    running = true;

    try {
      await callback();
    } catch {
      // Polling consumers own their UI error state. Keep the scheduler resilient.
    } finally {
      running = false;
      scheduleNextRun();
    }
  }

  function handleVisibilityChange() {
    clearScheduledRun();

    if (isVisible()) {
      void run();
    }
  }

  documentTarget?.addEventListener?.('visibilitychange', handleVisibilityChange);
  void run();

  return () => {
    stopped = true;
    clearScheduledRun();
    documentTarget?.removeEventListener?.('visibilitychange', handleVisibilityChange);
  };
}
