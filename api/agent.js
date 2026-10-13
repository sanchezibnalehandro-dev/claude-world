// Security hold: anonymous browser requests must not be forwarded to a billed AI API.
// Replacement requires server-side authentication and bounded, server-owned inputs.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(503).json({
    error: 'Manual agent visits are temporarily disabled while authenticated access is implemented.'
  });
}
