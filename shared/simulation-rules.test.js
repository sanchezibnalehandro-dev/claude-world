import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canDoLocationAction,
  defaultIntentForLocation,
  scrubContradictions,
  updateIntentAge,
  updateNeeds
} from './simulation-rules.js';

function decision(overrides = {}) {
  return {
    next_location: 'hut',
    wood_delta: 0,
    fish_delta: 0,
    mushroom_delta: 0,
    herb_delta: 0,
    made_rod: false,
    lit_fire: false,
    feed_fire: false,
    cook_fish: 0,
    eat_mush: 0,
    cellar_fish_delta: 0,
    cellar_mush_delta: 0,
    ...overrides
  };
}

test('default intent remains location-specific', () => {
  assert.equal(defaultIntentForLocation('river').focus, 'river');
  assert.equal(defaultIntentForLocation('woods').focus, 'woods');
  assert.equal(defaultIntentForLocation('hut').focus, 'hut');
});

test('need updates preserve the legacy arithmetic', () => {
  const state = {
    weather: 'clear',
    fire: false,
    location: 'woods',
    needs: {
      hunger: 20,
      cold: 10,
      fatigue: 15,
      spirit: 70
    }
  };

  updateNeeds(
    state,
    decision({
      next_location: 'woods',
      wood_delta: 2
    }),
    22
  );

  assert.deepEqual(state.needs, {
    hunger: 26,
    cold: 17,
    fatigue: 23,
    spirit: 69
  });
});

test('resting still recovers fatigue and spirit', () => {
  const state = {
    weather: 'clear',
    fire: true,
    location: 'hut',
    needs: {
      hunger: 20,
      cold: 10,
      fatigue: 15,
      spirit: 70
    }
  };

  updateNeeds(state, decision(), 12);

  assert.deepEqual(state.needs, {
    hunger: 26,
    cold: 0,
    fatigue: 14,
    spirit: 74
  });
});

test('moving cancels practical actions at the old location', () => {
  const state = { location: 'woods' };
  const d = decision({
    next_location: 'river',
    wood_delta: 2,
    mushroom_delta: 1
  });

  const notes = scrubContradictions(state, d);

  assert.equal(notes.length, 1);
  assert.equal(d.wood_delta, 0);
  assert.equal(d.mushroom_delta, 0);
});

test('actions are constrained by current location', () => {
  const state = { location: 'river' };
  const d = decision({
    next_location: 'river',
    wood_delta: 2,
    fish_delta: 1,
    lit_fire: true
  });

  scrubContradictions(state, d);

  assert.equal(d.fish_delta, 1);
  assert.equal(d.wood_delta, 0);
  assert.equal(d.lit_fire, false);
  assert.equal(canDoLocationAction('river', d), true);
});

test('intent age increments and resets exactly as before', () => {
  const state = { intent: { age: 4 } };

  assert.equal(updateIntentAge(state, false), 5);
  assert.equal(updateIntentAge(state, true), 0);
});
