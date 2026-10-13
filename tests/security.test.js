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

test('agent never forwards anonymous paid requests', async () => {
  const res = response();
  await agent({ method: 'POST', body: { model: 'fake', max_tokens: 1000000 } }, res);
  assert.equal(res.code, 503);
  assert.match(res.body.error, /disabled/i);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('agent rejects non-POST methods', async () => {
  const res = response();
  await agent({ method: 'GET' }, res);
  assert.equal(res.code, 405);
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
    for (const token of [undefined, 'Bearer wrong-token']) {
      const res = response();
      await cron({ method: 'GET', headers: { authorization: token } }, res);
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
