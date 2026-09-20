import {
  defaultIntentForLocation,
  scrubContradictions,
  updateIntentAge,
  updateNeeds
} from './simulation-rules.js';

export function applyDecisionToState(state, decision, options = {}) {
  const hour = Number.isFinite(options.hour) ? options.hour : 12;
  const time = options.time || '00:00';
  const inv = state.inv;
  const oldLocation = state.location;
  const notes = scrubContradictions(state, decision);
  const entries = [];

  const effects = {
    didFishSuccessfully: false,
    didGatherWood: false,
    didGatherFood: false,
    didHomePractical: false
  };

  if (decision.next_location !== oldLocation) {
    state.location = decision.next_location;
    entries.push({ type: 'action', text: decision.main_action, time, day: state.day });
  } else {
    entries.push({ type: 'action', text: decision.main_action, time, day: state.day });

    if (decision.minor_action) {
      entries.push({ type: 'action', text: decision.minor_action, time, day: state.day });
    }
  }

  notes.forEach((text) => {
    entries.push({ type: 'action', text, time, day: state.day });
  });

  if (decision.wood_delta) {
    inv.wood = Math.max(0, inv.wood + decision.wood_delta);
    if (decision.wood_delta > 0) effects.didGatherWood = true;
  }

  if (decision.mushroom_delta) {
    inv.mushroom = Math.max(0, inv.mushroom + decision.mushroom_delta);
    if (decision.mushroom_delta > 0) effects.didGatherFood = true;
  }

  if (decision.herb_delta) {
    inv.herb = Math.max(0, inv.herb + decision.herb_delta);
    if (decision.herb_delta > 0) effects.didGatherFood = true;
  }

  if (
    decision.made_rod &&
    inv.wood >= 1 &&
    inv.rod <= 0 &&
    state.location === 'hut'
  ) {
    inv.rod = 10;
    inv.wood -= 1;
    effects.didHomePractical = true;
  }

  if (decision.fish_delta > 0 && state.location === 'river') {
    if (inv.rod > 0) {
      inv.fish += decision.fish_delta;
      inv.rod = Math.max(0, inv.rod - 1);
      effects.didFishSuccessfully = true;

      if (inv.rod <= 0) {
        entries.push({
          type: 'action',
          text: 'Удочка с треском сломалась. Клоду придётся собирать новую.',
          time,
          day: state.day
        });
      }
    } else {
      entries.push({
        type: 'action',
        text: 'У воды он только усмехнулся себе: без удочки река не отдаёт ничего.',
        time,
        day: state.day
      });
    }
  }

  if (
    decision.cellar_fish_delta > 0 &&
    state.location === 'hut' &&
    inv.fish >= decision.cellar_fish_delta
  ) {
    inv.fish -= decision.cellar_fish_delta;
    state.cellar.fish += decision.cellar_fish_delta;
    effects.didHomePractical = true;
  } else if (
    decision.cellar_fish_delta < 0 &&
    state.location === 'hut' &&
    state.cellar.fish >= Math.abs(decision.cellar_fish_delta)
  ) {
    inv.fish += Math.abs(decision.cellar_fish_delta);
    state.cellar.fish -= Math.abs(decision.cellar_fish_delta);
    effects.didHomePractical = true;
  }

  if (
    decision.cellar_mush_delta > 0 &&
    state.location === 'hut' &&
    inv.mushroom >= decision.cellar_mush_delta
  ) {
    inv.mushroom -= decision.cellar_mush_delta;
    state.cellar.mushroom += decision.cellar_mush_delta;
    effects.didHomePractical = true;
  } else if (
    decision.cellar_mush_delta < 0 &&
    state.location === 'hut' &&
    state.cellar.mushroom >= Math.abs(decision.cellar_mush_delta)
  ) {
    inv.mushroom += Math.abs(decision.cellar_mush_delta);
    state.cellar.mushroom -= Math.abs(decision.cellar_mush_delta);
    effects.didHomePractical = true;
  }

  if (
    decision.cook_fish > 0 &&
    state.location === 'hut' &&
    inv.fish >= decision.cook_fish
  ) {
    if (state.fire || decision.lit_fire) {
      inv.fish -= decision.cook_fish;
      effects.didHomePractical = true;
    } else {
      entries.push({
        type: 'action',
        text: 'Без огня рыба так и осталась обещанием ужина.',
        time,
        day: state.day
      });
    }
  }

  if (decision.eat_mush > 0 && inv.mushroom >= decision.eat_mush) {
    inv.mushroom -= decision.eat_mush;
  }

  if (
    decision.lit_fire &&
    inv.wood >= 2 &&
    !state.fire &&
    state.location === 'hut'
  ) {
    state.fire = true;
    state.fireWood = 8;
    inv.wood -= 2;
    effects.didHomePractical = true;
  } else if (
    decision.feed_fire &&
    state.fire &&
    inv.wood >= 1 &&
    state.location === 'hut'
  ) {
    state.fireWood = Math.min(8, state.fireWood + 3);
    inv.wood -= 1;
    effects.didHomePractical = true;
  }

  updateNeeds(state, decision, hour);

  if (decision.thought) {
    entries.push({ type: 'thought', text: decision.thought, time, day: state.day });
  }

  if (decision.wish) {
    entries.push({ type: 'wish', text: decision.wish, time, day: state.day });
  }

  if (decision.new_summary) {
    state.summary = decision.new_summary;
  }

  let intentChanged = false;

  if (decision.new_intent) {
    state.intent = { ...decision.new_intent, age: 0 };
    intentChanged = true;
  } else if (oldLocation !== state.location) {
    state.intent = defaultIntentForLocation(state.location);
    intentChanged = true;
  }

  updateIntentAge(state, intentChanged);

  return {
    state,
    decision,
    entries,
    effects
  };
}
