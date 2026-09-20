/**
 * Shared domain vocabulary for Claude World.
 *
 * Keep this module free of browser, database and provider dependencies.
 */

/** @typedef {'hut'|'river'|'woods'} Location */
/** @typedef {'rest_fire'|'relax'|'sleep'|'fish'|'chop_wood'|'gather_mushrooms'} AgentActionType */
/** @typedef {'hut'|'river'|'woods'|'rest'|'reflection'|'supplies'} IntentFocus */
/** @typedef {'now'|'today'|'until_evening'} IntentHorizon */

export const LOCATIONS = Object.freeze(['hut', 'river', 'woods']);

export const AGENT_ACTION_TYPES = Object.freeze([
  'rest_fire',
  'relax',
  'sleep',
  'fish',
  'chop_wood',
  'gather_mushrooms'
]);

export const INTENT_FOCI = Object.freeze([
  'hut',
  'river',
  'woods',
  'rest',
  'reflection',
  'supplies'
]);

export const INTENT_HORIZONS = Object.freeze([
  'now',
  'today',
  'until_evening'
]);

export function isLocation(value) {
  return LOCATIONS.includes(value);
}

export function isAgentActionType(value) {
  return AGENT_ACTION_TYPES.includes(value);
}

export function isIntentFocus(value) {
  return INTENT_FOCI.includes(value);
}

export function isIntentHorizon(value) {
  return INTENT_HORIZONS.includes(value);
}

export function clampNeed(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}
