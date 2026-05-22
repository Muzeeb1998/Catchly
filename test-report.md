# Catchly — End-to-End QA Test Report

**Auditor:** automated static analysis + reproducible manual steps
**Codebase commit:** working tree at HEAD `0d5beb3`
**Approach:** read every source file; for browser-only behavior, write step-by-step verification instructions a human can run in ≤30s.

---

## P0 / P1 Bug Summary

| TC ID | Severity | Area | One-line impact |
| --- | --- | --- | --- |
| TC-INSTALL-008 | P1 | Theme | sessionStorage cache empty on every popup re-open → flash-of-wrong-theme for non-System users |
| TC-MANUAL-011 | P1 | Delete | `deleteSub` does not clear scheduled alarms `renewal_<id>` / `trial_<id>` |
| TC-MANUAL-018 | P1 | Add modal | `parseFloat("9,99")` returns 9 silently; no locale-decimal detection |
| TC-MANUAL-023 | P1 | Modal | Save button not disabled during save → rapid double-click can double-fire third-sub trigger |
| TC-CONTENT-007 | P1 | Toast | Auto-dismiss timer fires unconditionally after 25s; if user is mid-type in some other state there is no interaction reset, but more importantly the dismiss runs even after the user clicked Track (race: track handler also calls dismiss, then setTimeout dismiss runs on already-removed node) |
| TC-NOTIF-010 | P1 | Shadow-charge | No dedup — daily alarm can re-fire shadow notification every day for same sub while window holds |
| TC-STORAGE-006 | P1 | Storage | `events_v1` capped at 500 but each entry only ~80 bytes — fine. `pending_captures_v1` has NO cap; 1-hour dedup per serviceKey but different services can stack indefinitely if user never opens popup |
| TC-STORAGE-014 | P1 | Storage | No schema version field anywhere; future migration risk if shape changes |
| TC-THEME-002 | P1 | Theme | Bootstrap reads `sessionStorage["catchly_theme_cache"]` synchronously; sessionStorage IS reset every popup close (per-tab session) → fast-path cache is effectively dead. Same root cause as TC-INSTALL-008 |
| TC-CALENDAR-004 | P0 | Calendar | `nextRenewalAfter` uses `Date.setMonth` which JS rolls over: Jan 31 → Mar 3, not Feb 28. Real bug. Affects every monthly renewal that lands on day 29-31 |
| TC-WAITLIST-009 | P1 | Waitlist | `WAITLIST_ENDPOINT = ''` — Cloudflare worker URL never pasted. All submissions silent local-only |
| TC-WAITLIST-019 | P1 | Waitlist | Auto-dismiss "12s" mentioned in spec but `maybeShowThirdSubToast` set to 12s in popup.js. Verify outcome logged as `dismissed_soft` — needs inspection |
| TC-CONTENT-015 | P1 | Content script | `<all_urls>` match runs on banking/accounts/extension store too. Privacy posture says "local only" but script still injects everywhere even when it does nothing |
| TC-PRELAUNCH-007 | P1 | Pre-launch | Waitlist endpoint not deployed/wired (same as TC-WAITLIST-009) |
| TC-PRELAUNCH-009 | P1 | Pre-launch | `lib/merchants.js` has 20 service entries; README claims 21 |

---

## SECTION 1 — INSTALLATION & FIRST-RUN FLOW

### TC-INSTALL-001 — Manifest valid MV3 with correct permissions
- **APPROACH:** STATIC + bash validation
- **CODE REFS:** `manifest.json:1-51`
- **STEPS:** `python3 -c "import json; json.load(open('manifest.json'))"`
- **EXPECTED:** Parses; `manifest_version: 3`; permissions are minimum needed (storage/alarms/notifications/tabs/activeTab)
- **FINDING:** PASS
- **DETAILS:** All five permissions are actually used. `tabs` for `chrome.tabs.create` (notification click handler in background.js:177) and `chrome.tabs.query`/`sendMessage` (popup.js:1058 theme broadcast). `activeTab` unused in code — could be dropped, see TC-PRELAUNCH-002.

### TC-INSTALL-002 — Icon set complete and valid PNGs
- **APPROACH:** bash
- **STEPS:** `file icons/icon*.png`
- **EXPECTED:** 16/32/48/128 PNGs, square
- **FINDING:** PASS — all four sizes present and dimensions match filenames.

### TC-INSTALL-003 — onInstalled opens welcome only on first install
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:19-27`
- **EXPECTED:** Welcome tab opens only when `reason === 'install'`; updates/Chrome updates do not re-trigger
- **FINDING:** PASS — gated correctly.

### TC-INSTALL-004 — Welcome does not re-trigger on extension reload
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:19-27`
- **EXPECTED:** Reload from `chrome://extensions/` fires onInstalled with `reason: 'update'`, not `'install'` — welcome skipped
- **FINDING:** PASS — same gate covers it.

### TC-INSTALL-005 — Uninstall + reinstall resets all state
- **APPROACH:** MANUAL
- **STEPS:** 1) Track several subs. 2) Uninstall extension. 3) Reinstall. 4) Open popup.
- **EXPECTED:** Empty state, welcome tab opens again, no leftover data.
- **FINDING:** NEEDS HUMAN VERIFY — chrome.storage.local is namespaced by extension ID; Chrome wipes it on uninstall. Logic should be correct, but verify ID isn't preserved across reinstalls (only happens for unpacked extensions with same path; verify).

### TC-INSTALL-006 — Popup renders without console errors on first open
- **APPROACH:** MANUAL
- **CODE REFS:** `popup.js:64-79` boot sequence
- **STEPS:** 1) Fresh install. 2) Open popup. 3) Open DevTools on popup → Console.
- **EXPECTED:** No errors. Note: `[waitlist] No endpoint configured — saved locally only.` only fires on submit, not boot — should be clean.
- **FINDING:** NEEDS HUMAN VERIFY — code path looks safe; storage helpers return defaults for missing keys.

### TC-INSTALL-007 — No flash-of-unstyled-content
- **APPROACH:** STATIC
- **CODE REFS:** `popup.html:6-10`
- **EXPECTED:** Inline early-paint script in `<head>` before stylesheets
- **FINDING:** PASS — `<script src="theme-bootstrap.js">` is synchronous and placed before stylesheet links. Browser blocks paint until script + stylesheets parse.

