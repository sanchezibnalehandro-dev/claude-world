import { clampNeed } from './world-domain.js';

export function defaultIntentForLocation(loc) {
  if (loc === 'river') {
    return {
      label: 'слежу за рекой и прислушиваюсь к воде',
      focus: 'river',
      horizon: 'today',
      reason: 'день тянет к течению и живому движению',
      age: 0
    };
  }

  if (loc === 'woods') {
    return {
      label: 'иду в лес и позволяю ему самому подсказать занятие',
      focus: 'woods',
      horizon: 'today',
      reason: 'лес лучше слышно, когда не тащишь его силой',
      age: 0
    };
  }

  return {
    label: 'держусь ближе к огню и собираю себя',
    focus: 'hut',
    horizon: 'today',
    reason: 'у дома лучше слышно, чего на самом деле хочется',
    age: 0
  };
}

export function updateNeeds(state, decision, hour) {
  const needs = state.needs;

  needs.hunger += 6;
  needs.fatigue += 2;

  if (state.weather === 'rain') needs.cold += 3;
  if (state.weather === 'storm') needs.cold += 5;

  if (state.fire && state.location === 'hut') {
    needs.cold -= 10;
  } else if (hour >= 18 || hour < 7) {
    needs.cold += 7;
  } else {
    needs.cold += 2;
  }

  if (decision.wood_delta > 0) {
    needs.fatigue += 6;
    needs.spirit -= 1;
  }

  if (decision.fish_delta > 0) {
    needs.fatigue += 4;
    needs.spirit += 1;
  }

  if (decision.mushroom_delta > 0 || decision.herb_delta > 0) {
    needs.fatigue += 2;
    needs.spirit += 1;
  }

  if (decision.made_rod) {
    needs.fatigue += 1;
    needs.spirit += 2;
  }

  if (decision.lit_fire) {
    needs.cold -= 22;
    needs.spirit += 5;
  } else if (decision.feed_fire) {
    needs.cold -= 8;
    needs.spirit += 2;
  }

  if (decision.cook_fish > 0) {
    needs.hunger -= 24 * decision.cook_fish;
    needs.spirit += 3;
  }

  if (decision.eat_mush > 0) {
    needs.hunger -= 12 * decision.eat_mush;
  }

  const didPractical = Boolean(
    decision.wood_delta > 0 ||
    decision.fish_delta > 0 ||
    decision.mushroom_delta > 0 ||
    decision.herb_delta > 0 ||
    decision.made_rod ||
    decision.lit_fire ||
    decision.feed_fire ||
    decision.cook_fish > 0 ||
    decision.cellar_fish_delta !== 0 ||
    decision.cellar_mush_delta !== 0
  );

  if (!didPractical) {
    needs.fatigue -= 3;
    needs.spirit += 4;
  }

  if (needs.hunger > 70) needs.spirit -= 4;
  if (needs.cold > 70) needs.spirit -= 5;
  if (needs.fatigue > 80) needs.spirit -= 4;

  needs.hunger = clampNeed(needs.hunger);
  needs.cold = clampNeed(needs.cold);
  needs.fatigue = clampNeed(needs.fatigue);
  needs.spirit = clampNeed(needs.spirit);

  return needs;
}

export function updateIntentAge(state, didChangeIntent) {
  state.intent.age = didChangeIntent
    ? 0
    : Math.min((state.intent.age || 0) + 1, 99);

  return state.intent.age;
}

export function canDoLocationAction(loc, decision) {
  if (decision.eat_mush > 0) return true;

  if (loc === 'river') {
    return decision.fish_delta > 0;
  }

  if (loc === 'woods') {
    return (
      decision.wood_delta > 0 ||
      decision.mushroom_delta > 0 ||
      decision.herb_delta > 0
    );
  }

  if (loc === 'hut') {
    return (
      decision.made_rod ||
      decision.lit_fire ||
      decision.feed_fire ||
      decision.cook_fish > 0 ||
      decision.cellar_fish_delta !== 0 ||
      decision.cellar_mush_delta !== 0
    );
  }

  return false;
}

export function scrubContradictions(state, decision) {
  const notes = [];
  const moving = decision.next_location !== state.location;
  const practicalAtOldPlace = canDoLocationAction(state.location, decision);

  if (moving && practicalAtOldPlace) {
    notes.push(
      'Клод сменил место — поэтому практические действия я свёл к нулю, чтобы мир не телепортировался.'
    );

    decision.wood_delta = 0;
    decision.fish_delta = 0;
    decision.mushroom_delta = 0;
    decision.herb_delta = 0;
    decision.made_rod = false;
    decision.lit_fire = false;
    decision.feed_fire = false;
    decision.cook_fish = 0;
    decision.cellar_fish_delta = 0;
    decision.cellar_mush_delta = 0;
  }

  if (!moving) {
    if (state.location !== 'river') {
      decision.fish_delta = 0;
    }

    if (state.location !== 'woods') {
      decision.wood_delta = 0;
      decision.mushroom_delta = 0;
      decision.herb_delta = 0;
    }

    if (state.location !== 'hut') {
      decision.made_rod = false;
      decision.lit_fire = false;
      decision.feed_fire = false;
      decision.cook_fish = 0;
      decision.cellar_fish_delta = 0;
      decision.cellar_mush_delta = 0;
    }
  }

  return notes;
}
