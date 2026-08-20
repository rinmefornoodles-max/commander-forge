/*
  Commander Forge feedback configuration.
  This Apps Script Web App endpoint receives feedback submissions and stores
  them in the Commander Forge Feedback Google Sheet.

  This URL is the public form receiver, not a private API key.
*/
window.CommanderForgeFeedback = Object.freeze({
  endpoint: 'https://script.google.com/macros/s/AKfycbzkAQcapl7bTeNwa9o-_O9RALULdaRcp-zaPlLNdd1buCt1Rc9vpd2MvGqmZWcCs3fA/exec'
});

// 6.14 stability layer. Kept separate from the gameplay bundle so reliability
// improvements can ship without changing multiplayer/game rules code.
(() => {
  const script = document.createElement('script');
  script.src = './commander-forge-stability-6.14.0.js?v=6.14.0';
  script.defer = true;
  document.head.appendChild(script);
})();