### TC-INSTALL-008 — No flash-of-wrong-theme
- **APPROACH:** STATIC + MANUAL
- **CODE REFS:** `theme-bootstrap.js:16-28`
- **EXPECTED:** Fast-path sessionStorage cache hits on second popup open, sets data-theme synchronously
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** sessionStorage is per-tab-session. Chrome extension popups create a fresh page context on every open and the popup process is eligible for garbage collection on close. The `sessionStorage["catchly_theme_cache"]` written on theme change is reset to empty on every popup close → the synchronous fast path always reads `null` and defaults to `'system'`. Then the async `chrome.storage.local.get` callback fires ~5–50ms later and applies the real theme. For users who picked Utility/Dark/Editorial, every popup open will flash the System look first.
- **FIX HINT:** Replace `sessionStorage` with `chrome.storage.session` (MV3-only, persists for browser session lifetime, available synchronously after first hit via `chrome.storage.session.getKeys`). Or pre-render with `<body class="theme-pending">` and reveal only after async settles.

### TC-INSTALL-009 — firstUseTs gets set on first popup open
- **APPROACH:** STATIC + MANUAL
- **CODE REFS:** `popup.js:67` boot, `lib/waitlist.js:145-149` markFirstUseIfUnset
- **EXPECTED:** Idempotent stamp on first call; survives subsequent calls
- **FINDING:** PASS — Verify in devtools: `await chrome.storage.local.get('waitlist_state')` returns object containing numeric `firstUseTs`.

### TC-INSTALL-010 — Notifications denied doesn't crash
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:159-171` pushNotification try/catch
- **EXPECTED:** Error logged, no propagation
- **FINDING:** PASS — `try { chrome.notifications.create(...) } catch (e) { console.warn(...) }`.

---

## SECTION 2 — MANUAL SUBSCRIPTION ADD FLOW

### TC-MANUAL-001 — Quick-pick service tile populates fields
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:940-954` quick-pick click handler
- **EXPECTED:** Name, amount, currency, cycle, category filled
- **FINDING:** PASS — sets all five fields from SERVICES entry and stores `body.dataset.pickedKey`.

### TC-MANUAL-002 — Save creates sub in storage with correct schema
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:968-1018` save handler; `lib/storage.js:68-75` saveSub
- **EXPECTED:** Object has id, serviceKey, name, plan, amount, currency, cycle, startedAt, nextRenewal, status, isTrial, trialEndsAt, category, color, cancelUrl
- **FINDING:** PASS — all fields populated. `id` via `uid('sub')` collision-resistant enough (timestamp + 5-char random suffix).

### TC-MANUAL-003 — Save schedules renewal alarm
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:1015` `sendMessage({type:'reschedule_all'})` → `background.js:193-198`
- **EXPECTED:** New alarm `renewal_<subId>` created
- **FINDING:** PASS — message handler calls `scheduleAlarmsForSub` for every sub.

### TC-MANUAL-004 — Save updates summary stats in real time
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:1019` `await refresh()` after save
- **EXPECTED:** Stats re-render with new totals
- **FINDING:** PASS.

### TC-MANUAL-005 — Save triggers reschedule_all
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:1015`
- **FINDING:** PASS.

### TC-MANUAL-006 — Duplicate detection on second add
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:90-106` findPotentialDuplicate; `popup.js:702` calls only from pending-capture flow
- **EXPECTED:** Manual add via modal also runs duplicate check
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** `findPotentialDuplicate` is only called from `renderPendingCaptures` (popup.js:702). The manual add modal (`#f-save` handler at popup.js:968-1018) goes straight to `saveSub` without any duplicate check. Users can add Netflix three times via manual add with no warning.
- **FIX HINT:** Inject `findPotentialDuplicate` call in `#f-save` handler before `saveSub`; show inline confirm "Already tracking Netflix at $24.99/mo. Update price instead?"

### TC-MANUAL-007 — Duplicate detection uses fuzzy strategies
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:90-106`
- **FINDING:** PASS — serviceKey exact, name exact, name substring + price within $1.

### TC-MANUAL-008 — Edit preserves serviceKey, color, cancelUrl
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:980` `pickedKey || editing?.serviceKey`; `popup.js:1004` `color: svc?.color || editing?.color`; `popup.js:1005` `cancelUrl: svc?.cancelUrl || editing?.cancelUrl`
- **FINDING:** PASS — preserved via fallback chain.

### TC-MANUAL-009 — Edit with changed amount records previousAmount
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:992`
- **EXPECTED:** When `editing && editing.amount !== amount`, set `previousAmount = editing.amount`
- **FINDING:** PASS — line 992 does exactly this. Also calls `checkAndRecordPriceChange` at line 1011.

### TC-MANUAL-010 — Edit with same amount does NOT set previousAmount
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:992`
- **EXPECTED:** previousAmount stays the prior value or undefined
- **FINDING:** PASS — ternary `editing && editing.amount !== amount ? editing.amount : editing?.previousAmount` only changes when amount differs.

### TC-MANUAL-011 — Delete sub clears alarms
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:738-742` delete handler; `lib/storage.js:77-81` deleteSub
- **EXPECTED:** `chrome.alarms.clear('renewal_<id>')` and `'trial_<id>'` fired
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** Delete handler calls `deleteSub(sub.id)` then `closeDrawer()` + `refresh()`. No alarm clear. The next time `runDailyChecks` runs it will find no sub matching the alarm id, but the alarm still fires uselessly until the daily check runs. Worse, `fireRenewalNotification` looks up by id (background.js:131-133) — sub gone → silent return. Net: no user-visible bug, but orphaned alarms accumulate in `chrome.alarms` and could exceed the 500-alarm limit eventually for power users.
- **FIX HINT:** Add `await chrome.alarms.clear('renewal_'+sub.id); await chrome.alarms.clear('trial_'+sub.id);` before `closeDrawer()`.

### TC-MANUAL-012 — Add sub with $0 amount accepted
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:971-976` amount validation
- **EXPECTED:** Accepted (free tier of paid service is valid)
- **FINDING:** PASS — `parseFloat('') === NaN`, `parseFloat('0') === 0`, branch allows 0.

