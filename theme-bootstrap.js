// theme-bootstrap.js — early-paint theme application (Part A).
//
// Loaded synchronously from <head> of popup.html + options.html BEFORE
// stylesheets parse, so the first paint matches the user's stored theme.
// Reads localStorage["catchly_theme_cache"] for the synchronous fast path,
// then reconciles with chrome.storage.local.settings_v1.theme async.
//
// localStorage (not sessionStorage) because Chrome extension popups get a
// fresh page context on every open — sessionStorage was being reset every
// reopen, so the "fast path" never actually hit and users with a non-System
// theme saw a flash of System white before the async chrome.storage read
// finished. localStorage at the chrome-extension://<id> origin persists
// across popup invocations and is synchronously readable.
//
// Must be an external file — MV3 extension_pages CSP blocks inline scripts.

(function () {
  var VALID = { system: 1, editorial: 1, utility: 1, dark: 1 };
  function apply(t) {
    if (!VALID[t]) t = 'system';
    document.documentElement.setAttribute('data-theme', t);
  }
  try {
    apply(localStorage.getItem('catchly_theme_cache') || 'system');
  } catch (e) {
    apply('system');
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('settings_v1', function (res) {
      var stored = res && res.settings_v1 && res.settings_v1.theme;
      var t = VALID[stored] ? stored : 'system';
      try { localStorage.setItem('catchly_theme_cache', t); } catch (e) {}
      if (document.documentElement.getAttribute('data-theme') !== t) apply(t);
    });
  }
})();
