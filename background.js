// Background service worker (MV3).
// Responsibilities:
//   1. Schedule renewal/trial-end notifications via chrome.alarms
//   2. Keep the action-icon badge updated with days-to-most-urgent
//   3. Route messages from content script & popup
//   4. Run shadow-charge check on a daily alarm

import {
  getAllSubs, getSettings, getDaysSinceLastVisit,
  addPendingCapture, recordUsage, logEvent
} from './lib/storage.js';
import { daysUntil, urgencyOf, fmtMoney } from './lib/utils.js';
import { identifyFromPage } from './lib/merchants.js';

const ALARM_DAILY = 'sentry_daily';
const ALARM_BADGE = 'sentry_badge';

// ---------- lifecycle ----------
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.alarms.create(ALARM_DAILY, { periodInMinutes: 60 * 24 });
  await chrome.alarms.create(ALARM_BADGE, { periodInMinutes: 60 });
  await refreshBadge();
  if (reason === 'install') {
    // Open onboarding popup-ish: just log; popup itself shows onboarding when empty
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(refreshBadge);

// ---------- alarms ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_BADGE) await refreshBadge();
  if (alarm.name === ALARM_DAILY) await runDailyChecks();
  if (alarm.name.startsWith('renewal_')) {
    const subId = alarm.name.replace('renewal_', '');
    await fireRenewalNotification(subId);
  }
  if (alarm.name.startsWith('trial_')) {
    const subId = alarm.name.replace('trial_', '');
    await fireTrialNotification(subId);
  }
});

// ---------- badge ----------
// Shows days until the most urgent renewal/trial. Color shifts with urgency.
async function refreshBadge() {
  const subs = await getAllSubs();
  const active = subs.filter(s => s.status === 'active');
  if (!active.length) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  // Most urgent = smallest non-negative daysUntil
  let best = null;
  for (const s of active) {
    const d = daysUntil(s.isTrial && s.trialEndsAt ? s.trialEndsAt : s.nextRenewal);
    if (d === null) continue;
    if (best === null || d < best.d) best = { d, sub: s };
  }
  if (!best) return;
  const u = urgencyOf(best.sub.isTrial && best.sub.trialEndsAt
    ? best.sub.trialEndsAt
    : best.sub.nextRenewal);
  const colors = {
    safe: '#3D8B5C',
    soon: '#D4881F',
    urgent: '#B85737',
    overdue: '#7A2E26'
  };
  await chrome.action.setBadgeBackgroundColor({ color: colors[u] });
  await chrome.action.setBadgeText({ text: best.d >= 0 ? String(best.d) : '!' });
  await chrome.action.setTitle({
    title: `Subscription Sentry — next: ${best.sub.name} in ${best.d}d`
  });
}

// ---------- daily checks ----------
async function runDailyChecks() {
  const settings = await getSettings();
  const subs = await getAllSubs();
  for (const sub of subs) {
    if (sub.status !== 'active') continue;
    // Reschedule alarms for upcoming renewals/trials
    await scheduleAlarmsForSub(sub, settings);
    // Shadow-charge check
    if (settings.notifyShadow) {
      const dRenew = daysUntil(sub.nextRenewal);
      const lastVisit = await getDaysSinceLastVisit(sub.serviceKey);
      if (
        dRenew !== null && dRenew >= 0 && dRenew <= 3 &&
        lastVisit !== null && lastVisit >= settings.shadowDaysThreshold
      ) {
        await pushNotification({
          id: `shadow_${sub.id}_${Date.now()}`,
          title: `Shadow charge ahead: ${sub.name}`,
          message:
            `Renews in ${dRenew}d for ${fmtMoney(sub.amount, sub.currency)}. ` +
            `You haven't visited in ${lastVisit} days.`,
          priority: 2
        });
        await logEvent({ type: 'shadow_alert', subId: sub.id, daysSince: lastVisit, ts: Date.now() });
      }
    }
  }
  await refreshBadge();
}

