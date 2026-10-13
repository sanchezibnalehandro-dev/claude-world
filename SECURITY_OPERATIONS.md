# Security status: Claude World

## Manual visits

Manual **«Визит агента»** is disabled until the owner explicitly approves an authenticated implementation. The page control is disabled, and `POST /api/agent` always returns HTTP 410 without contacting Anthropic. Do not add a public unguarded proxy to restore the button.

## Automated visits

The separate `GET /api/cron` continues to require `CRON_SECRET` set in Vercel and the correct Bearer Authorization header; missing secrets fail closed. Verify cron triggers and database RLS separately.

## Production checklist

- Verify GitHub main commit and Vercel production deployment SHA match.
- Confirm no successful paid calls can be made to `/api/agent`.
- Check Anthropic API usage for unexpected historical charges; rotate API key if compromise is suspected.
- Configure provider-side billing limits/alerts.
- Review anonymous Supabase access and RLS separately.
- Keep any future restoration of manual visits in its own reviewed PR.
