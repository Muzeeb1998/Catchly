// options.js — settings + welcome screen.

import {
  getSettings, setSettings,
  exportAll, wipeAll, seedSampleData
} from './lib/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Welcome mode?
  const params = new URLSearchParams(location.search);
  if (params.get('welcome') === '1') {
    document.getElementById('welcome').classList.remove('hidden');
    document.getElementById('settings').classList.add('hidden');
  }

  wireWelcome();
  await loadSettings();
  wireSettings();
  wireDataButtons();
});

function wireWelcome() {
  document.getElementById('w-go')?.addEventListener('click', () => {
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('settings').classList.remove('hidden');
    // Update URL without reloading
    history.replaceState({}, '', 'options.html');
  });
  document.getElementById('w-seed')?.addEventListener('click', async () => {
    await seedSampleData();
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('settings').classList.remove('hidden');
    history.replaceState({}, '', 'options.html');
  });
}

async function loadSettings() {
  const s = await getSettings();
  document.querySelectorAll('[data-rem]').forEach(el => {
    const d = parseInt(el.dataset.rem, 10);
    el.checked = s.reminderDays.includes(d);
  });
  document.getElementById('opt-trials').checked = s.notifyTrials;
  document.getElementById('opt-hikes').checked = s.notifyHikes;
  document.getElementById('opt-shadow').checked = s.notifyShadow;
  document.getElementById('opt-threshold').value = s.shadowDaysThreshold;
  document.getElementById('opt-currency').value = s.currency;
  document.getElementById('opt-detect').checked = s.detectOnPages;
}

function wireSettings() {
  // Reminder days
  document.querySelectorAll('[data-rem]').forEach(input => {
    input.addEventListener('change', async () => {
      const days = [];
      document.querySelectorAll('[data-rem]').forEach(el => {
        if (el.checked) days.push(parseInt(el.dataset.rem, 10));
      });
      await setSettings({ reminderDays: days });
      await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    });
  });

  const bind = (id, key, type = 'check') => {
    document.getElementById(id).addEventListener('change', async (e) => {
      const v = type === 'check' ? e.target.checked
              : type === 'num' ? parseInt(e.target.value, 10)
              : e.target.value;
      await setSettings({ [key]: v });
    });
  };
  bind('opt-trials', 'notifyTrials');
  bind('opt-hikes', 'notifyHikes');
  bind('opt-shadow', 'notifyShadow');
  bind('opt-threshold', 'shadowDaysThreshold', 'num');
  bind('opt-currency', 'currency', 'val');
  bind('opt-detect', 'detectOnPages');
}

function wireDataButtons() {
  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentry-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-seed').addEventListener('click', async () => {
    if (!confirm('Load sample subscriptions? This will overwrite your current tracked subs.')) return;
    await seedSampleData();
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    alert('Sample data loaded. Open the Sentry popup to see it.');
  });

  document.getElementById('btn-wipe').addEventListener('click', async () => {
    if (!confirm('Permanently delete all tracked subscriptions, settings, and history? This cannot be undone.')) return;
    await wipeAll();
    alert('Wiped. Reload this page to reset settings.');
  });
}
