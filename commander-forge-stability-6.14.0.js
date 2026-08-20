(() => {
  'use strict';

  const PRODUCT_VERSION = '6.14.0';
  const BUNDLE_VERSION = '6.13.0';
  let updateNotice = null;

  window.CommanderForgeProductVersion = PRODUCT_VERSION;
  window.CommanderForgeExpectedBundleVersion = BUNDLE_VERSION;

  function updateDisplayedVersion() {
    document.querySelectorAll('.forge-title-version').forEach((node) => {
      node.textContent = `Version ${PRODUCT_VERSION} · Cards and rules data provided by Scryfall`;
    });
  }

  function removeKnownStaleMismatchBanner() {
    document.querySelectorAll('body > div').forEach((node) => {
      if (/Commander Forge cache mismatch: index expects 6\.12\.1, but JavaScript 6\.13\.0 loaded/i.test(node.textContent || '')) node.remove();
    });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      registration.update().catch(() => {});
    } catch (error) {
      console.warn('[Commander Forge service worker]', error);
    }
  }

  function showUpdateNotice(latestVersion) {
    if (updateNotice) return;
    updateNotice = document.createElement('div');
    updateNotice.setAttribute('role', 'status');
    updateNotice.style.cssText = 'position:fixed;z-index:100000;left:12px;right:12px;bottom:12px;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:12px;background:#13231b;border:1px solid #6fa981;color:#eef8f0;box-shadow:0 8px 28px #0008;font:600 13px/1.35 system-ui';
    const text = document.createElement('span');
    text.textContent = `Commander Forge ${latestVersion} is available.`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Update & Reload';
    button.style.cssText = 'padding:7px 11px;border-radius:8px;border:1px solid #8ac39a;background:#244b32;color:#fff;font:inherit;cursor:pointer;white-space:nowrap';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Updating…';
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith('commander-forge-')).map((key) => caches.delete(key)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
        }
      } catch {}
      location.reload();
    });
    updateNotice.append(text, button);
    document.body.appendChild(updateNotice);
  }

  async function checkForUpdate() {
    try {
      const response = await fetch(`./VERSION.txt?check=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const text = (await response.text()).trim();
      const latestVersion = text.match(/^(\d+\.\d+\.\d+)/)?.[1] || '';
      if (latestVersion && latestVersion !== PRODUCT_VERSION) showUpdateNotice(latestVersion);
    } catch {}
  }

  function install() {
    updateDisplayedVersion();
    setTimeout(registerServiceWorker, 900);
    setTimeout(checkForUpdate, 1200);
    setTimeout(removeKnownStaleMismatchBanner, 650);
    setTimeout(removeKnownStaleMismatchBanner, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
