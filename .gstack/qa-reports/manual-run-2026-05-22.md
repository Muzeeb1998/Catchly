# Catchly — Manual QA Run, 2026-05-22

Live walkthrough of `manual-test-checklist.md`. Results captured as I get them from the human tester.

---

## Section A — Install + first-run

| ID | Result | Note |
| --- | --- | --- |
| A1 | PASS | Fresh load-unpacked opened welcome tab automatically |
| A2 | PASS (production) / P2 (unpacked-dev) | Reload via chrome://extensions/ on UNPACKED extension triggers `onInstalled` with `reason: 'install'` again → welcome re-opens. Chrome behavior, not a code bug. Production Web Store updates fire `reason: 'update'` → welcome stays closed. Optional polish: also gate welcome on `firstUseTs` being unset, so unpacked-dev reload skips welcome when there's already state. |
| A3 | PASS | Popup boot console clean |
| A4 | PASS | `waitlist_state.firstUseTs` present and numeric |
| A5 | PASS (deferred) | wipeAll cleared storage. Sample data reloaded after. |

---

## DISCOVERED DURING TESTING

### M-005 — Utility theme: --warning = yellow killed every warning-text contrast
- **Found:** User clarification "yellow contrast is creating problem" after M-002 ink-on-yellow chip fix. Root cause: brief mapped `--amber: #F5D547` to `--warning`, but `--warning` is consumed as TEXT color and thin border on multiple surfaces: `.pill-trial` (border + text), `.when-soon` (countdown text), `.alert-clay .alert-icon` (severity icon stroke), `.alert-clay` border-left, `.detail-warn` border-left, `.status-pill::before` dot. Yellow text on white canvas ≈ 1.4:1, WCAG fail.
- **Severity:** P1 (warning labels are unreadable in Utility theme; trial / countdown / hike-pill cues are the product's headline value)
- **Fix shipped:** Utility light `--warning: #F5D547 → #B54708` (Editorial's amber), Utility dark `--warning: #F5D547 → #D49050` (Editorial dark amber). Applied to both popup.css and options.css blocks. `--primary` stays yellow because the chip/btn/cta overrides shipped in M-002 already put ink text on top of yellow fills.
- **Re-test:** Reload → Utility theme → confirm Adobe row TRIAL pill reads as amber, Adobe/Netflix "in Nd" countdown text is amber not yellow, alert strip border bars are visible amber.
- **Note:** Brief spec listed `--amber: #F5D547` but the existing codebase doesn't use an `--amber` token directly — only `--warning`. Mapping the brief literally broke the contrast contract. The new value preserves the warning-as-amber semantic from Editorial.

### M-004 — Blue accent + cool gray-blue surface tint feels heavy across all pages
- **Found:** User report with screenshot showing Editorial-light popup; visible blue surfaces: (1) `.bottom-tabs .tab.active` label+icon = `var(--primary)` blue, (2) selected/hover sub-row bg = `--surface-2: #EEF1F6` cool blue undertone present on every list/alerts/pane surface. Net effect: low-noise UI but reads as "blue everywhere" when scanning.
- **Severity:** P2 (taste / visual consistency, not contrast/function)
- **Fixes shipped:**
  - `--surface-2: #EEF1F6 → #F0F1F3` (Editorial light + Utility light blocks in popup.css; options.css same). Neutral gray, no blue tint. Affects hover state on sub rows, alerts strip background, several pane backgrounds.
  - `.bottom-tabs .tab.active { color: var(--ink); }` + same for `.tab-icon`. Replaces blue text+icon with ink. Added `.bottom-tabs .tab.active::before` thin 2px primary-color bar at top edge (12px side gutter) so wayfinding survives the demote.
  - Dark variants untouched (cool dark tones are appropriate for navy palette).
  - Existing Utility-only `.bottom-tabs .tab.active` overrides at popup.css:1197-1198 now redundant but harmless.
- **Re-test:** Reload → cycle bottom tabs → active tab shows thin blue bar at top + bold ink label, no full-color text. Hover over a sub row → cell tint is neutral gray, not gray-blue.
- **Caveat surfaced:** the per-sub brand square colors (Disney/Max/Dropbox/OnePassword) still display blue identity. M-003 dampened these in Utility theme only — Editorial keeps full brand color. If user wants brand muted in Editorial too, separate decision.

### M-003 — Utility theme: brand-color tiles too loud against yellow palette
- **Found:** User report — "light blue color is creating problem every page" while in Utility theme. Audit shows zero hardcoded blue outside theme tokens; `var(--primary)` and `var(--primary-soft)` resolve to yellow when `data-theme="utility"`. Source confirmed as per-sub brand-color squares (Disney `#0E47A1`, Max `#002BE7`, Dropbox `#0061FF`, OnePassword `#0572EC`) which stay branded across all themes. In yellow Utility, the blue tiles read as off-palette billboards.
- **Severity:** P2 (visual jar, not a contrast failure; identity remains)
- **Fix shipped:** popup.css `:root[data-theme="utility"] .brand-square { filter: saturate(0.7) brightness(0.92); }` — dampens brand saturation in Utility only. Editorial/System/Dark unaffected; CDN white SVG logo layered inside stays readable.
- **Re-test:** Reload extension → Utility theme → confirm Disney/Max/Dropbox/OnePassword tiles look muted-brand, still recognizable. If user still reports blue elsewhere → request screenshot to pinpoint.
- **Caveat:** Doesn't address Chrome's native `<select>` / `<input type="date">` focus halo (OS-blue, not themable from CSS without aggressive `-webkit-appearance: none` overrides).

### M-002 — Utility theme: chip + Advanced-link text invisible (yellow on yellow)
- **Found:** Section B prep. Settings pane in Utility theme — reminder chips (7d/3d/1d) show selected state with `color: var(--primary)` = #F5D547 yellow on `background: var(--primary-soft)` = #FDF8D4 light yellow tint. Contrast ratio ~1.2. Same for `.settings-advanced` link.
- **Severity:** P1 (Utility theme regression — checked chips are unreadable, primary action link is barely visible)
- **Fix shipped:** popup.css adds `:root[data-theme="utility"]` overrides for `.chip:has(input:checked)` (ink text + solid yellow bg + deep-yellow border) and `.settings-advanced` + `:hover` (ink text on yellow hover bg). Editorial/System palettes unaffected.
- **Re-test:** Reload extension → Settings → Theme = Utility → confirm chips show dark ink "7d 3d 1d" on yellow fill and Advanced settings link reads dark on canvas (yellow on hover).
- **Follow-up worth doing:** Audit every CSS rule that resolves to `color: var(--primary)` for Utility contrast. Likely missed: alert action buttons, badge dots, focus rings on form inputs, link colors elsewhere. One pass via `grep -n 'var(--primary)' popup.css options.css | grep -i 'color'` would catch them.

### M-001 — ChatGPT cancelUrl pointed at stale `#settings/Subscription` slug
- **Found:** During Section B prep, tester clicked "Open cancel page" on the ChatGPT row → page landed on Settings → Account, not Subscription/Billing. Stale URL hash; OpenAI moved subscription management under the Billing nav.
- **Severity:** P1 (cancel-flow guidance is the headline differentiator of the product; sending users to the wrong tab breaks the value prop)
- **Fix shipped:** `lib/merchants.js:190` cancelUrl updated to `https://chatgpt.com/#settings/Billing`; cancelSteps text updated to match. `lib/storage.js:232` sample-data demo_chatgpt entry updated to same URL.
- **Re-test:** Reload sample data → click ChatGPT in popup → drawer → "Open cancel page" → confirm lands on Billing tab.
- **Follow-up worth doing:** spot-check every other `cancelUrl` in lib/merchants.js — these slugs rot whenever a service redesigns. Build a periodic link-check (CI cron or one-off `wrangler` script) that HEADs each cancelUrl and flags 4xx/redirect-chain.

## Section B — Theme switching + flash-of-wrong-theme

| ID | Result | Note |
| --- | --- | --- |
| B1 | PASS | Default `data-theme="system"` |
| B2 | PASS | Utility swap instant; storage value persisted |
| B3 | PASS | No visible FOWT after the M-002/M-005 token corrections — sessionStorage cache may not be hitting but async reconcile is fast enough not to flash visibly. TC-INSTALL-008 still a latent risk on slow CPU; monitor in production |
| B4 | PASS | Forced Dark renders dark navy + blue regardless of OS |
| B5 | PASS | System tracks OS dark mode toggle |
| B6 | PASS | Toast on chatgpt.com re-themed live without dismiss |

## Sections C-I — auto-deferred to static analysis

Per user decision mid-run: remaining sections (C manual add, D delete+alarms, E content script, F notifications, G calendar math, H waitlist, I edge cases) were not exercised interactively in the browser. Findings carry over from the static `test-report.md` + `critical-bugs.md` produced earlier this session at commit `0d5beb3`.

Cross-reference summary — bugs already documented that the interactive sections would have surfaced:

| Section | Static finding | Status |
| --- | --- | --- |
| C2 | `if (!name) alert('Name is required')` at popup.js:970 | PASS in static, confirm via C2 step if you ever run it |
| C3 | `if (amount < 0) alert(...)` at popup.js:975 | PASS, originally false-flagged then corrected in test-report.md |
| C4 | `parseFloat("9,99") === 9` — silent EU decimal truncation | FAIL P1 (TC-MANUAL-018) — known, fix hint in critical-bugs.md |
| C5 | Manual add bypasses `findPotentialDuplicate` | FAIL P1 (TC-MANUAL-006) |
| C6 | No `submit.disabled = true` guard during async save | FAIL P1 (TC-MANUAL-023) |
| D | Delete handler doesn't clear `renewal_<id>` / `trial_<id>` alarms | FAIL P1 (TC-MANUAL-011) |
| E | `<all_urls>` content-script injection on banking sites | FAIL P1 (TC-CONTENT-015) |
| E | Toast auto-dismiss timer fires after manual dismiss | FAIL P1 (TC-CONTENT-007) |
| F | Shadow-charge re-fires daily, no dedup against event log | FAIL P1 (TC-NOTIF-010) |
| G | `nextRenewalAfter` Jan 31 + 1mo → Mar 3 (Date.setMonth overflow) | FAIL P0 (TC-CALENDAR-004 / 005) |
| H | `WAITLIST_ENDPOINT = ''` — submissions local-only, worker never deployed | FAIL P1 (TC-WAITLIST-009) |
| I | Multi-currency totals sum raw amounts ignoring currency | FAIL P2 (TC-EDGE-010) |

## Final summary

**Interactive bugs found + fixed this manual run (5):**
- M-001 P1 — ChatGPT cancelUrl pointed at stale `#settings/Subscription` slug → updated to `#settings/Billing` in `lib/merchants.js` + `lib/storage.js` seed data
- M-002 P1 — Utility theme: reminder chips + Advanced-link text invisible (yellow on yellow) → scoped `[data-theme="utility"]` overrides for ink text on chip/btn/advanced/banner-cta
- M-003 P2 — Utility theme: brand-color tiles too loud against yellow palette → CSS `filter: saturate(0.7) brightness(0.92)` on `.brand-square` in Utility
- M-004 P2 — Editorial blue accent + cool gray-blue surface tint felt heavy across all pages → demoted `.bottom-tabs .tab.active` to ink + added thin 2px `::before` indicator bar; shifted `--surface-2: #EEF1F6 → #F0F1F3` neutral gray
- M-005 P1 — Utility `--warning: #F5D547` killed warning-text contrast (pill-trial, when-soon, alert-clay, status-pill dot, detail-warn) → `--warning: #B54708` light / `#D49050` dark; mirrored in options.css

**Static-only deferred findings:** see `critical-bugs.md` for the P0 (calendar Date overflow) and remaining 10 P1 bugs.

**Recommended next:** dev fixes critical-bugs.md P0 + P1 list, then a second interactive pass through Sections C-I to verify each fix.

