// popup.js — the dashboard.
// CHANGE LOG (most recent on top):
//   Part B   — behavioral waitlist re-prompts: third-sub bottom toast,
//              after-capture inline replacement, day-7 fallback banner.
//              All three gated by lib/waitlist.js shouldShowWaitlistPrompt
//              (24h no-prompt window, max 3 'shown' lifetime, 7-day gap,
//              no back-to-back same surface, permanent opt-out wins).
//   Change 3 — brand logos everywhere. 32px brand-square (SVG from logos/ when
//              service is known, else solid brand-color tile with first-letter
//              monogram) replaces the old 24px monogram block on sub rows,
//              pending captures, alert rows, drawer header (48px), and the
//              quick-pick grid in the Add modal.
//   Change 2 — sub-list now groups Active + Inactive into collapsible sections
//              (chevron headers with counts, collapse state persisted via
//              getUiState/setUiState in chrome.storage.local). Inactive rows
//              dimmed to 60% with "Cancelled <date>" instead of countdown.
//   Change 1 — bottom tab bar with 4 destinations (Subs/Alerts/Insights/Settings),
//              header gear removed (Settings now a tab), Calendar tab dropped,
//              Alerts moved to its own pane, inline Settings pane with theme/
//              currency/notification controls + Advanced settings link.
// Loads data, renders panes, handles drawer + modal, reconciles pending captures,
// computes alerts (price hikes, shadow charges, trials).

import {
  getAllSubs, saveSub, deleteSub, getSettings, setSettings,
  getPendingCaptures, dismissCapture, findPotentialDuplicate,
  getEvents, seedSampleData, getDaysSinceLastVisit, logEvent,
  checkAndRecordPriceChange,
  getUiState, setUiState
} from './lib/storage.js';
import { SERVICES, listServices } from './lib/merchants.js';
import {
  uid, fmtMoney, fmtRelative, fmtDate, daysUntil,
  urgencyOf, toMonthly, toYearly, nextRenewalAfter, esc
} from './lib/utils.js';
import {
  COPY as WL_COPY,
  markFirstUseIfUnset,
  shouldShowWaitlistPrompt,
  submitEmail as wlSubmitEmail,
  isValidEmail as wlIsValidEmail,
  logExposure as wlLogExposure,
  getWaitlistState
} from './lib/waitlist.js';

// ----------------------------------------------------------------------------
// state
// ----------------------------------------------------------------------------
const state = {
  subs: [],
  settings: null,
  filter: '',
  sort: 'renewal',
  calCursor: new Date(),
  events: [],
  ui: { activeCollapsed: false, inactiveCollapsed: true } // Change 2
};

// ----------------------------------------------------------------------------
// boot
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  applyStoredTheme();
  wireBrandSquareFallback();
  // Mark first popup-open time so the 24h no-prompt window can start ticking.
  // Idempotent — no-op after the first call. (Part B)
  await markFirstUseIfUnset();
  await refresh();
  wireHeader();
  wireTabs();
  wireListTools();
  wireDrawer();
  wireModal();
  wireKeyboard();
  wireSettingsPane();
  await renderPendingCaptures();
  // Day-7 fallback banner — gated by shouldShowWaitlistPrompt. (Part B5)
  await maybeShowFallbackBanner();
});

// Apply stored theme as early as possible to avoid flash.
function applyStoredTheme() {
  try {
    chrome.storage.local.get('settings_v1', (res) => {
      const t = (res?.settings_v1?.theme) || 'system';
      setThemeAttr(t);
    });
  } catch {}
}
// Whitelist: system | editorial | utility. Legacy auto/light/dark from the
// old segmented control collapse to 'system'. Always sets the attribute so
// CSS rules selecting [data-theme="..."] can match deterministically.
function setThemeAttr(theme) {
  const valid = { system: 1, editorial: 1, utility: 1, dark: 1 };
  const next = valid[theme] ? theme : 'system';
  document.documentElement.setAttribute('data-theme', next);
}

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      const modal = document.getElementById('add-modal');
      const drawer = document.getElementById('drawer');
      if (modal && !modal.classList.contains('hidden')) { closeAddModal(); return; }
      if (drawer && !drawer.classList.contains('hidden')) { closeDrawer(); return; }
    }
    if (e.key === '/' && !inField) {
      const s = document.getElementById('search');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    }
  });
}

async function refresh() {
  state.subs = await getAllSubs();
  state.settings = await getSettings();
  state.events = await getEvents(20);
  state.ui = await getUiState();
  await renderAll();
}

async function renderAll() {
  renderSummary();
  renderSubList();
  renderInsights();
  await renderAlerts();
  syncSettingsPane();
}

// ----------------------------------------------------------------------------
// header
// ----------------------------------------------------------------------------
function wireHeader() {
  document.getElementById('btn-add').addEventListener('click', () => openAddModal());
  // Gear icon removed — Settings is now a bottom tab. See wireSettingsPane().
  document.getElementById('btn-advanced')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('btn-add-empty')?.addEventListener('click', () => openAddModal());
  document.getElementById('btn-seed')?.addEventListener('click', async () => {
    if (!confirm('Load sample subscriptions? This will overwrite your current tracked subs.')) return;
    await seedSampleData();
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    await refresh();
  });
}

// ----------------------------------------------------------------------------
// tabs
// ----------------------------------------------------------------------------
function wireTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
      const target = btn.dataset.tab;
      document.querySelectorAll('.pane').forEach(p => {
        p.classList.toggle('active', p.dataset.pane === target);
      });
    });
  });
}

// ----------------------------------------------------------------------------
// summary strip
// ----------------------------------------------------------------------------
function renderSummary() {
  const active = state.subs.filter(s => s.status === 'active');
  const month = active.reduce((sum, s) => sum + toMonthly(s.amount || 0, s.cycle || 'monthly'), 0);
  const year = active.reduce((sum, s) => sum + toYearly(s.amount || 0, s.cycle || 'monthly'), 0);
  document.getElementById('stat-month').textContent = fmtMoney(month, state.settings.currency);
  document.getElementById('stat-year').textContent = fmtMoney(year, state.settings.currency);
  document.getElementById('stat-count').textContent = String(active.length);
}

