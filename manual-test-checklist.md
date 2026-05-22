# Catchly — Manual Test Checklist

Run through linearly. Should complete in under 60 minutes.

**Setup before you start:**
- [ ] Load the extension fresh at `chrome://extensions/` → Load unpacked → select the `catchly/` folder
- [ ] Open DevTools on the popup (right-click extension icon → Inspect popup) and the background worker (extension card → "service worker" link)
- [ ] Keep `chrome://extensions/` open in another tab for quick reloads

---

## A. Install + first-run

### A1. Fresh-install opens welcome tab
- [ ] Remove the extension, then re-add via "Load unpacked"
- **Expected:** A new tab opens at `options.html?welcome=1` automatically
- **Verifies:** TC-INSTALL-003

### A2. Reload does NOT re-open welcome
- [ ] On the extension card, click the reload icon (↻)
- **Expected:** No new tab opens; existing storage preserved
- **Verifies:** TC-INSTALL-004

### A3. Popup opens without console errors
- [ ] Click the extension icon to open popup
- [ ] Check popup DevTools → Console
- **Expected:** No red errors. `[waitlist] No endpoint configured` warning is acceptable (only appears on submit, not boot).
- **Verifies:** TC-INSTALL-006

### A4. firstUseTs is stamped
- [ ] In popup DevTools → Application → Storage → Extension → check `waitlist_state`
- **Expected:** Object with `firstUseTs: <epoch ms>` set to current time
- **Verifies:** TC-INSTALL-009

### A5. Uninstall + reinstall wipes storage
- [ ] Track a sub via the `+` button
- [ ] Remove extension → reload unpacked
- [ ] Open popup
- **Expected:** Empty state, no leftover sub
- **Verifies:** TC-INSTALL-005

---

## B. Theme switching + flash-of-wrong-theme

### B1. Default theme on first open
- [ ] Fresh install, open popup
- [ ] Inspect `<html>` element via popup DevTools
- **Expected:** `data-theme="system"`
- **Verifies:** TC-THEME-001

### B2. Switch to Utility
- [ ] Popup → bottom tab "Settings" → Theme dropdown → "Utility (off-white + yellow)"
- **Expected:** Instant swap to off-white canvas + yellow accents; popup `<html>` shows `data-theme="utility"`; chrome.storage.local.settings_v1.theme = "utility"
- **Verifies:** TC-THEME-004

### B3. Flash-of-wrong-theme on popup re-open
- [ ] With Utility theme set, close popup, immediately re-open
- [ ] Watch carefully on the first ~50ms
- **Expected (bug):** Brief flash of System (white) theme before snapping to Utility
- **Verifies (confirms bug):** TC-INSTALL-008 / TC-THEME-002
- **Note:** If you don't see the flash, try slowing CPU via DevTools → Performance → CPU 6x throttling, then re-open.

### B4. Force Dark mode
- [ ] Settings → Theme → "Dark (force dark mode)"
- **Expected:** Popup turns dark (navy canvas, blue accent) regardless of OS theme
- **Verifies:** TC-THEME-012

### B5. System theme follows OS
- [ ] Settings → Theme → "System"
- [ ] Toggle macOS Dark Mode / Windows Dark Mode at OS level
- **Expected:** Popup follows OS within 100ms (no reload required)
- **Verifies:** TC-THEME-011

### B6. Toast re-themes on live theme change
- [ ] Open a tab on `https://chatgpt.com/#pricing` (or similar trigger page) — toast appears
- [ ] While toast is visible, switch popup theme
- **Expected:** Toast updates to new theme without dismissing
- **Verifies:** TC-THEME-005

---

## C. Manual add flow

### C1. Quick-pick prefills fields
- [ ] Popup → `+` icon → click Spotify tile
- **Expected:** Name = Spotify, amount = 11.99, currency = USD, cycle = monthly, category = Music
- **Verifies:** TC-MANUAL-001

### C2. Empty name rejected
- [ ] `+` → leave Name empty → Save
- **Expected:** alert "Name is required"
- **Verifies:** TC-MANUAL-015

### C3. Negative amount rejected
- [ ] `+` → enter Name "Test", Amount "-5" → Save
- **Expected:** alert "Amount cannot be negative"
- **Verifies:** TC-MANUAL-013

