// Catchly smoke tests — Sections 1–4 of the manual QA plan, plus dedicated
// coverage for the v0.1.0 onboarding overlay + What's-New info icon.
//
// Drives a real Chromium with the unpacked extension loaded via
// --load-extension. Tests run sequentially in a single persistent context so
// state-bleed between tests is explicit (each test resets the storage keys
// it cares about in its own setup).
//
// Limits (documented, not bugs):
//   - chrome.notifications fires but the OS toast doesn't render headlessly.
//   - chrome.alarms doesn't run on real time in tests; we exercise the
//     scheduling code path without waiting for the alarm to fire.
//   - The extension id Playwright assigns to an unpacked load differs from
//     the id Chrome Web Store will assign on packed submission. The worker
//     CORS regex /^chrome-extension:\/\/[a-p]{32}$/ accepts both since the
//     dev id Chrome generates also uses the a–p alphabet.

import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');

const WORKER_URL = 'https://catchly-waitlist.catchly-dev.workers.dev/signup';

let context;
let extensionId;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});

test.afterAll(async () => {
  await context?.close();
});

// Open a fresh popup page with the storage state we want before the
// document evaluates popup.js. Playwright doesn't expose chrome-extension://
// init scripts, so we open the page, immediately seed storage, then reload
// so the controllers re-run against the seeded state.
async function openPopupWith(state) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(async (s) => {
    await new Promise((r) => chrome.storage.local.clear(r));
    if (Object.keys(s).length) {
      await new Promise((r) => chrome.storage.local.set(s, r));
    }
  }, state);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  return page;
}

// =============================================================================
// SECTION A — original five smoke tests (pre-existing functionality)
// =============================================================================

test('A1. popup renders with no console errors', async () => {
  const page = await openPopupWith({ onboardingCompleted: true, lastSeenUpdate: 'gmail-scan-v1' });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.waitForSelector('.bottom-tabs', { timeout: 10_000 });

  expect(consoleErrors, `console errors during popup render:\n${consoleErrors.join('\n')}`).toEqual([]);
  await page.close();
});

test('A2. options page renders', async () => {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForLoadState('domcontentloaded');
  expect(consoleErrors).toEqual([]);
  await page.close();
});

test('A3. chrome.storage.local roundtrip', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  const writeRead = await page.evaluate(async () => {
    const test = { hello: 'world', n: 42 };
    await chrome.storage.local.set({ __smoke: test });
    const got = await chrome.storage.local.get('__smoke');
    await chrome.storage.local.remove('__smoke');
    return got.__smoke;
  });
  expect(writeRead).toEqual({ hello: 'world', n: 42 });
  await page.close();
});

test('A4. brand logos load from chrome-extension://, no CDN traffic', async () => {
  const page = await openPopupWith({
    onboardingCompleted: true,
    lastSeenUpdate: 'gmail-scan-v1',
    subs_v1: [{
      id: 'smoke-1', name: 'Netflix', serviceKey: 'netflix',
      amount: 15.49, currency: 'USD', cycle: 'monthly',
      nextRenewal: Date.now() + 7 * 86400_000,
      status: 'active', color: '#E50914', schemaVersion: 1
    }]
  });
  const offending = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('simpleicons.org') || u.includes('cdn.jsdelivr')) {
      offending.push(u);
    }
  });
  // Trigger a render pass for the seeded sub.
  await page.reload();
  await page.waitForSelector('.brand-square', { timeout: 5000 });

  const src = await page.locator('.brand-square img').first().getAttribute('src');
  expect(src).toMatch(/^chrome-extension:\/\//);
  expect(src).toContain('logos/netflix.svg');
  expect(offending, `unexpected third-party fetches:\n${offending.join('\n')}`).toEqual([]);
  await page.close();
});

test('A5. waitlist worker accepts POST from extension origin', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  const result = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `smoke-${Date.now()}@catchly.test`,
          source: 'playwright_smoke',
          version: '0.1.0',
          dismissedCount: 0
        })
      });
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  }, WORKER_URL);
  expect(result.ok, `worker rejected: ${JSON.stringify(result)}`).toBe(true);
  expect(result.body?.ok).toBe(true);
  await page.close();
});

// =============================================================================
// SECTION B — onboarding overlay (first-run, 3 screens)
// =============================================================================