// ----------------------------------------------------------------------------
// alerts: price hikes, shadow charges, trials ending
// ----------------------------------------------------------------------------
const ALERT_ICONS = {
  hike:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  trial:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>`,
  shadow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
};

// ----------------------------------------------------------------------------
// brand square — real brand logo from simpleicons.org CDN over a brand-color
// tile. Falls back to first-letter monogram on the brand tile if the CDN
// fetch fails (handled by a single global error listener wired at boot to
// avoid inline onerror handlers, which MV3 CSP blocks). (Change 3)
// ----------------------------------------------------------------------------
function cdnLogoUrl(slug) {
  // Simple Icons colorized endpoint: returns the official monochrome mark
  // tinted to the given hex (no #). We use FFFFFF so the mark sits on top
  // of our brand-color tile.
  return `https://cdn.simpleicons.org/${encodeURIComponent(slug)}/FFFFFF`;
}

function brandSquareHtml({ serviceKey, color, name, logo, cdnSlug } = {}, size = 32) {
  const svc = serviceKey ? SERVICES[serviceKey] : null;
  const slug = cdnSlug || svc?.cdnSlug || null;
  const brand = color || svc?.color || '#15110C';
  const displayName = name || svc?.name || '';
  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?';
  const radius = size >= 40 ? 8 : 6;
  const fontSize = Math.max(10, Math.round(size * 0.45));
  const imgSize = Math.round(size * 0.6);
  const styleTile = `width:${size}px;height:${size}px;border-radius:${radius}px;background:${esc(brand)};`;
  if (slug) {
    return `<span class="brand-square" data-initial="${esc(initial)}" data-fs="${fontSize}" style="${styleTile}"><img src="${cdnLogoUrl(slug)}" alt="" width="${imgSize}" height="${imgSize}" loading="lazy"/></span>`;
  }
  // Fallback: solid brand bg + white letter
  return `<span class="brand-square brand-fallback" style="${styleTile}font-size:${fontSize}px;">${esc(initial)}</span>`;
}

// Global error fallback — if the CDN image fails (offline, CDN down, slug
// not found), swap the broken <img> for the first-letter monogram. Capture
// phase because <img> error events don't bubble. Registered once at boot.
function wireBrandSquareFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const parent = img.closest('.brand-square');
    if (!parent || !parent.dataset.initial) return;
    img.remove();
    parent.classList.add('brand-fallback');
    parent.style.fontSize = parent.dataset.fs + 'px';
    parent.textContent = parent.dataset.initial;
  }, true);
}

