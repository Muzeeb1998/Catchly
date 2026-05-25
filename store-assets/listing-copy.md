# Chrome Web Store listing copy

Paste these strings verbatim into the corresponding fields in the
Chrome Web Store developer dashboard.

> **Note on brand names.** The Web Store rejected our first
> submission ("Yellow Argon" — Spam and Placement) because the
> public-facing **Detailed description** field enumerated brand
> names (Netflix, Spotify, etc.) as if for SEO. The new public
> description below uses category descriptors only (streaming,
> AI, productivity, news, design, storage). The non-public
> **Permission justification** fields on the Privacy tab DO
> still enumerate the 24 host domains by name — those are
> reviewer-only fields, not displayed on the listing page, and
> reviewers need the explicit list to verify the narrow
> allowlist claim.

---

## Short description (≤ 132 chars) — Store listing tab

```
Catch forgotten subscriptions, price hikes, and shadow charges — locally, in your browser. No bank login. No account.
```

*(119 characters)*

---

## Detailed description (≤ 16 000 chars) — Store listing tab

```
The subscriptions you forgot about are the ones costing you the most.

Catchly is a privacy-first subscription tracker that runs entirely inside your browser. It quietly watches signup confirmations, checkout pages, and renewal notices on the specific services it supports, then keeps a running list of every recurring charge it spots. There is no bank connection. There is no required account. Your subscription data never leaves your device.

SINGLE PURPOSE

Catchly does one thing: detect, track, and warn you about recurring charges — subscriptions, free trials, price hikes, and unused "shadow" services — locally, on the device you installed it on, with no backend that holds your data.

WHAT CATCHLY CATCHES

- New subscription signups on supported streaming, AI, productivity, news, design, and storage services
- Free trials about to convert to paid — with a 24-hour warning before the card is charged
- Price hikes the moment they appear on a renewal page
- "Shadow charges" — services you haven't opened in 30+ days that are still billing you
- Annual renewals you'd otherwise forget until the charge hits your statement
- Subscriptions you add manually in 10 seconds, for services Catchly can't auto-detect

WHY PEOPLE USE IT

- One dashboard for every recurring charge you've signed up for, organized by next renewal
- Renewal calendar so the next 30 days are never a surprise
- Reminders configurable to 1, 3, or 7 days before a renewal, or all three at once
- Spot price increases the day they happen, not on your next bank statement
- Quick-link "Cancel this" buttons that jump straight to the cancellation page — no customer-service runarounds
- Multi-currency support with separate totals so mixed-currency portfolios don't produce garbage numbers
- Four themes (Editorial, Utility, Dark, System)
- Manual entry, sample-data mode, and full JSON import/export — you own your data and can take it with you

PRIVACY THAT ACTUALLY MEANS SOMETHING

Catchly runs entirely on your device. Your subscription list, your usage data, and your visit history live in your browser's local storage and nowhere else. There is no analytics SDK, no crash reporter, no telemetry beacon, no error logger, and no usage ping anywhere in the codebase.

Catchly can only run on a narrow allowlist of subscription services that the extension is designed to detect. Every host permission is enumerated explicitly in the published manifest.json file. The browser itself prevents Catchly from running on any other site, including banking, brokerage, healthcare, payment-processor, identity-provider, or government login pages. That's enforced by Chrome at the platform level — it's not a "trust us" promise.

THE ONE OPTIONAL OUTBOUND CALL

If you click the "Notify me" button on the upcoming Gmail-auto-scan waitlist, your email address is sent to a Cloudflare Worker so we can email you when that feature launches. That is the only thing Catchly ever sends anywhere, it only fires when you explicitly type into the email field and click the button, and the email is the only piece of data transmitted.

Skip that field and the extension makes zero outbound calls during normal use.

WHAT CATCHLY DOES NOT DO

✗ Does not connect to your bank
✗ Does not read your inbox or email content
✗ Does not require an account, password, or sign-up
✗ Does not sync your subscription data to any server
✗ Does not track you across sites
✗ Does not run on banking, brokerage, healthcare, government, payment-processor, or authentication sites
✗ Does not load brand logos from a third-party CDN — every icon is bundled inside the extension
✗ Does not contain analytics SDKs, telemetry beacons, crash reporters, or error loggers
✗ Does not execute remote code, dynamic scripts, or anything fetched at runtime

OPEN SOURCE — VERIFY EVERY CLAIM

The full source code is published on GitHub:
https://github.com/Muzeeb1998/Catchly

Every claim in this listing is verifiable in code.

PRICING

Catchly's core product is free, forever. There is no trial that converts. There is no feature behind a paywall that you need for the value proposition to work.

ROADMAP

The launch version covers manual + auto-detected tracking, renewal warnings, price-hike alerts, free-trial countdowns, shadow-charge detection, a renewal calendar, monthly/yearly spend insights, and one-click cancellation links. Coming next: Gmail auto-scan, a cancellation copilot for the top services, and family-plan splitting.

Every future feature will follow the same rule: local-first, no data sold, no bank login required.

SUPPORT

Privacy questions: privacy@getcatchly.com
General support: https://github.com/Muzeeb1998/Catchly/issues
Website: https://getcatchly.com
Privacy policy: https://getcatchly.com/privacy

Install once. Browse the services you already use. Catchly handles the rest.
```

---