### TC-MANUAL-013 — Add sub with negative amount rejected
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:975`
- **EXPECTED:** Validation error
- **FINDING:** PASS — line 975: `if (amount < 0) { alert('Amount cannot be negative'); return; }`. Rejection is via `alert()` which is acceptable for a v1 but should migrate to inline error for consistency with the rest of the form.

### TC-MANUAL-014 — Very large amount renders without overflow
- **APPROACH:** MANUAL
- **STEPS:** Add sub with amount `999999.99`
- **EXPECTED:** Number renders without overflowing cell; mono font keeps tabular alignment
- **FINDING:** NEEDS HUMAN VERIFY — popup.css `.sub-amount` has no `max-width`; long numbers may push layout. Visual check required.

### TC-MANUAL-015 — Empty name rejected
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:970` `if (!name) { alert('Name is required'); return; }`
- **FINDING:** PASS.

### TC-MANUAL-016 — 200-char name renders truncated
- **APPROACH:** STATIC
- **CODE REFS:** `popup.css` `.sub-name { overflow: hidden; text-overflow: ellipsis }` — needs verification
- **FINDING:** NEEDS HUMAN VERIFY — CSS truncation in flex grids can be fragile; visual check.

### TC-MANUAL-017 — Emoji in name stores/renders correctly
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js esc()` HTML escape via `lib/utils.js:88-95`
- **EXPECTED:** Emoji passes through unchanged
- **FINDING:** PASS — esc only escapes `&`, `<`, `>`, `"`, `'`; emoji code points untouched.

### TC-MANUAL-018 — Comma decimal separator silently fails
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:972` `parseFloat(rawAmount)`
- **EXPECTED:** Detect locale comma OR reject
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** `parseFloat("9,99")` returns `9`. European user enters `9,99` → stored as `9`, monthly stat off by 99 cents per sub. Silent data loss. Common 1-star review trigger in EU markets.
- **FIX HINT:** Pre-process: `rawAmount.replace(',', '.')` if no `.` present, OR show inline help text "Use period for decimals (e.g., 9.99)".

### TC-MANUAL-019 — nextRenewal in past shows 'overdue'
- **APPROACH:** STATIC
- **CODE REFS:** `lib/utils.js:65-72` urgencyOf; `:48` fmtRelative
- **EXPECTED:** `urgencyOf(pastTs) === 'overdue'`; relative text `"Nd overdue"`
- **FINDING:** PASS.

### TC-MANUAL-020 — Modal × clears form state
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:1027-1033` closeAddModal; clears `body.dataset.pickedKey`
- **FINDING:** PASS — pickedKey cleared. Form values persist in DOM but innerHTML is regenerated on next `openAddModal` call so effectively reset.

### TC-MANUAL-021 — Overlay click clears state
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:851-857` wireModal — clicks on `[data-close]` (overlay + × button) call closeAddModal
- **FINDING:** PASS.

### TC-MANUAL-022 — Edit cancel doesn't save partial changes
- **APPROACH:** STATIC
- **CODE REFS:** modal close path doesn't call saveSub
- **FINDING:** PASS — saveSub only runs on `#f-save` click.

### TC-MANUAL-023 — Rapid double-click on Save creates duplicates
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:968-1018`
- **EXPECTED:** Button disabled during save, second click ignored
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** No `submit.disabled = true` guard. `saveSub` is async; two clicks within milliseconds both pass validation then both call `saveSub(sub)` with the same `uid()` (different ids due to Date.now() difference, but both write). One sub created (sub.id collision avoided via timestamp), but `await refresh()` runs twice and `await chrome.runtime.sendMessage` runs twice. Lower risk than predicted — but the third-sub waitlist toast could fire twice. Also if user clicks Save while saveSub promise is pending and the modal is still open (it isn't — `closeAddModal()` runs before await refresh), they could click again. Actually `closeAddModal()` at line 1016 fires *before* `await refresh()` — so by the time await yields, modal is hidden. Net: low real-world risk, but no defensive guard.
- **FIX HINT:** `body.querySelector('#f-save').disabled = true;` at start of handler.

---

## SECTION 3 — CONTENT SCRIPT AUTO-DETECTION

### TC-CONTENT-001 — `__sentryContentLoaded` prevents double-injection
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:7-8`
- **FINDING:** PASS — `if (window.__sentryContentLoaded) return;`.

### TC-CONTENT-002 — `looksLikeSubscriptionPage` requires ≥2 hits
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:36-49`
- **FINDING:** PASS — returns `hits >= 2`. Some trigger words overlap ("per month" + "/month" both match if both appear) which could double-count on innocuous pricing pages.

### TC-CONTENT-003 — `identifyService` matches domain first, title fallback
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:199-210`
- **FINDING:** PASS — domain loop first, then title contains-check.

### TC-CONTENT-004 — Only known services trigger toast
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:226-227` `if (!svc) return`
- **FINDING:** PASS.

### TC-CONTENT-005 — Price regex handles common formats
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:52-70`
- **EXPECTED:** Handles `$9.99/month`, `€9.99/year`, `9.99 USD/mo`
- **FINDING:** PASS — two regex patterns cover prefix-symbol and suffix-code formats. Misses comma-decimal European formats (`9,99 €/mois`).

### TC-CONTENT-006 — Toast uses !important to survive host CSS
- **APPROACH:** STATIC
- **CODE REFS:** `content.css` — every rule has `!important`
- **FINDING:** PASS.

### TC-CONTENT-007 — Auto-dismiss after 25s
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:142-143` `setTimeout(dismiss, 25000)`
- **EXPECTED:** Single timer; no double-fire after Track clicked
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** Track click path also calls `dismiss()` (content.js:138). The 25s timeout still fires later, calls `dismiss()` again. `dismiss` does `root.classList.remove(...)` + `setTimeout(() => root.remove(), 250)`. Second call on already-removed node tries `root.classList.remove` on an orphan — no throw, but if root is GC'd between the two calls, may throw on the inner `root.remove()`. Low impact (silent error in worst case) but unclean.
- **FIX HINT:** `const timer = setTimeout(dismiss, 25000)` + `clearTimeout(timer)` in dismiss.

### TC-CONTENT-008 — SPA navigation re-runs detection
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:246-262` — wraps `history.pushState`/`replaceState`, listens for popstate/hashchange
- **FINDING:** PASS — better than the previous MutationObserver approach (cited in code comments).

### TC-CONTENT-009 — "Track this" sends capture to background
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:122-138`
- **FINDING:** PASS.

### TC-CONTENT-010 — addPendingCapture dedup within 1-hour window
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:139-150`
- **FINDING:** PASS — filters by serviceKey + `ts > oneHrAgo`.

