// Manual visits are intentionally disabled. Never forward untrusted payloads to a billed API.
// The world and the separately authenticated cron endpoint remain available.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(410).json({ error: 'Manual agent visits are disabled' });
}
