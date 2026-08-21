(() => {
  'use strict';

  const PRODUCT_VERSION = '6.15.0';
  const PHASE_NAMES = ['Untap', 'Upkeep', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End'];
  let lastRuntimeError = '';

  function safeState() {
    try { return window.CommanderForge?.getState?.() || null; } catch { return null; }
  }

  function safeTechnicalSnapshot() {
    const state = safeState();
    return {
      productVersion: PRODUCT_VERSION,
      gameplayBuild: window.CommanderForgeBuildVersion || '6.15.0',
      mode: new URLSearchParams(location.search).get('join') ? 'online' : (state?.onlineGameId ? 'online' : 'solo/local'),
      playerCount: state ? Object.keys(state.players || {}).length : '',
      turn: state?.turnNumber ?? '',
      activePlayer: state?.activePlayerId ?? '',
      phase: state ? (PHASE_NAMES[Number(state.phaseIndex || 0)] || String(state.phaseIndex ?? '')) : '',
      rulesMode: state?.settings?.rulesMode || '',
      manaMode: state?.settings?.manaMode || '',
      online: navigator.onLine,
      viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
      page: location.pathname || '/',
    };
  }

  function formatTechnicalDetails() {
    return Object.entries(safeTechnicalSnapshot())
      .filter(([, value]) => value !== '' && value != null)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');
  }

  function feedbackElements() {
    return {
      form: document.getElementById('forge-feedback-form'),
      message: document.getElementById('forge-feedback-message'),
      type: document.getElementById('forge-feedback-type'),
      status: document.getElementById('forge-feedback-status'),
      tech: document.getElementById('forge-feedback-tech'),
    };
  }

  function installFeedbackDiagnostics() {
    const { form, status } = feedbackElements();
    if (!form || form.dataset.diagnostics615 === '1') return;
    form.dataset.diagnostics615 = '1';

    if (!document.getElementById('forge-feedback-tech') && status) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-top:9px;font-size:12px;line-height:1.35;color:#aeb9b0';
      label.innerHTML = '<input id="forge-feedback-tech" type="checkbox" checked style="margin-top:2px" /> <span>Include safe technical details (version, phase, rules mode, and screen size). Your hand and library are never included.</span>';
      status.before(label);
    }

    form.addEventListener('submit', () => {
      const { message, tech } = feedbackElements();
      if (!message || !tech?.checked || message.dataset.diagnosticsAttached === '1') return;
      const details = formatTechnicalDetails();
      if (!details) return;
      message.value = `${message.value.trim()}\n\n--- Safe technical details ---\n${details}`;
      message.dataset.diagnosticsAttached = '1';
    }, true);

    form.addEventListener('input', (event) => {
      if (event.target?.id === 'forge-feedback-message') delete event.target.dataset.diagnosticsAttached;
    });
  }

  function openFeedbackForError(errorText) {
    lastRuntimeError = String(errorText || lastRuntimeError || 'Runtime error');
    const { message, type, status, tech } = feedbackElements();
    try { window.CommanderForgeTitle?.show?.(); } catch {}
    if (type) type.value = 'Bug report';
    if (tech) tech.checked = true;
    if (message) {
      message.value = `Runtime error: ${lastRuntimeError.slice(0, 700)}\n\nWhat I was doing when it happened:\n`;
      delete message.dataset.diagnosticsAttached;
      setTimeout(() => message.focus(), 0);
    }
    if (status) {
      status.textContent = 'Technical details are ready to attach. Add what you were doing, then send.';
      status.dataset.state = 'warning';
    }
  }

  function installRuntimeReporter() {
    window.addEventListener('error', (event) => {
      lastRuntimeError = String(event.error?.stack || event.message || 'Runtime error');
    }, true);
    window.addEventListener('unhandledrejection', (event) => {
      lastRuntimeError = String(event.reason?.stack || event.reason || 'Unhandled promise rejection');
    }, true);

    const root = document.getElementById('toast-root');
    if (!root || root.dataset.diagnostics615 === '1') return;
    root.dataset.diagnostics615 = '1';
    const observer = new MutationObserver(() => {
      root.querySelectorAll('.toast.error:not([data-report-ready])').forEach((node) => {
        node.dataset.reportReady = '1';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Report this error';
        button.style.cssText = 'margin-left:10px;padding:5px 9px;border-radius:7px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer';
        button.addEventListener('click', () => openFeedbackForError(lastRuntimeError || node.textContent || 'Runtime error'));
        node.appendChild(button);
      });
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function install() {
    installFeedbackDiagnostics();
    installRuntimeReporter();
    window.CommanderForgeSafeDiagnostics = {
      snapshot: safeTechnicalSnapshot,
      format: formatTechnicalDetails,
      reportLastError: () => openFeedbackForError(lastRuntimeError || 'Runtime error'),
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
