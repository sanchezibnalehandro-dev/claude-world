import test from 'node:test';
import assert from 'node:assert/strict';
import agent from '../api/agent.js';
import cron from '../api/cron.js';

function response() {
  return {
    code: 200, headers: {}, body: undefined,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('manual AI API blocks POST without calling paid provider', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected network request'); };
  try {
    for (const headers of [{}, { authorization: 'Bearer arbitrary' }]) {
      const res = response();
      await agent({ method: 'POST', headers, body: { model: 'arbitrary', max_tokens: 999999 } }, res);
      assert.equal(res.code, 410);
      assert.equal(res.headers['Cache-Control'], 'no-store');
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test('manual AI API rejects other methods', async () => {
  const res = response();
  await agent({ method: 'GET' }, res);
  assert.equal(res.code, 405);
});

test('cron fails closed without CRON_SECRET', async () => {
  const before = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const res = response();
    await cron({ method: 'GET', headers: {} }, res);
    assert.equal(res.code, 503);
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});

test('cron rejects unauthorized requests', async () => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    for (const authorization of [undefined, 'Bearer incorrect']) {
      const res = response();
      await cron({ method: 'GET', headers: { authorization } }, res);
      assert.equal(res.code, 401);
    }
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});

test('cron rejects unsupported methods', async () => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const res = response();
    await cron({ method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } }, res);
    assert.equal(res.code, 405);
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});