test('B1. fresh install shows onboarding on screen 1', async () => {
  const page = await openPopupWith({});  // no flags set
  await page.waitForSelector('#onboard-overlay:not([hidden])', { timeout: 5000 });

  const visibleStep = await page.evaluate(() => {
    const s = document.querySelector('.onboard-screen:not([hidden])');
    return s ? s.dataset.onboardStep : null;
  });
  expect(visibleStep).toBe('1');

  const activeDots = await page.locator('.onboard-screen:not([hidden]) .onboard-dot.is-active').count();
  expect(activeDots).toBe(1);
  await page.close();
});

test('B2. "Get started" advances to screen 2', async () => {
  const page = await openPopupWith({});
  await page.waitForSelector('#onboard-overlay:not([hidden])');

  await page.locator('.onboard-screen:not([hidden]) [data-onboard-action="next"]').click();
  await page.waitForFunction(() => {
    const s = document.querySelector('.onboard-screen:not([hidden])');
    return s && s.dataset.onboardStep === '2';
  }, { timeout: 2000 });
  await page.close();
});

test('B3. "Back" returns to screen 1', async () => {
  const page = await openPopupWith({});
  await page.waitForSelector('#onboard-overlay:not([hidden])');
  await page.locator('.onboard-screen:not([hidden]) [data-onboard-action="next"]').click();
  await page.waitForFunction(() => {
    const s = document.querySelector('.onboard-screen:not([hidden])');
    return s && s.dataset.onboardStep === '2';
  });
  await page.locator('.onboard-screen:not([hidden]) [data-onboard-action="back"]').click();
  await page.waitForFunction(() => {
    const s = document.querySelector('.onboard-screen:not([hidden])');
    return s && s.dataset.onboardStep === '1';
  }, { timeout: 2000 });
  await page.close();
});

test('B4. "Skip" dismisses overlay and writes flag', async () => {
  const page = await openPopupWith({});
  await page.waitForSelector('#onboard-overlay:not([hidden])');
  await page.locator('[data-onboard-action="skip"]').click();
  await page.waitForFunction(() => document.getElementById('onboard-overlay')?.hidden === true, null, { timeout: 2000 });

  const flag = await page.evaluate(() => chrome.storage.local.get('onboardingCompleted'));
  expect(flag.onboardingCompleted).toBe(true);
  await page.close();
});

test('B5. "Start using Catchly" on screen 3 dismisses + writes flag', async () => {
  const page = await openPopupWith({});
  await page.waitForSelector('#onboard-overlay:not([hidden])');
  await page.locator('.onboard-screen:not([hidden]) [data-onboard-action="next"]').click();
  await page.waitForFunction(() => {
    const s = document.querySelector('.onboard-screen:not([hidden])');
    return s && s.dataset.onboardStep === '2';
  });
  await page.locator('.onboard-screen:not([hidden]) [data-onboard-action="next"]').click();
  await page.waitForFunction(() => {
    const s = document.querySelector('.onboard-screen:not([hidden])');
    return s && s.dataset.onboardStep === '3';
  });
  await page.locator('[data-onboard-action="complete"]').click();
  await page.waitForFunction(() => document.getElementById('onboard-overlay')?.hidden === true, null, { timeout: 2000 });

  const flag = await page.evaluate(() => chrome.storage.local.get('onboardingCompleted'));
  expect(flag.onboardingCompleted).toBe(true);
  await page.close();
});

test('B6. completed flag suppresses overlay on subsequent opens', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.waitForLoadState('domcontentloaded');
  // Overlay should remain hidden — no timing race because applyTheme +
  // OnboardingController.init both fire on DOMContentLoaded.
  await page.waitForTimeout(200);
  const isHidden = await page.locator('#onboard-overlay').evaluate(el => el.hidden);
  expect(isHidden).toBe(true);
  await page.close();
});

test('B7. Esc key triggers skip behavior', async () => {
  const page = await openPopupWith({});
  await page.waitForSelector('#onboard-overlay:not([hidden])');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('onboard-overlay')?.hidden === true, null, { timeout: 2000 });
  const flag = await page.evaluate(() => chrome.storage.local.get('onboardingCompleted'));
  expect(flag.onboardingCompleted).toBe(true);
  await page.close();
});

test('B8. main UI is interactable after completion', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.waitForSelector('.bottom-tabs');
  // Confirm no element of the overlay blocks the tabs.
  await page.locator('.tab[data-tab="settings"]').click();
  await page.waitForSelector('.pane[data-pane="settings"].active');
  await page.close();
});

// =============================================================================
// SECTION C — What's New info icon + popover
// =============================================================================

test('C1. info icon shows dot when unseen', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.waitForSelector('#updates-info-btn[data-has-update="true"]', { timeout: 3000 });
  await page.close();
});

