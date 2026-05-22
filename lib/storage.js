// Storage layer — chrome.storage.local wrapper.
// All data stays on-device. No sync, no account, no server.

const STORE_KEYS = {
  SUBS: 'subs_v1',
  EVENTS: 'events_v1',           // price changes, captures, cancellations
  SETTINGS: 'settings_v1',
  CAPTURES_PENDING: 'pending_captures_v1',
  USAGE: 'usage_v1',             // last-visit timestamps per service key (shadow-charge)
  UI_STATE: 'ui_state_v1'        // collapse state for sub-list groups (Change 2)
};

const DEFAULT_UI_STATE = {
  activeCollapsed: false,
  inactiveCollapsed: true
};

// Sub-record schema version. Bump when the shape of a sub object changes in
// a way that older code can't handle. saveSub / bulkSetSubs stamp every
// write with this value; getAllSubs runs each record through migrateSub
// on read so v0 records (anything pre-stamp) get upgraded lazily.
const SUB_SCHEMA_VERSION = 1;

function migrateSub(sub) {
  if (!sub) return sub;
  const current = sub.schemaVersion || 0;
  if (current >= SUB_SCHEMA_VERSION) return sub;
  // No breaking changes between v0 (unstamped) and v1 — just stamp the
  // field so future migrations have a known baseline. When we add v2:
  //   if (current < 2) { /* apply v1 -> v2 transform */ }
  // chain them in order from `current` up to SUB_SCHEMA_VERSION.
  return { ...sub, schemaVersion: SUB_SCHEMA_VERSION };
}

const DEFAULT_SETTINGS = {
  currency: 'USD',
  reminderDays: [7, 3, 1],
  notifyTrials: true,
  notifyHikes: true,
  notifyShadow: true,
  shadowDaysThreshold: 60,
  detectOnPages: true,
  theme: 'system'
};

// ---------- generic get/set ----------
async function get(key, fallback) {
  const res = await chrome.storage.local.get(key);
  return res[key] !== undefined ? res[key] : fallback;
}
async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ---------- settings ----------
export async function getSettings() {
  const s = await get(STORE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...s };
}
export async function setSettings(patch) {
  const cur = await getSettings();
  await set(STORE_KEYS.SETTINGS, { ...cur, ...patch });
}

// ---------- ui state (Change 2: collapsible sub-list groups) ----------
export async function getUiState() {
  const s = await get(STORE_KEYS.UI_STATE, {});
  return { ...DEFAULT_UI_STATE, ...s };
}
export async function setUiState(patch) {
  const cur = await getUiState();
  await set(STORE_KEYS.UI_STATE, { ...cur, ...patch });
}

// ---------- subscriptions ----------
// Every read passes through migrateSub so callers see schema-current records.
// Every write stamps schemaVersion explicitly so a future migration always
// has a known baseline to upgrade from.
export async function getAllSubs() {
  const subs = await get(STORE_KEYS.SUBS, []);
  return subs.map(migrateSub);
}

export async function getSub(id) {
  const subs = await getAllSubs();
  return subs.find(s => s.id === id) || null;
}

export async function saveSub(sub) {
  const subs = await getAllSubs();
  const stamped = { ...sub, schemaVersion: SUB_SCHEMA_VERSION };
  const idx = subs.findIndex(s => s.id === stamped.id);
  if (idx >= 0) subs[idx] = stamped;
  else subs.push(stamped);
  await set(STORE_KEYS.SUBS, subs);
  return stamped;
}

export async function deleteSub(id) {
  const subs = await getAllSubs();
  const next = subs.filter(s => s.id !== id);
  await set(STORE_KEYS.SUBS, next);
}

export async function bulkSetSubs(subs) {
  const stamped = (subs || []).map(s => ({ ...s, schemaVersion: SUB_SCHEMA_VERSION }));
  await set(STORE_KEYS.SUBS, stamped);
}

// ---------- duplicate detection ----------
// Fuzzy match on name + price + cycle to avoid Subscription Stopper's
// "had to manually delete the 10th and re-add each one" complaint.
export async function findPotentialDuplicate(candidate) {
  const subs = await getAllSubs();
  const candName = (candidate.name || '').toLowerCase();
  const candKey = candidate.serviceKey;

  for (const s of subs) {
    if (s.status === 'cancelled') continue;
    if (candKey && s.serviceKey === candKey) return s;
    const sName = (s.name || '').toLowerCase();
    if (sName === candName) return s;
    if (sName && candName && (sName.includes(candName) || candName.includes(sName))) {
      const priceClose = Math.abs((s.amount || 0) - (candidate.amount || 0)) < 1;
      if (priceClose) return s;
    }
  }
  return null;
}

// ---------- price-hike detection ----------
// Differentiator #1 nobody else does well.
export async function checkAndRecordPriceChange(sub, newAmount) {
  if (!sub || typeof newAmount !== 'number') return null;
  const oldAmount = sub.amount;
  if (Math.abs(newAmount - oldAmount) < 0.01) return null;
  await logEvent({
    type: 'price_change',
    subId: sub.id,
    subName: sub.name,
    from: oldAmount,
    to: newAmount,
    currency: sub.currency || 'USD',
    ts: Date.now()
  });
  return { from: oldAmount, to: newAmount, delta: newAmount - oldAmount };
}

// ---------- events / activity log ----------
export async function getEvents(limit = 50) {
  const events = await get(STORE_KEYS.EVENTS, []);
  return events.slice(-limit).reverse();
}
export async function logEvent(evt) {
  const events = await get(STORE_KEYS.EVENTS, []);
  events.push(evt);
  if (events.length > 500) events.splice(0, events.length - 500);
  await set(STORE_KEYS.EVENTS, events);
}

