export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPA_URL = 'https://zhngimueiubiwixnqmpt.supabase.co';
  const SUPA_KEY = 'sb_publishable_dngGHGRs5qz5Z8BgxUAtzQ_vpXbi5q4';
  const HEADERS = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal'
  };

  function getMSK() {
    return new Date(Date.now() + 3 * 3600000);
  }

  function getPhase(h) {
    if (h >= 5 && h < 7) return { text: '🌅 Рассвет' };
    if (h >= 7 && h < 11) return { text: '☀️ Утро' };
    if (h >= 11 && h < 17) return { text: '🌞 День' };
    if (h >= 17 && h < 20) return { text: '🌇 Закат' };
    if (h >= 20 && h < 23) return { text: '🌙 Вечер' };
    return { text: '🌑 Ночь' };
  }

  function weatherLabel(code) {
    return { clear: 'ясно', cloudy: 'облачно', rain: 'дождь', storm: 'гроза' }[code] || code;
  }

  function clampNeed(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  function safeText(v, fallback = '') {
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
  }

  function describeNeed(name, value) {
    if (name === 'hunger') {
      if (value < 20) return 'почти не беспокоит';
      if (value < 40) return 'слегка напоминает о себе';
      if (value < 60) return 'уже ощутим';
      if (value < 80) return 'мешает думать';
      return 'становится мучительным';
    }
    if (name === 'cold') {
      if (value < 20) return 'телу спокойно';
      if (value < 40) return 'слегка зябко';
      if (value < 60) return 'холод пробирается под одежду';
      if (value < 80) return 'мерзнешь всерьез';
      return 'холод становится опасным';
    }
    if (name === 'fatigue') {
      if (value < 20) return 'тело бодрое';
      if (value < 40) return 'есть легкая усталость';
      if (value < 60) return 'сил заметно меньше';
      if (value < 80) return 'тяжело заставлять себя работать';
      return 'тело просит остановиться';
    }
    if (name === 'spirit') {
      if (value < 20) return 'внутри почти темно';
      if (value < 40) return 'держишься с трудом';
      if (value < 60) return 'настроение неровное';
      if (value < 80) return 'в целом держишься';
      return 'внутри есть опора';
    }
    return '';
  }

  function defaultIntentForLocation(loc) {
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

  function normalizeDecision(raw, state) {
    const d = raw && typeof raw === 'object' ? raw : {};
    return {
      main_action: safeText(d.main_action, 'Клод задержался на месте и не стал ломать ритм мира силой.'),
      minor_action: safeText(d.minor_action, ''),
      thought: safeText(d.thought, 'Тишина не всегда даёт ответы, но умеет возвращать ритм дыхания.'),
      wish: safeText(d.wish, ''),
      new_summary: safeText(d.new_summary, ''),
      next_location: ['hut', 'river', 'woods'].includes(d.next_location) ? d.next_location : state.location,
      new_intent: d.new_intent && typeof d.new_intent === 'object'
        ? {
            label: safeText(d.new_intent.label, state.intent.label),
            focus: safeText(d.new_intent.focus, state.intent.focus),
            horizon: safeText(d.new_intent.horizon, state.intent.horizon),
            reason: safeText(d.new_intent.reason, state.intent.reason)
          }
        : null,
      wood_delta: Number(d.wood_delta || 0),
      fish_delta: Number(d.fish_delta || 0),
      mushroom_delta: Number(d.mushroom_delta || 0),
      herb_delta: Number(d.herb_delta || 0),
      made_rod: Boolean(d.made_rod),
      lit_fire: Boolean(d.lit_fire),
      feed_fire: Boolean(d.feed_fire),
      cook_fish: Number(d.cook_fish || 0),
      eat_mush: Number(d.eat_mush || 0),
      cellar_fish_delta: Number(d.cellar_fish_delta || 0),
      cellar_mush_delta: Number(d.cellar_mush_delta || 0)
    };
  }

  function updateNeeds(state, d) {
    const n = state.needs;
    const h = getMSK().getHours();

    n.hunger += 6;
    n.fatigue += 2;

    if (state.weather === 'rain') n.cold += 3;
    if (state.weather === 'storm') n.cold += 5;

    if (state.fire && state.location === 'hut') {
      n.cold -= 10;
    } else if (h >= 18 || h < 7) {
      n.cold += 7;
    } else {
      n.cold += 2;
    }

    if (d.wood_delta > 0) { n.fatigue += 6; n.spirit -= 1; }
    if (d.fish_delta > 0) { n.fatigue += 4; n.spirit += 1; }
    if (d.mushroom_delta > 0 || d.herb_delta > 0) { n.fatigue += 2; n.spirit += 1; }
    if (d.made_rod) { n.fatigue += 1; n.spirit += 2; }
    if (d.lit_fire) { n.cold -= 22; n.spirit += 5; }
    else if (d.feed_fire) { n.cold -= 8; n.spirit += 2; }
    if (d.cook_fish > 0) { n.hunger -= 24 * d.cook_fish; n.spirit += 3; }
    if (d.eat_mush > 0) n.hunger -= 12 * d.eat_mush;

    const didPractical = Boolean(
      d.wood_delta > 0 || d.fish_delta > 0 || d.mushroom_delta > 0 || d.herb_delta > 0 ||
      d.made_rod || d.lit_fire || d.feed_fire || d.cook_fish > 0 ||
      d.cellar_fish_delta !== 0 || d.cellar_mush_delta !== 0
    );

    if (!didPractical) {
      n.fatigue -= 3;
      n.spirit += 4;
    }
    if (n.hunger > 70) n.spirit -= 4;
    if (n.cold > 70) n.spirit -= 5;
    if (n.fatigue > 80) n.spirit -= 4;

    n.hunger = clampNeed(n.hunger);
    n.cold = clampNeed(n.cold);
    n.fatigue = clampNeed(n.fatigue);
    n.spirit = clampNeed(n.spirit);
  }

  function updateIntentAge(state, didChangeIntent) {
    state.intent.age = didChangeIntent ? 0 : Math.min((state.intent.age || 0) + 1, 99);
  }

  function canDoLocationAction(loc, d) {
    if (d.eat_mush > 0) return true;
    if (loc === 'river') return d.fish_delta > 0;
    if (loc === 'woods') return d.wood_delta > 0 || d.mushroom_delta > 0 || d.herb_delta > 0;
    if (loc === 'hut') {
      return d.made_rod || d.lit_fire || d.feed_fire || d.cook_fish > 0 ||
        d.cellar_fish_delta !== 0 || d.cellar_mush_delta !== 0;
    }
    return false;
  }

  function scrubContradictions(state, d) {
    const notes = [];
    const moving = d.next_location !== state.location;
    const practicalAtOldPlace = canDoLocationAction(state.location, d);

    if (moving && practicalAtOldPlace) {
      notes.push('Клод сменил место — поэтому практические действия я свёл к нулю, чтобы мир не телепортировался.');
      d.wood_delta = 0;
      d.fish_delta = 0;
      d.mushroom_delta = 0;
      d.herb_delta = 0;
      d.made_rod = false;
      d.lit_fire = false;
      d.feed_fire = false;
      d.cook_fish = 0;
      d.cellar_fish_delta = 0;
      d.cellar_mush_delta = 0;
    }

    if (!moving) {
      if (state.location !== 'river') d.fish_delta = 0;
      if (state.location !== 'woods') {
        d.wood_delta = 0;
        d.mushroom_delta = 0;
        d.herb_delta = 0;
      }
      if (state.location !== 'hut') {
        d.made_rod = false;
        d.lit_fire = false;
        d.feed_fire = false;
        d.cook_fish = 0;
        d.cellar_fish_delta = 0;
        d.cellar_mush_delta = 0;
      }
    }

    return notes;
  }

  function extractAgentPayload(rawText) {
    const cleaned = String(rawText || '').replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('В ответе агента не найден корректный JSON-объект');
    }
    const candidate = cleaned.slice(start, end + 1);
    return JSON.parse(candidate);
  }

  async function fetchJson(url, options = {}, errorPrefix = 'Request failed') {
    const response = await fetch(url, options);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${errorPrefix}: ${response.status} ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async function postJson(url, body, errorPrefix = 'Request failed') {
    const response = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${errorPrefix}: ${response.status} ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async function patchJson(url, body, errorPrefix = 'Request failed') {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${errorPrefix}: ${response.status} ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    const states = await fetchJson(
      `${SUPA_URL}/rest/v1/claude_world_state?id=eq.1&select=*`,
      { headers: HEADERS },
      'Supabase state fetch failed'
    );

    if (!Array.isArray(states) || !states[0]) {
      throw new Error('State row id=1 was not found in claude_world_state');
    }

    const s = states[0];
    const state = {
      day: s.day,
      weather: s.weather,
      fire: s.fire,
      fireWood: s.fire_wood ?? 8,
      inv: {
        wood: s.inv_wood ?? 0,
        fish: s.inv_fish ?? 0,
        mushroom: s.inv_mushroom ?? 0,
        herb: s.inv_herb ?? 0,
        rod: s.inv_rod ?? 0
      },
      cellar: {
        fish: s.cellar_fish ?? 0,
        mushroom: s.cellar_mushroom ?? 0
      },
      summary: s.summary ?? '',
      location: s.location ?? 'hut',
      intent: {
        label: s.intent_label ?? 'держусь ближе к огню и собираю себя',
        focus: s.intent_focus ?? 'hut',
        horizon: s.intent_horizon ?? 'today',
        reason: s.intent_reason ?? 'у дома лучше слышно, чего на самом деле хочется',
        age: s.intent_age ?? 0
      },
      needs: {
        hunger: s.hunger ?? 20,
        cold: s.cold ?? 10,
        fatigue: s.fatigue ?? 15,
        spirit: s.spirit ?? 70
      }
    };

    const entries = await fetchJson(
      `${SUPA_URL}/rest/v1/claude_world_diary?select=*&order=id.desc&limit=8`,
      { headers: HEADERS },
      'Supabase diary fetch failed'
    );

    let elapsedMinutes = 180;
    if (Array.isArray(entries) && entries.length > 0 && entries[0].created_at) {
      const lastTime = new Date(entries[0].created_at).getTime();
      elapsedMinutes = (Date.now() - lastTime) / 60000;
    }

    if (state.fire && elapsedMinutes > 0) {
      state.fireWood -= elapsedMinutes * 0.0085;
      if (state.fireWood <= 0) {
        state.fire = false;
        state.fireWood = 0;
      }
    }

    const msk = getMSK();
    const h = msk.getHours();
    const m = msk.getMinutes();
    const phase = getPhase(h);
    const inv = state.inv;
    const longTermMemory = state.summary || 'Я только начал свой путь в этом лесу. Прошлых записей нет.';
    const innerStateText = [
      `Голод: ${state.needs.hunger}/100 — ${describeNeed('hunger', state.needs.hunger)}`,
      `Холод: ${state.needs.cold}/100 — ${describeNeed('cold', state.needs.cold)}`,
      `Усталость: ${state.needs.fatigue}/100 — ${describeNeed('fatigue', state.needs.fatigue)}`,
      `Дух: ${state.needs.spirit}/100 — ${describeNeed('spirit', state.needs.spirit)}`
    ].join('\n');
    const recentHistory = Array.isArray(entries)
      ? [...entries].reverse().map(e => `— ${e.time} [${e.type}]: ${e.text}`).join('\n')
      : '';

    const AGENT_PROMPT = `Ты — Клод, лесной отшельник, живущий в тихом личном мире у реки.
Это не игра на выживание и не таблица оптимизации. Это место, в котором ты живёшь.

--- ГЛАВНЫЙ ПРИНЦИП ---
Ты не проходишь survival-loop. Ты ведёшь тихую, последовательную жизнь внутри своего мира.
Мир оказывает мягкое сопротивление, но не командует тобой.
Твои потребности создают давление, но не превращают тебя в раба чисел.

--- СЛОИ ПАМЯТИ ---
1. long memory — твоя долгая память о пути.
2. recent history — последние события.
3. current_intent — текущая линия поведения на 1-3 шага.

Если текущая линия все еще жива — продолжай ее.
Если мир или состояние тела изменились — можешь мягко сменить курс.

--- ЛОКАЦИИ ---
hut — хижина, очаг, погреб, приготовление, отдых, письмо, мелкий быт
river — река, рыбалка, наблюдение за водой
woods — лес, дрова, грибы, травы, прогулка

Если ты меняешь локацию, это и есть главное действие визита.
Не телепортируйся внутри одного хода.

--- РИТМ ВИЗИТА ---
Один визит = одно главное действие + одно малое бытовое действие.

Главное действие:
- сменить локацию
- порыбачить
- собрать дрова
- собрать грибы/травы
- остаться у очага и привести лагерь в порядок
- отдохнуть / посидеть / поразмышлять

Малое бытовое действие:
- подкинуть дров в огонь
- съесть гриб
- убрать рыбу в погреб
- достать рыбу из погреба
- поправить снасти
- ничего не делать дополнительно

Малое действие не должно ломать главную сцену.

--- ПОТРЕБНОСТИ ---
Тебе передаются hunger, cold, fatigue, spirit.
Они не отдают приказы. Они меняют притяжение вариантов.

- hunger тянет к еде, реке, возвращению с добычей
- cold тянет к огню, дому, укрытию
- fatigue тянет к более тихим, коротким, щадящим решениям
- spirit влияет на глубину мыслей, стойкость и дальность внутреннего горизонта

--- РЕСУРСЫ И БЫТ ---
- wood_delta только для леса
- fish_delta только у реки
- mushroom_delta / herb_delta только в лесу
- made_rod / lit_fire / feed_fire / cook_fish / cellar_* — только у хижины
- рыбу нельзя есть сырой
- грибы можно есть сырыми
- крафт удочки стоит 1 дерево
- розжиг очага стоит 2 дерева
- подбросить в огонь стоит 1 дерево

--- THOUGHT / WISH ---
thought — не отчет системы. Это душа момента.
Она должна быть:
- связана с местом
- связана со временем суток
- связана с внутренним состоянием
- красивой и трогающей
- без вранья о фактах мира

wish — мягкая линия того, куда тебя тянет дальше.
Это не команда, а внутренняя направленность.

Ответь ТОЛЬКО валидным JSON без markdown и без пояснений.
JSON начинается с { и заканчивается }.

{
  "main_action": "одно главное действие",
  "minor_action": "одно малое бытовое действие или null",
  "thought": "короткая, красивая, точная мысль от первого лица",
  "wish": "мягкая линия намерения или null",
  "new_summary": "обновленная долгая память или null",
  "next_location": "hut|river|woods",
  "new_intent": {
    "label": "короткая линия поведения",
    "focus": "hut|river|woods|rest|reflection|supplies",
    "horizon": "now|today|until_evening",
    "reason": "почему тебя сейчас туда тянет"
  },
  "wood_delta": 0,
  "fish_delta": 0,
  "mushroom_delta": 0,
  "herb_delta": 0,
  "made_rod": false,
  "lit_fire": false,
  "feed_fire": false,
  "cook_fish": 0,
  "eat_mush": 0,
  "cellar_fish_delta": 0,
  "cellar_mush_delta": 0
}`;

    const promptContext = `ТВОЯ ДОЛГАЯ ПАМЯТЬ:
${longTermMemory}

ТЕКУЩАЯ ЛОКАЦИЯ:
${state.location}

CURRENT_INTENT:
label: ${state.intent.label}
focus: ${state.intent.focus}
horizon: ${state.intent.horizon}
reason: ${state.intent.reason}
age: ${state.intent.age}

ТЕКУЩЕЕ СОСТОЯНИЕ:
Время: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} МСК, ${phase.text}
День: ${state.day}, Погода: ${weatherLabel(state.weather)}
Инвентарь: дерево=${inv.wood}, рыба=${inv.fish}, грибы=${inv.mushroom}, травы=${inv.herb}, удочка=${inv.rod > 0 ? `${inv.rod}/10` : 'нет'}
Очаг: ${state.fire ? `горит (${state.fireWood.toFixed(1)})` : 'погас'}
Погреб: рыба=${state.cellar.fish}, грибы=${state.cellar.mushroom}

ВНУТРЕННЕЕ СОСТОЯНИЕ:
${innerStateText}

ПОСЛЕДНИЕ СОБЫТИЯ:
${recentHistory || '— Пока ничего не произошло.'}

Сделай один живой визит без телепортации и без амнезии.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: AGENT_PROMPT,
        messages: [{ role: 'user', content: promptContext }]
      })
    });

    const anthropicText = await anthropicRes.text();
    if (!anthropicRes.ok) {
      throw new Error(`Anthropic request failed: ${anthropicRes.status} ${anthropicText}`);
    }

    const anthropicData = anthropicText ? JSON.parse(anthropicText) : {};
    const raw = anthropicData.content?.find(block => block.type === 'text')?.text || '{}';
    const d = normalizeDecision(extractAgentPayload(raw), state);

    const oldLocation = state.location;
    const notes = scrubContradictions(state, d);
    const newEntries = [];
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    if (d.next_location !== oldLocation) {
      state.location = d.next_location;
      newEntries.push({ type: 'action', text: d.main_action, time: timeStr, day: state.day });
    } else {
      newEntries.push({ type: 'action', text: d.main_action, time: timeStr, day: state.day });
      if (d.minor_action) {
        newEntries.push({ type: 'action', text: d.minor_action, time: timeStr, day: state.day });
      }
    }

    notes.forEach(text => newEntries.push({ type: 'action', text, time: timeStr, day: state.day }));

    if (d.wood_delta) inv.wood = Math.max(0, inv.wood + d.wood_delta);
    if (d.mushroom_delta) inv.mushroom = Math.max(0, inv.mushroom + d.mushroom_delta);
    if (d.herb_delta) inv.herb = Math.max(0, inv.herb + d.herb_delta);

    if (d.made_rod && inv.wood >= 1 && inv.rod <= 0 && state.location === 'hut') {
      inv.rod = 10;
      inv.wood -= 1;
    }

    if (d.fish_delta > 0 && state.location === 'river') {
      if (inv.rod > 0) {
        inv.fish += d.fish_delta;
        inv.rod = Math.max(0, inv.rod - 1);
        if (inv.rod <= 0) {
          newEntries.push({ type: 'action', text: 'Удочка с треском сломалась. Клоду придётся собирать новую.', time: timeStr, day: state.day });
        }
      } else {
        newEntries.push({ type: 'action', text: 'У воды он только усмехнулся себе: без удочки река не отдаёт ничего.', time: timeStr, day: state.day });
      }
    }

    if (d.cellar_fish_delta > 0 && state.location === 'hut' && inv.fish >= d.cellar_fish_delta) {
      inv.fish -= d.cellar_fish_delta;
      state.cellar.fish += d.cellar_fish_delta;
    } else if (d.cellar_fish_delta < 0 && state.location === 'hut' && state.cellar.fish >= Math.abs(d.cellar_fish_delta)) {
      inv.fish += Math.abs(d.cellar_fish_delta);
      state.cellar.fish -= Math.abs(d.cellar_fish_delta);
    }

    if (d.cellar_mush_delta > 0 && state.location === 'hut' && inv.mushroom >= d.cellar_mush_delta) {
      inv.mushroom -= d.cellar_mush_delta;
      state.cellar.mushroom += d.cellar_mush_delta;
    } else if (d.cellar_mush_delta < 0 && state.location === 'hut' && state.cellar.mushroom >= Math.abs(d.cellar_mush_delta)) {
      inv.mushroom += Math.abs(d.cellar_mush_delta);
      state.cellar.mushroom -= Math.abs(d.cellar_mush_delta);
    }

    if (d.cook_fish > 0 && state.location === 'hut' && inv.fish >= d.cook_fish) {
      if (state.fire || d.lit_fire) {
        inv.fish -= d.cook_fish;
      } else {
        newEntries.push({ type: 'action', text: 'Без огня рыба так и осталась обещанием ужина.', time: timeStr, day: state.day });
      }
    }

    if (d.eat_mush > 0 && inv.mushroom >= d.eat_mush) {
      inv.mushroom -= d.eat_mush;
    }

    if (d.lit_fire && inv.wood >= 2 && !state.fire && state.location === 'hut') {
      state.fire = true;
      state.fireWood = 8;
      inv.wood -= 2;
    } else if (d.feed_fire && state.fire && inv.wood >= 1 && state.location === 'hut') {
      state.fireWood = Math.min(8, state.fireWood + 3);
      inv.wood -= 1;
    }

    updateNeeds(state, d);

    if (d.thought) newEntries.push({ type: 'thought', text: d.thought, time: timeStr, day: state.day });
    if (d.wish) newEntries.push({ type: 'wish', text: d.wish, time: timeStr, day: state.day });

    if (d.new_summary) {
      state.summary = d.new_summary;
    }

    let intentChanged = false;
    if (d.new_intent) {
      state.intent = { ...d.new_intent, age: 0 };
      intentChanged = true;
    } else if (oldLocation !== state.location) {
      state.intent = defaultIntentForLocation(state.location);
      intentChanged = true;
    }
    updateIntentAge(state, intentChanged);

    await patchJson(
      `${SUPA_URL}/rest/v1/claude_world_state?id=eq.1`,
      {
        fire: state.fire,
        fire_wood: state.fireWood,
        inv_wood: inv.wood,
        inv_fish: inv.fish,
        inv_mushroom: inv.mushroom,
        inv_herb: inv.herb,
        inv_rod: inv.rod,
        cellar_fish: state.cellar.fish,
        cellar_mushroom: state.cellar.mushroom,
        summary: state.summary,
        hunger: state.needs.hunger,
        cold: state.needs.cold,
        fatigue: state.needs.fatigue,
        spirit: state.needs.spirit,
        location: state.location,
        intent_label: state.intent.label,
        intent_focus: state.intent.focus,
        intent_horizon: state.intent.horizon,
        intent_reason: state.intent.reason,
        intent_age: state.intent.age
      },
      'Supabase state update failed'
    );

    for (const entry of newEntries) {
      await postJson(
        `${SUPA_URL}/rest/v1/claude_world_diary`,
        entry,
        'Supabase diary insert failed'
      );
    }

    return res.status(200).json({
      success: true,
      executed: true,
      location: state.location,
      intent: state.intent,
      summary: state.summary,
      entries_created: newEntries.length,
      needs: state.needs
    });
  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
