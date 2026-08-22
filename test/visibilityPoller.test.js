import assert from 'node:assert/strict';
import test from 'node:test';

import { startVisibilityAwarePolling } from '../src/lib/visibilityPoller.js';

test('visibility-aware polling pauses while hidden and refreshes on return', async () => {
  const listeners = new Map();
  const timers = new Map();
  let nextTimerId = 1;
  let calls = 0;
  const documentTarget = {
    visibilityState: 'visible',
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
  };

  const stop = startVisibilityAwarePolling(
    () => { calls += 1; },
    15000,
    {
      documentTarget,
      setTimer(callback) {
        const timerId = nextTimerId;
        nextTimerId += 1;
        timers.set(timerId, callback);
        return timerId;
      },
      clearTimer(timerId) {
        timers.delete(timerId);
      },
    },
  );

  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(timers.size, 1);

  documentTarget.visibilityState = 'hidden';
  listeners.get('visibilitychange')();
  assert.equal(timers.size, 0);

  documentTarget.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(timers.size, 1);

  stop();
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
});