### C4. Comma-decimal silently truncates (bug)
- [ ] `+` → Name "Spotify EU", Amount "9,99", click Save
- **Expected (bug):** Sub created with amount = 9, not 9.99. Check via popup DevTools → Storage → `subs_v1` → newest entry.
- **Verifies:** TC-MANUAL-018

### C5. Duplicate add not blocked (bug)
- [ ] `+` → Netflix → Save. `+` → Netflix → Save (twice).
- **Expected (bug):** Two Netflix entries created with no warning.
- **Verifies:** TC-MANUAL-006

### C6. Rapid double-click on Save (bug)
- [ ] `+` → fill in any sub → triple-click Save button rapidly
- **Expected (bug):** No visible duplicate sub created (id collision via timestamp prevents true dup) BUT third-sub waitlist toast may fire twice on the third add. Check storage → `events_v1` for double exposure entries.
- **Verifies:** TC-MANUAL-023

### C7. Long name renders cleanly
- [ ] `+` → Name = paste a 200-char string → Save → check sub-list row
- **Expected:** Truncated with ellipsis, no layout overflow into the amount column
- **Verifies:** TC-MANUAL-016

### C8. Large amount renders cleanly
- [ ] `+` → Amount = 999999.99 → Save → check sub row + summary stat
- **Expected:** Number fits within the cell, mono font keeps tabular alignment
- **Verifies:** TC-MANUAL-014

### C9. Modal close clears state
- [ ] `+` → click Netflix tile (prefills fields) → close via × → click `+` again
- **Expected:** Fields are empty (not Netflix prefilled)
- **Verifies:** TC-MANUAL-020

---

## D. Delete + alarm cleanup

### D1. Orphaned alarms after delete (bug)
- [ ] Track a sub
- [ ] In background DevTools console: `chrome.alarms.getAll().then(a => console.table(a))`
- [ ] Note the `renewal_<id>` entry
- [ ] Open popup → click the sub → drawer → Delete → confirm
- [ ] Re-run `chrome.alarms.getAll().then(a => console.table(a))`
- **Expected (bug):** The `renewal_<id>` alarm is still there
- **Verifies:** TC-MANUAL-011

---

## E. Content script + capture toast

### E1. Toast appears on signup page
- [ ] Navigate to `https://chatgpt.com/#pricing` (or `https://www.spotify.com/premium`)
- **Expected:** After ~1.5 seconds, toast slides in from bottom-right with "Subscription detected — ChatGPT Plus" + Track / Not now buttons
- **Verifies:** TC-CONTENT-004