async function renderAlerts() {
  const host = document.getElementById('alerts');
  host.innerHTML = '';
  const items = [];

  const s = state.settings || {};
  for (const sub of state.subs) {
    if (sub.status !== 'active') continue;

    // Price hike (previousAmount stored)
    if (s.notifyHikes !== false && sub.previousAmount && sub.previousAmount !== sub.amount) {
      const delta = sub.amount - sub.previousAmount;
      if (delta > 0) {
        items.push({
          color: 'rust',
          icon: 'hike',
          subRef: sub,
          title: `${sub.name} went up ${fmtMoney(delta, sub.currency)}`,
          sub: `${fmtMoney(sub.previousAmount, sub.currency)} → ${fmtMoney(sub.amount, sub.currency)} / ${sub.cycle}`,
          action: 'Review',
          onAction: () => openDrawer(sub.id)
        });
      }
    }

    // Trial ending soon
    if (s.notifyTrials !== false && sub.isTrial && sub.trialEndsAt) {
      const d = daysUntil(sub.trialEndsAt);
      if (d !== null && d >= 0 && d <= 3) {
        items.push({
          color: 'clay',
          icon: 'trial',
          subRef: sub,
          title: `Free trial: ${sub.name} ends ${d === 0 ? 'today' : `in ${d}d`}`,
          sub: `Will auto-charge ${fmtMoney(sub.amount, sub.currency)} unless cancelled`,
          action: 'Cancel',
          onAction: () => openDrawer(sub.id)
        });
      }
    }

    // Shadow charge: renewal soon + not visited in a while
    if (s.notifyShadow !== false && sub.serviceKey) {
      const dRenew = daysUntil(sub.nextRenewal);
      const lastVisit = await getDaysSinceLastVisit(sub.serviceKey);
      if (
        dRenew !== null && dRenew >= 0 && dRenew <= 7 &&
        lastVisit !== null && lastVisit >= (state.settings.shadowDaysThreshold || 60)
      ) {
        items.push({
          color: '',
          icon: 'shadow',
          subRef: sub,
          title: `Shadow charge: ${sub.name}`,
          sub: `Renews in ${dRenew}d. You haven't visited in ${lastVisit} days.`,
          action: 'Review',
          onAction: () => openDrawer(sub.id)
        });
      }
    }
  }

  // De-dupe per sub (one alert max in this strip)
  const seen = new Set();
  const unique = items.filter(it => {
    const k = it.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const slice = unique.slice(0, 8);
  for (const a of slice) {
    const el = document.createElement('div');
    el.className = `alert ${a.color ? 'alert-' + a.color : ''}`;
    const iconSvg = ALERT_ICONS[a.icon] || '';
    const brandHtml = a.subRef ? brandSquareHtml(a.subRef, 28) : '';
    el.innerHTML = `
      ${brandHtml}
      ${iconSvg ? `<div class="alert-icon">${iconSvg}</div>` : ''}
      <div class="alert-body">
        <div class="alert-title">${esc(a.title)}</div>
        <div class="alert-sub">${esc(a.sub)}</div>
      </div>
      <button class="alert-act">${esc(a.action)}</button>
    `;
    el.querySelector('.alert-act').addEventListener('click', a.onAction);
    host.appendChild(el);
  }

  // empty state + tab badge (Change 1)
  const empty = document.getElementById('alerts-empty');
  if (empty) empty.classList.toggle('hidden', slice.length > 0);
  const badge = document.getElementById('tab-alerts-badge');
  if (badge) {
    if (slice.length) {
      badge.textContent = String(slice.length);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// ----------------------------------------------------------------------------
// sub list
// ----------------------------------------------------------------------------
function wireListTools() {
  document.getElementById('search').addEventListener('input', (e) => {
    state.filter = e.target.value.toLowerCase().trim();
    renderSubList();
  });
  document.getElementById('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderSubList();
  });
}

function renderSubList() {
  const ul = document.getElementById('sub-list');
  const empty = document.getElementById('empty-state');
  ul.innerHTML = '';

  const filterFn = (s) => {
    if (!state.filter) return true;
    return (s.name || '').toLowerCase().includes(state.filter) ||
           (s.category || '').toLowerCase().includes(state.filter);
  };
  const sortActive = (a, b) => {
    if (state.sort === 'amount') return (b.amount || 0) - (a.amount || 0);
    if (state.sort === 'name')   return (a.name || '').localeCompare(b.name || '');
    return (a.nextRenewal || 0) - (b.nextRenewal || 0);
  };
  const sortInactive = (a, b) => (b.cancelledAt || 0) - (a.cancelledAt || 0);

  const active   = state.subs.filter(s => s.status === 'active').filter(filterFn).sort(sortActive);
  const inactive = state.subs.filter(s => s.status !== 'active').filter(filterFn).sort(sortInactive);

  // Total empty state — no subs in either bucket
  if (active.length === 0 && inactive.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  if (active.length > 0) {
    ul.appendChild(buildGroup({
      key: 'active',
      label: active.length === 1 ? 'Active Subscription' : 'Active Subscriptions',
      count: active.length,
      collapsed: !!state.ui.activeCollapsed,
      rows: active,
      inactive: false
    }));
  }
  if (inactive.length > 0) {
    ul.appendChild(buildGroup({
      key: 'inactive',
      label: 'Inactive',
      count: inactive.length,
      collapsed: !!state.ui.inactiveCollapsed,
      rows: inactive,
      inactive: true
    }));
  }
}

function buildGroup({ key, label, count, collapsed, rows, inactive }) {
  // <li> wrapper so #sub-list (a <ul>) stays semantically valid
  const wrap = document.createElement('li');
  wrap.className = `sub-group ${collapsed ? 'is-collapsed' : ''}`;
  wrap.dataset.group = key;

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'group-header';
  header.setAttribute('aria-expanded', String(!collapsed));
  header.setAttribute('aria-controls', `sub-group-${key}-rows`);
  header.innerHTML = `
    <span class="group-chevron" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </span>
    <span class="group-label">${esc(label)}</span>
    <span class="group-count">${count}</span>
  `;
  header.addEventListener('click', async () => {
    const isCollapsed = wrap.classList.toggle('is-collapsed');
    header.setAttribute('aria-expanded', String(!isCollapsed));
    const patch = key === 'active'
      ? { activeCollapsed: isCollapsed }
      : { inactiveCollapsed: isCollapsed };
    state.ui = { ...state.ui, ...patch };
    await setUiState(patch);
  });

  const rowsWrap = document.createElement('ul');
  rowsWrap.className = 'group-rows';
  rowsWrap.id = `sub-group-${key}-rows`;

  for (const sub of rows) {
    rowsWrap.appendChild(buildSubItem(sub, inactive));
  }

  wrap.appendChild(header);
  wrap.appendChild(rowsWrap);
  return wrap;
}

function buildSubItem(sub, inactive) {
  const li = document.createElement('li');
  li.className = inactive ? 'sub-item sub-item-inactive' : 'sub-item';
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `${sub.name}, ${fmtMoney(sub.amount || 0, sub.currency)} per ${sub.cycle || 'month'}`);

  const brand = brandSquareHtml(sub, 32);

  if (inactive) {
    const cancelledLabel = sub.cancelledAt
      ? `Cancelled ${fmtDate(sub.cancelledAt)}`
      : 'Cancelled';
    li.innerHTML = `
      ${brand}
      <div class="sub-main">
        <div class="sub-name">${esc(sub.name)}</div>
        <div class="sub-meta">${esc(cancelledLabel)}</div>
      </div>
      <div class="sub-right">
        <div class="sub-amount">${fmtMoney(sub.amount || 0, sub.currency)}</div>
      </div>
    `;
  } else {
    const renewalTs = sub.isTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.nextRenewal;
    const u = urgencyOf(renewalTs);
    const whenClass = u === 'safe' ? '' : `when-${u}`;
    const hike = sub.previousAmount && sub.amount > sub.previousAmount;
    li.innerHTML = `
      ${brand}
      <div class="sub-main">
        <div class="sub-name">
          ${esc(sub.name)}
          ${sub.isTrial ? '<span class="sub-pill pill-trial">trial</span>' : ''}
          ${hike ? '<span class="sub-pill pill-hike">price ↑</span>' : ''}
        </div>
        <div class="sub-meta">${esc(sub.plan || sub.category || sub.cycle || '')}</div>
      </div>
      <div class="sub-right">
        <div class="sub-amount">${fmtMoney(sub.amount || 0, sub.currency)}</div>
        <div class="sub-when ${whenClass}">${esc(fmtRelative(renewalTs))}</div>
      </div>
    `;
  }

  li.addEventListener('click', () => openDrawer(sub.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDrawer(sub.id);
    }
  });
  return li;
}

// ----------------------------------------------------------------------------
// calendar
// ----------------------------------------------------------------------------
function wireCalendarNav() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() + 1, 1);
    renderCalendar();
  });
}