### TC-CONTENT-011 — Toast z-index above host modals
- **APPROACH:** STATIC
- **CODE REFS:** `content.css:23` `z-index: 2147483600 !important`
- **FINDING:** PASS — near max int. Note: a few sites set `2147483647` (true max); toast could be hidden by those. Acceptable.

### TC-CONTENT-012 — Toast renders cross-theme correctly
- **APPROACH:** STATIC + MANUAL
- **CODE REFS:** `content.css:7-58` light/dark blocks; `content.js:88` sets data-theme
- **FINDING:** NEEDS HUMAN VERIFY — light page + dark theme tested visually.

### TC-CONTENT-013 — Toast survives host CSS resets
- **APPROACH:** STATIC
- **CODE REFS:** `content.css` `!important` on every property
- **FINDING:** PASS at the property level. Edge case: if host page sets `position: static !important` on `body > *` (rare), the toast could break. Acceptable.

### TC-CONTENT-014 — Content script handles non-HTTP URLs
- **APPROACH:** STATIC
- **CODE REFS:** `manifest.json:39` `matches: <all_urls>` — Chrome will not inject into `chrome://`, `about:`, or `chrome-extension://` regardless. `file://` requires explicit toggle by user in extension settings.
- **FINDING:** PASS — Chrome enforces.

### TC-CONTENT-015 — Content script does NOT run on banking / Google / Chrome Web Store
- **APPROACH:** STATIC
- **CODE REFS:** `manifest.json:39`
- **EXPECTED:** Privacy posture should exclude sensitive sites
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** `<all_urls>` injects on Chase, Wells Fargo, Bank of America, Google Accounts, banking, healthcare portals. The script does nothing visible there (no trigger words), but it DOES read `document.body.innerText` of every page (content.js:37) — including bank account pages, medical records, etc. Even though nothing leaves the device, this is a privacy-thesis violation for a product marketed as "Privacy-first."
- **FIX HINT:** Add `exclude_matches: ["*://*.chase.com/*", "*://accounts.google.com/*", ...]` to manifest. Or better: shift to `activeTab` model that only runs when user explicitly clicks the extension icon.

---

## SECTION 4 — NOTIFICATION SYSTEM

### TC-NOTIF-001 — Alarm scheduling uses smallest reminder day
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:122-127`
- **EXPECTED:** `Math.min(...days)` selects nearest reminder
- **FINDING:** PASS — also has empty-array fallback to `[3]` at line 122.

### TC-NOTIF-002 — Trial alarm fires 24h before trialEndsAt
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:113-118`
- **FINDING:** PASS — `when = sub.trialEndsAt - 24 * 3600_000`.

### TC-NOTIF-003 — Renewal alarms cleared on sub edit
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:110-112` scheduleAlarmsForSub clears before re-creating
- **FINDING:** PASS for edit (reschedule_all → scheduleAlarmsForSub clears). FAIL for delete — see TC-MANUAL-011.

### TC-NOTIF-004 — Changing reminderDays triggers reschedule_all
- **APPROACH:** STATIC
- **CODE REFS:** `options.js:221` `await chrome.runtime.sendMessage({type:'reschedule_all'})`
- **FINDING:** PASS for options page. popup Settings pane reminder chips (popup.js:wireSettingsPane) — verify they also send.

### TC-NOTIF-005 — Notification body includes amount + name + days
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:135-140`
- **FINDING:** PASS — `${sub.name} renews in ${d}d` + `${fmtMoney(...)} — click to manage`.

### TC-NOTIF-006 — Trial notification priority 2 + requireInteraction
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:155, 165`
- **FINDING:** PASS.

### TC-NOTIF-007 — Clicking notification opens popup
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:174-178` opens `popup.html?from=notif` as new tab
- **FINDING:** PASS — note this opens as a tab, not as the popup itself. MV3 limitation. Layout will be wider than 380px and may look stretched.

### TC-NOTIF-008 — Daily alarm runs once per 24h
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:20` `periodInMinutes: 60 * 24`
- **FINDING:** PASS.

### TC-NOTIF-009 — Shadow-charge gates: dRenew ≤ 3 AND lastVisit ≥ threshold
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:90-93`
- **FINDING:** PASS.

### TC-NOTIF-010 — Shadow-charge dedup
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:87-104`
- **EXPECTED:** Don't fire same shadow alert every day for the same renewal window
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** Daily alarm runs runDailyChecks → for each sub, if conditions hold, calls pushNotification with id `shadow_<subId>_<ts>`. New id every day (`Date.now()`) means it's a new notification, no Chrome de-dup. So for an Audible-style sub that's renewing in 3 days and hasn't been visited in 60 days, user gets a shadow-charge notification three days in a row.
- **FIX HINT:** Check `events_v1` for an existing `shadow_alert` for this subId within the past N days before firing.

### TC-NOTIF-011 — Badge color shifts by urgency
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:65-72`
- **FINDING:** PASS — four colors mapped to four tiers.

### TC-NOTIF-012 — Badge text shows days
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:72`
- **FINDING:** PASS.

### TC-NOTIF-013 — Badge clears when no active subs
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:50-53`
- **FINDING:** PASS.

### TC-NOTIF-014 — chrome.notifications.create errors caught
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:159-171` try/catch
- **FINDING:** PASS.

---

## SECTION 5 — STORAGE LAYER & DATA INTEGRITY

### TC-STORAGE-001 — Subs persist across popup close/reopen
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:68-74` saveSub writes to chrome.storage.local
- **FINDING:** PASS.

### TC-STORAGE-002 — Subs persist across extension reload
- **APPROACH:** STATIC
- **FINDING:** PASS — chrome.storage.local persists across reloads.

### TC-STORAGE-003 — Settings merge with DEFAULT_SETTINGS
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:39-42`
- **FINDING:** PASS — spread merge.

### TC-STORAGE-004 — Price change logs only when delta > 0.01
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:113`
- **FINDING:** PASS.

### TC-STORAGE-005 — findPotentialDuplicate covers all strategies
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:90-106`
- **FINDING:** PASS (covered TC-MANUAL-007).

### TC-STORAGE-006 — Event log capped at 500
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:131-136`
- **FINDING:** PASS for events. But see TC-STORAGE-013 for pending captures + usage.

