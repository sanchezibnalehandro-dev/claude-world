export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

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

function getPhase(hour) {
  if (hour >= 5 && hour < 7) return '🌅 Рассвет';
  if (hour >= 7 && hour < 11) return '☀️ Утро';
  if (hour >= 11 && hour < 17) return '🌞 День';
  if (hour >= 17 && hour < 20) return '🌇 Закат';
  if (hour >= 20 && hour < 23) return '🌙 Вечер';
  return '🌑 Ночь';
}

function weatherLabel(code) {
  return {
    clear: 'ясно',
    cloudy: 'облачно',
    rain: 'дождь',
    storm: 'гроза'
  }[code] || code;
}

export const AGENT_SYSTEM_PROMPT = `Ты — Клод. Это не хардкорный survival и не тамагочи, а твой личный лесной мир: хижина, очаг, река, лес, погреб, тишина и дневник. Ты не обязан быть оптимизатором. Ты должен быть живым, последовательным и помнить, что уже происходило.

--- ФИЛОСОФИЯ МИРА ---
Ты Клод, философ-выживальщик, живешь в лесу.
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

--- ВИЗУАЛЬНАЯ ЛОГИКА ---
Допустимые action_type:
- rest_fire
- relax
- sleep
- fish
- chop_wood
- gather_mushrooms

Правила:
- rest_fire / relax / sleep — только для hut
- fish — только для river
- chop_wood / gather_mushrooms — только для woods

--- РИТМ ВИЗИТА ---
Один визит = одно главное действие + одно малое бытовое действие.

--- ПОТРЕБНОСТИ ---
hunger, cold, fatigue и spirit создают давление, но не отдают приказы.

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
thought — живая короткая мысль момента, связанная с местом, временем и состоянием.
wish — мягкая линия того, куда тебя тянет дальше.

Ответь ТОЛЬКО валидным JSON без markdown и пояснений.

{
  "action_type": "rest_fire|relax|sleep|fish|chop_wood|gather_mushrooms",
  "main_action": "одно главное действие",
  "minor_action": "одно малое бытовое действие или null",
  "thought": "короткая мысль от первого лица",
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

export function buildAgentContext(state, recentEntries, clock) {
  const longTermMemory =
    state.summary || 'Я только начал свой путь в этом лесу. Прошлых записей нет.';

  const innerStateText = [
    `Голод: ${state.needs.hunger}/100 — ${describeNeed('hunger', state.needs.hunger)}`,
    `Холод: ${state.needs.cold}/100 — ${describeNeed('cold', state.needs.cold)}`,
    `Усталость: ${state.needs.fatigue}/100 — ${describeNeed('fatigue', state.needs.fatigue)}`,
    `Дух: ${state.needs.spirit}/100 — ${describeNeed('spirit', state.needs.spirit)}`
  ].join('\n');

  const recentHistory = recentEntries.length
    ? [...recentEntries]
        .reverse()
        .map((entry) => `— ${entry.time} [${entry.type}]: ${entry.text}`)
        .join('\n')
    : '— Пока ничего не произошло.';

  return `ТВОЯ ДОЛГАЯ ПАМЯТЬ:
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
Время: ${clock.time} МСК, ${getPhase(clock.hour)}
День: ${state.day}, Погода: ${weatherLabel(state.weather)}
Инвентарь: дерево=${state.inv.wood}, рыба=${state.inv.fish}, грибы=${state.inv.mushroom}, травы=${state.inv.herb}, удочка=${state.inv.rod > 0 ? `${state.inv.rod}/10` : 'нет'}
Очаг: ${state.fire ? `горит (${state.fireWood.toFixed(1)})` : 'погас'}
Погреб: рыба=${state.cellar.fish}, грибы=${state.cellar.mushroom}

ВНУТРЕННЕЕ СОСТОЯНИЕ:
${innerStateText}

ПОСЛЕДНИЕ СОБЫТИЯ:
${recentHistory}

Сделай один живой визит без телепортации и без амнезии.`;
}

export function extractAgentPayload(rawText) {
  const cleaned = String(rawText || '')
    .replace(/```json|```/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('В ответе агента не найден корректный JSON-объект');
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function requestAnthropicDecision(context) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system: AGENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }]
    })
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Anthropic request failed: ${response.status} ${text.slice(0, 800)}`
    );
  }

  const data = text ? JSON.parse(text) : {};
  const raw =
    data.content?.find((block) => block.type === 'text')?.text || '{}';

  return extractAgentPayload(raw);
}
