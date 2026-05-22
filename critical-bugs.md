# Catchly — Critical Bugs (P0 + P1)

Triage list for the dev. Sorted by severity, then by surface. Each entry: TC ID, name, impact, fix hint, code anchor.

---

## P0 — Block any release

### TC-CALENDAR-004 — Monthly renewal drifts forward 1–3 days
- **Impact:** Every subscription with renewal day 29/30/31 silently drifts forward. Over 12 months the date can drift ~12 days. Trial-end calculations are also affected (popup.js pending-capture flow seeds 7-day trial via `now + 7 * day` which is fine, but renewal recomputation uses `nextRenewalAfter`).
- **Root cause:** `lib/utils.js:78` uses `d.setMonth(d.getMonth() + 1)`. JS rolls overflow days: Jan 31 → Feb 31 → normalized to Mar 3.
- **Fix:** Clamp the day after setMonth.
  ```js
  case 'monthly': {
    const targetDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, daysInTarget));
    break;
  }
  ```
  Same for `'quarterly'` and `'yearly'` (Feb 29 leap → Feb 28 non-leap).

---

## P1 — Must fix before public launch

### TC-INSTALL-008 / TC-THEME-002 — Flash-of-wrong-theme on every popup open
- **Impact:** Users who pick Editorial/Utility/Dark see the System theme flash for ~5-50ms every popup open before async storage read swaps to their pick. Visible flicker. Looks broken.
- **Root cause:** `theme-bootstrap.js:17` reads `sessionStorage["catchly_theme_cache"]` synchronously, but sessionStorage is per-page-session in Chrome extension popups → cleared on every popup close. The fast-path cache never actually hits.
- **Fix:** Use `chrome.storage.session` (MV3 only, persists for browser session) instead of sessionStorage, OR hide `<body>` until async storage read completes.
  ```js
  chrome.storage.session.get('catchly_theme_cache', (res) => { ... });
  ```

### TC-MANUAL-011 — Orphaned alarms after sub delete
- **Impact:** Deleted subs leave their `renewal_<id>` and `trial_<id>` alarms scheduled. They never fire user-visible notifications (background.js:131-133 returns silently when sub is missing) but they consume the 500-alarm Chrome limit. Power users with frequent add/delete cycles hit the cap.
- **Root cause:** `popup.js:738-742` delete handler doesn't clear alarms.
- **Fix:**
  ```js
  await chrome.alarms.clear(`renewal_${sub.id}`);
  await chrome.alarms.clear(`trial_${sub.id}`);
  await deleteSub(sub.id);
  ```

### TC-MANUAL-018 — Comma-decimal input silently truncates
- **Impact:** EU user enters `9,99` for a sub price. `parseFloat("9,99") === 9`. Stored as $9. Monthly/yearly stats off by 99¢ per sub. Silent data loss; common 1-star trigger in EU markets.
- **Root cause:** `popup.js:972` uses `parseFloat` directly on the raw input.
- **Fix:** Detect comma-as-decimal before parsing:
  ```js
  const normalized = rawAmount.includes(',') && !rawAmount.includes('.')
    ? rawAmount.replace(',', '.')
    : rawAmount;
  const parsedAmount = parseFloat(normalized);
  ```
  Or add help text "Use a period for decimals."

### TC-MANUAL-023 — Save button not disabled during async save
- **Impact:** Rapid double-click on Save fires the handler twice. Second call may double-write storage, double-broadcast reschedule, double-fire the third-sub waitlist toast trigger. Low real-world risk but unclean.
- **Root cause:** `popup.js:968-1022` has no `submit.disabled = true` guard.
- **Fix:**
  ```js
  const save = body.querySelector('#f-save');
  save.addEventListener('click', async () => {
    if (save.disabled) return;
    save.disabled = true;
    try { /* existing handler body */ } finally { save.disabled = false; }
  });
  ```

### TC-CONTENT-007 — Toast auto-dismiss runs after manual dismiss
- **Impact:** When user clicks "Track this", `dismiss()` runs immediately. The 25-second `setTimeout(dismiss, 25000)` still fires later, calling `dismiss()` again on an already-removed node. Silent no-op in current code, but if root is GC'd the inner `root.remove()` could throw. Also wastes a timer slot.
- **Root cause:** `content.js:143` setTimeout has no clear path.
- **Fix:**
  ```js
  const timer = setTimeout(dismiss, 25000);
  const dismiss = () => { clearTimeout(timer); root.classList.remove('sentry-toast-in'); setTimeout(() => root.remove(), 250); };
  ```
  (or capture timer id and clear inside dismiss).