## Privacy tab — Single purpose description (≤ 1 000 chars)

```
Catchly's single purpose is to help users track recurring subscription charges on a defined set of services without using a bank login, an account, or any cloud backend. The extension detects subscription sign-up and checkout pages on the 24 specific services listed in the manifest's host_permissions field, lets the user save the subscription to chrome.storage.local with one click, and surfaces local-only renewal reminders, free-trial countdowns, price-hike alerts, and "haven't used in a while" shadow-charge warnings. Nothing else.
```

---

## Privacy tab — storage justification (≤ 1 000 chars)

```
The "storage" permission persists the user's saved subscription list, app settings, theme preference, usage history (for the "haven't visited in X days" shadow-charge feature), and pending-capture queue to chrome.storage.local on the user's device. Every value the extension reads or writes lives in chrome.storage.local — never chrome.storage.sync — so user data never leaves the device. The extension is non-functional without this permission: subscriptions would be forgotten on every popup close, alarms could not be scheduled, and theme preference could not be restored. Implementation in lib/storage.js — source at https://github.com/Muzeeb1998/Catchly.
```

---

## Privacy tab — alarms justification (≤ 1 000 chars)

```
The "alarms" permission schedules Chrome alarms that fire renewal reminder notifications at the user-configured offset before each subscription's next renewal (default 3 days; configurable to 1, 3, or 7 days, or any combination). Also used for the free-trial 24-hour-before-end alarm, a daily housekeeping alarm that runs the shadow-charge sweep and recomputes the action-icon badge, and an hourly badge-refresh alarm. There is no alternative MV3 API for scheduling background work at a future time — setTimeout does not survive service-worker termination. Used only by background.js.
```

---

## Privacy tab — notifications justification (≤ 1 000 chars)

```
The "notifications" permission displays Chrome desktop notifications when a subscription renewal is approaching, when a free trial is about to convert to paid, and when a shadow-charge sweep flags a subscription the user has not visited in the user-configured threshold of days (default 30). All notifications are generated and dispatched locally from the background service worker; the notification body never contains data fetched from a remote server. The user can disable any notification category in the Settings pane of the popup. Used only by background.js.
```

---

## Privacy tab — tabs justification (≤ 1 000 chars)

```
The "tabs" permission is used for two purposes. First, chrome.tabs.create({ url, active: true }) opens the cancellation page for a subscription in a new tab when the user clicks "Cancel this" in the detail drawer, and opens the options/onboarding page on first install. Second, chrome.tabs.onUpdated reads the URL and title of the active tab when it finishes loading, to detect when the user visits a known subscription service — this powers the "haven't visited in X days" usage-tracking that the shadow-charge alert depends on. The match is performed locally against the merchant map in lib/merchants.js; nothing about the visit is transmitted.
```

---

## Privacy tab — Host permission justification (≤ 1 000 chars)

> Reviewer-only field; not displayed on the public listing. Enumerating
> the 24 domains here is required to demonstrate the narrow-allowlist
> claim — not a spam violation.

```
host_permissions declares a fixed allowlist of 24 specific subscription-service domains: netflix.com, spotify.com, disneyplus.com, max.com, hbomax.com, hulu.com, primevideo.com, youtube.com, music.apple.com, tv.apple.com, chatgpt.com, openai.com, claude.ai, anthropic.com, notion.so, notion.com, grammarly.com, dropbox.com, 1password.com, adobe.com, audible.com, nytimes.com, github.com, figma.com. It is NOT <all_urls>. The content script (content.js) runs on these specific hosts to detect when the user lands on a subscription sign-up or checkout flow for a service Catchly recognizes — auto-detecting subscriptions at the moment of sign-up is the central value proposition. The browser enforces this allowlist at the platform level; Catchly cannot run on any other site, including banks, brokerages, healthcare, payment processors, identity providers, or government logins. Adding domains in future versions is visible as a manifest diff in the public source repository.
```

---

## Privacy tab — Are you using remote code?

**Select: `○ No, I am not using remote code`**

Catchly bundles every JS file, every font, every brand icon. No external script tags, no CDN imports, no eval, no `new Function()`. The Cloudflare Worker call is data submission, not code execution.

---

## Privacy tab — Data usage section

**Check exactly one box:**

- ✅ **Personally identifiable information** (email — for the opt-in waitlist signup)

**Leave all others unchecked.**

**Check all three certifications:**

- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## Privacy policy URL

```
https://getcatchly.com/privacy
```

---

## Store listing tab — additional fields

| Field | Value |
|---|---|
| Homepage URL | `https://getcatchly.com` |
| Support URL | `https://github.com/Muzeeb1998/Catchly/issues` |

---

## Category

- **Primary:** Productivity

## Language

English (only supported language at launch)

---

## Test instructions tab

**Credentials:** leave blank (Catchly has no login).

**Additional instructions (≤ 500 chars):**

```
Catchly has no login, no account, and no required setup — open the toolbar icon and you're in the dashboard.

Fastest path to verify functionality:
1. Click the Catchly icon → 3-screen onboarding shows on first run.
2. Settings tab → "Load sample data" populates the dashboard with example subs.
3. Visit netflix.com/signup/planform — the in-page detection toast appears.
4. Header calendar icon → 30-day renewal calendar drawer.

Source: https://github.com/Muzeeb1998/Catchly
```
