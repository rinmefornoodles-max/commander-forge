(() => {
  'use strict';

  const PRODUCT_VERSION = '6.15.0';
  const BUNDLE_VERSION = '6.15.0';
  let updateNotice = null;

  window.CommanderForgeProductVersion = PRODUCT_VERSION;
  window.CommanderForgeExpectedBundleVersion = BUNDLE_VERSION;

  function updateDisplayedVersion() {
    document.querySelectorAll('.forge-title-version').forEach((node) => {
      node.textContent = `Version ${PRODUCT_VERSION} · Cards and rules data provided by Scryfall`;
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

  function verifyGameplayBundle() {
    setTimeout(() => {
      const loaded = String(window.CommanderForgeBuildVersion || '');
      if (!loaded || loaded === BUNDLE_VERSION) return;
      const node = document.createElement('div');
      node.style.cssText = 'position:fixed;z-index:100001;left:12px;right:12px;bottom:12px;padding:12px 14px;border-radius:10px;background:#2b1616;border:1px solid #d56565;color:#ffd8d8;font:600 13px/1.4 system-ui';
      node.textContent = `Commander Forge version mismatch: page expects ${BUNDLE_VERSION}, but gameplay build ${loaded} loaded. Use Update & Reload or hard refresh.`;
      document.body.appendChild(node);
    }, 700);
  }

  function install() {
    updateDisplayedVersion();
    setTimeout(registerServiceWorker, 900);
    setTimeout(checkForUpdate, 1200);
    verifyGameplayBundle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