### TC-CONTENT-015 — Content script injects on banking / Google / sensitive sites
- **Impact:** Privacy thesis violation. Catchly's pitch is "local-only, no bank login." But `<all_urls>` in manifest injects content.js into Chase, Wells Fargo, Google Accounts, healthcare portals, etc. Script does nothing visible there but reads `document.body.innerText` of every page. Even though nothing leaves the device, a security-conscious user inspecting the extension finds it can read their bank balances.
- **Root cause:** `manifest.json:39` `matches: ["<all_urls>"]`.
- **Fix:** Add `exclude_matches` for high-sensitivity domains, or shift to `activeTab` model (script only runs when user explicitly clicks the extension icon).
  ```json
  "exclude_matches": [
    "*://*.chase.com/*", "*://*.bankofamerica.com/*", "*://*.wellsfargo.com/*",
    "*://accounts.google.com/*", "*://accounts.apple.com/*"
  ]
  ```

### TC-NOTIF-010 — Shadow-charge notification re-fires daily
- **Impact:** A sub renewing in 3 days that hasn't been visited in 60+ days triggers a shadow-charge notification. The daily alarm runs again 24h later, conditions still hold, notification fires again. User gets the same alert 3 days in a row. Notification fatigue → user disables notifications entirely.
- **Root cause:** `background.js:94-101` `pushNotification` is called unconditionally inside the daily loop. New notification id every time (`Date.now()` suffix), so Chrome doesn't dedup.
- **Fix:** Check the event log before firing.
  ```js
  const recentShadow = await getEvents(20).then(es =>
    es.find(e => e.type === 'shadow_alert' && e.subId === sub.id && Date.now() - e.ts < 7 * 86400_000)
  );
  if (recentShadow) continue;
  ```

### TC-STORAGE-014 — No schema version field on records
- **Impact:** Storage keys are namespaced `_v1` (good) but individual sub records have no `_schema` field. If a future version adds a required field (e.g., `tags: []`), old records lack it and code that iterates assuming presence will throw. Migration becomes a full rename-key cycle which loses cross-key references.
- **Fix:** Add `schemaVersion: 1` to each sub on save. Migration helper checks version on read and upgrades.

### TC-WAITLIST-009 / TC-PRELAUNCH-007 — Worker endpoint not wired
- **Impact:** Every "successful" waitlist submission writes locally only. Console logs `[waitlist] No endpoint configured — saved locally only.` but UI shows confirmed state. Server never receives signups. The whole waitlist validation experiment fails.
- **Root cause:** `lib/waitlist.js:32` `WAITLIST_ENDPOINT = ''`.
- **Fix:**
  1. `cd worker && wrangler deploy`
  2. Copy the printed `*.workers.dev` URL.
  3. Paste into `lib/waitlist.js:32` as `WAITLIST_ENDPOINT = 'https://.../signup'`.
  4. Reload extension.

### TC-MANUAL-006 — Manual add bypasses duplicate detection
- **Impact:** Users can add Netflix three times via the + button without any "already tracking" warning. Pending-capture flow catches duplicates (via `findPotentialDuplicate`) but manual flow does not.
- **Root cause:** `popup.js:968-1018` save handler goes straight to `saveSub` without calling `findPotentialDuplicate`.
- **Fix:** Inject duplicate check before save when `editing` is null:
  ```js
  if (!editing) {
    const dup = await findPotentialDuplicate({ name, amount, serviceKey: pickedKey });
    if (dup && !confirm(`Already tracking ${dup.name}. Add anyway?`)) return;
  }
  ```

---

## Pre-launch must-fix (not bugs per se but launch blockers)

- **TC-PRELAUNCH-007** — Same as TC-WAITLIST-009.
- **TC-PRELAUNCH-009** — `lib/merchants.js` ships 20 services but README claims 21. Doc/code drift.
- **TC-CROSS-005** — Declare `"minimum_chrome_version": "105"` in manifest (CSS `:has()` requires it).

---

*P2 issues are listed in `test-report.md` and can be deferred.*
