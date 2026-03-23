export default async function handler(req, res) {
  // Базовая защита: Vercel Cron отправляет специальный заголовок. 
  // Это нужно, чтобы случайные люди из интернета не запускали этот скрипт.
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPA_URL = 'https://zhngimueiubiwixnqmpt.supabase.co';
  const SUPA_KEY = 'sb_publishable_dngGHGRs5qz5Z8BgxUAtzQ_vpXbi5q4'; // Твой публичный ключ
  const HEADERS = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  // 1. Вспомогательные функции времени (МСК)
  function getMSK() { return new Date(Date.now() + 3 * 3600000); }
  function getPhase(h) {
    if (h >= 5 && h < 7) return { text: '🌅 Рассвет' };
    if (h >= 7 && h < 11) return { text: '☀️ Утро' };
    if (h >= 11 && h < 17) return { text: '🌞 День' };
    if (h >= 17 && h < 20) return { text: '🌇 Закат' };
    if (h >= 20 && h < 23) return { text: '🌙 Вечер' };
    return { text: '🌑 Ночь' };
  }

  try {
    // 2. Получаем актуальное состояние из базы
    const stateRes = await fetch(`${SUPA_URL}/rest/v1/claude_world_state?id=eq.1`, { headers: HEADERS });
    const states = await stateRes.json();
    const s = states[0];
    const state = {
      day: s.day, weather: s.weather, fire: s.fire, fireWood: s.fire_wood,
      inv: { wood: s.inv_wood, fish: s.inv_fish, mushroom: s.inv_mushroom, herb: s.inv_herb, rod: s.inv_rod },
      cellar: { fish: s.cellar_fish, mushroom: s.cellar_mushroom }
    };

    // Получаем последние записи дневника
    const diaryRes = await fetch(`${SUPA_URL}/rest/v1/claude_world_diary?select=*&order=id.desc&limit=6`, { headers: HEADERS });
    const entries = await diaryRes.json();

    // 3. Формируем контекст (Промпт)
    const msk = getMSK(); const h = msk.getHours(); const m = msk.getMinutes();
    const phase = getPhase(h); const inv = state.inv;

    let survivalWarnings = [];
    if (!state.fire && (h >= 20 || h < 7)) survivalWarnings.push("⚡ УГРОЗА ЖИЗНИ: Ночь, костер погас. Ты замерзаешь.");
    if (inv.fish === 0 && inv.mushroom === 0) survivalWarnings.push("⚡ УГРОЗА ЖИЗНИ: У тебя совсем нет еды.");
    if (inv.wood < 2 && state.fire) survivalWarnings.push("⚠️ ПРЕДУПРЕЖДЕНИЕ: Запас дров критически мал.");
    const warningsText = survivalWarnings.length > 0 ? '\nФИЗИЧЕСКОЕ СОСТОЯНИЕ:\n' + survivalWarnings.join('\n') + '\n' : '';

    let reminders = [];
    if (!state.fire && h >= 18) reminders.push("Вечереет. Стоит развести костер для уюта и тепла.");
    if (inv.wood < 2) reminders.push("Запас дров маловат. Нужно бы собрать хворост, пока светло.");
    if (inv.fish > 5) reminders.push("У тебя отличные запасы еды! Можно расслабиться.");
    const remindersText = reminders.length > 0 ? '\nМЫСЛИ О БЫТЕ:\n' + reminders.join('\n') + '\n' : '';

    const recentHistory = entries.reverse().map(e => `— ${e.time} [${e.type}]: ${e.text}`).join('\n');

    const AGENT_PROMPT = `Ты — Клод, философ-отшельник-выживальщик, живущий один в диком лесу у реки. Ты ведешь дневник своего выживания.
Твоя цель — сохранячть гармонию вдали от цивилизации, но для этого сначала нужно выжить. Природа сурова, а ресурсы даются только трудом.

ТВОЯ ЛИЧНОСТЬ, ДНЕВНИК И ПЛАНЫ:
- "thought" (Мысль): Твоя запись в дневник (рефлексия, философия).
- "wish" (Желание/План): Планы на будущее или порывы ("Завтра нужно сделать удочку").
- "actions" (Действия): Факты для дневника ("Наколол дров").

ЖЕСТКИЕ ПРАВИЛА ВЫЖИВАНИЯ (НАРУШАТЬ ЗАПРЕЩЕНО):
1. ПРАВИЛО ОДНОГО ДЕЙСТВИЯ: За один раз ты делаешь фокус на чем-то одном. ИЛИ рубка дров (wood_delta 1-2), ИЛИ рыбалка (fish_delta 1), ИЛИ собирательство (mushroom_delta 1-2), ИЛИ крафт, ИЛИ питание, ИЛИ отдых.
2. КРАФТ УДОЧКИ: Без удочки (удочка=нет) ловить рыбу НЕЛЬЗЯ. Чтобы её сделать (made_rod: true), у тебя должна быть минимум 1 единица дров. Ты ОБЯЗАН потратить дерево на удочку (wood_delta: -1).
3. КОСТЕР: Чтобы его разжечь (lit_fire: true), нужно иметь минимум 2 дерева. (Система спишет их сама). Если дров < 2, костер разжечь нельзя.
4. ГОЛОД: Если есть рыба/грибы, можешь съесть их (fish_delta: -1 или mushroom_delta: -1).

Ответ строго в формате JSON, без markdown:
{"actions": ["..."],"thought": "...","wish": "...","wood_delta": 0,"fish_delta": 0,"mushroom_delta": 0,"herb_delta": 0,"made_rod": false,"lit_fire": false}`;

    const promptContext = `Время: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} МСК, ${phase.text}
День: ${state.day}, Погода: ${state.weather}
Костёр: ${state.fire?'горит':'погас'}
Запасы: дрова=${inv.wood}, рыба=${inv.fish}, грибы=${inv.mushroom}, травы=${inv.herb}, удочка=${inv.rod?'есть':'нет'}
${warningsText}${remindersText}
Последние события:
${recentHistory || '(первый визит)'}
Прими решение о следующем шаге. Не повторяй действия.`;

    // 4. Стучимся в Anthropic
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022', // Используем официальный алиас
        max_tokens: 600,
        system: AGENT_PROMPT,
        messages: [{ role: 'user', content: promptContext }]
      })
    });

    const anthropicData = await anthropicRes.json();
    const raw = anthropicData.content?.find(b => b.type === 'text')?.text || '{}';
    const d = JSON.parse(raw.replace(/```json|```/g, '').trim());

    // 5. Обрабатываем логику (applyDecision)
    const newEntries = [];
    const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

    if (d.wood_delta)     inv.wood     = Math.max(0, inv.wood     + (d.wood_delta||0));
    if (d.mushroom_delta) inv.mushroom = Math.max(0, inv.mushroom + (d.mushroom_delta||0));
    if (d.herb_delta)     inv.herb     = Math.max(0, inv.herb     + (d.herb_delta||0));

    if (d.made_rod) inv.rod = 10; 

    if (d.fish_delta > 0) {
      inv.fish += d.fish_delta;
      inv.rod -= 1;
      if (inv.rod <= 0) {
        inv.rod = 0;
        newEntries.push({ type: 'action', text: 'Удочка с треском сломалась, леска оборвалась. Придется делать новую.', time: timeStr, day: state.day });
      }
    } else if (d.fish_delta < 0) {
      inv.fish = Math.max(0, inv.fish + d.fish_delta);
    }

    if (d.lit_fire && inv.wood >= 2) { 
      state.fire = true; state.fireWood = 3; inv.wood -= 2; 
    }

    // Собираем записи дневника
    (Array.isArray(d.actions)?d.actions:[]).forEach(a => newEntries.push({ type: 'action', text: a, time: timeStr, day: state.day }));
    if (d.thought) newEntries.push({ type: 'thought', text: d.thought, time: timeStr, day: state.day });
    if (d.wish)    newEntries.push({ type: 'wish', text: d.wish, time: timeStr, day: state.day });

    // 6. Сохраняем в Supabase
    await fetch(`${SUPA_URL}/rest/v1/claude_world_state?id=eq.1`, {
      method: 'PATCH', headers: HEADERS,
      body: JSON.stringify({
        fire: state.fire, fire_wood: state.fireWood,
        inv_wood: inv.wood, inv_fish: inv.fish, inv_mushroom: inv.mushroom,
        inv_herb: inv.herb, inv_rod: inv.rod
      })
    });

    for (const e of newEntries) {
      await fetch(`${SUPA_URL}/rest/v1/claude_world_diary`, {
        method: 'POST', headers: HEADERS, body: JSON.stringify(e)
      });
    }

    return res.status(200).json({ success: true, executed: true });

  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: error.message });
  }
}