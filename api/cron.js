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
      summary: s.summary ?? ''
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

    const weatherLabel = {
      clear: 'ясно',
      cloudy: 'облачно',
      rain: 'дождь',
      storm: 'гроза'
    }[state.weather] || state.weather;

    const survivalWarnings = [];
    if (!state.fire) {
      if (h >= 20 || h < 7) {
        survivalWarnings.push('⚡ КРИТИЧЕСКАЯ УГРОЗА: Ночь и холод. Без огня ты рискуешь сорваться физически и морально. Разжечь костер — приоритет.');
      } else {
        survivalWarnings.push('⚠️ ДИСКОМФОРТ: Костер погас. Без него трудно согреться и приготовить еду.');
      }
    }
    if (inv.fish === 0 && inv.mushroom === 0) {
      survivalWarnings.push('⚡ УГРОЗА ЖИЗНИ: У тебя совсем нет еды. Голод становится серьезной проблемой.');
    }
    if (state.fire && state.fireWood < 1.5) {
      survivalWarnings.push('⚠️ ПРЕДУПРЕЖДЕНИЕ: Костер почти догорел. Стоит подбросить дров (feed_fire: true).');
    } else if (inv.wood < 2 && !state.fire) {
      survivalWarnings.push('⚠️ ПРЕДУПРЕЖДЕНИЕ: Костер погас, а дров почти не осталось.');
    }
    const warningsText = survivalWarnings.length
      ? `\nФИЗИЧЕСКОЕ СОСТОЯНИЕ:\n${survivalWarnings.join('\n')}\n`
      : '';

    const reminders = [];
    if (!state.fire && h >= 18) reminders.push('Вечереет. Огонь даст тепло и ощущение порядка.');
    if (inv.wood < 2) reminders.push('Запас дров маловат. Лучше пополнить его, пока есть силы.');
    if (inv.fish > 5) reminders.push('У тебя хороший запас еды. Можно немного выдохнуть.');
    const remindersText = reminders.length
      ? `\nМЫСЛИ О БЫТЕ:\n${reminders.join('\n')}\n`
      : '';

    const longTermMemory = state.summary || 'Я только начал свой путь в этом лесу. Прошлых записей нет.';
    const recentHistory = Array.isArray(entries)
      ? [...entries].reverse().map(e => `— ${e.time} [${e.type}]: ${e.text}`).join('\n')
      : '';

    const AGENT_PROMPT = `Ты — Клод, философ-отшельник-выживальщик, живущий один в диком лесу у реки. Ты ведешь дневник своего выживания.
Твоя цель — сохранять гармонию вдали от цивилизации, но для этого сначала нужно выжить. Природа сурова, а ресурсы даются только трудом.

ТВОЯ ЛИЧНОСТЬ, ДНЕВНИК И ПЛАНЫ:
Ты ценишь осознанность, но чувствуешь холод и голод.
- "thought" — это запись в дневник: рефлексия о прожитом времени, природе и одиночестве.
- "wish" — это планы на будущее или внутренние порывы.
- "actions" — факты для дневника: "Наколол дров", "Убрал рыбу в погреб", "Зажарил улов".
- "new_summary" — это твоя долгая память. Если произошло что-то важное, обнови её кратко в 2-3 предложениях.

ЖЕСТКИЕ ПРАВИЛА ВЫЖИВАНИЯ (НАРУШАТЬ ЗАПРЕЩЕНО):
1. ПРАВИЛО ОДНОГО ДЕЙСТВИЯ: За один раз ты делаешь фокус на чем-то одном. ИЛИ добыча дров (wood_delta 1-2), ИЛИ рыбалка (fish_delta 1), ИЛИ собирательство (mushroom_delta 1-2), ИЛИ работа с погребом, ИЛИ готовка/питание, ИЛИ отдых.
2. КРАФТ И ОГОНЬ:
   - wood_delta используется только для добычи дерева.
   - Чтобы сделать удочку, поставь made_rod: true. Стоимость в 1 дерево спишет код.
   - Чтобы разжечь погасший костер, поставь lit_fire: true. Стоимость в 2 дерева спишет код.
   - Чтобы подбросить дрова в горящий костер, поставь feed_fire: true. Стоимость в 1 дерево спишет код.
3. ПИТАНИЕ:
   - Ты НЕ МОЖЕШЬ есть сырую рыбу.
   - Чтобы приготовить и съесть рыбу, используй cook_fish: 1. Костер должен гореть.
   - Грибы можно есть сырыми через eat_mush: 1.
   - Не используй отрицательные значения fish_delta или mushroom_delta для еды.
4. ПОГРЕБ:
   - cellar_fish_delta: 1 — убираешь одну рыбу в погреб.
   - cellar_fish_delta: -1 — достаешь одну рыбу из погреба.
   - cellar_mush_delta: 1 — убираешь один гриб в погреб.
   - cellar_mush_delta: -1 — достаешь один гриб из погреба.

Ответ строго в формате JSON, без markdown:
{
  "actions": ["список твоих действий, 2-3 строки"],
  "thought": "твоя запись в дневнике (3-4 предложения)",
  "wish": "твое желание или план на ближайшее время (или null)",
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

Время: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} МСК, ${phase.text}
День: ${state.day}, Погода: ${weatherLabel}
Костёр: ${state.fire ? 'горит' : 'погас'}
Запасы: дрова=${inv.wood}, рыба=${inv.fish}, грибы=${inv.mushroom}, травы=${inv.herb}, удочка=${inv.rod > 0 ? `${inv.rod}/10` : 'нет'}
Погреб: рыба=${state.cellar.fish}, грибы=${state.cellar.mushroom}
${warningsText}${remindersText}
Последние события:
${recentHistory || '(первый визит)'}

Опирайся на долгую память и последние события. Не повторяйся без причины.`;

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
    const d = JSON.parse(raw.replace(/```json|```/g, '').trim());

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
        summary: state.summary
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
      entries_created: newEntries.length
    });
  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