test('C2. info icon hides dot when lastSeenUpdate matches', async () => {
  const page = await openPopupWith({ onboardingCompleted: true, lastSeenUpdate: 'gmail-scan-v1' });
  await page.waitForSelector('#updates-info-btn');
  await page.waitForTimeout(200); // let the async init resolve
  const hasUpdate = await page.locator('#updates-info-btn').getAttribute('data-has-update');
  expect(hasUpdate).toBeNull();
  await page.close();
});

test('C3. clicking info icon opens popover and clears dot', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.waitForSelector('#updates-info-btn[data-has-update="true"]');

  await page.locator('#updates-info-btn').click();
  await page.waitForSelector('#updates-popover:not([hidden])', { timeout: 2000 });
  await page.waitForSelector('#updates-popover.is-open', { timeout: 2000 });

  // Popover content present
  const headline = await page.locator('.updates-item-title').first().textContent();
  expect(headline).toBe('Gmail auto-scan');

  // Dot gone + storage updated
  await page.waitForFunction(() => {
    const btn = document.getElementById('updates-info-btn');
    return btn && !btn.hasAttribute('data-has-update');
  });
  const stored = await page.evaluate(() => chrome.storage.local.get('lastSeenUpdate'));
  expect(stored.lastSeenUpdate).toBe('gmail-scan-v1');
  await page.close();
});

test('C4. close button dismisses popover', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.locator('#updates-info-btn').click();
  await page.waitForSelector('#updates-popover.is-open');

  await page.locator('#updates-popover-close').click();
  await page.waitForFunction(() => !document.getElementById('updates-popover').classList.contains('is-open'));
  await page.close();
});

test('C5. Esc closes popover', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.locator('#updates-info-btn').click();
  await page.waitForSelector('#updates-popover.is-open');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('updates-popover').classList.contains('is-open'));
  await page.close();
});

test('C6. outside click closes popover', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.locator('#updates-info-btn').click();
  await page.waitForSelector('#updates-popover.is-open');

  // Dispatch a synthetic outside click. We use evaluate rather than .click()
  // because the popover overlays the summary strip and Playwright would
  // intercept the click on the popover itself. The real-world equivalent is
  // a user clicking anywhere outside the popover; capture-phase listeners
  // fire either way.
  await page.evaluate(() => {
    const tabs = document.querySelector('.bottom-tabs');
    const r = tabs.getBoundingClientRect();
    const ev = new MouseEvent('click', {
      bubbles: true, cancelable: true,
      clientX: r.left + 4, clientY: r.top + 4
    });
    tabs.dispatchEvent(ev);
  });
  await page.waitForFunction(() => !document.getElementById('updates-popover').classList.contains('is-open'));
  await page.close();
});

test('C7. rapid clicks on info icon don\'t stack popovers', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  const btn = page.locator('#updates-info-btn');
  for (let i = 0; i < 6; i++) await btn.click({ force: true });
  // Should still be a single popover and a deterministic open/closed state.
  const count = await page.locator('.updates-popover').count();
  expect(count).toBe(1);
  await page.close();
});

test('C8. CTA does not navigate the popup itself', async () => {
  const page = await openPopupWith({ onboardingCompleted: true });
  await page.locator('#updates-info-btn').click();
  await page.waitForSelector('#updates-popover.is-open');

  const urlBefore = page.url();
  // chrome.tabs.create opens in a new tab — the popup's own URL must not change.
  await page.locator('.updates-item-cta').click();
  await page.waitForTimeout(150);
  expect(page.url()).toBe(urlBefore);
  await page.close();
});

// =============================================================================
// SECTION D — integration / regression
// =============================================================================

test('D1. existing storage keys unchanged after onboarding completion', async () => {
  const page = await openPopupWith({
    subs_v1: [{ id: 'd1', name: 'Spotify', serviceKey: 'spotify', amount: 10, currency: 'USD', cycle: 'monthly', nextRenewal: Date.now() + 86400_000, status: 'active', schemaVersion: 1 }]
  });
  await page.waitForSelector('#onboard-overlay:not([hidden])');
  await page.locator('[data-onboard-action="skip"]').click();
  await page.waitForFunction(() => document.getElementById('onboard-overlay')?.hidden === true, null, { timeout: 5000 });

  const after = await page.evaluate(() => chrome.storage.local.get(['subs_v1', 'onboardingCompleted']));
  expect(after.onboardingCompleted).toBe(true);
  expect(Array.isArray(after.subs_v1)).toBe(true);
  expect(after.subs_v1.length).toBe(1);
  await page.close();
});