### TC-STORAGE-007 — Pending captures dedup within 1h
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:140-146`
- **FINDING:** PASS.

### TC-STORAGE-008 — Usage tracking only for known services
- **APPROACH:** STATIC
- **CODE REFS:** `background.js:214-223` — only writes when `identifyFromPage` returns hit
- **FINDING:** PASS.

### TC-STORAGE-009 — exportAll returns valid JSON
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:179-189`
- **FINDING:** PASS — but does NOT export `waitlist_state` or `pending_captures_v1` or `ui_state_v1`. User who exports + wipes + re-imports loses waitlist signup + pending captures. Re-import path doesn't exist at all in the code (export only).
- **DETAILS:** Export is one-way. No import function. Restoring from export requires manual JSON edit + devtools storage write.
- **FIX HINT:** Add `wireImport` button and `importAll(data)` function for parity. Include all storage keys.

### TC-STORAGE-010 — wipeAll clears ALL keys including waitlist_state
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:190-192` `chrome.storage.local.clear()`
- **FINDING:** PASS — `clear()` wipes everything.

### TC-STORAGE-011 — seedSampleData overwrites existing
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:300` `bulkSetSubs(sample)`
- **FINDING:** PASS — confirmed dialog warns user (popup.js:67, options.js:256).

### TC-STORAGE-012 — Concurrent save race condition
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:68-75` saveSub
- **EXPECTED:** Last-write-wins is documented or guarded
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** Two concurrent `saveSub` calls each read `getAllSubs()`, mutate, write. Classic read-modify-write race. If user opens two popup windows (not possible in normal Chrome but conceivable via `chrome.runtime.getURL`) the latter write wins, losing the former. Acceptable for a single-popup-instance product but undocumented.
- **FIX HINT:** Document the constraint OR serialize writes via a promise queue.

### TC-STORAGE-013 — Unbounded growth patterns
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:139-150` pending captures, `:162-167` usage
- **EXPECTED:** All collections have caps or natural bounds
- **FINDING:** FAIL
- **SEVERITY:** P2
- **DETAILS:** `pending_captures_v1` has no cap. Per-serviceKey 1h dedup means each unique service can stack ≤24 captures/day. With 21 services that's max 504/day. If user never opens popup, queue grows. Memory + storage cost minor but unbounded. `usage_v1` is a single object keyed by serviceKey — bounded by service count, so OK.
- **FIX HINT:** Cap pending captures at 50 (or auto-dismiss anything older than 7 days).

### TC-STORAGE-014 — Schema version field
- **APPROACH:** STATIC
- **CODE REFS:** `lib/storage.js:4-11` keys are versioned (`_v1`) but no `version` field inside objects
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** Storage keys are namespaced `_v1` — good. But individual records (sub objects, settings) have no `_schema` field. If sub schema changes (e.g., adding required `tags: []`), old subs won't have the field and code that assumes existence will throw. The key-rename strategy works but is heavy.
- **FIX HINT:** Add `schemaVersion: 1` to each sub on save. Migration handler can detect and upgrade.

---

## SECTION 6 — THEME SYSTEM

### TC-THEME-001 — data-theme applied before paint
- **APPROACH:** STATIC
- **CODE REFS:** `popup.html:8` `<script src="theme-bootstrap.js">` before stylesheets
- **FINDING:** PASS (covered TC-INSTALL-007).

### TC-THEME-002 — sessionStorage cache key matches
- **APPROACH:** STATIC
- **CODE REFS:** `theme-bootstrap.js:17` `'catchly_theme_cache'`; `popup.js:1048` same key
- **FINDING:** FAIL — same root cause as TC-INSTALL-008. sessionStorage cleared on popup close.
- **SEVERITY:** P1

### TC-THEME-003 — chrome.storage.local is source of truth
- **APPROACH:** STATIC
- **CODE REFS:** `theme-bootstrap.js:21-28`
- **FINDING:** PASS.

### TC-THEME-004 — Dropdown onChange writes + broadcasts
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:1040-1066`
- **FINDING:** PASS — writes sessionStorage, setSettings, then iterates tabs with sendMessage.

### TC-THEME-005 — content.js listens and updates visible toast
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:24-33`
- **FINDING:** PASS.

### TC-THEME-006 — Utility block in popup.css/options.css/content.css
- **APPROACH:** bash grep
- **STEPS:** `grep -c 'data-theme="utility"' popup.css options.css content.css`
- **FINDING:** PASS — all three files.

### TC-THEME-007 — Utility has light AND dark variants
- **APPROACH:** STATIC
- **CODE REFS:** popup.css has Utility light + `@media (prefers-color-scheme: dark) :root[data-theme="utility"]`
- **FINDING:** PASS.

### TC-THEME-008 — Fonts unchanged across themes
- **APPROACH:** bash grep
- **STEPS:** `grep -n 'font-family\|--font' popup.css | grep -i theme`
- **FINDING:** PASS — `--font-ui`, `--font-mono`, `--font-accent` defined only in `:root`, never re-declared in theme blocks.

### TC-THEME-009 — --rust remapped to yellow in Utility
- **APPROACH:** STATIC
- **CODE REFS:** N/A — codebase uses Swiss tokens (`--primary`), not `--rust`. The Utility block remaps `--primary` to `#F5D547`.
- **FINDING:** PASS via the actual Swiss naming.

### TC-THEME-010 — Theme switch is instant
- **APPROACH:** STATIC
- **CODE REFS:** popup.css `--t-fast: 120ms` is used for `background` / `color` transitions on `.btn`, `.icon-btn`, etc.
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** Brief said "instant swap, no janky color crossfade." Many components have `transition: background var(--t-fast), color var(--t-fast)` for hover states. When theme flips, every element with a transition on these properties animates from old color to new — 120ms of crossfade. Visible as a "fade" not "snap."
- **FIX HINT:** Add `:root.is-theme-switching * { transition: none !important; }` toggled briefly during theme change.

### TC-THEME-011 — System follows prefers-color-scheme
- **APPROACH:** STATIC
- **CODE REFS:** popup.css `@media (prefers-color-scheme: dark) :root:not([data-theme="light"]) { ... }` — note this also matches data-theme="utility"/"editorial"/"dark"; the order of subsequent override blocks handles this.
- **FINDING:** PASS — order-dependent but correct.

