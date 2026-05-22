# Changelog

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
