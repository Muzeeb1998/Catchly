// Catchly smoke tests — Sections 1–4 of the manual QA plan, automated.
//
// Drives a real Chromium with the unpacked extension loaded via
// --load-extension. Verifies the must-pass-or-it's-broken paths before
// every Web Store submission:
//
//   1. Extension manifest loads, service worker boots, no console errors.
//   2. Popup renders, no JS exceptions, no third-party network requests.
//   3. chrome.storage.local roundtrip via the lib/storage.js API surface.
//   4. Brand-logo SVGs resolve from chrome-extension:// (no CDN regression).
//   5. Cloudflare waitlist worker accepts a POST from the extension origin
//      under the new CORS allowlist.
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
  // Persistent context is required for MV3 extensions — incognito-style
  // ephemeral contexts don't expose the service-worker target.
  context = await chromium.launchPersistentContext('', {
    headless: false, // MV3 extensions require headed mode in stable Chromium.
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  // Wait for the service worker so we can derive the extension id from its URL.
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});

test.afterAll(async () => {
  await context?.close();
});

test('1. popup renders with no console errors', async () => {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  // Give the popup a moment to render the bottom tabs + summary.
  await page.waitForSelector('.bottom-tabs', { timeout: 10_000 });

  expect(consoleErrors, `console errors during popup render:\n${consoleErrors.join('\n')}`).toEqual([]);
  await page.close();
});

test('2. options page renders', async () => {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForLoadState('domcontentloaded');
  expect(consoleErrors).toEqual([]);
  await page.close();
});

test('3. chrome.storage.local roundtrip', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

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

test('4. brand logos load from chrome-extension://, no CDN traffic', async () => {
  const page = await context.newPage();
  const offending = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('simpleicons.org') || u.includes('cdn.jsdelivr')) {
      offending.push(u);
    }
  });

  // Seed a sub so the popup actually renders a brand square.
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      subs_v1: [{
        id: 'smoke-1', name: 'Netflix', serviceKey: 'netflix',
        amount: 15.49, currency: 'USD', cycle: 'monthly',
        nextRenewal: Date.now() + 7 * 86400_000,
        status: 'active', color: '#E50914', schemaVersion: 1
      }]
    });
  });
  await page.reload();
  await page.waitForSelector('.brand-square', { timeout: 5000 });

  // Verify the <img> inside resolves to chrome-extension://
  const src = await page.locator('.brand-square img').first().getAttribute('src');
  expect(src).toMatch(/^chrome-extension:\/\//);
  expect(src).toContain('logos/netflix.svg');

  expect(offending, `unexpected third-party fetches:\n${offending.join('\n')}`).toEqual([]);

  // Clean up
  await page.evaluate(() => chrome.storage.local.remove('subs_v1'));
  await page.close();
});

test('5. waitlist worker accepts POST from extension origin', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Fetch from the extension origin so the Origin header is
  // chrome-extension://<id>, exercising the worker's CORS allowlist
  // (/^chrome-extension:\/\/[a-p]{32}$/).
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
