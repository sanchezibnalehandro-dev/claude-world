import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDecisionToState } from './apply-decision.js';

function baseState(overrides = {}) {
  return {
    day: 1,
    weather: 'clear',
    fire: true,
    fireWood: 8,
    inv: {
      wood: 2,
      fish: 0,
      mushroom: 0,
      herb: 0,
      rod: 0
    },
    cellar: {
      fish: 0,
      mushroom: 0
    },
    summary: '',
    location: 'hut',
    intent: {
      label: 'держусь ближе к огню',
      focus: 'hut',
      horizon: 'today',
      reason: 'тепло',
      age: 0
    },
    needs: {
      hunger: 20,
      cold: 10,
      fatigue: 15,
      spirit: 70
    },
    ...overrides
  };
}

function decision(overrides = {}) {
  return {
    action_type: null,
    main_action: 'Сижу у огня.',
    minor_action: '',
    thought: 'Тихо.',
    wish: '',
    new_summary: '',
    next_location: 'hut',
    new_intent: null,
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

test('applies a quiet home visit and creates diary entries', () => {
  const result = applyDecisionToState(
    baseState(),
    decision(),
    { hour: 12, time: '12:30' }
  );

  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].type, 'action');
  assert.equal(result.entries[1].type, 'thought');
  assert.equal(result.state.intent.age, 1);
  assert.deepEqual(result.state.needs, {
    hunger: 26,
    cold: 0,
    fatigue: 14,
    spirit: 74
  });
});

test('successful fishing consumes rod durability and reports visual effect', () => {
  const state = baseState({
    location: 'river',
    fire: false,
    inv: {
      wood: 0,
      fish: 0,
      mushroom: 0,
      herb: 0,
      rod: 2
    },
    intent: {
      label: 'рыбачу',
      focus: 'river',
      horizon: 'today',
      reason: 'нужна еда',
      age: 0
    }
  });

  const result = applyDecisionToState(
    state,
    decision({
      next_location: 'river',
      fish_delta: 1,
      main_action: 'Поймал рыбу.'
    }),
    { hour: 12, time: '12:30' }
  );

  assert.equal(result.state.inv.fish, 1);
  assert.equal(result.state.inv.rod, 1);
  assert.equal(result.effects.didFishSuccessfully, true);
});

test('changing location cancels practical action from the old location', () => {
  const state = baseState({
    location: 'woods',
    fire: false,
    inv: {
      wood: 0,
      fish: 0,
      mushroom: 0,
      herb: 0,
      rod: 0
    }
  });

  const result = applyDecisionToState(
    state,
    decision({
      next_location: 'river',
      wood_delta: 3,
      main_action: 'Ухожу к реке.'
    }),
    { hour: 12, time: '12:30' }
  );

  assert.equal(result.state.location, 'river');
  assert.equal(result.state.inv.wood, 0);
  assert.equal(result.effects.didGatherWood, false);
  assert.ok(result.entries.some((entry) => entry.text.includes('не телепортировался')));
});

test('lighting the fire consumes wood and reports a home effect', () => {
  const state = baseState({
    fire: false,
    fireWood: 0,
    inv: {
      wood: 3,
      fish: 0,
      mushroom: 0,
      herb: 0,
      rod: 0
    }
  });

  const result = applyDecisionToState(
    state,
    decision({
      lit_fire: true,
      main_action: 'Разжигаю очаг.'
    }),
    { hour: 22, time: '22:10' }
  );

  assert.equal(result.state.fire, true);
  assert.equal(result.state.fireWood, 8);
  assert.equal(result.state.inv.wood, 1);
  assert.equal(result.effects.didHomePractical, true);
});