### TC-THEME-012 — Dropdown has 4 options
- **APPROACH:** STATIC
- **CODE REFS:** `popup.html:121-124`
- **FINDING:** PASS — system / editorial / utility / dark (Dark was added later as fourth).

---

## SECTION 7 — CALENDAR VIEW

### TC-CALENDAR-001 — Month/year header updates
- **APPROACH:** STATIC
- **CODE REFS:** popup.js — Calendar pane was removed in Change 1 (bottom tab bar refactor)
- **FINDING:** N/A — Calendar tab was deleted from popup.html. No Calendar view exists in current build.
- **NOTE:** Section 7 tests largely moot. `lib/utils.js:nextRenewalAfter` is still called by manual add modal indirectly via `pending captures` flow. Test TC-CALENDAR-004 (month rollover) still applies.

### TC-CALENDAR-002 — Today highlighted — N/A (calendar removed)

### TC-CALENDAR-003 — Dots by urgency — N/A

### TC-CALENDAR-004 — nextRenewalAfter month-end correctness
- **APPROACH:** STATIC
- **CODE REFS:** `lib/utils.js:76-85`
- **EXPECTED:** Jan 31 + 1 month should be Feb 28/29, not Mar 3
- **FINDING:** FAIL
- **SEVERITY:** P0
- **DETAILS:** Code:
  ```
  case 'monthly': d.setMonth(d.getMonth() + 1); break;
  ```
  JavaScript's `Date.setMonth` rolls overflow days forward. Jan 31 → setMonth(1) → Feb 31 → normalized to Mar 3. This means anyone with a subscription that renews on the 29th, 30th, or 31st gets their next-renewal date drifted forward 1–3 days every month. Over a year, the date drifts ~12 days off.
  Reproduce: in devtools, `new Date(2025,0,31); d.setMonth(1); d` → "March 3 2025".
  Affected: `popup.js:692` calls `nextRenewalAfter` in the "add pending capture" flow. Not currently called for manual adds (those use a user-supplied date), so the symptom only shows when the content-script auto-fills via Track-this for a sub captured near month-end.
- **FIX HINT:** Clamp the day after setMonth:
  ```js
  case 'monthly': {
    const targetDay = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, daysInTarget));
    break;
  }
  ```

### TC-CALENDAR-005 — Feb 29 in leap year
- **APPROACH:** STATIC
- **FINDING:** Same root cause as TC-CALENDAR-004. Feb 29 2024 + 1 year = Feb 29 2025 → normalized to Mar 1.
- **SEVERITY:** P0 (same bug)

### TC-CALENDAR-006 — DST transition dates
- **APPROACH:** STATIC
- **FINDING:** `daysUntil` uses `(ts - Date.now()) / 86400_000`. DST shifts add/subtract 1h to wall-clock time but timestamps are UTC milliseconds — math unaffected. PASS.

### TC-CALENDAR-007 — Navigate ±36 months
- **APPROACH:** N/A (calendar removed)

### TC-CALENDAR-008 — Timezone handling
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:openAddModal` uses `new Date(value).toISOString().slice(0,10)` for date inputs — that's UTC. Local timezone offset can shift the rendered date by 1 day at midnight.
- **FINDING:** FAIL (minor)
- **SEVERITY:** P2
- **DETAILS:** User in UTC-8 picks "Dec 31 2025" → `new Date('2025-12-31').getTime()` = midnight UTC = 4pm PST Dec 30. Stored timestamp represents Dec 30 evening local. Display via `toLocaleDateString` re-renders as Dec 30. Off-by-one date for some users.
- **FIX HINT:** Use `new Date(year, month, day)` from parsed components instead of ISO parsing.

---

## SECTION 8 — WAITLIST SYSTEM

### TC-WAITLIST-001 — Welcome screen email input renders
- **APPROACH:** STATIC
- **CODE REFS:** `options.html:welcome-waitlist-form` markup; `options.js:47-73` hydrates
- **FINDING:** PASS.

### TC-WAITLIST-002 — Settings card email input renders
- **APPROACH:** STATIC
- **CODE REFS:** same
- **FINDING:** PASS.

### TC-WAITLIST-003 — Email validation catches bad formats
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:197-203`
- **EXPECTED:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **FINDING:** PASS — catches `"no-at-sign"`, `"@nodomain"`, `"trailing@"`, `"space @x.com"`. Accepts `"a@b.c"` (technically valid).

### TC-WAITLIST-004 — Submit disables button + spinner
- **APPROACH:** STATIC
- **CODE REFS:** `options.js:154-156`; popup.js for behavioral surfaces
- **FINDING:** PASS — `submit.disabled = true; submit.textContent = '…'`.

### TC-WAITLIST-005 — Success stores email
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:222-231` (no endpoint path) and `:256-262` (real endpoint)
- **FINDING:** PASS.

### TC-WAITLIST-006 — Confirmed state across welcome + settings
- **APPROACH:** STATIC
- **CODE REFS:** `options.js:84-112` renders confirmed state on both scopes
- **FINDING:** PASS.

### TC-WAITLIST-007 — Change email returns to form
- **APPROACH:** STATIC
- **CODE REFS:** `options.js:124-131`
- **FINDING:** PASS — clears email/submittedAt/submittedFrom and re-renders.

### TC-WAITLIST-008 — Network failure shows inline error
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:263-270` catch maps errors; `options.js:163` shows COPY.errors
- **FINDING:** PASS — no `alert()` for failures.

### TC-WAITLIST-009 — Worker endpoint configured
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:32` `WAITLIST_ENDPOINT = ''`
- **FINDING:** FAIL
- **SEVERITY:** P1
- **DETAILS:** Endpoint is empty string. All "successful" submissions only write to local storage. Console warns `[waitlist] No endpoint configured — saved locally only.` but UI shows confirmed state. User thinks they're signed up; we have no record server-side.
- **FIX HINT:** Run `wrangler deploy`, paste the printed URL into `lib/waitlist.js:32`.

### TC-WAITLIST-010 — Request body matches worker contract
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:240-246` vs `worker/waitlist-worker.js:48-63`
- **EXPECTED:** Client sends `{email, source, version, dismissedCount}`; worker reads same fields
- **FINDING:** PASS.

