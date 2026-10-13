import { createHash, timingSafeEqual } from 'node:crypto';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 700;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 4;
let requestWindow = { startedAt: 0, count: 0 };
let activeRequests = 0;

function validAccessToken(candidate, expected) {
  if (typeof candidate !== 'string' || !candidate || !expected || expected.length < 32) return false;
  const hash = (value) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(hash(candidate), hash(expected));
}

function parseSafePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { system, messages } = body;
  if (typeof system !== 'string' || system.length < 100 || system.length > 6000 ||
      !Array.isArray(messages) || messages.length !== 1) return null;
  const entry = messages[0];
  if (!entry || entry.role !== 'user' || typeof entry.content !== 'string' ||
      entry.content.length < 50 || entry.content.length > 14000) return null;
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: entry.content }]
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail closed if the operator has not configured a strong secret.
  const secret = process.env.AGENT_ACCESS_TOKEN;
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: 'Manual visit access is not configured' });
  }

  const authorization = req.headers?.authorization;
  const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  if (!validAccessToken(bearer, secret)) {
    return res.status(401).json({ error: 'Invalid visit access code' });
  }

  const payload = parseSafePayload(req.body);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid visit payload' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Agent provider is not configured' });
  }

  // A per-instance safety brake. Set a provider-side monthly budget as the hard spend control.
  const now = Date.now();
  if (now - requestWindow.startedAt >= WINDOW_MS) {
    requestWindow = { startedAt: now, count: 0 };
  }
  if (requestWindow.count >= MAX_REQUESTS_PER_WINDOW || activeRequests > 0) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Manual visit rate limit reached' });
  }
  requestWindow.count++;
  activeRequests++;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35_000)
    });

    if (!response.ok) {
      console.error('Anthropic request failed', response.status);
      return res.status(502).json({ error: 'Agent provider request failed' });
    }
    let data;
    try {
      data = await response.json();
    } catch {
      return res.status(502).json({ error: 'Agent provider returned invalid JSON' });
    }
    if (!Array.isArray(data?.content)) {
      return res.status(502).json({ error: 'Agent provider returned an invalid response' });
    }
    return res.status(200).json({ content: data.content });
  } catch (error) {
    console.error('Agent provider transport error:', error?.name || 'unknown');
    return res.status(502).json({ error: 'Agent provider is unavailable' });
  } finally {
    activeRequests--;
  }
}
