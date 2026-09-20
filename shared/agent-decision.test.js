import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAgentDecision } from './agent-decision.js';

const state = {
  location: 'woods',
  intent: {
    label: 'собираю припасы',
    focus: 'woods',
    horizon: 'today',
    reason: 'нужны дрова'
  }
};

test('normalizes a complete legacy decision without changing values', () => {
  const raw = {
    action_type: 'chop_wood',
    main_action: 'Рублю сухое дерево.',
    minor_action: 'Осматриваю опушку.',
    thought: 'Лес сегодня тихий.',
    wish: 'Вернуться к огню.',
    new_summary: 'Я сходил за дровами.',
    next_location: 'woods',
    new_intent: {
      label: 'закончить сбор',
      focus: 'woods',
      horizon: 'until_evening',
      reason: 'хочу закончить до темноты'
    },
    wood_delta: 2,
    fish_delta: 0,
    mushroom_delta: 1,
    herb_delta: 0,
    made_rod: false,
    lit_fire: false,
    feed_fire: false,
    cook_fish: 0,
    eat_mush: 0,
    cellar_fish_delta: 0,
    cellar_mush_delta: 0
  };

  assert.deepEqual(normalizeAgentDecision(raw, state), raw);
});

test('preserves legacy fallbacks for malformed decisions', () => {
  const decision = normalizeAgentDecision(
    {
      action_type: 'teleport',
      next_location: 'moon',
      wood_delta: '2',
      fish_delta: 'not-a-number'
    },
    state,
    {
      fallbackMainAction: 'legacy main fallback',
      fallbackThought: 'legacy thought fallback'
    }
  );

  assert.equal(decision.action_type, null);
  assert.equal(decision.next_location, 'woods');
  assert.equal(decision.main_action, 'legacy main fallback');
  assert.equal(decision.thought, 'legacy thought fallback');
  assert.equal(decision.wood_delta, 2);
  assert.equal(decision.fish_delta, 0);
  assert.equal(decision.new_intent, null);
});

test('falls back missing intent fields to the current intent', () => {
  const decision = normalizeAgentDecision(
    {
      next_location: 'hut',
      new_intent: {
        label: '   ',
        focus: '',
        horizon: '',
        reason: ''
      }
    },
    state
  );

  assert.deepEqual(decision.new_intent, state.intent);
  assert.equal(decision.next_location, 'hut');
});
