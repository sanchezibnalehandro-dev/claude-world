import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyElapsedFireDecay,
  getMoscowClock
} from './world-runtime.js';

test('Moscow clock is derived independently of server timezone', () => {
  const clock = getMoscowClock(new Date('2026-09-20T00:15:00.000Z'));

  assert.deepEqual(clock, {
    hour: 3,
    minute: 15,
    time: '03:15'
  });
});

test('fire decay preserves the legacy burn rate', () => {
  const state = {
    fire: true,
    fireWood: 8
  };

  const now = new Date('2026-09-20T03:00:00.000Z').getTime();
  const recentEntries = [
    {
      created_at: '2026-09-20T02:00:00.000Z'
    }
  ];

  const elapsed = applyElapsedFireDecay(state, recentEntries, now);

  assert.equal(elapsed, 60);
  assert.equal(state.fire, true);
  assert.equal(state.fireWood, 7.49);
});

test('fire goes out when elapsed burn consumes remaining wood', () => {
  const state = {
    fire: true,
    fireWood: 0.1
  };

  const now = new Date('2026-09-20T03:00:00.000Z').getTime();
  const recentEntries = [
    {
      created_at: '2026-09-20T02:00:00.000Z'
    }
  ];

  applyElapsedFireDecay(state, recentEntries, now);

  assert.equal(state.fire, false);
  assert.equal(state.fireWood, 0);
});
