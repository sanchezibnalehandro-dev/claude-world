import test from 'node:test';
import assert from 'node:assert/strict';
import agent from '../api/agent.js';
import cron from '../api/cron.js';

const ADMIN_TOKEN = 'test-owner-token-at-least-32-characters-long';
const HEADER = { authorization: `Bearer ${ADMIN_TOKEN}` };
const originalToken = process.env.AGENT_ACCESS_TOKEN;
const originalKey = process.env.ANTHROPIC_API_KEY;
const originalFetch = globalThis.fetch;
const goodBody = {
  system: 'A'.repeat(200),
  messages: [{ role: 'user', content: 'B'.repeat(200) }]
};
function response() {
  return {
    code: 200, headers: {}, body: undefined,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('manual agent rejects methods other than POST', async () => {
  const res = response();
  await agent({ method: 'GET' }, res);
  assert.equal(res.code, 405);
});
test('agent refuses to run without a configured access token', async () => {
  delete process.env.AGENT_ACCESS_TOKEN;
  const res = response();
  try {
    await agent({ method: 'POST', headers: {}, body: goodBody }, res);
    assert.equal(res.code, 503);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  } finally {
    if (originalToken === undefined) delete process.env.AGENT_ACCESS_TOKEN;
    else process.env.AGENT_ACCESS_TOKEN = originalToken;
  }
});
test('anonymous and incorrect credentials cannot call paid upstream', async () => {
  process.env.AGENT_ACCESS_TOKEN = ADMIN_TOKEN;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected upstream call'); };
  try {
    for (const headers of [{}, { authorization: 'Bearer incorrect' }]) {
      const res = response();
      await agent({ method: 'POST', headers, body: goodBody }, res);
      assert.equal(res.code, 401);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.AGENT_ACCESS_TOKEN;
    else process.env.AGENT_ACCESS_TOKEN = originalToken;
  }
});
test('authenticated input is restricted to one bounded request', async () => {
  process.env.AGENT_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ANTHROPIC_API_KEY = 'test-only-provider-key';
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected upstream call'); };
  try {
    for (const body of [
      { system: 'A'.repeat(10000), messages: goodBody.messages },
      { system: goodBody.system, messages: Array(30).fill({ role: 'user', content: 'B'.repeat(200) }) },
      { system: goodBody.system, messages: [{ role: 'assistant', content: 'B'.repeat(200) }] }
    ]) {
      const res = response();
      await agent({ method: 'POST', headers: HEADER, body }, res);
      assert.equal(res.code, 400);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.AGENT_ACCESS_TOKEN;
    else process.env.AGENT_ACCESS_TOKEN = originalToken;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});
test('authorized call uses only the fixed model and bounded tokens', async () => {
  process.env.AGENT_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ANTHROPIC_API_KEY = 'test-only-provider-key';
  let forwarded;
  globalThis.fetch = async (_url, options) => {
    forwarded = JSON.parse(options.body);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"thought":"ok"}' }] }) };
  };
  try {
    const res = response();
    await agent({
      method: 'POST', headers: HEADER,
      body: { ...goodBody, model: 'claude-ultra-billed-model', max_tokens: 1000000, tools: [{ type: 'web_search' }] }
    }, res);
    assert.equal(res.code, 200);
    assert.equal(forwarded.model, 'claude-haiku-4-5-20251001');
    assert.equal(forwarded.max_tokens, 700);
    assert.deepEqual(Object.keys(forwarded).sort(), ['max_tokens', 'messages', 'model', 'system']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.AGENT_ACCESS_TOKEN;
    else process.env.AGENT_ACCESS_TOKEN = originalToken;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});
test('cron refuses to start when CRON_SECRET is missing', async () => {
  const old = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const res = response();
    await cron({ method: 'GET', headers: {} }, res);
    assert.equal(res.code, 503);
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});
test('cron rejects missing or incorrect authorization', async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret-at-least-32-characters-long';
  try {
    for (const authorization of [undefined, 'Bearer wrong-token']) {
      const res = response();
      await cron({ method: 'GET', headers: { authorization } }, res);
      assert.equal(res.code, 401);
    }
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});
test('cron rejects methods other than GET', async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret-at-least-32-characters-long';
  try {
    const res = response();
    await cron({ method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }, res);
    assert.equal(res.code, 405);
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});
