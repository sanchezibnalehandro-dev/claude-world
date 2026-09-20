const DEFAULT_SUPABASE_URL = 'https://zhngimueiubiwixnqmpt.supabase.co';

export function buildSupabaseHeaders(key, options = {}) {
  if (!key) {
    throw new Error('Supabase API key is required');
  }

  const headers = {
    apikey: key,
    'Content-Type': 'application/json'
  };

  // New sb_publishable_/sb_secret_ keys are not JWTs.
  // Legacy anon/service_role keys are JWTs and can be sent as Bearer tokens.
  if (!key.startsWith('sb_')) {
    headers.Authorization = `Bearer ${key}`;
  }

  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  return headers;
}

function getServerConfig() {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      'SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is not set'
    );
  }

  return { url, key };
}

async function requestJson(path, options = {}) {
  const { url, key } = getServerConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...buildSupabaseHeaders(key, { prefer: options.prefer }),
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase request failed: ${response.status} ${text.slice(0, 800)}`
    );
  }

  return text ? JSON.parse(text) : null;
}

export function mapDbRowToWorldState(row) {
  return {
    day: row.day,
    weather: row.weather,
    fire: row.fire,
    fireWood: row.fire_wood ?? 8,
    inv: {
      wood: row.inv_wood ?? 0,
      fish: row.inv_fish ?? 0,
      mushroom: row.inv_mushroom ?? 0,
      herb: row.inv_herb ?? 0,
      rod: row.inv_rod ?? 0
    },
    cellar: {
      fish: row.cellar_fish ?? 0,
      mushroom: row.cellar_mushroom ?? 0
    },
    summary: row.summary ?? '',
    location: row.location ?? 'hut',
    intent: {
      label: row.intent_label ?? 'держусь ближе к огню и собираю себя',
      focus: row.intent_focus ?? 'hut',
      horizon: row.intent_horizon ?? 'today',
      reason: row.intent_reason ?? 'у дома лучше слышно, чего на самом деле хочется',
      age: row.intent_age ?? 0
    },
    needs: {
      hunger: row.hunger ?? 20,
      cold: row.cold ?? 10,
      fatigue: row.fatigue ?? 15,
      spirit: row.spirit ?? 70
    }
  };
}

export function mapWorldStateToDbPatch(state) {
  return {
    fire: state.fire,
    fire_wood: state.fireWood,
    inv_wood: state.inv.wood,
    inv_fish: state.inv.fish,
    inv_mushroom: state.inv.mushroom,
    inv_herb: state.inv.herb,
    inv_rod: state.inv.rod,
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
  };
}

export async function loadWorldSnapshot() {
  const states = await requestJson(
    'claude_world_state?id=eq.1&select=*',
    { method: 'GET' }
  );

  if (!Array.isArray(states) || !states[0]) {
    throw new Error('State row id=1 was not found in claude_world_state');
  }

  const diary = await requestJson(
    'claude_world_diary?select=*&order=id.desc&limit=8',
    { method: 'GET' }
  );

  return {
    state: mapDbRowToWorldState(states[0]),
    recentEntries: Array.isArray(diary) ? diary : []
  };
}

export async function persistWorldSnapshot(state, entries) {
  await requestJson(
    'claude_world_state?id=eq.1',
    {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(mapWorldStateToDbPatch(state))
    }
  );

  for (const entry of entries) {
    await requestJson(
      'claude_world_diary',
      {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify(entry)
      }
    );
  }
}
