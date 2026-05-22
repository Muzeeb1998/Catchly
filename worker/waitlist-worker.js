// Catchly — waitlist signup worker.
//
// Endpoints
//   POST /signup     { email, source, version, dismissedCount }
//                    -> { ok: true } | { ok: false, error }
//   OPTIONS *        CORS preflight
//   any other route  404 { ok: false, error: 'not_found' }
//
// Storage: Workers KV namespace bound as `WAITLIST`.
// Keys:    signup:<timestamp>:<random8>
// Value:   JSON { email, source, version, dismissedCount, ts }
//
// Privacy: no IP, no user-agent, no headers persisted. Only what the
// client submits. Tighten ALLOWED_ORIGIN to your packed extension id
// once it's known (chrome-extension://<id>).

const ALLOWED_ORIGIN = '*';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400'
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS, ...extra }
  });
}

function clip(s, n) {
  return (s || '').toString().slice(0, n);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/signup') {
      return json({ ok: false, error: 'not_found' }, 404);
    }

    let payload;
    try { payload = await request.json(); }
    catch { return json({ ok: false, error: 'invalid_json' }, 400); }

    const email = clip(payload?.email, 254).trim().toLowerCase();
    if (!email || email.length < 3 || !EMAIL_RE.test(email)) {
      return json({ ok: false, error: 'invalid_email' }, 400);
    }

    const source = clip(payload?.source, 32) || 'unknown';
    const version = clip(payload?.version, 16) || 'unknown';
    const dismissedCount = Number.isFinite(payload?.dismissedCount) ? payload.dismissedCount : 0;
    const ts = Date.now();
    const rand = crypto.randomUUID().slice(0, 8);
    const key = `signup:${ts}:${rand}`;
    const value = JSON.stringify({ email, source, version, dismissedCount, ts });

    try {
      await env.WAITLIST.put(key, value);
      return json({ ok: true });
    } catch (err) {
      return json({ ok: false, error: 'storage_error' }, 500);
    }
  }
};