### E2. Auto-dismiss after 25s
- [ ] On the toast, wait without clicking
- **Expected:** Toast disappears after exactly 25 seconds
- **Verifies:** TC-CONTENT-007 (visual) — bug is silent (timer still runs after manual dismiss; can't see in UI but check console for any GC errors)

### E3. Track-this saves capture
- [ ] On the toast → click "Track this"
- [ ] Open popup
- **Expected:** Pending-capture strip at top shows the captured service. Click Track on it → moves to main sub list.
- **Verifies:** TC-CONTENT-009

### E4. Toast cross-theme rendering
- [ ] Switch popup theme to Utility
- [ ] Reload a signup page (e.g., `https://chatgpt.com/#pricing`)
- **Expected:** Toast renders in Utility theme (off-white background, yellow accent bar, ink text)
- **Verifies:** TC-CONTENT-012

### E5. Content script runs on banking sites (privacy bug)
- [ ] Open `https://chase.com` (or any bank login page)
- [ ] In page DevTools console: `window.__sentryContentLoaded`
- **Expected (bug):** Returns `true` — script has injected on the bank site
- **Verifies:** TC-CONTENT-015

---

## F. Notifications + badge

### F1. Badge shows urgency color
- [ ] Settings → Load sample data
- [ ] Check the extension toolbar icon
- **Expected:** Badge shows "2" (sample data has Adobe trial ending in 2 days), color is urgent rust
- **Verifies:** TC-NOTIF-011 / TC-NOTIF-012

### F2. Badge clears when no active subs
- [ ] Cancel all sample subs via drawer → "Mark as cancelled"
- **Expected:** Badge text disappears
- **Verifies:** TC-NOTIF-013

### F3. Shadow-charge re-fires daily (bug)
- [ ] Load sample data (Audible matches the shadow profile)
- [ ] In background DevTools console: trigger `chrome.alarms.getAll()` to find the daily alarm
- [ ] Trigger manually 3 times: in background console run:
  ```js
  chrome.runtime.sendMessage({ type: 'noop' }); // wakeup
  // Then fire the daily-checks logic 3x by re-importing the module or by editing the sub's lastVisit
  ```
  (alternative: change system clock forward 24h, twice)
- **Expected (bug):** New shadow-charge notification each time (3 total). No dedup.
- **Verifies:** TC-NOTIF-010

---

## G. Calendar / date math (P0)

### G1. Month rollover bug (P0)
- [ ] In popup DevTools console:
  ```js
  const { nextRenewalAfter } = await import(chrome.runtime.getURL('lib/utils.js'));
  const jan31 = new Date(2025, 0, 31).getTime();
  new Date(nextRenewalAfter(jan31, 'monthly'));
  ```
- **Expected (bug):** Returns `March 3 2025`, not `Feb 28 2025`
- **Verifies:** TC-CALENDAR-004

### G2. Leap-year Feb 29 bug (P0)
- [ ] In popup DevTools console:
  ```js
  const feb29 = new Date(2024, 1, 29).getTime();
  new Date(nextRenewalAfter(feb29, 'yearly'));
  ```
- **Expected (bug):** Returns `March 1 2025`, not `Feb 28 2025`
- **Verifies:** TC-CALENDAR-005

---

## H. Waitlist

### H1. Endpoint not deployed (bug)
- [ ] Popup → Settings → Advanced settings (opens options.html) → Settings tab → "What's coming" card
- [ ] Enter `test@example.com` → Notify me
- [ ] Check options-page DevTools → Console
- **Expected (bug):** Warning: `[waitlist] No endpoint configured — saved locally only.` Yet UI shows confirmed state.
- **Verifies:** TC-WAITLIST-009

### H2. Confirmed state shows email
- [ ] After H1, look at the welcome card AND settings card
- **Expected:** Both show green check + email + "We'll email you when Gmail auto-scan launches" + Change email button
- **Verifies:** TC-WAITLIST-006

### H3. Change email returns to form
- [ ] On confirmed state → click "Change email"
- **Expected:** Form re-appears, input focused, ready for new value
- **Verifies:** TC-WAITLIST-007

### H4. After-capture inline prompt
- [ ] Reset state via DevTools console: `chrome.storage.local.remove(['waitlist_state'])` then set `firstUseTs` 25h+ ago:
  ```js
  await chrome.storage.local.set({ waitlist_state: { firstUseTs: Date.now() - 26*3600*1000, exposures: [], dismissedPermanently: false, email: null } });
  ```
- [ ] Trigger a capture on a known service, click "Track this", open popup
- **Expected:** Pending-capture row resolves and is replaced in place by an inline waitlist prompt
- **Verifies:** TC-WAITLIST-014

### H5. Auto-dismiss third-sub toast after 12s
- [ ] Reset waitlist state with `firstUseTs` 25h ago (as in H4)
- [ ] Add 3 subs manually (via `+` button)
- [ ] Third sub triggers slide-up toast at bottom of popup
- [ ] Wait 12s without clicking
- **Expected:** Toast slides down. Check storage → `waitlist_state.exposures` for entry with `outcome: 'dismissed_soft'`.
- **Verifies:** TC-WAITLIST-019

---

## I. Edge cases

### I1. System clock forward 6 months
- [ ] Track a sub renewing in 30 days
- [ ] OS: change system clock forward 6 months
- [ ] Reopen popup
- **Expected:** Sub shows "150d overdue" (or similar), badge shows `!`
- **Verifies:** TC-EDGE-001

### I2. README + CHANGELOG sanity
- [ ] Open `README.md` and `CHANGELOG.md`
- **Expected:** README title says "Catchly" (not "Subscription Sentry"). CHANGELOG has Part A/B/C entries through the recent rename + theme work.
- **Verifies:** TC-PRELAUNCH-008

---

## Summary

After completing all checks above, count failures. Cross-reference with `critical-bugs.md` to confirm severity. Anything new found goes back into `test-report.md` as a "DISCOVERED DURING MANUAL VERIFY" entry.