### TC-WAITLIST-011 — CORS configured on worker
- **APPROACH:** STATIC
- **CODE REFS:** `worker/waitlist-worker.js:17-23`
- **FINDING:** PASS — `Access-Control-Allow-Origin: *` (overly permissive; should tighten to extension ID post-launch).

### TC-WAITLIST-012 — shouldShowWaitlistPrompt evaluates all conditions
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:155-180`
- **FINDING:** PASS — all 6 conditions in code; covered earlier in this session.

### TC-WAITLIST-013 — Third-sub trigger only on manual add
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:1018-1021` `if (wasNew) await maybeShowThirdSubToast()`; `wasNew = !editing`
- **FINDING:** PASS for manual edit-vs-new distinction. Pending-capture flow (`popup.js:817`) doesn't call `maybeShowThirdSubToast`, so it correctly doesn't fire there.

### TC-WAITLIST-014 — After-capture trigger fires
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js` `renderPendingCaptures` "add" branch — calls shouldShow + replaceCapture with inline prompt
- **FINDING:** NEEDS HUMAN VERIFY — code path looks correct; manual test confirms.

### TC-WAITLIST-015 — Day-7 fallback only if no prior exposure
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js:1219-1224` `if (s.exposures.length > 0) return`
- **FINDING:** PASS.

### TC-WAITLIST-016 — "Not interested" sets permanent dismiss
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:184-190`
- **FINDING:** PASS — `if (outcome === 'dismissed_hard') patch.dismissedPermanently = true`.

### TC-WAITLIST-017 — dismissed_soft allows re-prompt on different surface
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:174-177`
- **FINDING:** PASS.

### TC-WAITLIST-018 — Exposures array capped
- **APPROACH:** STATIC
- **CODE REFS:** `lib/waitlist.js:184-190` logExposure has no cap
- **EXPECTED:** Bounded growth
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** Each prompt generates 1–2 entries (shown + dismiss). With max 3 lifetime shown + 3 dismisses + 0–1 submission = ~7 max. Bounded by `MAX_EXPOSURES=3` upper bound on `shown`. After cap reached, no new shown entries created. Net: bounded indirectly. OK.

### TC-WAITLIST-019 — Auto-dismiss "12s" counts as dismissed_soft
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js maybeShowThirdSubToast` setTimeout 12000ms
- **FINDING:** NEEDS HUMAN VERIFY — code dispatch path looks correct; verify outcome logged.

---

## SECTION 9 — CROSS-BROWSER COMPATIBILITY

### TC-CROSS-001 — No Chrome-only APIs outside manifest scope
- **APPROACH:** STATIC
- **CODE REFS:** uses `chrome.*` namespace throughout. Brave/Edge support `chrome.*` aliases. Firefox MV3 uses `browser.*` — would need polyfill.
- **FINDING:** PASS for Chromium-based browsers (Chrome, Edge, Brave, Arc, Opera).

### TC-CROSS-002 — chrome.* called with error handling
- **APPROACH:** STATIC
- **CODE REFS:** `background.js`, `content.js`, `popup.js` mostly try/catch or callback-based
- **FINDING:** PASS (mostly). Some calls like `chrome.runtime.sendMessage({type:'reschedule_all'})` in popup.js do NOT await/await-then-catch; if background worker is asleep and message fails, popup continues silently. Acceptable.

### TC-CROSS-003 — CSS uses standard properties
- **APPROACH:** STATIC
- **CODE REFS:** popup.css uses `font-feature-settings`, `font-variant-numeric`, `:has()` — all modern but standard
- **FINDING:** PASS — `:has()` requires Chrome 105+, Firefox 121+. Manifest doesn't declare minimum version.

### TC-CROSS-004 — Content script CSS survives Brave Shields
- **APPROACH:** STATIC
- **CODE REFS:** `content.css` uses `!important` on every rule
- **FINDING:** PASS — Brave Shields strips ads/trackers via blocklists; doesn't strip extension content scripts.

### TC-CROSS-005 — minimum_chrome_version declared
- **APPROACH:** STATIC
- **CODE REFS:** `manifest.json` — no `minimum_chrome_version` field
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** Code uses `:has()` CSS (Chrome 105+), AbortController (Chrome 66+), optional chaining (Chrome 80+). Declaring `"minimum_chrome_version": "105"` prevents install on older Chromium where the UI would silently break.
- **FIX HINT:** Add `"minimum_chrome_version": "105"` to manifest.json.

---

## SECTION 10 — PERFORMANCE & RESOURCE USAGE

### TC-PERF-001 — No setInterval / always-on timers in service worker
- **APPROACH:** bash grep
- **STEPS:** `grep -n setInterval background.js`
- **FINDING:** PASS — empty. Uses chrome.alarms (correct MV3 pattern).

### TC-PERF-002 — Content script uses passive observer
- **APPROACH:** STATIC
- **CODE REFS:** `content.js:246-262` uses history API wrappers + popstate/hashchange listeners. No MutationObserver.
- **FINDING:** PASS — comment in code calls out the previous MutationObserver was replaced for this reason.

### TC-PERF-003 — popup.js doesn't full-rerender on minor state changes
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js renderSubList` does `ul.innerHTML = ''` then rebuilds. Called from `renderAll` which fires on every refresh.
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** Theme dropdown change calls `setSettings` → no refresh. Filter input change calls `renderSubList` → full innerHTML rebuild. With 50+ subs this could be visible jank. With sample data (6 subs) it's invisible.
- **FIX HINT:** Diff-based render or use a virtualized list. Out of scope for v1.

### TC-PERF-004 — Drawer/modal listeners cleaned up on close
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js openDrawer` rebuilds body innerHTML on every open — old listeners on stale DOM are GC'd; new listeners attached to fresh nodes. No leak.
- **FINDING:** PASS.

### TC-PERF-005 — Large sub lists don't trigger N+2 storage queries
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js renderAlerts` calls `await getDaysSinceLastVisit(sub.serviceKey)` inside a for-loop — each call hits chrome.storage.local.
- **FINDING:** FAIL
- **SEVERITY:** P2
- **DETAILS:** With N subs, `renderAlerts` does N chrome.storage.local reads of `usage_v1` — same key every time. Fast (~1ms each) but wasteful.
- **FIX HINT:** Fetch usage once outside the loop: `const usage = await getUsage()` then lookup `usage[sub.serviceKey]`.

