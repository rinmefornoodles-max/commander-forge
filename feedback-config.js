/*
  Commander Forge feedback configuration.
  This Apps Script Web App endpoint receives feedback submissions and stores
  them in the Commander Forge Feedback Google Sheet.

  This URL is the public form receiver, not a private API key.
*/
window.CommanderForgeFeedback = Object.freeze({
  endpoint: 'https://script.google.com/macros/s/AKfycbzkAQcapl7bTeNwa9o-_O9RALULdaRcp-zaPlLNdd1buCt1Rc9vpd2MvGqmZWcCs3fA/exec'
});

// Reliability/diagnostic layers stay separate from gameplay rules code.
(() => {
  const stability = document.createElement('script');
  stability.src = './commander-forge-stability-6.15.0.js?v=6.15.0';
  stability.defer = true;
  document.head.appendChild(stability);

  const diagnostics = document.createElement('script');
  diagnostics.src = './commander-forge-diagnostics-6.15.0.js?v=6.15.0';
  diagnostics.defer = true;
  document.head.appendChild(diagnostics);

  // 6.14.1: bridge the missing canBlock import in the 6.13 gameplay bundle.
  // This is intentionally a tiny isolated compatibility layer; 6.15 removes
  // the need for it by importing canBlock directly inside game.js.
  const blockingHotfix = document.createElement('script');
  blockingHotfix.src = './commander-forge-blocking-hotfix-6.14.1.js?v=6.14.1';
  blockingHotfix.defer = true;
  document.head.appendChild(blockingHotfix);
})();
