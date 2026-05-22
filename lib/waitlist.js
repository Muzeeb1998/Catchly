// lib/waitlist.js — early-access email signup + behavioral re-prompt system.
//
// Behavioral model (read this before changing trigger logic):
//   - Show at moments of demonstrated value, not at moments of friction.
//   - Max 3 lifetime exposures per user. Period.
//   - Permanent opt-out always wins. If a user says "Not interested",
//     never ask again.
//   - The first 24h after install is a no-prompt window. Let people
//     explore before we ask anything.
//   - Same surface (toast/inline/banner) cannot repeat back-to-back.
//
// The always-available surfaces (welcome card, settings card) do NOT go
// through shouldShowWaitlistPrompt — they are explicit user choices.
// Only the three behavioral re-prompts (third_sub, after_capture,
// fallback) are gated by the evaluator.
//
// Endpoint: Cloudflare Worker. WAITLIST_ENDPOINT is empty until the
// worker is deployed (Part C). While empty, submitEmail() degrades to a
// local-only success so the UI is verifiable end-to-end.

// ----------------------------------------------------------------------------
// constants
// ----------------------------------------------------------------------------
const WAITLIST_KEY = 'waitlist_state';
const VERSION = '0.1.0';

// Cloudflare Worker endpoint (Part C). Deploy the worker in `worker/` per
// worker/README.md, then paste the live URL here, e.g.
//   'https://subscription-sentry-waitlist.<your-subdomain>.workers.dev/signup'
// While empty, submitEmail writes state locally and resolves
// { ok: true, localOnly: true } so the UI stays verifiable offline.
export const WAITLIST_ENDPOINT = '';

const MAX_EXPOSURES = 3;
const MIN_EXPOSURE_GAP_MS = 7 * 24 * 3600_000;   // 7 days
const NO_PROMPT_WINDOW_MS = 24 * 3600_000;       // first 24h
const SUBMIT_TIMEOUT_MS = 8000;

// Maps trigger source -> the surface it renders to. Used by rule #6
// (don't re-show the same surface back-to-back).
const SURFACE_BY_SOURCE = {
  third_sub: 'toast',
  after_capture: 'inline',
  fallback: 'banner',
  welcome: 'welcome_card',
  settings: 'settings_card'
};

// ----------------------------------------------------------------------------
// COPY — all user-facing strings live here so they can be tuned without
// touching the surfaces. Keep tone calm; lead with the user's problem.
// ----------------------------------------------------------------------------
export const COPY = {
  // Welcome screen card (Part A1)
  welcome: {
    eyebrow: 'COMING IN v1.0',
    title: 'Auto-scan from Gmail',
    body: 'Find every subscription you\'re paying for in 15 seconds. Receipts parsed locally — your emails never leave your device.',
    cta: 'Get early access',
    placeholder: 'you@example.com',
    incentive: 'Early users get one free month of Pro at launch.',
    privacy: 'Stored only to notify you at launch. Nothing else.',
    meanwhile: 'meanwhile',
    manualCta: 'Add subscriptions manually',
    sampleCta: 'Try with sample data',
    note: 'Catchly also auto-detects sign-ups when you visit checkout pages on supported services.'
  },

  // Settings card (Part A2) — persistent, always available
  settings: {
    eyebrow: 'GMAIL AUTO-SCAN',
    title: 'Find every sub in 15 seconds',
    body: 'Local parsing — emails never leave your device.',
    status: 'in development',
    cta: 'Notify me',
    placeholder: 'you@example.com',
    privacy: 'Stored only to notify you at launch. Nothing else.'
  },

  // Behavioral surfaces (Part B — defined now so all copy lives in one place)
  thirdSub: {
    title: 'Three down — and we have a sense there\'s more.',
    body: 'Gmail auto-scan finds every sub in 15 seconds.',
    cta: 'Notify me',
    placeholder: 'you@example.com',
    dismissHard: 'Not interested',
    privacy: 'Stored only to notify you at launch. Nothing else.'
  },
  afterCapture: {
    title: 'That capture? Imagine doing it for every sub at once.',
    body: 'Gmail auto-scan finds every subscription in 15 seconds. Local parsing — emails stay on your device.',
    cta: 'Notify me',
    placeholder: 'you@example.com',
    dismissHard: 'Not interested',
    privacy: 'Stored only to notify you at launch. Nothing else.'
  },
  fallback: {
    title: 'Find subs you\'ve forgotten about',
    body: 'Gmail auto-scan is coming. Get early access.',
    cta: 'Notify me'
  },

  // Confirmed state — shown after a successful submission anywhere
  confirmed: {
    title: 'You\'re on the list',
    body: 'We\'ll email you when Gmail auto-scan launches.',
    change: 'Change email'
  },

  // Inline errors
  errors: {
    invalidEmail: 'That doesn\'t look like a valid email.',
    networkTimeout: 'Network timed out. Try again in a moment.',
    serverError: 'Something went wrong. Try again in a moment.',
    offline: 'You appear to be offline.'
  }
};