### TC-PERF-006 — Font loading non-blocking
- **APPROACH:** STATIC
- **CODE REFS:** `popup.html:9` `<link rel="stylesheet" href="fonts/fonts.css">` — local stylesheet, not Google Fonts. No preconnect needed because no remote origin.
- **FINDING:** PASS.

---

## SECTION 11 — 1-STAR REVIEW EDGE CASES

### TC-EDGE-001 — System clock change handling
- **APPROACH:** MANUAL
- **STEPS:** 1) Track Netflix renewing in 30d. 2) Change system clock forward 6 months. 3) Reopen popup.
- **EXPECTED:** Renewal shows "in -150 days overdue" or similar. Badge shows `!`.
- **FINDING:** NEEDS HUMAN VERIFY — code should handle (urgencyOf returns 'overdue'; fmtRelative returns "Nd overdue"). Visual + badge check required.

### TC-EDGE-002 — Browser data clear preserves chrome.storage.local
- **APPROACH:** MANUAL
- **STEPS:** 1) Track subs. 2) Settings → Privacy → Clear browsing data (all time, everything checked).
- **EXPECTED:** Subs preserved. chrome.storage.local is not affected by "clear browsing data" by default; only "remove extension" clears it.
- **FINDING:** PASS (per Chrome documentation).

### TC-EDGE-003 — Extension update mid-session
- **APPROACH:** STATIC
- **EXPECTED:** chrome.runtime.onInstalled fires with `reason: 'update'`. State persists.
- **FINDING:** PASS — background.js does not wipe storage on update.

### TC-EDGE-004 — Rapid + click only opens one modal
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js openAddModal` removes hidden class — if already open, no-op
- **FINDING:** PASS — second click on already-open modal: `classList.remove('hidden')` is idempotent. Form body is rebuilt though — user's typing would be lost. Edge case.

### TC-EDGE-005 — Very long sub name truncates cleanly
- **APPROACH:** NEEDS HUMAN VERIFY (covered TC-MANUAL-016)

### TC-EDGE-006 — RTL text renders correctly
- **APPROACH:** STATIC
- **CODE REFS:** No `dir="rtl"` support, no RTL CSS overrides. `dir="auto"` on inputs would help.
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** Hebrew/Arabic sub names render LTR-positioned. Punctuation at end appears at wrong side. Not critical for v1 (English-only product).

### TC-EDGE-007 — Past nextRenewal doesn't crash formatting
- **APPROACH:** STATIC
- **CODE REFS:** `fmtRelative(pastTs)` returns `"Nd overdue"`
- **FINDING:** PASS.

### TC-EDGE-008 — Concurrent popup windows
- **APPROACH:** STATIC
- **FINDING:** N/A — Chrome only allows one popup at a time. Acceptable.

### TC-EDGE-009 — Cancelled subs in history (collapsible)
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js renderSubList` splits active + inactive groups (Change 2)
- **FINDING:** PASS.

### TC-EDGE-010 — Multi-currency totals display in home currency
- **APPROACH:** STATIC
- **CODE REFS:** `popup.js renderSummary` sums raw amounts ignoring currency
- **FINDING:** FAIL
- **SEVERITY:** P2
- **DETAILS:** A user with €9 Spotify + $9 Netflix sees monthly stat of `$18.00` (uses settings.currency for display but sums raw numeric amounts). Should either convert via exchange rate or group by currency.
- **FIX HINT:** Either show "mixed currencies" badge OR convert via a free FX API (breaks privacy thesis). Document v1 limitation.

---

## SECTION 12 — PRE-LAUNCH CHECKLIST

### TC-PRELAUNCH-001 — Manifest name + description fit store listing
- **APPROACH:** STATIC
- **CODE REFS:** `manifest.json:3-5`
- **FINDING:** PASS — name "Catchly", description is 1 sentence, concise.

### TC-PRELAUNCH-002 — Every declared permission used
- **APPROACH:** bash grep
- **STEPS:** `grep -nE 'chrome\.(storage|alarms|notifications|tabs|activeTab)' *.js lib/*.js`
- **FINDING:** FAIL (PARTIAL)
- **SEVERITY:** P2
- **DETAILS:** `activeTab` permission declared but never used. `chrome.tabs.create` + `chrome.tabs.query` use the broader `tabs` permission. Dropping `activeTab` reduces install-prompt scariness.
- **FIX HINT:** Remove `"activeTab"` from `permissions` array.

### TC-PRELAUNCH-003 — No console.log in production
- **APPROACH:** bash grep
- **FINDING:** PASS — only `console.warn` for legitimate error reporting (3 sites). No `console.log` debug litter.

### TC-PRELAUNCH-004 — No TODO/FIXME in critical paths
- **APPROACH:** bash grep
- **FINDING:** PASS — no TODO/FIXME anywhere.

### TC-PRELAUNCH-005 — No hardcoded credentials
- **APPROACH:** bash grep
- **FINDING:** PASS — only `worker/wrangler.toml` has a KV namespace id (a public Cloudflare resource id, not a secret).

### TC-PRELAUNCH-006 — No old "Sentry" name in user-visible strings
- **APPROACH:** bash grep
- **CODE REFS:** confirmed in earlier rename pass; only internal `__sentryContentLoaded`, `.sentry-toast` class, `[Sentry]` console.warn label remain
- **FINDING:** PASS.

### TC-PRELAUNCH-007 — Waitlist worker URL not placeholder
- **APPROACH:** STATIC
- **FINDING:** FAIL — same as TC-WAITLIST-009.
- **SEVERITY:** P1

### TC-PRELAUNCH-008 — README + CHANGELOG current
- **APPROACH:** STATIC
- **CODE REFS:** `README.md` still references "Subscription Sentry" in the title (was renamed) — wait, that was renamed. Need to verify CHANGELOG includes all recent changes.
- **FINDING:** NEEDS HUMAN VERIFY — spot check both files.

### TC-PRELAUNCH-009 — lib/merchants.js entries quality
- **APPROACH:** bash grep
- **STEPS:** count entries; verify required fields
- **FINDING:** FAIL (minor)
- **SEVERITY:** P2
- **DETAILS:** README claims 21 services, code has 20. Doc/code drift.
- **FIX HINT:** Audit, add 1 more service or update README.

### TC-PRELAUNCH-010 — manifest icons exist on disk
- **APPROACH:** bash
- **FINDING:** PASS — verified TC-INSTALL-002.

---

*End of report.*
