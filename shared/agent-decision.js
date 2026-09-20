import {
  AGENT_ACTION_TYPES,
  INTENT_FOCI,
  INTENT_HORIZONS,
  LOCATIONS,
  isAgentActionType,
  isLocation
} from './world-domain.js';

export {
  AGENT_ACTION_TYPES,
  INTENT_FOCI,
  INTENT_HORIZONS,
  LOCATIONS
};

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Canonical decision shape shared by manual and autonomous agent visits.
 *
 * The normalizer deliberately preserves the legacy behaviour:
 * - unknown action types become null;
 * - unknown locations fall back to the current location;
 * - malformed/missing intent fields fall back to the current intent;
 * - missing resource deltas become zero;
 * - missing flags become false.
 */
export function normalizeAgentDecision(raw, state, options = {}) {
  const decision = raw && typeof raw === 'object' ? raw : {};
  const currentIntent = state?.intent || {};
  const currentLocation = isLocation(state?.location) ? state.location : 'hut';

  const actionType = safeText(decision.action_type, '').toLowerCase();

  return {
    action_type: isAgentActionType(actionType) ? actionType : null,
    main_action: safeText(
      decision.main_action,
      options.fallbackMainAction || 'Клод задержался на месте и не стал ломать ритм мира силой.'
    ),
    minor_action: safeText(decision.minor_action, ''),
    thought: safeText(
      decision.thought,
      options.fallbackThought || 'Тишина не всегда даёт ответы, но умеет возвращать ритм дыхания.'
    ),
    wish: safeText(decision.wish, ''),
    new_summary: safeText(decision.new_summary, ''),
    next_location: isLocation(decision.next_location)
      ? decision.next_location
      : currentLocation,
    new_intent: decision.new_intent && typeof decision.new_intent === 'object'
      ? {
          label: safeText(decision.new_intent.label, currentIntent.label || ''),
          focus: safeText(decision.new_intent.focus, currentIntent.focus || ''),
          horizon: safeText(decision.new_intent.horizon, currentIntent.horizon || ''),
          reason: safeText(decision.new_intent.reason, currentIntent.reason || '')
        }
      : null,
    wood_delta: safeNumber(decision.wood_delta),
    fish_delta: safeNumber(decision.fish_delta),
    mushroom_delta: safeNumber(decision.mushroom_delta),
    herb_delta: safeNumber(decision.herb_delta),
    made_rod: Boolean(decision.made_rod),
    lit_fire: Boolean(decision.lit_fire),
    feed_fire: Boolean(decision.feed_fire),
    cook_fish: safeNumber(decision.cook_fish),
    eat_mush: safeNumber(decision.eat_mush),
    cellar_fish_delta: safeNumber(decision.cellar_fish_delta),
    cellar_mush_delta: safeNumber(decision.cellar_mush_delta)
  };
}

/**
 * Provider-neutral JSON Schema for the decision contract.
 *
 * It is not enforced by the legacy Anthropic call yet. It exists now so the
 * provider adapter can later request structured output without redefining the
 * world contract.
 */
export const AGENT_DECISION_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    action_type: {
      anyOf: [
        { type: 'string', enum: [...AGENT_ACTION_TYPES] },
        { type: 'null' }
      ]
    },
    main_action: { type: 'string' },
    minor_action: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    thought: { type: 'string' },
    wish: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    new_summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    next_location: { type: 'string', enum: [...LOCATIONS] },
    new_intent: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string' },
            focus: { type: 'string', enum: [...INTENT_FOCI] },
            horizon: { type: 'string', enum: [...INTENT_HORIZONS] },
            reason: { type: 'string' }
          },
          required: ['label', 'focus', 'horizon', 'reason']
        },
        { type: 'null' }
      ]
    },
    wood_delta: { type: 'number' },
    fish_delta: { type: 'number' },
    mushroom_delta: { type: 'number' },
    herb_delta: { type: 'number' },
    made_rod: { type: 'boolean' },
    lit_fire: { type: 'boolean' },
    feed_fire: { type: 'boolean' },
    cook_fish: { type: 'number' },
    eat_mush: { type: 'number' },
    cellar_fish_delta: { type: 'number' },
    cellar_mush_delta: { type: 'number' }
  },
  required: [
    'action_type',
    'main_action',
    'minor_action',
    'thought',
    'wish',
    'new_summary',
    'next_location',
    'new_intent',
    'wood_delta',
    'fish_delta',
    'mushroom_delta',
    'herb_delta',
    'made_rod',
    'lit_fire',
    'feed_fire',
    'cook_fish',
    'eat_mush',
    'cellar_fish_delta',
    'cellar_mush_delta'
  ]
});