// ----------------------------------------------------------------------------
// state read / write
// ----------------------------------------------------------------------------
const DEFAULT_STATE = {
  email: null,
  submittedAt: null,
  submittedFrom: null,
  exposures: [],
  dismissedPermanently: false,
  firstUseTs: null
};

export async function getWaitlistState() {
  const res = await chrome.storage.local.get(WAITLIST_KEY);
  const s = res[WAITLIST_KEY] || {};
  return { ...DEFAULT_STATE, ...s };
}

export async function setWaitlistState(patch) {
  const cur = await getWaitlistState();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [WAITLIST_KEY]: next });
  return next;
}

// Called the first time the popup opens. Idempotent.
export async function markFirstUseIfUnset() {
  const s = await getWaitlistState();
  if (s.firstUseTs) return s;
  return await setWaitlistState({ firstUseTs: Date.now() });
}

// ----------------------------------------------------------------------------
// trigger evaluator
// ----------------------------------------------------------------------------
// Returns true only when the rules in PART B-2 of the spec all hold.
export async function shouldShowWaitlistPrompt(triggerSource) {
  const s = await getWaitlistState();

  // 1. User has not signed up
  if (s.email) return false;
  // 2. Not permanently dismissed
  if (s.dismissedPermanently) return false;
  // 3. 24h+ since first popup use (and firstUseTs must be set at all)
  if (!s.firstUseTs) return false;
  if (Date.now() - s.firstUseTs < NO_PROMPT_WINDOW_MS) return false;
  // 4. Lifetime exposure cap — count only 'shown' entries so a single prompt
  //    (shown + dismissed_soft) doesn't burn two slots.
  const shownCount = s.exposures.filter(e => e.outcome === 'shown').length;
  if (shownCount >= MAX_EXPOSURES) return false;
  // 5. 7 day gap since most recent exposure
  if (s.exposures.length > 0) {
    const last = s.exposures[s.exposures.length - 1];
    if (Date.now() - last.ts < MIN_EXPOSURE_GAP_MS) return false;
    // 6. If last outcome was 'dismissed_soft', different surface required
    if (last.outcome === 'dismissed_soft') {
      const wantSurface = SURFACE_BY_SOURCE[triggerSource];
      if (last.surface === wantSurface) return false;
    }
  }
  return true;
}

// Log every prompt shown OR dismissed OR submitted.
// outcome ∈ 'shown' | 'dismissed_soft' | 'dismissed_hard' | 'submitted'
export async function logExposure({ surface, outcome }) {
  const s = await getWaitlistState();
  const exposures = [...s.exposures, { surface, outcome, ts: Date.now() }];
  const patch = { exposures };
  if (outcome === 'dismissed_hard') patch.dismissedPermanently = true;
  return await setWaitlistState(patch);
}

// ----------------------------------------------------------------------------
// email validation
// ----------------------------------------------------------------------------
// Simple RFC-5322-ish check — good enough for client-side gate.
// The Cloudflare Worker re-validates server-side (Part C).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s) {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

// ----------------------------------------------------------------------------
// submission
// ----------------------------------------------------------------------------
// Validates, posts to Worker if endpoint configured, writes state on success.
// Returns { ok: true, state } or { ok: false, error: <code> }.
export async function submitEmail({ email, source }) {
  const clean = (email || '').trim().toLowerCase();
  if (!isValidEmail(clean)) {
    return { ok: false, error: 'invalidEmail' };
  }

  const state = await getWaitlistState();
  const dismissedCount = state.exposures.filter(e =>
    e.outcome === 'dismissed_soft' || e.outcome === 'dismissed_hard'
  ).length;

  // No endpoint yet -> local-only success. Part C will set WAITLIST_ENDPOINT.
  if (!WAITLIST_ENDPOINT) {
    const next = await setWaitlistState({
      email: clean,
      submittedAt: Date.now(),
      submittedFrom: source
    });
    await logExposure({ surface: SURFACE_BY_SOURCE[source] || source, outcome: 'submitted' });
    console.warn('[waitlist] No endpoint configured — saved locally only.');
    return { ok: true, state: next, localOnly: true };
  }

  // Real submit with 8s timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const res = await fetch(WAITLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: clean,
        source,
        version: VERSION,
        dismissedCount
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: 'serverError' };
    }
    const data = await res.json().catch(() => ({}));
    if (data && data.ok === false) {
      return { ok: false, error: 'serverError' };
    }
    const next = await setWaitlistState({
      email: clean,
      submittedAt: Date.now(),
      submittedFrom: source
    });
    await logExposure({ surface: SURFACE_BY_SOURCE[source] || source, outcome: 'submitted' });
    return { ok: true, state: next };
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') return { ok: false, error: 'networkTimeout' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, error: 'offline' };
    }
    return { ok: false, error: 'serverError' };
  }
}

// ----------------------------------------------------------------------------
// utility — wipe state (used by options "Wipe everything" button)
// ----------------------------------------------------------------------------
export async function resetWaitlistState() {
  await chrome.storage.local.remove(WAITLIST_KEY);
}