async function scheduleAlarmsForSub(sub, settings) {
  // Clear any old alarm
  await chrome.alarms.clear(`renewal_${sub.id}`);
  await chrome.alarms.clear(`trial_${sub.id}`);
  // Trial-end alarm (1 day before, if isTrial)
  if (sub.isTrial && sub.trialEndsAt) {
    const when = sub.trialEndsAt - 24 * 3600_000;
    if (when > Date.now() + 30_000) {
      await chrome.alarms.create(`trial_${sub.id}`, { when });
    }
  }
  // Renewal alarm at earliest configured reminderDay
  const daysRaw = Array.isArray(settings.reminderDays) ? settings.reminderDays : [];
  const days = daysRaw.length ? daysRaw : [3];
  const minD = Math.min(...days);
  const when = sub.nextRenewal - minD * 24 * 3600_000;
  if (when > Date.now() + 30_000) {
    await chrome.alarms.create(`renewal_${sub.id}`, { when });
  }
}

async function fireRenewalNotification(subId) {
  const subs = await getAllSubs();
  const sub = subs.find(s => s.id === subId);
  if (!sub || sub.status !== 'active') return;
  const d = daysUntil(sub.nextRenewal);
  await pushNotification({
    id: `renewal_${subId}_${Date.now()}`,
    title: `${sub.name} renews ${d === 0 ? 'today' : `in ${d}d`}`,
    message: `${fmtMoney(sub.amount, sub.currency)} — click to manage`,
    priority: 1
  });
}

async function fireTrialNotification(subId) {
  const settings = await getSettings();
  if (!settings.notifyTrials) return;
  const subs = await getAllSubs();
  const sub = subs.find(s => s.id === subId);
  if (!sub || sub.status !== 'active') return;
  await pushNotification({
    id: `trial_${subId}_${Date.now()}`,
    title: `Free trial ending: ${sub.name}`,
    message:
      `Trial ends in 24h. Will auto-charge ${fmtMoney(sub.amount, sub.currency)}. ` +
      `Cancel now if you don't want it.`,
    priority: 2
  });
}

async function pushNotification({ id, title, message, priority = 0 }) {
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title, message, priority,
      requireInteraction: priority >= 2
    });
  } catch (e) {
    // Notifications may be denied; silently fail.
    console.warn('Notification failed:', e);
  }
}

// Clicking a notification opens the popup (best we can do in MV3).
chrome.notifications.onClicked.addListener(async (notifId) => {
  await chrome.notifications.clear(notifId);
  // Open the dashboard
  await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?from=notif') });
});

// ---------- messages ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'capture') {
        const saved = await addPendingCapture(msg.payload);
        sendResponse({ ok: true, saved });
      } else if (msg.type === 'usage') {
        await recordUsage(msg.serviceKey);
        sendResponse({ ok: true });
      } else if (msg.type === 'refresh_badge') {
        await refreshBadge();
        sendResponse({ ok: true });
      } else if (msg.type === 'reschedule_all') {
        const subs = await getAllSubs();
        const settings = await getSettings();
        for (const s of subs) await scheduleAlarmsForSub(s, settings);
        await refreshBadge();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'unknown' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async response
});

// ---------- usage tracking on every tab visit to a known service ----------
// Throttle per-service writes — chrome.storage.local has write quotas + every
// page-load event firing recordUsage would thrash IO on heavy browsing.
const __usageThrottle = new Map(); // key -> last write ts
const USAGE_MIN_INTERVAL = 10 * 60 * 1000;
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== 'complete' || !tab.url) return;
  if (!/^https?:/.test(tab.url)) return;
  const hit = identifyFromPage(tab.url, tab.title || '');
  if (!hit) return;
  const now = Date.now();
  const last = __usageThrottle.get(hit.key) || 0;
  if (now - last < USAGE_MIN_INTERVAL) return;
  __usageThrottle.set(hit.key, now);
  await recordUsage(hit.key);
});