function renderCalendar() {
  const cursor = state.calCursor;
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  document.getElementById('cal-title').textContent = monthLabel;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // bucket subs by day
  const buckets = {};
  for (const s of state.subs) {
    if (s.status !== 'active') continue;
    const t = s.isTrial && s.trialEndsAt ? s.trialEndsAt : s.nextRenewal;
    if (!t) continue;
    const d = new Date(t);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    if (!buckets[day]) buckets[day] = [];
    buckets[day].push(s);
  }

  // fill in leading blanks (previous month)
  for (let i = 0; i < startDow; i++) {
    const el = document.createElement('div');
    el.className = 'cal-other';
    el.textContent = '';
    grid.appendChild(el);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const el = document.createElement('div');
    const isToday =
      year === today.getFullYear() &&
      month === today.getMonth() &&
      day === today.getDate();
    if (isToday) el.classList.add('cal-today');
    el.setAttribute('role', 'gridcell');
    const dateLabel = new Date(year, month, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (buckets[day]) {
      const names = buckets[day].map(s => s.name).join(', ');
      el.setAttribute('aria-label', `${dateLabel}: ${names}`);
      el.setAttribute('tabindex', '0');
    } else {
      el.setAttribute('aria-label', dateLabel);
    }
    el.innerHTML = `<div>${day}</div>`;
    if (buckets[day]) {
      const dotsDiv = document.createElement('div');
      dotsDiv.className = 'cal-day-dots';
      for (const sub of buckets[day]) {
        const t = sub.isTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.nextRenewal;
        const u = urgencyOf(t);
        const dot = document.createElement('span');
        dot.className = `dot dot-${u === 'overdue' ? 'urgent' : u}`;
        dot.title = `${sub.name} — ${fmtMoney(sub.amount || 0, sub.currency)}`;
        dotsDiv.appendChild(dot);
      }
      el.appendChild(dotsDiv);
    }
    grid.appendChild(el);
  }
  // trailing blanks to fill last row
  const total = startDow + daysInMonth;
  const trailing = (7 - (total % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    const el = document.createElement('div');
    el.className = 'cal-other';
    grid.appendChild(el);
  }
}

// ----------------------------------------------------------------------------
// insights
// ----------------------------------------------------------------------------
function renderInsights() {
  const active = state.subs.filter(s => s.status === 'active');

  // category bars
  const byCat = {};
  for (const s of active) {
    const cat = s.category || 'Other';
    byCat[cat] = (byCat[cat] || 0) + toMonthly(s.amount || 0, s.cycle || 'monthly');
  }
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  const bars = document.getElementById('cat-bars');
  bars.innerHTML = '';
  if (entries.length === 0) {
    bars.innerHTML = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px 0;">No data yet.</div>`;
  } else {
    for (const [name, amt] of entries) {
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div class="cat-name">${esc(name)}</div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.round((amt / max) * 100)}%"></div></div>
        <div class="cat-amt">${fmtMoney(amt, state.settings.currency)}/mo</div>
      `;
      bars.appendChild(row);
    }
  }

  // recent activity
  const list = document.getElementById('event-list');
  list.innerHTML = '';
  if (!state.events.length) {
    list.innerHTML = `<li style="color:var(--muted);font-style:italic;border:none;padding:4px 0;">No activity yet.</li>`;
  } else {
    for (const e of state.events.slice(0, 8)) {
      const li = document.createElement('li');
      let text = '';
      if (e.type === 'price_change') {
        const cur = e.currency || state.settings.currency;
        text = `${e.subName}: ${fmtMoney(e.from, cur)} → ${fmtMoney(e.to, cur)}`;
      } else if (e.type === 'capture_added') {
        text = `Tracked ${e.subName}`;
      } else if (e.type === 'capture_dismissed') {
        text = `Dismissed capture: ${e.subName}`;
      } else if (e.type === 'sub_cancelled') {
        text = `Cancelled ${e.subName}`;
      } else if (e.type === 'shadow_alert') {
        text = `Shadow alert sent`;
      } else if (e.type === 'sample_loaded') {
        text = `Loaded sample data`;
      } else {
        text = e.type;
      }
      li.innerHTML = `<span class="event-text">${esc(text)}</span><span class="event-when">${esc(fmtDate(e.ts))}</span>`;
      list.appendChild(li);
    }
  }

  // year recap
  const yearTotal = active.reduce((sum, s) => sum + toYearly(s.amount || 0, s.cycle || 'monthly'), 0);
  document.getElementById('recap-num').textContent = fmtMoney(yearTotal, state.settings.currency);
  const expensive = [...active].sort((a, b) => toMonthly(b.amount || 0, b.cycle) - toMonthly(a.amount || 0, a.cycle))[0];
  document.getElementById('recap-foot').textContent = expensive
    ? `${expensive.name} is your biggest line item (${fmtMoney(toMonthly(expensive.amount, expensive.cycle), expensive.currency)}/mo).`
    : 'Add a subscription to see insights.';
}

// ----------------------------------------------------------------------------
// drawer (subscription detail)
// ----------------------------------------------------------------------------
function wireDrawer() {
  const drawer = document.getElementById('drawer');
  drawer.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest('[data-close]')) {
      closeDrawer();
    }
  });
}

function openDrawer(subId) {
  const sub = state.subs.find(s => s.id === subId);
  if (!sub) return;
  const drawer = document.getElementById('drawer');
  const body = document.getElementById('drawer-body');
  document.getElementById('drawer-eyebrow').textContent = sub.category || 'Subscription';

  const renewalTs = sub.isTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.nextRenewal;
  const u = urgencyOf(renewalTs);
  const cancelInfo = SERVICES[sub.serviceKey];

  const hikeWarn = sub.previousAmount && sub.amount > sub.previousAmount
    ? `<div class="detail-warn detail-warn-hike">Price went up from ${fmtMoney(sub.previousAmount, sub.currency)} to ${fmtMoney(sub.amount, sub.currency)} this cycle.</div>`
    : '';

  const trialWarn = sub.isTrial && sub.trialEndsAt
    ? `<div class="detail-warn">Free trial ends ${fmtDate(sub.trialEndsAt)}. Auto-charges ${fmtMoney(sub.amount, sub.currency)} unless cancelled.</div>`
    : '';

  const stepsHtml = cancelInfo?.cancelSteps
    ? `<div class="card-eyebrow" style="margin-top:14px">how to cancel</div>
       <ol class="cancel-steps">${cancelInfo.cancelSteps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
    : '';

  body.innerHTML = `
    <div class="detail-hero">
      ${brandSquareHtml(sub, 48)}
      <div style="flex:1;min-width:0;">
        <div class="detail-title">${esc(sub.name)}</div>
        <div class="detail-sub">${esc([sub.plan, sub.category].filter(Boolean).join(' · '))}</div>
      </div>
    </div>

    ${hikeWarn}
    ${trialWarn}

    <div class="detail-rows">
      <div class="detail-row"><span class="detail-key">Amount</span><span class="detail-val">${fmtMoney(sub.amount, sub.currency)} / ${esc(sub.cycle)}</span></div>
      <div class="detail-row"><span class="detail-key">Monthly equivalent</span><span class="detail-val">${fmtMoney(toMonthly(sub.amount, sub.cycle), sub.currency)}</span></div>
      <div class="detail-row"><span class="detail-key">Yearly equivalent</span><span class="detail-val">${fmtMoney(toYearly(sub.amount, sub.cycle), sub.currency)}</span></div>
      <div class="detail-row"><span class="detail-key">${sub.isTrial ? 'Trial ends' : 'Next renewal'}</span><span class="detail-val">${esc(fmtDate(renewalTs))} <em style="color:var(--muted);font-style:normal;">(${esc(fmtRelative(renewalTs))})</em></span></div>
      ${sub.startedAt ? `<div class="detail-row"><span class="detail-key">Started</span><span class="detail-val">${esc(fmtDate(sub.startedAt))}</span></div>` : ''}
    </div>

    ${stepsHtml}

    <div class="detail-actions">
      ${sub.cancelUrl ? `<button class="btn" id="d-cancel-open">Open cancel page</button>` : ''}
      <button class="btn btn-secondary" id="d-mark-cancelled">Mark as cancelled (already done)</button>
      <button class="btn btn-ghost" id="d-edit">Edit</button>
      <button class="btn btn-ghost" id="d-delete" style="color:var(--danger)">Delete</button>
    </div>
  `;

  body.querySelector('#d-cancel-open')?.addEventListener('click', () => {
    if (sub.cancelUrl) chrome.tabs.create({ url: sub.cancelUrl });
  });
  body.querySelector('#d-mark-cancelled')?.addEventListener('click', async () => {
    sub.status = 'cancelled';
    sub.cancelledAt = Date.now();
    await saveSub(sub);
    await logEvent({ type: 'sub_cancelled', subId: sub.id, subName: sub.name, ts: Date.now() });
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    closeDrawer();
    await refresh();
  });
  body.querySelector('#d-edit')?.addEventListener('click', () => {
    closeDrawer();
    openAddModal(sub);
  });
  body.querySelector('#d-delete')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${sub.name} from tracking?`)) return;
    await deleteSub(sub.id);
    closeDrawer();
    await refresh();
  });

  drawer.classList.remove('hidden');
}

function closeDrawer() {
  document.getElementById('drawer').classList.add('hidden');
}

// ----------------------------------------------------------------------------
// pending captures (from content script)
// ----------------------------------------------------------------------------
async function renderPendingCaptures() {
  const pending = await getPendingCaptures();
  const host = document.getElementById('pending-captures');
  host.innerHTML = '';
  if (!pending.length) { host.classList.add('hidden'); return; }
  host.classList.remove('hidden');

  for (const p of pending) {
    // Check for duplicate against existing subs
    const dup = await findPotentialDuplicate({ ...p, serviceKey: p.serviceKey });
    const wrap = document.createElement('div');
    wrap.className = 'capture';
    wrap.innerHTML = `
      ${brandSquareHtml({ serviceKey: p.serviceKey, color: p.color, name: p.name }, 32)}
      <div class="capture-body">
        <div class="capture-eyebrow">${dup ? 'looks like a duplicate' : 'detected — add?'}</div>
        <div class="capture-name">${esc(p.name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">
          ${p.amount ? fmtMoney(p.amount, 'USD') + ' / ' + esc(p.cycle || 'monthly') : 'price not detected'}${p.isTrial ? ' · trial' : ''}
        </div>
      </div>
      <div class="capture-actions">
        ${dup
          ? `<button class="btn btn-sm" data-act="hike">Update price</button>
             <button class="btn btn-sm btn-ghost" data-act="dismiss">Dismiss</button>`
          : `<button class="btn btn-sm" data-act="add">Track</button>
             <button class="btn btn-sm btn-ghost" data-act="dismiss">Dismiss</button>`
        }
      </div>
    `;
    wrap.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute('data-act');
      if (!act) return;
      let skipRerender = false;
      if (act === 'dismiss') {
        await dismissCapture(p.id);
        await logEvent({ type: 'capture_dismissed', subName: p.name, ts: Date.now() });
      } else if (act === 'add') {
        const svc = SERVICES[p.serviceKey] || {};
        const now = Date.now();
        const nextRenewal = p.isTrial
          ? now + 7 * 86400_000 // assume 7-day trial
          : nextRenewalAfter(now, p.cycle || 'monthly');
        const sub = {
          id: uid('sub'),
          serviceKey: p.serviceKey,
          name: p.name,
          plan: svc.plans?.[0]?.name || '',
          amount: p.amount || svc.defaultPrice || 0,
          currency: p.currency || svc.currency || 'USD',
          cycle: p.cycle || svc.cycle || 'monthly',
          nextRenewal,
          startedAt: now,
          status: 'active',
          isTrial: !!p.isTrial,
          trialEndsAt: p.isTrial ? now + 7 * 86400_000 : null,
          category: svc.category || 'Other',
          color: p.color || svc.color || '#15110C',
          cancelUrl: svc.cancelUrl || null
        };
        await saveSub(sub);
        await dismissCapture(p.id);
        await logEvent({ type: 'capture_added', subName: sub.name, ts: Date.now() });
        await chrome.runtime.sendMessage({ type: 'reschedule_all' });

        // After-capture inline prompt — replace this row IN PLACE with the
        // waitlist inline prompt instead of removing it. (Part B4)
        if (await shouldShowWaitlistPrompt('after_capture')) {
          renderInlineWaitlistPrompt(wrap);
          skipRerender = true;
        }
      } else if (act === 'hike') {
        // Treat as a price change against the existing sub
        if (dup) {
          const prev = dup.amount;
          dup.previousAmount = prev;
          dup.amount = p.amount || prev;
          await saveSub(dup);
          await checkAndRecordPriceChange({ id: dup.id, name: dup.name, amount: prev }, dup.amount);
        }
        await dismissCapture(p.id);
      }
      if (!skipRerender) {
        await renderPendingCaptures();
      }
      await refresh();
    });
    host.appendChild(wrap);
  }
}

// ----------------------------------------------------------------------------
// add / edit modal
// ----------------------------------------------------------------------------
function wireModal() {
  const m = document.getElementById('add-modal');
  m.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest('[data-close]')) {
      closeAddModal();
    }
  });
}

function openAddModal(editing = null) {
  const body = document.getElementById('add-body');
  const services = listServices();

  const cur = editing || {};
  const startedAtIso = cur.startedAt
    ? new Date(cur.startedAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const renewalIso = cur.nextRenewal
    ? new Date(cur.nextRenewal).toISOString().slice(0, 10)
    : new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  body.innerHTML = `
    ${editing ? '' : `
      <div class="card-eyebrow" style="margin-bottom:8px;">quick-pick known services</div>
      <input id="svc-filter" class="service-filter" type="search" placeholder="Filter services" />
      <div class="service-grid" id="svc-grid">
        ${services.map(s => `
          <button class="service-pick" data-pick="${esc(s.key)}" data-name="${esc(s.name.toLowerCase())}">
            ${brandSquareHtml({ serviceKey: s.key, color: s.color, name: s.name, logo: s.logo }, 20)}
            <span class="pick-name">${esc(s.name)}</span>
          </button>
        `).join('')}
      </div>
      <div class="card-eyebrow" style="margin-bottom:8px;">or enter manually</div>
    `}

    <div class="form-row">
      <label>Name</label>
      <input id="f-name" type="text" placeholder="Netflix" value="${esc(cur.name || '')}" />
    </div>
    <div class="form-row form-row-3">
      <div>
        <label>Amount</label>
        <input id="f-amount" type="number" step="0.01" placeholder="9.99" value="${cur.amount ?? ''}" />
      </div>
      <div>
        <label>Currency</label>
        <select id="f-currency">
          ${['USD','EUR','GBP','CAD','AUD','JPY','INR'].map(c =>
            `<option ${cur.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Cycle</label>
        <select id="f-cycle">
          ${['monthly','yearly','weekly','quarterly'].map(c =>
            `<option ${cur.cycle === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row form-row-2">
      <div>
        <label>Started</label>
        <input id="f-started" type="date" value="${startedAtIso}" />
      </div>
      <div>
        <label>Next renewal</label>
        <input id="f-renewal" type="date" value="${renewalIso}" />
      </div>
    </div>
    <div class="form-row form-row-2">
      <div>
        <label>Category</label>
        <input id="f-category" type="text" placeholder="Streaming" value="${esc(cur.category || '')}" />
      </div>
      <div>
        <label>Plan (optional)</label>
        <input id="f-plan" type="text" placeholder="Premium" value="${esc(cur.plan || '')}" />
      </div>
    </div>
    <div class="trial-toggle">
      <input id="f-trial" type="checkbox" ${cur.isTrial ? 'checked' : ''} />
      <label for="f-trial">This is a free trial</label>
    </div>
    <div class="modal-foot">
      ${editing ? '<button class="btn btn-ghost" data-close>Cancel</button>' : ''}
      <button class="btn" id="f-save">${editing ? 'Save changes' : 'Add subscription'}</button>
    </div>
  `;

  // wire service quick-pick
  body.querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.pick;
      const svc = SERVICES[key];
      if (!svc) return;
      body.querySelector('#f-name').value = svc.name;
      body.querySelector('#f-amount').value = svc.defaultPrice;
      body.querySelector('#f-currency').value = svc.currency || 'USD';
      body.querySelector('#f-cycle').value = svc.cycle || 'monthly';
      body.querySelector('#f-category').value = svc.category || '';
      body.dataset.pickedKey = key;
    });
  });

  // wire service filter
  const svcFilter = body.querySelector('#svc-filter');
  if (svcFilter) {
    svcFilter.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      body.querySelectorAll('#svc-grid [data-pick]').forEach(btn => {
        const name = btn.dataset.name || '';
        btn.classList.toggle('hidden', q && !name.includes(q));
      });
    });
  }

  body.querySelector('#f-save').addEventListener('click', async () => {
    const name = body.querySelector('#f-name').value.trim();
    if (!name) { alert('Name is required'); return; }
    const rawAmount = body.querySelector('#f-amount').value;
    const parsedAmount = parseFloat(rawAmount);
    if (rawAmount && Number.isNaN(parsedAmount)) { alert('Amount must be a number'); return; }
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    if (amount < 0) { alert('Amount cannot be negative'); return; }
    const currency = body.querySelector('#f-currency').value;
    const cycle = body.querySelector('#f-cycle').value;
    const startedRaw = body.querySelector('#f-started').value;
    const renewalRaw = body.querySelector('#f-renewal').value;
    if (!renewalRaw) { alert('Next renewal date is required'); return; }
    const startedAt = startedRaw ? new Date(startedRaw).getTime() : Date.now();
    const nextRenewal = new Date(renewalRaw).getTime();
    if (Number.isNaN(nextRenewal)) { alert('Invalid renewal date'); return; }
    const category = body.querySelector('#f-category').value.trim();
    const plan = body.querySelector('#f-plan').value.trim();
    const isTrial = body.querySelector('#f-trial').checked;

    const pickedKey = body.dataset.pickedKey || editing?.serviceKey || null;
    const svc = pickedKey ? SERVICES[pickedKey] : null;

    const id = editing?.id || uid('sub');
    const previousAmount = editing && editing.amount !== amount ? editing.amount : editing?.previousAmount;
    const sub = {
      id,
      serviceKey: pickedKey,
      name,
      plan,
      amount,
      previousAmount,
      currency,
      cycle,
      startedAt,
      nextRenewal,
      status: 'active',
      isTrial,
      trialEndsAt: isTrial ? nextRenewal : null,
      category: category || (svc?.category || 'Other'),
      color: svc?.color || editing?.color || '#15110C',
      cancelUrl: svc?.cancelUrl || editing?.cancelUrl || null
    };
    if (editing && previousAmount && previousAmount !== amount) {
      await checkAndRecordPriceChange({ id, name, amount: previousAmount }, amount);
    }
    await saveSub(sub);
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    closeAddModal();
    const wasNew = !editing;
    await refresh();
    // Third-sub waitlist trigger — only on a NEW manual add (not edit), and
    // only when active count just hit exactly 3. (Part B3)
    if (wasNew) await maybeShowThirdSubToast();
  });

  document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() {
  const m = document.getElementById('add-modal');
  m.classList.add('hidden');
  // Clear stale picked-service state so next open starts clean
  const body = document.getElementById('add-body');
  if (body) delete body.dataset.pickedKey;
}

// ----------------------------------------------------------------------------
// settings pane (Change 1)
// ----------------------------------------------------------------------------
function wireSettingsPane() {
  // Theme dropdown (Part C) — replaces the old Auto/Light/Dark segmented
  // control. Three options: system / editorial / utility. Apply instantly,
  // persist to chrome.storage.local + sessionStorage cache, broadcast so
  // content.js can re-theme any visible toast.
  const themeSelect = document.getElementById('set-theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', async (e) => {
      const t = e.target.value;
      setThemeAttr(t);
      try { sessionStorage.setItem('catchly_theme_cache', t); } catch {}
      await setSettings({ theme: t });
      state.settings = await getSettings();
      // Broadcast to content scripts on every open tab so any visible
      // capture toast re-themes. Must use chrome.tabs.sendMessage per tab —
      // chrome.runtime.sendMessage from a popup does NOT reach content
      // scripts running on web pages, only other extension pages + worker.
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (!tab.id) continue;
          try { await chrome.tabs.sendMessage(tab.id, { type: 'theme_changed', theme: t }); }
          catch {} // tab may not have the content script (chrome://, store, etc.)
        }
      } catch {}
    });
  }

  // Reminder day chips
  document.querySelectorAll('#settings-pane [data-rem]').forEach(input => {
    input.addEventListener('change', async () => {
      const days = [];
      document.querySelectorAll('#settings-pane [data-rem]').forEach(cb => {
        if (cb.checked) days.push(parseInt(cb.dataset.rem, 10));
      });
      await setSettings({ reminderDays: days });
      state.settings = await getSettings();
      await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    });
  });

  // Notification + display toggles
  const bind = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', async (e) => {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      await setSettings({ [key]: v });
      state.settings = await getSettings();
      await renderAlerts();
    });
  };
  bind('set-trials', 'notifyTrials');
  bind('set-hikes', 'notifyHikes');
  bind('set-shadow', 'notifyShadow');
  bind('set-currency', 'currency');
  bind('set-detect', 'detectOnPages');
}

function syncSettingsPane() {
  const s = state.settings;
  if (!s) return;

  // Theme dropdown selected value (Part C)
  const themeSelect = document.getElementById('set-theme');
  if (themeSelect) themeSelect.value = s.theme || 'system';

  // Reminder day chips
  document.querySelectorAll('#settings-pane [data-rem]').forEach(cb => {
    cb.checked = (s.reminderDays || []).includes(parseInt(cb.dataset.rem, 10));
  });

  // Toggles + currency
  const set = (id, v) => { const el = document.getElementById(id); if (el && 'checked' in el) el.checked = !!v; };
  set('set-trials', s.notifyTrials);
  set('set-hikes', s.notifyHikes);
  set('set-shadow', s.notifyShadow);
  set('set-detect', s.detectOnPages);
  const cur = document.getElementById('set-currency');
  if (cur) cur.value = s.currency || 'USD';
}

// ============================================================================
// Waitlist behavioral re-prompts (Part B)
// ============================================================================

// Lucide "zap" icon SVG used in waitlist surface headers + banner
const WL_ZAP_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const WL_X_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const WL_CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

// ----- B3: third-sub toast -------------------------------------------------
async function maybeShowThirdSubToast() {
  const activeCount = state.subs.filter(s => s.status === 'active').length;
  if (activeCount !== 3) return;
  if (!(await shouldShowWaitlistPrompt('third_sub'))) return;

  const host = document.getElementById('wl-toast');
  if (!host) return;
  const copy = WL_COPY.thirdSub;
  host.innerHTML = `
    <div class="wl-head">
      <span class="wl-head-icon">${WL_ZAP_SVG}</span>
      <div class="wl-head-body">
        <div class="wl-head-title">${esc(copy.title)}</div>
        <div class="wl-head-sub">${esc(copy.body)}</div>
      </div>
      <button class="wl-head-close" type="button" data-wl="soft" aria-label="Close">${WL_X_SVG}</button>
    </div>
    <form class="wl-form" data-wl-form novalidate>
      <input type="email" class="wl-input" autocomplete="email" placeholder="${esc(copy.placeholder)}" />
      <button type="submit" class="wl-submit">${esc(copy.cta)}</button>
    </form>
    <div class="wl-error hidden" role="alert"></div>
    <div class="wl-foot">
      <button type="button" class="wl-dismiss-hard" data-wl="hard">${esc(copy.dismissHard)}</button>
      <p class="wl-privacy">${esc(copy.privacy)}</p>
    </div>
  `;
  host.classList.remove('hidden');
  // Slide-up via class flip on next frame
  requestAnimationFrame(() => host.classList.add('is-open'));

  // Auto-dismiss after 12s if untouched
  const timer = setTimeout(() => wlCloseToast('dismissed_soft'), 12000);
  host.dataset.wlTimer = String(timer);

  wireWaitlistSurface(host, 'third_sub', 'toast', (outcome) => wlCloseToast(outcome));
}

function wlCloseToast(outcome) {
  const host = document.getElementById('wl-toast');
  if (!host) return;
  const timer = parseInt(host.dataset.wlTimer || '0', 10);
  if (timer) clearTimeout(timer);
  delete host.dataset.wlTimer;
  // animate out, then hide
  host.classList.remove('is-open');
  setTimeout(() => {
    host.classList.add('hidden');
    host.innerHTML = '';
  }, 200);
  if (outcome) wlLogExposure({ surface: 'toast', outcome });
}

// ----- B4: after-capture inline prompt --------------------------------------
function renderInlineWaitlistPrompt(wrap) {
  const copy = WL_COPY.afterCapture;
  wrap.className = 'wl-inline';
  wrap.innerHTML = `
    <div class="wl-head">
      <span class="wl-head-icon">${WL_ZAP_SVG}</span>
      <div class="wl-head-body">
        <div class="wl-head-title">${esc(copy.title)}</div>
        <div class="wl-head-sub">${esc(copy.body)}</div>
      </div>
      <button class="wl-head-close" type="button" data-wl="soft" aria-label="Close">${WL_X_SVG}</button>
    </div>
    <form class="wl-form" data-wl-form novalidate>
      <input type="email" class="wl-input" autocomplete="email" placeholder="${esc(copy.placeholder)}" />
      <button type="submit" class="wl-submit">${esc(copy.cta)}</button>
    </form>
    <div class="wl-error hidden" role="alert"></div>
    <div class="wl-foot">
      <button type="button" class="wl-dismiss-hard" data-wl="hard">${esc(copy.dismissHard)}</button>
      <p class="wl-privacy">${esc(copy.privacy)}</p>
    </div>
  `;

  // Mark 'shown' immediately so the lifetime cap reflects this exposure.
  wlLogExposure({ surface: 'inline', outcome: 'shown' });

  wireWaitlistSurface(wrap, 'after_capture', 'inline', (outcome) => {
    if (outcome) wlLogExposure({ surface: 'inline', outcome });
    wrap.remove();
    // Refresh captures list now that the inline prompt is gone.
    renderPendingCaptures();
  });
}

// ----- B5: day-7 fallback banner --------------------------------------------
async function maybeShowFallbackBanner() {
  const s = await getWaitlistState();
  if (!s.firstUseTs) return; // markFirstUseIfUnset hasn't run yet (shouldn't happen)
  if (Date.now() - s.firstUseTs < 7 * 24 * 3600_000) return;
  if (s.exposures.length > 0) return; // brief: "no exposure has happened yet"
  if (!(await shouldShowWaitlistPrompt('fallback'))) return;

  const host = document.getElementById('wl-banner');
  if (!host) return;
  const copy = WL_COPY.fallback;
  host.innerHTML = `
    <span class="wl-banner-icon">${WL_ZAP_SVG}</span>
    <div class="wl-banner-body">
      <div class="wl-banner-title">${esc(copy.title)}</div>
      <div class="wl-banner-sub">${esc(copy.body)}</div>
    </div>
    <button type="button" class="wl-banner-cta" data-wl="open-settings">${esc(copy.cta)}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
    <button type="button" class="wl-banner-close" data-wl="soft" aria-label="Close">${WL_X_SVG}</button>
  `;
  host.classList.remove('hidden');
  wlLogExposure({ surface: 'banner', outcome: 'shown' });

  host.addEventListener('click', async (e) => {
    const t = e.target instanceof HTMLElement ? e.target.closest('[data-wl]') : null;
    if (!t) return;
    const which = t.getAttribute('data-wl');
    if (which === 'soft') {
      await wlLogExposure({ surface: 'banner', outcome: 'dismissed_soft' });
      host.classList.add('hidden');
      host.innerHTML = '';
    } else if (which === 'open-settings') {
      // Hand off to options.html#waitlist — that page scrolls + focuses input
      const url = chrome.runtime.getURL('options.html#waitlist');
      chrome.tabs.create({ url });
    }
  });
}

// ----- shared wiring for toast + inline surfaces ----------------------------
// host: element containing .wl-form / [data-wl] buttons
// source: trigger source string ('third_sub' | 'after_capture')
// surface: surface key ('toast' | 'inline')
// closeFn: function (outcome) -> void that tears down the surface
function wireWaitlistSurface(host, source, surface, closeFn) {
  const form = host.querySelector('[data-wl-form]');
  const input = host.querySelector('.wl-input');
  const submit = host.querySelector('.wl-submit');
  const errorEl = host.querySelector('.wl-error');

  if (surface === 'toast') {
    // Toast logs 'shown' here (inline logged at render time)
    wlLogExposure({ surface: 'toast', outcome: 'shown' });
  }

  if (form && input && submit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
      if (!wlIsValidEmail(email)) {
        if (errorEl) {
          errorEl.textContent = WL_COPY.errors.invalidEmail;
          errorEl.classList.remove('hidden');
        }
        input.focus();
        return;
      }
      const originalLabel = submit.textContent;
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.textContent = '…';
      try {
        const res = await wlSubmitEmail({ email, source });
        if (res.ok) {
          // Show confirmation in same surface for 3s then close
          host.innerHTML = `
            <div class="wl-confirm">
              <span class="wl-head-icon" style="color:var(--success);">${WL_CHECK_SVG}</span>
              ${esc(WL_COPY.confirmed.title)} — ${esc(WL_COPY.confirmed.body)}
            </div>
          `;
          // submitEmail() already wrote a 'submitted' exposure — don't log again.
          setTimeout(() => closeFn(null), 3000);
        } else {
          if (errorEl) {
            errorEl.textContent = WL_COPY.errors[res.error] || WL_COPY.errors.serverError;
            errorEl.classList.remove('hidden');
          }
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
          submit.textContent = originalLabel;
        }
      } catch {
        if (errorEl) {
          errorEl.textContent = WL_COPY.errors.serverError;
          errorEl.classList.remove('hidden');
        }
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        submit.textContent = originalLabel;
      }
    });
  }

  host.addEventListener('click', (e) => {
    const t = e.target instanceof HTMLElement ? e.target.closest('[data-wl]') : null;
    if (!t) return;
    const which = t.getAttribute('data-wl');
    if (which === 'soft') closeFn('dismissed_soft');
    else if (which === 'hard') closeFn('dismissed_hard');
  });
}
