# Subscription Sentry

A privacy-first Chrome extension that tracks your subscriptions without ever asking for your bank login. Detects sign-ups on supported services, warns you before renewals, flags price hikes, and shows you exactly where to cancel.

This is an MVP starter — built to be loaded, used, and forked. Not a polished product yet.

---

## Install (60 seconds)

1. Open `chrome://extensions/` in Chrome, Brave, or Edge.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this folder.
4. The Sentry icon appears in your toolbar. Click the puzzle-piece icon and **pin Sentry** so the renewal-countdown badge is always visible.
5. On first install a welcome tab opens with a "Load sample data" button — recommended for a quick tour.
6. When Chrome asks, **allow notifications** so renewal/trial reminders work.

---

## What's actually working

All 12 features from the v1 starter kit are functional code, not stubs:

| # | Feature | Where to see it |
|---|---------|-----------------|
| 1 | **Auto-detect on checkout** | Visit `netflix.com/signup`, `spotify.com/premium`, `chatgpt.com`, etc. — a toast appears in the corner. |
| 2 | **One-click manual add** | Click the `+` icon in the popup. Quick-pick known services or enter manually. |
| 3 | **Smart reminders** | Notifications fire 7/3/1 days before renewal (configurable in Settings). |
| 4 | **Spending dashboard** | Popup shows monthly / yearly / active-count summary. |
| 5 | **Local-only storage** | All data in `chrome.storage.local`. No network calls. Verify in DevTools. |
| 6 | **Merchant normalization** | 21 services with aliases — "GOOGLE *YOUTUBE PREMIUM" maps cleanly. |
| 7 | **Price-hike alerts** | Sample data includes a Netflix hike ($22.99 → $24.99). See the alert strip + drawer warning. |
| 8 | **Shadow-charge detector** | Sample data includes Audible last-visited 87 days ago + renewing in 11d. Open Audible's detail drawer. |
| 9 | **Guided cancel** | Detail drawer → "Open cancel page" deep-links straight to the cancel URL + shows step-by-step. |
| 10 | **Trial countdown badge** | Pin the icon — the badge shows days to most-urgent renewal, color-coded green→amber→rust. |
| 11 | **Duplicate detection** | Try tracking Netflix twice — Sentry offers "Update price" instead. |
| 12 | **Annual savings recap** | Insights tab — big italic rust number is your annual run-rate. |

---

## Test the full flow

After loading sample data:
1. **Popup** — three tabs (Subscriptions / Calendar / Insights). Click any sub to open the detail drawer with cancel steps.
2. **Calendar tab** — colored dots on renewal days. Today is highlighted in rust.
3. **Insights tab** — category spending bars + recent activity feed + annual recap.
4. **Settings** — toggle reminder days, change currency, export your data as JSON, wipe everything.
5. **Content script** — visit a known service's signup page (e.g. `chatgpt.com/#pricing`, `audible.com/ep/signupbtn`) and watch for the corner toast.

---

## What this build deliberately does NOT do

So you don't go looking for things that aren't there:

- **No Gmail scan.** A real version would request `gmail.readonly` and parse receipts. That requires OAuth, app verification by Google, and a privacy review — out of scope for a 1-day MVP. The architecture (a `gmail-scan` button + parser pipeline) is ready to drop in.
- **No full cancel automation.** Sentry deep-links you straight to each service's cancel page and walks you through the dark-pattern steps in plain English, but it does not auto-click cancel buttons. Auto-clicking requires per-service scripts that break weekly when sites redesign. This is the right call for v1; Rocket Money also doesn't actually cancel anything — they hand you off to humans, charge 30-60% of "savings," and people get furious. Sentry is honest about being a guide.
- **No Plaid / bank linking.** That's the entire point. The product wedge is "we don't touch your bank."
- **No backend.** No sync across devices, no team mode, no admin dashboard. All on-device. Adding backend (with E2E encryption) is a v2 decision once you have users.
- **No payment / pro tier.** When you're ready, Stripe + a license-key flow is the cleanest path. Free vs. Pro split is already designed (see the feature-list message above).
- **Not on the Chrome Web Store yet.** Submission needs a privacy policy page, screenshots, demo video, $5 dev account, and a 1-3 day review. Plan a half-day for it.

---

## Architecture (10,000-foot)

```
manifest.json          MV3 — permissions: storage, alarms, notifications, tabs, host <all_urls>
background.js          service worker — alarms, badge, notifications, message router, usage tracking
content.js + content.css   runs on all pages, detects subs, shows toast
popup.html/.js/.css    main dashboard — 3 tabs, drawer, modal
options.html/.js/.css  settings + welcome screen
lib/merchants.js       service catalog with cancel URLs, aliases, default prices (THE CONTENT MOAT)
lib/storage.js         chrome.storage.local wrapper + sample data seeder
lib/utils.js           formatting + date helpers
icons/                 16, 48, 128 PNGs
```

---

## What to do next

Roughly in priority order:

1. **Use it on yourself for a week.** Track every sub you actually pay for. Whatever feels clunky is your real backlog.
2. **Expand `lib/merchants.js`.** Add the next 20-50 services. Each entry takes 5 minutes. This is your content moat — the more services you cover with real cancel URLs, the bigger your gap to Subscription Ghost.
3. **Privacy policy + Web Store assets.** Even a one-pager. Submit to the store.
4. **Build the price-hike differentiator harder.** Right now hikes are detected only when the user updates the price themselves. The killer move: the content script re-scans known service billing pages in the background and detects hikes automatically. ~1 day of work.
5. **Gmail receipt scan as a Pro feature.** Real $5/mo trigger. Add it once you have ~100 free users.
6. **Submit to Product Hunt.** Position: "the subscription tracker that doesn't need your bank login."

Good luck.
