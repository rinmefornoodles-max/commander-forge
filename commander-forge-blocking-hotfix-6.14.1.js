'use strict';

// Commander Forge 6.14.1 blocking hotfix.
// The 6.13 gameplay bundle exports canBlock from card-evaluation.js, but the
// game.js bundle module omitted the import before assignBlocker() called it.
// Keep this shim temporary: 6.15 imports canBlock directly in the game module.
(() => {
  if (typeof globalThis.canBlock === 'function') return;

  globalThis.canBlock = (...args) => {
    // __modules is a global lexical binding created by the classic 6.13 bundle.
    // It exists by the time a player can interact with the battlefield.
    if (typeof __modules === 'undefined') {
      throw new Error('Commander Forge blocker rules are not loaded yet.');
    }
    const implementation = __modules['./card-evaluation.js']?.canBlock;
    if (typeof implementation !== 'function') {
      throw new Error('Commander Forge blocker rules are unavailable.');
    }
    return implementation(...args);
  };
})();
