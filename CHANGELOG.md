# Changelog

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
