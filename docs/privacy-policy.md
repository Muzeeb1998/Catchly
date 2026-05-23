---
layout: default
title: Catchly — Privacy Policy
description: How Catchly handles your data. Local-first by default.
---

# Catchly — Privacy Policy

**Last updated:** 2026-05-22
**Effective for:** Catchly v0.1.0 and later

This policy describes exactly what data Catchly handles. Plain English, no legalese. If anything below changes in a future release, the "Last updated" date moves and the changelog ([CHANGELOG.md](https://github.com/Muzeeb1998/Catchly/blob/main/CHANGELOG.md)) records the diff.

---

## TL;DR

- All of your subscription data stays on your device. Catchly never sends it to a server.
- Catchly does not request access to your email, bank, or any third-party account.
- The only data that ever leaves your device is the email address you optionally type into the early-access waitlist form. You choose when, you choose if.
- No analytics, no telemetry, no third-party trackers, no advertising.
- Source code is public at https://github.com/Muzeeb1998/Catchly. You can read every line.

---

## 1. Data Catchly stores on your device

All of the following is written to `chrome.storage.local`, which is scoped to the Catchly extension on your specific browser profile. It is not synced to any Google account, is not visible to other extensions, and is wiped when you uninstall Catchly.

| Storage key | What's in it | Why |
| --- | --- | --- |
| `subs_v1` | Every subscription you track: name, amount, currency, cycle, dates, optional notes, status | Display in the popup; compute renewals; schedule alarms |
| `events_v1` | Activity log: price changes, captures added/dismissed, cancellations, shadow alerts. Capped at 500 entries. | Insights tab + shadow-charge dedup |
| `settings_v1` | Your preferences: currency, reminder days, notification toggles, theme, detect-on-pages toggle | Apply preferences across surfaces |
| `pending_captures_v1` | Sub captures from the content script awaiting your "Track this" / "Dismiss". Auto-expired after 7 days, capped at 50 entries. | Bridge between detection and confirmation |
| `usage_v1` | Last visit timestamp per known service domain | Power the "shadow charge" detection ("haven't visited Audible in 87 days") |
| `ui_state_v1` | Collapsed / expanded state of the Active / Inactive subscription sections | Remember UI preference across popup opens |
| `waitlist_state` | The email you submitted to the waitlist (if any), submission timestamp, and the surface you used to submit | Reflect signup status in the welcome and settings cards; prevent re-prompting |

You can export this entire dataset as JSON via `Settings → Advanced settings → Export JSON`. You can re-import it via `Import JSON`. You can wipe it completely via `Wipe everything`.

---

## 2. Data Catchly reads but does not store

### Page content on supported subscription pages

The Catchly content script runs on most web pages so it can detect subscription signups (Netflix, Spotify, ChatGPT Plus, etc.). When it runs, it reads `document.body.innerText` of the current page to look for the page's text content for known trigger phrases like "per month", "subscribe now", "free trial".

This is the entire interaction. The page text is examined in memory, briefly, on your device. It is never stored, never sent over the network, never written to disk, and never shared with any third party. If no trigger phrases are present, the script does nothing visible and the text is discarded as soon as the function returns.

The content script does **not** run on the following categories of sites (full list in [`manifest.json`](https://github.com/Muzeeb1998/Catchly/blob/main/manifest.json) `exclude_matches`):

- US, UK, and EU consumer banks (Chase, Bank of America, Wells Fargo, Citi, Capital One, US Bank, HSBC, Barclays, Santander, TD Bank, PNC, Ally, American Express, Discover)
- Brokerages and crypto exchanges (Schwab, Fidelity, Vanguard, E*TRADE, Robinhood, Coinbase, Kraken)
- Payment processors (PayPal, Venmo, Cash App, Stripe, Plaid)
- Identity / SSO providers (Google Accounts, Apple ID, iCloud, Microsoft, Okta, Auth0, Duo, Facebook login pages)
- Healthcare portals (healthcare.gov, MyChart)
- US government auth (IRS, USCIS, SSA)

### Service domain visits

When you load a page on a known service domain (the 20 services listed in [`lib/merchants.js`](https://github.com/Muzeeb1998/Catchly/blob/main/lib/merchants.js)), Catchly records the timestamp of that visit to `usage_v1` so the "shadow charge" detector can later flag subscriptions that renew soon but haven't been used in a while. Only the service identifier (e.g., `netflix`) and the timestamp are stored. The specific URL, page contents, and any query parameters are **not** stored. Writes are throttled to once per 10 minutes per service to avoid disk thrashing.

### Brand logos

The 20 brand-logo tiles in the popup are fetched at runtime from `cdn.simpleicons.org` (a CC0-licensed icon library). The CDN sees: your browser's IP address, user-agent, and the icon slug being requested (e.g., `netflix`). No Catchly-side identifier is sent. If you'd rather the CDN never see your IP, fork the repo and replace `brandSquareHtml` to use the local letter-monogram fallback unconditionally.

---

## 3. Data Catchly sends off your device

Exactly one optional flow sends data off your device: the early-access waitlist.

When you click `Notify me` after typing an email into any of the waitlist cards, Catchly sends a single HTTPS POST to a Cloudflare Worker the maintainer operates. The request body is exactly:

```json
{
  "email": "you@example.com",
  "source": "welcome",
  "version": "0.1.0",
  "dismissedCount": 0
}
```

- `email` is what you typed.
- `source` identifies which surface you submitted from (`welcome`, `settings`, `third_sub`, `after_capture`, `fallback`).
- `version` is the Catchly version that submitted.
- `dismissedCount` is the number of waitlist prompts you previously dismissed (used to gauge friction at launch; never an identifier).

The Cloudflare Worker writes the payload to Cloudflare Workers KV. It does **not** capture or store your IP address, user-agent, browser headers, geographic location, or any other request metadata. The full Worker source is in [`worker/waitlist-worker.js`](https://github.com/Muzeeb1998/Catchly/blob/main/worker/waitlist-worker.js).

You can use Catchly indefinitely without ever entering an email. The waitlist is optional.

If you change your mind, click `Change email` on either waitlist card to clear the local record, or `Wipe everything` to clear all Catchly storage (this only deletes the local copy — to remove your email from the Workers KV store, [open an issue](https://github.com/Muzeeb1998/Catchly/issues) or email the address in the GitHub profile).

---

## 4. Data Catchly does NOT touch

- Your bank login credentials. Catchly does not link to a bank, does not use Plaid, does not ask for read access to financial accounts.
- Your Gmail or any other email account. (Gmail auto-scan is on the roadmap; if and when it ships, it will require explicit Google OAuth consent with the `gmail.readonly` scope, undergo Google's restricted-scope app verification, and ship a separate privacy policy update covering its data handling.)
- Your password manager, calendar, browsing history, bookmarks, or any other browser data.
- Any data on the excluded domains listed in Section 2.

---

## 5. Permissions Catchly requests and why

| Permission | Why |
| --- | --- |
| `storage` | Persist the subscription data documented in Section 1 |
| `alarms` | Schedule renewal and trial-end reminders that fire on the correct day |
| `notifications` | Show OS notifications when reminders fire (you can deny this at install time without breaking anything else) |
| `tabs` | Open the cancel page when you click "Open cancel page"; broadcast theme changes to existing tabs |
| `host_permissions: <all_urls>` | Allow the content script to detect signup pages on subscription services. Restricted via `exclude_matches` (Section 2). |

---

## 6. Children

Catchly is not directed at children under 13. If you are a parent or guardian and believe your child has used Catchly's optional waitlist to submit an email address, [open an issue](https://github.com/Muzeeb1998/Catchly/issues) and the entry will be removed from the Workers KV store.

---

## 7. Changes to this policy

When this policy changes materially (new data collected, new third-party recipient, new sharing practice), the change will be:

- Reflected in the `Last updated` date at the top of this page
- Recorded in [CHANGELOG.md](https://github.com/Muzeeb1998/Catchly/blob/main/CHANGELOG.md) under a `Privacy` heading
- Announced via a notification in the popup on the next version bump

Cosmetic or clarifying edits (typos, wording polish) update the date without a CHANGELOG entry.

---

## 8. Contact

Questions, deletion requests, or concerns:

- Open an issue: https://github.com/Muzeeb1998/Catchly/issues
- Maintainer GitHub: https://github.com/Muzeeb1998

There is no support phone number, no support email mailing list, and no internal team — Catchly is currently maintained by one person. Response time is best-effort.

---

*Catchly is open source under the MIT license. The source for every behaviour described in this policy is auditable at https://github.com/Muzeeb1998/Catchly.*
