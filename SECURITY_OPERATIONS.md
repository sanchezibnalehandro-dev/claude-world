# Claude World manual visits: security operations

The public web page may be browsed without login, but paid AI calls are an **operator-only** action.

1. Set `AGENT_ACCESS_TOKEN` as an encrypted server-only Vercel Environment Variable for the intended deployment environment. Generate a unique, unpredictable 32+ character token. Example generation command: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never use `NEXT_PUBLIC_` or commit the token.
2. Keep `ANTHROPIC_API_KEY` server-only and configure spending limits and usage alerts at the provider. The per-instance 4/minute guard is *not* a globally enforced spending budget.
3. When you click **ВИЗИТ АГЕНТА** the browser asks for the private code. The code lives only in page memory until reload, not in URLs or localStorage.
4. `POST /api/agent` requires Bearer token, enforces a one-message bounded request, and selects a fixed Anthropic model and 700 output tokens. Without `AGENT_ACCESS_TOKEN`, it responds 503 and never calls the paid provider.
5. `GET /api/cron` requires existing `CRON_SECRET`. Without it the endpoint fails closed. Use a different secret from `AGENT_ACCESS_TOKEN`.
6. Before production release, test invalid/missing codes, valid operator visit, cron schedule, provider billing alerts, and rollback. The frontend still uses direct browser-to-Supabase calls; **review those RLS policies separately**.

**Known limitations:** password entry protects the paid endpoint but is not a multi-user login, and simple rate limiting is process-local. A compromised access code permits billable requests within these bounds until rotated. There is no unrestricted anonymous paid-agent mode.
