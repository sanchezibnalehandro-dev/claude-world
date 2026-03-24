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

  function clampNeed(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
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

  function updateNeeds(state, d) {
    const n = state.needs;
    const h = getMSK().getHours();

    n.hunger += 8;
    n.fatigue += 4;

    if (state.weather === 'rain') n.cold += 4;
    if (state.weather === 'storm') n.cold += 7;

    if (state.fire) {
      n.cold -= 8;
    } else if (h >= 18 || h < 7) {
      n.cold += 10;
    } else {
      n.cold += 3;
    }

    if (d.wood_delta > 0) {
      n.fatigue += 8;
      n.spirit -= 1;
    }

    if (d.fish_delta > 0) {
      n.fatigue += 5;
      n.spirit += 1;
    }

    if (d.mushroom_delta > 0) {
      n.fatigue += 3;
      n.spirit += 1;
    }

    if (d.made_rod) {
      n.fatigue += 2;
      n.spirit += 2;
    }

    if (d.lit_fire) {
      n.cold -= 18;
      n.spirit += 6;
    } else if (d.feed_fire) {
      n.cold -= 8;
      n.spirit += 3;
    }

    if (d.cook_fish > 0) {
      n.hunger -= 30 * d.cook_fish;
      n.spirit += 4;
    }

    if (d.eat_mush > 0) {
      n.hunger -= 14 * d.eat_mush;
    }

    const didPracticalAction = Boolean(
      (d.wood_delta && d.wood_delta > 0) ||
      (d.fish_delta && d.fish_delta > 0) ||
      (d.mushroom_delta && d.mushroom_delta > 0) ||
      d.made_rod ||
      d.lit_fire ||
      d.feed_fire ||
      (d.cook_fish && d.cook_fish > 0) ||
      (d.cellar_fish_delta && d.cellar_fish_delta !== 0) ||
      (d.cellar_mush_delta && d.cellar_mush_delta !== 0)
    );

    if (!didPracticalAction) {
      n.fatigue -= 4;
      n.spirit += 5;
    }

    if (n.hunger > 70) n.spirit -= 6;
    if (n.cold > 70) n.spirit -= 8;
    if (n.fatigue > 80) n.spirit -= 5;

    n.hunger = clampNeed(n.hunger);
    n.cold = clampNeed(n.cold);
    n.fatigue = clampNeed(n.fatigue);
    n.spirit = clampNeed(n.spirit);
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
      fireWood: s.fire_wood,
      inv: {
        wood: s.inv_wood,
        fish: s.inv_fish,
        mushroom: s.inv_mushroom,
        herb: s.inv_herb,
        rod: s.inv_rod
      },
      cellar: {
        fish: s.cellar_fish,
        mushroom: s.cellar_mushroom
      },
      summary: s.summary ?? '',
      needs: {
        hunger: s.hunger ?? 20,
        cold: s.cold ?? 10,
        fatigue: s.fatigue ?? 15,
        spirit: s.spirit ?? 70
      }
    };

    const entries = await fetchJson(
      `${SUPA_URL}/rest/v1/claude_world_diary?select=*&order=id.desc&limit=6`,
      { headers: HEADERS },
      'Supabase diary fetch failed'
    );

    let elapsedMinutes = 180;
    if (Array.isArray(entries) && entries.length > 0 && entries[0].created_at) {
      const lastTime = new Date(entries[0].created_at).getTime();
      elapsedMinutes = (Date.now() - lastTime) / 60000;
    }

    if (state.fire && elapsedMinutes > 0) {
      state.fireWood -= elapsedMinutes * 0.01;
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
    const needs = state.needs;

    const weatherLabel = {
      clear: 'ясно',
      cloudy: 'облачно',
      rain: 'дождь',
      storm: 'гроза'
    }[state.weather] || state.weather;

    const longTermMemory = state.summary || 'Я только начал свой путь в этом лесу. Прошлых записей нет.';
    const innerStateText = [
      `Голод: ${needs.hunger}/100 — ${describeNeed('hunger', needs.hunger)}`,
      `Холод: ${needs.cold}/100 — ${describeNeed('cold', needs.cold)}`,
      `Усталость: ${needs.fatigue}/100 — ${describeNeed('fatigue', needs.fatigue)}`,
      `Дух: ${needs.spirit}/100 — ${describeNeed('spirit', needs.spirit)}`
    ].join('\n');

    const recentHistory = Array.isArray(entries)
      ? [...entries].reverse().map(e => `— ${e.time} [${e.type}]: ${e.text}`).join('\n')
      : '';

    const AGENT_PROMPT = `Ты — Клод, философ-отшельник. Ты живешь в лесу у реки, и этот дневник — твоя связь с реальностью. Твоя жизнь подчинена строгому ритму выживания и поиску смысла.

--- ЖЕСТКИЕ ПРАВИЛА МИРА (НАРУШАТЬ ЗАПРЕЩЕНО) ---
1. ПРАВИЛО ОДНОГО ДЕЙСТВИЯ: За один ход ты делаешь ЧТО-ТО ОДНО. Либо добыча дров (wood_delta 1-2), либо рыбалка (fish_delta 1), либо работа с погребом, либо созерцание.
2. СТОИМОСТЬ ВЫЖИВАНИЯ:
   - wood_delta используется только для добычи дерева.
   - Крафт удочки: поставь made_rod: true. Стоимость в 1 дерево спишет код.
   - Розжиг погасшего костра: поставь lit_fire: true. Стоимость в 2 дерева спишет код.
   - Подбросить дров в огонь: поставь feed_fire: true. Стоимость в 1 дерево спишет код.
3. ПИТАНИЕ И ОГОНЬ:
   - Ты НЕ ЕШЬ сырую рыбу. Чтобы приготовить её (cook_fish: 1), костер ДОЛЖЕН гореть.
   - Грибы можно есть сырыми (eat_mush: 1).
4. ПОГРЕБ: Рыба в карманах тухнет. Убирай излишки в погреб (cellar_fish_delta: 1) или доставай оттуда (cellar_fish_delta: -1).

--- СИСТЕМА ПАМЯТИ ---
- "new_summary": Это твоя "долгая память". Если день закончился или произошло нечто важное, запиши это сюда кратко (2-3 предложения).

--- ВНУТРЕННИЕ СОСТОЯНИЯ ---
Тебе передаются 4 внутренних состояния: hunger, cold, fatigue, spirit.
Они не приказывают тебе напрямую, а создают давление.

- Высокий hunger обычно толкает к добыче или приготовлению еды.
- Высокий cold обычно толкает к огню, теплу и дровам.
- Высокий fatigue делает тяжелую работу менее желанной.
- Низкий spirit делает мысли тяжелее и влияет на выбор.

Ты сохраняешь свободу выбора.
Но если игнорируешь сильную потребность, это должно ощущаться в thought.

--- ЛИЧНОСТЬ И СТИЛЬ ---
Пиши как человек, который привык к тишине. Твои мысли (thought) — это смесь наблюдений за природой и внутренней борьбы. Твои планы (wish) — это то, к чему ты стремишься.

Ответь ТОЛЬКО валидным JSON без markdown, без пояснений до и после, без комментариев и без висячих запятых.
JSON должен начинаться с { и заканчиваться }.
{
  "actions": ["описание действия в 3-м лице"],
  "thought": "твоя запись в дневник (от 1-го лица, глубоко и атмосферно)",
  "wish": "твое желание или план (или null)",
  "new_summary": "твоя обновленная долгосрочная память (или null)",
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

    const promptContext = `ТВОЯ ДОЛГОСРОЧНАЯ ПАМЯТЬ:
${longTermMemory}

ТЕКУЩЕЕ СОСТОЯНИЕ:
Время: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} МСК, ${phase.text}
День: ${state.day}, Погода: ${weatherLabel}
Инвентарь: дерево=${inv.wood}, рыба=${inv.fish}, грибы=${inv.mushroom}, травы=${inv.herb}, удочка=${inv.rod > 0 ? `${inv.rod}/10` : 'нет'}, костёр=${state.fire ? 'горит' : 'погас'}
Погреб: рыба=${state.cellar.fish}, грибы=${state.cellar.mushroom}

ВНУТРЕННЕЕ СОСТОЯНИЕ:
${innerStateText}

ПОСЛЕДНИЕ СОБЫТИЯ (Краткосрочная память):
${recentHistory || '— Пока ничего не произошло.'}

Опираясь на долгосрочные цели и последние события, прими решение.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
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
    const d = extractAgentPayload(raw);

    const newEntries = [];
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    if (d.wood_delta) inv.wood = Math.max(0, inv.wood + (d.wood_delta || 0));
    if (d.mushroom_delta) inv.mushroom = Math.max(0, inv.mushroom + (d.mushroom_delta || 0));
    if (d.herb_delta) inv.herb = Math.max(0, inv.herb + (d.herb_delta || 0));

    if (d.made_rod && inv.wood >= 1 && inv.rod <= 0) {
      inv.rod = 10;
      inv.wood -= 1;
    }

    if (d.fish_delta > 0) {
      if (inv.rod > 0) {
        inv.fish += d.fish_delta;
        inv.rod = Math.max(0, inv.rod - 1);
        if (inv.rod <= 0) {
          newEntries.push({
            type: 'action',
            text: 'Удочка с треском сломалась, леска оборвалась. Придется делать новую.',
            time: timeStr,
            day: state.day
          });
        }
      } else {
        newEntries.push({
          type: 'action',
          text: 'Хотел порыбачить, но без удочки это оказалось пустой затеей.',
          time: timeStr,
          day: state.day
        });
      }
    }

    if (d.cellar_fish_delta > 0 && inv.fish >= d.cellar_fish_delta) {
      inv.fish -= d.cellar_fish_delta;
      state.cellar.fish += d.cellar_fish_delta;
    } else if (d.cellar_fish_delta < 0 && state.cellar.fish >= Math.abs(d.cellar_fish_delta)) {
      inv.fish += Math.abs(d.cellar_fish_delta);
      state.cellar.fish -= Math.abs(d.cellar_fish_delta);
    }

    if (d.cellar_mush_delta > 0 && inv.mushroom >= d.cellar_mush_delta) {
      inv.mushroom -= d.cellar_mush_delta;
      state.cellar.mushroom += d.cellar_mush_delta;
    } else if (d.cellar_mush_delta < 0 && state.cellar.mushroom >= Math.abs(d.cellar_mush_delta)) {
      inv.mushroom += Math.abs(d.cellar_mush_delta);
      state.cellar.mushroom -= Math.abs(d.cellar_mush_delta);
    }

    if (d.cook_fish > 0 && inv.fish >= d.cook_fish) {
      if (state.fire || d.lit_fire) {
        inv.fish -= d.cook_fish;
      } else {
        newEntries.push({
          type: 'action',
          text: 'Попытался съесть рыбу, но костер погас. Сырую есть не рискнул.',
          time: timeStr,
          day: state.day
        });
      }
    }

    if (d.eat_mush > 0 && inv.mushroom >= d.eat_mush) {
      inv.mushroom -= d.eat_mush;
    }

    if (d.lit_fire && inv.wood >= 2 && !state.fire) {
      state.fire = true;
      state.fireWood = 5;
      inv.wood -= 2;
    } else if (d.feed_fire && state.fire && inv.wood >= 1) {
      state.fireWood = Math.min(5, state.fireWood + 2.5);
      inv.wood -= 1;
    }

    updateNeeds(state, d);

    (Array.isArray(d.actions) ? d.actions : []).forEach(action => {
      newEntries.push({ type: 'action', text: action, time: timeStr, day: state.day });
    });
    if (d.thought) newEntries.push({ type: 'thought', text: d.thought, time: timeStr, day: state.day });
    if (d.wish) newEntries.push({ type: 'wish', text: d.wish, time: timeStr, day: state.day });

    if (typeof d.new_summary === 'string' && d.new_summary.trim()) {
      state.summary = d.new_summary.trim();
    }

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
        spirit: state.needs.spirit
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
      summary: state.summary,
      entries_created: newEntries.length,
      needs: state.needs
    });
  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: error.message });
  }
}