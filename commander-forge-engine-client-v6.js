(function (root) {
  'use strict';
  const listeners = new Set();
  let requestId = 0;
  let worker = null;
  let status = { state: 'starting', version: '6.0.0-alpha.4', lastSyncAt: null, error: null };
  const pending = new Map();

  function notify() { for (const fn of listeners) { try { fn({ ...status }); } catch (_) {} } }
  function setStatus(patch) { status = { ...status, ...patch }; notify(); }

  function start() {
    if (worker) return;
    try {
      worker = new Worker('./commander-forge-engine-worker-v6.js');
      worker.onmessage = (event) => {
        const msg = event.data || {};
        const job = pending.get(msg.id);
        if (!job) return;
        pending.delete(msg.id);
        if (msg.ok) job.resolve(msg.result);
        else job.reject(Object.assign(new Error(msg.error?.message || 'Engine worker error'), msg.error || {}));
      };
      worker.onerror = (event) => setStatus({ state: 'error', error: event.message || 'Worker failed to load.' });
      call('PING').then((pong) => setStatus({ state: 'ready', version: pong.version, error: null })).catch((err) => setStatus({ state: 'error', error: err.message }));
    } catch (err) {
      setStatus({ state: 'error', error: err.message });
    }
  }

  function call(type, payload = {}) {
    start();
    return new Promise((resolve, reject) => {
      const id = `cf6-${++requestId}`;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload });
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`Engine 6 request timed out: ${type}`));
      }, 10000);
    });
  }

  let syncTimer = null;
  function shadowSyncLegacy(state) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        const result = await call('IMPORT_LEGACY_STATE', { state });
        setStatus({ state: 'ready', lastSyncAt: Date.now(), lastCompile: result?.compiled || null, error: null });
      } catch (err) {
        setStatus({ state: 'error', error: err.message });
      }
    }, 20);
  }

  const api = {
    start,
    call,
    ping: () => call('PING'),
    createGame: (players) => call('CREATE_GAME', { players }),
    registerDefinitions: (definitions) => call('REGISTER_DEFINITIONS', { definitions }),
    addCard: (definitionId, ownerId, zone, options) => call('ADD_CARD', { definitionId, ownerId, zone, options }),
    getState: () => call('GET_STATE'),
    getLegalActions: (playerId) => call('GET_LEGAL_ACTIONS', { playerId }),
    performAction: (action) => call('PERFORM_ACTION', { action }),
    resolveTop: (options) => call('RESOLVE_TOP', { options }),
    validateTargetSelection: (spec, ids, context) => call('VALIDATE_TARGET_SELECTION', { spec, ids, context }),
    compileCard: (card, register = true) => call('COMPILE_CARD', { card, register }),
    shadowSyncLegacy,
    getStatus: () => ({ ...status }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }
  };
  root.CommanderForgeEngine6 = api;
  start();
})(typeof globalThis !== 'undefined' ? globalThis : window);
