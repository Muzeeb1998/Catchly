# Changelog

## Unreleased — Theme dropdown + wiring (Part C/D/E)

Replaced the popup Settings pane's Auto/Light/Dark segmented control with a native `<select>` dropdown carrying three options: System / Editorial / Utility. Selecting an option instantly applies `<html data-theme>`, writes to `sessionStorage["catchly_theme_cache"]` (fast path for next open) + `chrome.storage.local.settings_v1.theme`, and broadcasts `{type:'theme_changed'}` to every open tab via `chrome.tabs.sendMessage` so content.js can re-theme any visible capture toast. `setThemeAttr` whitelists the three values (legacy auto/light/dark collapse to 'system'). Utility theme gains scoped `[data-theme="utility"] .btn / .tab.active` overrides to fix white-on-yellow contrast.

## Unreleased — Theme tokens: System / Editorial / Utility (Part A + B)

Added a Utility theme (off-white + yellow accent) alongside the existing Editorial baseline (current Swiss white + blue), both with light + dark variants gated on `prefers-color-scheme`. New token blocks live under `:root[data-theme="utility"]` in popup.css + options.css and `.sentry-toast[data-theme="utility"]` in content.css — no component CSS was rewritten, no fonts touched. Inline `<head>` script in popup.html + options.html sets `data-theme` before stylesheets parse (reads sessionStorage synchronously, reconciles with `chrome.storage.local.settings_v1.theme` async). Storage default theme bumped from `'auto'` to `'system'`. Dropdown UI + JS wiring follow in Part C/D/E.

## Unreleased — Part C: Cloudflare Worker endpoint

The waitlist now has a deployable backend. A single Cloudflare Worker (`worker/waitlist-worker.js`) accepts POST `/signup` requests, validates the email server-side, and writes one entry per signup to a Workers KV namespace. No IP, no user-agent, no headers persisted — only the four fields the client sends (email, source, version, dismissedCount).

### Files
- `worker/waitlist-worker.js` — ~60-line Worker module. CORS preflight, JSON parse with try/catch, email regex re-check, 254-char and 32-char field caps, KV write under `signup:<timestamp>:<random8>` keys (sorts chronologically by default).
- `worker/wrangler.toml` — config template. `[[kv_namespaces]]` binding placeholder; user pastes the namespace id printed by `wrangler kv:namespace create WAITLIST`.
- `worker/README.md` — five-step deploy (install wrangler → login → create KV → paste id → deploy), commands to read collected emails one-off or bulk-dump to JSONL, optional hardening (tighten CORS to the packed extension id, custom domain, rate limit).

### Wiring
- `lib/waitlist.js` `WAITLIST_ENDPOINT` is still empty by default so the UI keeps working offline. After `wrangler deploy` prints the live URL, paste it into that constant and reload the extension.
- Manifest left untouched. MV3 extension pages (popup, options) fetch any origin without `host_permissions`; README documents the hardening note for content-script use.

### Cost
Cloudflare's free tier covers 100k worker requests + 100k KV writes per day. A v1 waitlist will not approach either limit.

## Unreleased — Part B: Behavioral re-prompts

Three demonstrated-value moments now surface the same early-access offer that was specced in Part A, with strict frequency rules so the product feels aware instead of pushy.

- **Third-sub bottom toast (`third_sub`)**: After a manual save in the Add modal, if the active subscription count is exactly 3 and the evaluator allows, a slide-up toast appears above the bottom tab bar with the same email form. Auto-dismisses after 12s (logged as `dismissed_soft`). Skipped on edits, sample-data seeds, and pending-capture adds.
- **After-capture inline (`after_capture`)**: When the user clicks "Track this" on a content-script capture row, the row is replaced in place by a thin inline prompt (no auto-dismiss). The original row mount survives — only its contents swap — so the inline prompt sits exactly where the capture resolved.
- **Day-7 fallback banner (`fallback`)**: On popup open, if 7+ days have passed since first popup use AND no prior exposure has happened AND the evaluator allows, a hairline banner mounts at the top of the Subs pane. Its "Notify me" CTA opens `options.html#waitlist`, which scrolls the persistent settings card into view and focuses the email input.

### Trigger rules (lib/waitlist.js `shouldShowWaitlistPrompt`)
- `waitlist_state.email` must be null (no submission yet)
- `dismissedPermanently` must be false (Not interested wins forever)
- `firstUseTs` must be set and at least 24h old (no-prompt window)
- Lifetime cap: at most 3 entries with `outcome === 'shown'` (so a single prompt's shown + dismissed_soft entries don't burn two slots)
- At least 7 days since the most recent exposure entry
- If the most recent outcome was `dismissed_soft`, the next surface must differ from the previous one (no back-to-back same surface)

### Exposure logging
- Toast and banner log `shown` at mount; inline logs `shown` at render
- Dismissals log `dismissed_soft` (× or auto-timeout) or `dismissed_hard` (Not interested → also sets `dismissedPermanently`)
- Submissions log `submitted` once via `submitEmail` — the surface close path does not re-log to avoid duplicate entries

### Boot
- `markFirstUseIfUnset()` runs early on popup boot. Idempotent. Stamps `waitlist_state.firstUseTs` once on the very first popup open (no pre-seeding on install)

## Unreleased — Part A: Always-available waitlist surfaces

Added two persistent surfaces that introduce the upcoming Gmail auto-scan feature: a card on the first-install welcome screen (above the existing primary CTAs) and a "What's coming" card pinned to the top of the settings grid. Both share the same building blocks (eyebrow, title, body, email form, privacy note, optional incentive) and swap to a confirmed-state view once an email is captured. All user-facing strings live in a single `COPY` object inside `lib/waitlist.js` so future copy tuning happens without touching surface code. Submission writes to `chrome.storage.local` under the `waitlist_state` key; until the Cloudflare Worker ships in Part C, `WAITLIST_ENDPOINT` is empty and submissions resolve as a local-only success so the UI is verifiable end-to-end.

### Trigger source → surface → copy variant (for future reference)

| Trigger source | Surface key | COPY variant | Part |
| --- | --- | --- | --- |
| `welcome` | welcome card | `COPY.welcome` | A |
| `settings` | settings card | `COPY.settings` | A |
| `third_sub` | bottom toast | `COPY.thirdSub` | B |
| `after_capture` | inline (replaces resolved capture row) | `COPY.afterCapture` | B |
| `fallback` | top banner (day-7) | `COPY.fallback` | B |

### Notes
- `lib/waitlist.js` ships the full state machine + `shouldShowWaitlistPrompt` evaluator + `submitEmail` helper up front (deliverable #1), even though Part A only exercises submission. Parts B/C consume the same module.
- Token mapping: the brief mentions a `--clay` inline-error color from the warm-paper palette. Current Swiss palette has no `--clay`; the implementation uses `--danger` (#B42318) for inline errors and `--warning` for the in-development status dot.
- `build_preview.py` is not present in this repo; preview verification happens by loading the extension in Chrome (per established workflow).
