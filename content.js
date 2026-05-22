// content.js — runs on every page (document_idle).
// Detects subscription checkout / signup pages and surfaces a capture toast.
// Privacy: nothing leaves the browser. The capture only stores: service name,
// best-guess price, cycle, source URL. User must click "Track" to save.

(function () {
  if (window.__sentryContentLoaded) return;
  window.__sentryContentLoaded = true;

  // ---------- detection ----------
  function looksLikeSubscriptionPage() {
    const text = (document.body && document.body.innerText || '').toLowerCase();
    if (!text || text.length < 50) return false;
    const triggers = [
      'free trial', 'start free trial', 'start your free trial',
      'start trial', 'subscribe now', 'start subscription',
      'recurring', 'billed monthly', 'per month', '/month',
      'billed yearly', 'per year', '/year', '/yr',
      'auto-renew', 'auto renew', 'first month free'
    ];
    let hits = 0;
    for (const t of triggers) if (text.includes(t)) hits++;
    return hits >= 2;
  }

  // Best-effort price extraction. Looks for "$X.XX/month" patterns.
  function guessPriceAndCycle() {
    const html = document.body ? document.body.innerText : '';
    const patterns = [
      /(?:US\$|\$|€|£)\s?(\d+(?:\.\d{1,2})?)\s*(?:\/|per\s+)\s*(month|mo|year|yr|week|wk)/i,
      /(\d+(?:\.\d{1,2})?)\s*(?:USD|EUR|GBP)\s*(?:\/|per\s+)\s*(month|mo|year|yr|week|wk)/i
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const amount = parseFloat(m[1]);
        const cycleRaw = m[2].toLowerCase();
        const cycle = /^y/.test(cycleRaw) ? 'yearly'
                    : /^w/.test(cycleRaw) ? 'weekly'
                    : 'monthly';
        return { amount, cycle };
      }
    }
    return null;
  }

  function guessIsTrial() {
    const text = (document.body && document.body.innerText || '').toLowerCase();
    return /free\s+trial|start\s+trial|first\s+month\s+free|try\s+free/i.test(text);
  }

  // ---------- toast UI ----------
  function buildToast({ serviceName, amount, cycle, isTrial, color, serviceKey }) {
    // Remove any prior toast
    const prior = document.getElementById('__sentry_toast');
    if (prior) prior.remove();

    const root = document.createElement('div');
    root.id = '__sentry_toast';
    root.className = 'sentry-toast';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Subscription Sentry — track this subscription?');

    const priceStr = amount ? `$${amount.toFixed(2)}/${cycle === 'yearly' ? 'yr' : cycle === 'weekly' ? 'wk' : 'mo'}` : '';
    const label = isTrial ? 'Free trial detected' : 'Subscription detected';
    const colorDot = color || '#0F1419';

    root.innerHTML = `
      <div class="sentry-toast-bar" style="background:${colorDot}"></div>
      <div class="sentry-toast-body">
        <div class="sentry-toast-eyebrow">${label}</div>
        <div class="sentry-toast-title">${escapeHtml(serviceName)}</div>
        ${priceStr ? `<div class="sentry-toast-price">${priceStr}${isTrial ? ' after trial' : ''}</div>` : ''}
        <div class="sentry-toast-actions">
          <button class="sentry-btn sentry-btn-primary" data-act="track">Track this</button>
          <button class="sentry-btn sentry-btn-ghost" data-act="dismiss">Not now</button>
        </div>
        <div class="sentry-toast-foot">Stays on your device. Nothing sent anywhere.</div>
      </div>
      <button class="sentry-toast-close" data-act="dismiss" aria-label="Close">×</button>
    `;
    document.documentElement.appendChild(root);

    requestAnimationFrame(() => root.classList.add('sentry-toast-in'));

    const dismiss = () => {
      root.classList.remove('sentry-toast-in');
      setTimeout(() => root.remove(), 250);
    };

    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute('data-act');
      if (act === 'dismiss') return dismiss();
      if (act === 'track') {
        const payload = {
          serviceKey,
          name: serviceName,
          amount: amount || 0,
          cycle: cycle || 'monthly',
          isTrial: !!isTrial,
          sourceUrl: location.href,
          color: colorDot
        };
        try {
          await chrome.runtime.sendMessage({ type: 'capture', payload });
          showToastConfirmation();
        } catch (err) {
          console.warn('[Sentry] capture failed', err);
        }
        dismiss();
      }
    });

    // Auto-dismiss after 25 seconds if untouched
    setTimeout(dismiss, 25000);
  }

  function showToastConfirmation() {
    const c = document.createElement('div');
    c.className = 'sentry-toast sentry-toast-confirm sentry-toast-in';
    c.innerHTML = `
      <div class="sentry-toast-bar" style="background:#3D8B5C"></div>
      <div class="sentry-toast-body">
        <div class="sentry-toast-title">Tracked.</div>
        <div class="sentry-toast-foot">Open the Sentry icon to view.</div>
      </div>`;
    document.documentElement.appendChild(c);
    setTimeout(() => {
      c.classList.remove('sentry-toast-in');
      setTimeout(() => c.remove(), 250);
    }, 2500);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- service matching (subset of merchants.js, inlined for content script) ----------
  // Content scripts can't import ES modules from extension easily; we duplicate
  // a minimal lookup map here. Background still owns the canonical list.
  const KNOWN_DOMAINS = {
    'netflix.com': { key: 'netflix', name: 'Netflix', color: '#E50914' },
    'spotify.com': { key: 'spotify', name: 'Spotify', color: '#1DB954' },
    'disneyplus.com': { key: 'disneyplus', name: 'Disney+', color: '#0E47A1' },
    'max.com': { key: 'max', name: 'Max (HBO)', color: '#002BE7' },
    'hbomax.com': { key: 'max', name: 'Max (HBO)', color: '#002BE7' },
    'hulu.com': { key: 'hulu', name: 'Hulu', color: '#1CE783' },
    'primevideo.com': { key: 'primevideo', name: 'Amazon Prime Video', color: '#FF9900' },
    'music.apple.com': { key: 'applemusic', name: 'Apple Music', color: '#FA243C' },
    'tv.apple.com': { key: 'appletv', name: 'Apple TV+', color: '#000000' },
    'youtube.com': { key: 'youtubepremium', name: 'YouTube Premium', color: '#FF0000' },
    'chatgpt.com': { key: 'chatgpt', name: 'ChatGPT Plus', color: '#10A37F' },
    'openai.com': { key: 'chatgpt', name: 'ChatGPT Plus', color: '#10A37F' },
    'claude.ai': { key: 'claude', name: 'Claude Pro', color: '#D97757' },
    'anthropic.com': { key: 'claude', name: 'Claude Pro', color: '#D97757' },
    'notion.so': { key: 'notion', name: 'Notion', color: '#000000' },
    'notion.com': { key: 'notion', name: 'Notion', color: '#000000' },
    'grammarly.com': { key: 'grammarly', name: 'Grammarly Premium', color: '#15C39A' },
    'dropbox.com': { key: 'dropbox', name: 'Dropbox', color: '#0061FF' },
    '1password.com': { key: 'onepassword', name: '1Password', color: '#0572EC' },
    'adobe.com': { key: 'adobecc', name: 'Adobe Creative Cloud', color: '#FA0F00' },
    'audible.com': { key: 'audible', name: 'Audible', color: '#F8991C' },
    'nytimes.com': { key: 'nyt', name: 'New York Times', color: '#000000' },
    'github.com': { key: 'github', name: 'GitHub', color: '#181717' },
    'figma.com': { key: 'figma', name: 'Figma', color: '#F24E1E' }
  };

  function identifyService() {
    const host = location.hostname.replace(/^www\./, '');
    for (const [d, svc] of Object.entries(KNOWN_DOMAINS)) {
      if (host === d || host.endsWith('.' + d)) return svc;
    }
    // Fall back to page title
    const title = (document.title || '').toLowerCase();
    for (const [, svc] of Object.entries(KNOWN_DOMAINS)) {
      if (title.includes(svc.name.toLowerCase())) return svc;
    }
    return null;
  }

  // ---------- main ----------
  async function detectionEnabled() {
    try {
      const res = await chrome.storage.local.get('settings_v1');
      const s = res.settings_v1 || {};
      return s.detectOnPages !== false; // default on
    } catch {
      return true;
    }
  }

  async function maybeTrigger() {
    if (!(await detectionEnabled())) return;
    if (!looksLikeSubscriptionPage()) return;
    const svc = identifyService();
    if (!svc) return; // Only show toast for KNOWN services in v1; reduces noise
    const price = guessPriceAndCycle();
    const isTrial = guessIsTrial();
    buildToast({
      serviceName: svc.name,
      serviceKey: svc.key,
      color: svc.color,
      amount: price ? price.amount : null,
      cycle: price ? price.cycle : 'monthly',
      isTrial
    });
  }

  // Run after a short delay so dynamic content has time to render.
  setTimeout(maybeTrigger, 1500);

  // Re-check on SPA-style navigation (best-effort).
  // Use history API hooks + popstate instead of a wide MutationObserver — that
  // observer fired on every DOM mutation site-wide and burned CPU on busy pages.
  let lastHref = location.href;
  const onUrlChange = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    setTimeout(maybeTrigger, 1500);
  };
  const wrap = (k) => {
    const orig = history[k];
    history[k] = function () {
      const r = orig.apply(this, arguments);
      onUrlChange();
      return r;
    };
  };
  try { wrap('pushState'); wrap('replaceState'); } catch {}
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
})();
