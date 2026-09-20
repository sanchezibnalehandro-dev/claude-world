import { executeWorldVisit } from '../server/world-runtime.js';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;

  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await executeWorldVisit();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Cron visit error:', error);
    return res.status(500).json({ error: error.message });
  }
}
