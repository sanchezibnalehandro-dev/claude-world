import { normalizeAgentDecision } from '../shared/agent-decision.js';
import { applyDecisionToState } from '../shared/apply-decision.js';
import {
  loadWorldSnapshot,
  persistWorldSnapshot
} from './supabase-rest.js';
import {
  buildAgentContext,
  requestAnthropicDecision
} from './anthropic-provider.js';

function getMoscowClock(now = new Date()) {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();

  return {
    hour,
    minute,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}

function applyElapsedFireDecay(state, recentEntries, now = Date.now()) {
  let elapsedMinutes = 180;

  if (recentEntries[0]?.created_at) {
    const lastTime = new Date(recentEntries[0].created_at).getTime();

    if (Number.isFinite(lastTime)) {
      elapsedMinutes = Math.max(0, (now - lastTime) / 60000);
    }
  }

  if (state.fire && elapsedMinutes > 0) {
    state.fireWood -= elapsedMinutes * 0.0085;

    if (state.fireWood <= 0) {
      state.fire = false;
      state.fireWood = 0;
    }
  }

  return elapsedMinutes;
}

export async function executeWorldVisit(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const { state, recentEntries } = await loadWorldSnapshot();

  applyElapsedFireDecay(state, recentEntries, now.getTime());

  const clock = getMoscowClock(now);
  const context = buildAgentContext(state, recentEntries, clock);
  const rawDecision = await requestAnthropicDecision(context);

  const decision = normalizeAgentDecision(rawDecision, state, {
    fallbackMainAction:
      'Клод задержался на месте и не стал ломать ритм мира силой.',
    fallbackThought:
      'Тишина не всегда даёт ответы, но умеет возвращать ритм дыхания.'
  });

  const result = applyDecisionToState(state, decision, {
    hour: clock.hour,
    time: clock.time
  });

  await persistWorldSnapshot(result.state, result.entries);

  return {
    success: true,
    executed: true,
    state: result.state,
    decision: result.decision,
    effects: result.effects,
    entries: result.entries
  };
}

export {
  applyElapsedFireDecay,
  getMoscowClock
};