// ---------- pending captures (from content script) ----------
export async function addPendingCapture(capture) {
  const pending = await get(STORE_KEYS.CAPTURES_PENDING, []);
  // dedupe within last hour by serviceKey
  const oneHrAgo = Date.now() - 3600_000;
  const recent = pending.filter(p =>
    p.serviceKey === capture.serviceKey && p.ts > oneHrAgo
  );
  if (recent.length) return null;
  pending.push({ ...capture, ts: Date.now(), id: `cap_${Date.now()}` });
  await set(STORE_KEYS.CAPTURES_PENDING, pending);
  return pending[pending.length - 1];
}
export async function getPendingCaptures() {
  return await get(STORE_KEYS.CAPTURES_PENDING, []);
}
export async function dismissCapture(id) {
  const pending = await get(STORE_KEYS.CAPTURES_PENDING, []);
  await set(STORE_KEYS.CAPTURES_PENDING, pending.filter(p => p.id !== id));
}

// ---------- usage tracking (shadow-charge detection) ----------
// Records the last time the user visited a known service domain.
// Used to flag "you haven't logged in for 60+ days but this renews tomorrow."
export async function recordUsage(serviceKey) {
  if (!serviceKey) return;
  const usage = await get(STORE_KEYS.USAGE, {});
  usage[serviceKey] = Date.now();
  await set(STORE_KEYS.USAGE, usage);
}
export async function getUsage() {
  return await get(STORE_KEYS.USAGE, {});
}
export async function getDaysSinceLastVisit(serviceKey) {
  const usage = await getUsage();
  const last = usage[serviceKey];
  if (!last) return null;
  return Math.floor((Date.now() - last) / 86400_000);
}

// ---------- export / import / wipe ----------
export async function exportAll() {
  const subs = await getAllSubs();
  const events = await get(STORE_KEYS.EVENTS, []);
  const settings = await getSettings();
  const usage = await getUsage();
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    subs, events, settings, usage
  };
}
export async function wipeAll() {
  await chrome.storage.local.clear();
}

// ---------- sample data ----------
// For instant demo on first install. Users can wipe in settings.
export async function seedSampleData() {
  const now = Date.now();
  const day = 86400_000;
  const sample = [
    {
      id: 'demo_netflix',
      serviceKey: 'netflix',
      name: 'Netflix',
      plan: 'Premium',
      amount: 24.99,
      previousAmount: 22.99,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 3 * day,
      startedAt: now - 400 * day,
      status: 'active',
      isTrial: false,
      category: 'Streaming',
      color: '#E50914',
      cancelUrl: 'https://www.netflix.com/cancelplan',
      notes: ''
    },
    {
      id: 'demo_chatgpt',
      serviceKey: 'chatgpt',
      name: 'ChatGPT Plus',
      plan: 'Plus',
      amount: 20.00,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 18 * day,
      startedAt: now - 90 * day,
      status: 'active',
      isTrial: false,
      category: 'AI',
      color: '#10A37F',
      cancelUrl: 'https://chatgpt.com/#settings/Billing'
    },
    {
      id: 'demo_audible',
      serviceKey: 'audible',
      name: 'Audible',
      plan: 'Premium Plus',
      amount: 14.95,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 11 * day,
      startedAt: now - 210 * day,
      status: 'active',
      isTrial: false,
      category: 'Audio',
      color: '#F8991C',
      cancelUrl: 'https://www.audible.com/account/membership-details'
    },
    {
      id: 'demo_adobe_trial',
      serviceKey: 'adobecc',
      name: 'Adobe Creative Cloud',
      plan: 'All Apps (Free Trial)',
      amount: 59.99,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 2 * day,
      startedAt: now - 5 * day,
      status: 'active',
      isTrial: true,
      trialEndsAt: now + 2 * day,
      category: 'Design',
      color: '#FA0F00',
      cancelUrl: 'https://account.adobe.com/plans'
    },
    {
      id: 'demo_spotify',
      serviceKey: 'spotify',
      name: 'Spotify',
      plan: 'Individual',
      amount: 11.99,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 22 * day,
      startedAt: now - 700 * day,
      status: 'active',
      isTrial: false,
      category: 'Music',
      color: '#1DB954',
      cancelUrl: 'https://www.spotify.com/account/subscription/'
    },
    {
      id: 'demo_nyt',
      serviceKey: 'nyt',
      name: 'New York Times',
      plan: 'All Access',
      amount: 17.00,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 8 * day,
      startedAt: now - 500 * day,
      status: 'active',
      isTrial: false,
      category: 'News',
      color: '#000000',
      cancelUrl: 'https://myaccount.nytimes.com/seg/subscription'
    }
  ];
  await bulkSetSubs(sample);
  // Seed usage data: Audible hasn't been visited in 87 days → shadow charge
  const usage = {
    netflix: now - 2 * day,
    chatgpt: now - 1 * day,
    audible: now - 87 * day,
    spotify: now - 0.5 * day,
    nyt: now - 40 * day,
    adobecc: now - 3 * day
  };
  await set(STORE_KEYS.USAGE, usage);
  await logEvent({
    type: 'price_change',
    subId: 'demo_netflix',
    subName: 'Netflix',
    from: 22.99, to: 24.99, currency: 'USD', ts: now - 6 * day
  });
  await logEvent({ type: 'sample_loaded', ts: now });
}
