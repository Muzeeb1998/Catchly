# Chrome Web Store listing copy

Paste these strings verbatim into the corresponding fields in the
Chrome Web Store developer dashboard.

---

## Short description (≤ 132 chars)

Catch forgotten subscriptions, price hikes, and shadow charges — locally, in your browser. No bank login. No account.

*(119 characters)*

---

## Detailed description (≤ 16 000 chars)

**Catchly is a privacy-first subscription tracker.**

It catches the subscriptions you forgot you signed up for, warns
you before a price hike or auto-renewal hits your card, and flags
the services you haven't opened in weeks. It runs entirely inside
your browser. There is no bank login, no account, and nothing ever
leaves your device.

---

**Why most subscription trackers are a bad trade.**

Every other subscription tracker on the market asks you to hand
over your bank credentials, your email inbox, or both. That is the
business model — they're not selling you a feature, they're selling
your transaction data to a data broker, or themselves becoming the
broker. You save $12/month on a forgotten Hulu sub and pay for it
with a permanent record of every place you swipe your card.

Catchly was built to skip that trade.

- **No bank login.** Catchly never asks for, never sees, and never
  stores any payment credentials.
- **No account.** There is no sign-up screen, no password, no
  cloud profile. You install the extension and it works.
- **Local-only.** All your data lives in `chrome.storage.local`
  on your device. Catchly has no backend that holds your
  subscriptions. There's nothing for us to hack, leak, or sell.

---

**What it actually does**

✓ **Auto-detect at checkout.**
When you land on a known subscription checkout page (Netflix,
Spotify, ChatGPT Plus, Notion, etc. — 20+ services at launch and
growing), a small toast slides in asking whether you want to
track this. One click and it's saved. No click and it disappears.
The page itself is parsed locally; nothing about your visit is
sent anywhere.

✓ **Renewal warnings.**
For every subscription you track, Catchly schedules a Chrome
notification N days before it auto-renews. Default is 3 days; you
can configure 1/3/7-day reminders, or several at once.

✓ **Free-trial countdown.**
Mark a sub as a free trial and Catchly fires a separate, louder
notification 24 hours before the trial ends so you can cancel
before the card gets charged.

✓ **Shadow-charge detection.**
If you haven't visited a service's site in the configured window
(default 30 days) and a renewal is coming up in the next 3 days,
Catchly raises a "shadow charge" alert. This is the killer
feature for catching the subs you genuinely forgot about — the
streaming service you tried for one show two years ago and never
opened again.

✓ **Price-hike alerts.**
Bump a sub's price in the popup and Catchly logs the delta so you
can see exactly how much your monthly subscription budget has
crept up over time.

✓ **Renewal calendar.**
The header calendar drawer shows every upcoming renewal in the
next 30 days, day by day, with the total spend rolled up at the
top.

✓ **Insights and shadow-charges view.**
Monthly spend totals, top categories, mixed-currency handling
(USD + EUR + GBP shown separately so you don't get garbage
totals), and a dedicated "haven't used in a while" list.

✓ **Cancellation guidance.**
Every sub's detail drawer has a "Cancel this" link that takes you
to the service's actual cancellation page (not a customer-service
runaround), where it exists.

✓ **Manual entry, sample data, and full import/export.**
Add a sub by hand in 10 seconds. Want to play with the UI before
committing? Load sample data with one click. Want to back up?
Export everything to a JSON file you control. Reimport on a new
machine.

✓ **Four themes.**
System (follows your OS), Editorial (calm cream + black),
Utility (high-contrast yellow + ink), and Dark. Switch in one
click — the transition crossfades smoothly.

---

**Why "local-only" matters more than it sounds**

Privacy claims are cheap. The hard part is *verifying* them.

Because Catchly has no backend, you don't have to trust us. You
can verify it:

1. Open Chrome's Developer Tools while the extension runs.
2. Watch the Network tab.
3. Add a subscription, get a notification, browse around.
4. You will not see a single outbound request to a Catchly server,
   because there isn't one.

The only network call the extension makes is to a Cloudflare
Worker for the optional Gmail-auto-scan waitlist signup — and
that only fires *if and when you click the "Notify me" button*.
Nothing else.

The full source code is on GitHub:
**https://github.com/Muzeeb1998/Catchly**

---

**Permissions, explained in plain English**

We ask for four permissions. Each one has a specific, narrow job.

- `storage` — to save your subscriptions to
  `chrome.storage.local`. Without this, the extension forgets
  everything when you close Chrome.
- `alarms` — to schedule renewal-warning notifications. Chrome
  needs this to fire a notification at a future time.
- `notifications` — to show those warnings.
- `tabs` — to read the URL/title of the page you're on so we can
  match it against the list of known subscription services
  (Netflix, Spotify, etc.) and so the "how long since you last
  visited" check works.
- Host permission `<all_urls>` — needed for the in-page toast at
  checkout to work on any site. We explicitly exclude 47
  sensitive domains from the content script: every major bank
  (Chase, BoA, Wells Fargo, Capital One, Citi, ...), brokerages
  (Schwab, Fidelity, Vanguard, ...), payment processors (Stripe,
  PayPal, Venmo, Cash App, ...), identity providers (Google
  Accounts, Apple ID, Microsoft, Okta, Auth0, ...), and
  government sites (irs.gov, ssa.gov, ...). Catchly never runs
  on those pages.

We do not request `<all_urls>` host permission to spy on you. We
request it because Chrome's content-script API has no way to say
"only run on shopping checkout pages." The exclude list is the
strongest mitigation Chrome offers.

---

**Privacy policy**

Full policy at **https://getcatchly.com/privacy**.

Short version: we collect nothing. There is no analytics SDK, no
crash reporter, no telemetry beacon, no error logger, no usage
ping. If you sign up for the optional Gmail-auto-scan waitlist,
we store your email address in a Cloudflare KV store keyed by
timestamp — that's it.

---

**Roadmap**

The current launch covers manual + auto-detected tracking and
local-only reminders. Coming up:

- **Gmail auto-scan** — opt-in, on-device parsing of your inbox
  to find every receipt-based subscription in 15 seconds. Click
  "Notify me" in Settings to be emailed when it ships.
- **Cancellation copilot** — guided 1-click cancellation for the
  top 50 services.
- **Family plan splitting** — track which subs are shared and
  whose card they hit.

All future features will follow the same rule: local-first, no
data sold, no bank login.

---

**Made by**

An indie developer who got tired of paying $9/month for a
subscription tracker that wanted his bank password.

Catchly is free forever for the core product. A paid Pro tier
will eventually exist for the auto-scan + copilot features — it
will be a flat monthly price, not a percentage of "savings."

---

**Support**

- Source: https://github.com/Muzeeb1998/Catchly
- Privacy questions: privacy@getcatchly.com
- General: https://getcatchly.com

---

## Category

- **Primary:** Productivity
- **Secondary suggestion:** Tools / Workflow & Planning

## Language

English (only supported language at launch)
