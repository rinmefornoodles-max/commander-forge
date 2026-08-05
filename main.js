import { COLORS, PHASES, ZONE_LABELS } from './constants.js';
import { fetchCardsByNames, fetchPreconDeck, fetchPreconIndex } from './api.js';
import {
  buildPlayerDeck,
  createInitialState,
  drawCards,
  findCard,
  getState,
  importState,
  resetState,
  restore,
  setState,
  subscribe,
  undo,
  updateState,
} from './state.js';
import { commanderCandidates, recognizedEffects, validateDeck } from './rules.js';
import { analyzePosition, defenseAdvice, possibleMoves } from './coach.js';
import {
  addCounter,
  assignBlocker,
  attachCard,
  adjustCommanderDamage,
  adjustMana,
  adjustPlayer,
  clearMana,
  copyAsToken,
  counterStackTop,
  createToken,
  draw,
  flipCard,
  mill,
  moveCard,
  mulligan,
  concede,
  nextPhase,
  resolveStackTop,
  revealCardPublicly,
  revealTopPublicly,
  setPhase,
  shuffleLibrary,
  switchActivePlayer,
  toggleAttack,
  toggleTap,
  tapForMana,
  updateCardNote,
} from './game.js';
import {
  cardImage,
  cardSmallImage,
  debounce,
  deepClone,
  downloadJson,
  escapeHtml,
  isCreature,
  isLand,
  manaProductionChoices,
  manaSourceLabel,
  parseDecklist,
  shuffle,
  uid,
} from './utils.js';

const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');

window.CommanderForge = { getState };

const ui = {
  setupOpen: false,
  settingsOpen: false,
  tokenOpen: false,
  damageOpen: null,
  logOpen: false,
  importOpen: false,
  inspectorMode: 'card',
  inspectorOpen: false,
  drawer: null,
  drawerSearch: '',
  libraryReveal: null,
  loading: null,
  coach: null,
  preconIndex: null,
  drafts: {
    p1: createDraft('Player 1'),
    p2: createDraft('Player 2'),
  },
};

function createDraft(name) {
  return {
    name,
    source: 'custom',
    text: '',
    entries: [],
    byName: {},
    cards: [],
    commanders: [],
    candidates: [],
    validation: null,
    preconQuery: '',
    preconResults: [],
    selectedPrecon: null,
    ready: false,
  };
}

restore();
if (!getState().started) ui.setupOpen = true;
subscribe(render);
render();

function render() {
  const state = getState();
  app.innerHTML = `
    ${renderHeader(state)}
    <main class="game-shell">
      <section class="play-area">${renderTable(state)}</section>
      <aside class="inspector ${ui.inspectorOpen ? 'open' : ''}">${renderInspector(state)}</aside>
    </main>
    ${renderBottomBar(state)}
    ${renderDrawer(state)}
    ${renderModals(state)}
    ${ui.loading ? renderLoading() : ''}
  `;
  requestAnimationFrame(() => {
    const carousel = document.querySelector('.drawer-carousel');
    if (carousel) carousel.addEventListener('wheel', horizontalWheel, { passive: false });
  });
}

function renderHeader(state) {
  const phase = PHASES[state.phaseIndex];
  const active = state.players[state.activePlayerId];
  return `
    <header class="app-header">
      <div class="brand">
        <img src="./forge-mark.svg" alt="" />
        <div class="brand-text"><h1>The Commander Forge</h1><p>Digital Commander playmat</p></div>
      </div>
      <div class="phase-bar" aria-label="Turn phases">
        <span class="turn-pill">Turn ${state.turnNumber} · ${escapeHtml(active.name)}</span>
        ${PHASES.map((item, index) => `<button class="phase-chip ${index === state.phaseIndex ? 'active' : ''}" data-action="set-phase" data-index="${index}">${item.label}</button>`).join('')}
        <button class="btn primary small-btn" data-action="next-phase">Next ›</button>
      </div>
      <div class="header-actions">
        <button class="btn small-btn" data-action="undo" title="Undo">↶ <span class="desktop-label">Undo</span></button>
        <button class="btn small-btn" data-action="coach">✦ <span class="desktop-label">Coach</span></button>
        <button class="btn small-btn" data-action="open-log">☷ <span class="desktop-label">Log</span></button>
        <button class="btn small-btn" data-action="open-settings">⚙</button>
        <button class="btn small-btn" data-action="open-setup">Decks</button>
      </div>
    </header>`;
}

function renderTable(state) {
  return `
    ${state.winner ? `<div class="winner-banner">🏆 ${escapeHtml(state.players[state.winner]?.name || 'A player')} wins the game</div>` : ''}
    <div class="table">
      ${renderPlayerMat(state, 'p2', true)}
      ${renderStack(state)}
      ${renderPlayerMat(state, 'p1', false)}
    </div>`;
}

function renderPlayerMat(state, playerId, opponent) {
  const player = state.players[playerId];
  const battlefield = player.zones.battlefield;
  const hideHand = opponent && state.settings.hideOpponentHand;
  return `
    <section class="player-mat ${opponent ? 'opponent' : 'you'}" data-player-mat="${playerId}">
      <aside class="player-sidebar">
        ${renderPlayerStatus(state, playerId)}
        <div class="command-slot zone ${player.zones.command.length ? '' : 'empty'}" data-drop-zone="command" data-player-id="${playerId}">
          <span class="zone-label">Command Zone</span>
          <div class="card-row">${player.zones.command.map((card) => renderCard(card, state, { compact: true })).join('') || `<span class="muted small">Drop commander here</span>`}</div>
        </div>
        <div class="zone-shortcuts">
          ${renderZonePile(playerId, 'library', player.zones.library.length)}
          ${renderZonePile(playerId, 'graveyard', player.zones.graveyard.length)}
          ${renderZonePile(playerId, 'exile', player.zones.exile.length)}
          <button class="zone-pile" data-action="open-damage" data-player-id="${playerId}"><strong>Commander damage</strong><span>${Math.max(0, ...Object.values(player.commanderDamage).map(Number))}/21 max</span></button>
        </div>
      </aside>
      <div class="board-main">
        <div class="zone battlefield-zone" data-drop-zone="battlefield" data-player-id="${playerId}">
          <span class="zone-label">${opponent ? `${escapeHtml(player.name)}'s battlefield` : 'Your battlefield'}</span>
          <div class="card-row ${battlefield.length < 4 ? 'centered' : ''}">${battlefield.map((card) => renderCard(card, state)).join('')}</div>
        </div>
        <div class="zone hand-zone" data-drop-zone="hand" data-player-id="${playerId}">
          <span class="zone-label">${opponent ? `${escapeHtml(player.name)}'s hand · ${player.zones.hand.length}` : `Your hand · ${player.zones.hand.length}`}</span>
          <div class="card-row">${hideHand ? renderHiddenHand(player.zones.hand.length) : player.zones.hand.map((card) => renderCard(card, state)).join('')}</div>
        </div>
      </div>
    </section>`;
}

function renderPlayerStatus(state, playerId) {
  const player = state.players[playerId];
  const active = state.activePlayerId === playerId;
  const floating = COLORS.filter((color) => Number(player.mana[color] || 0) > 0)
    .map((color) => `<span class="mana-chip">${color}<b>${player.mana[color]}</b></span>`)
    .join('');
  const sourceGroups = new Map();
  for (const card of player.zones.battlefield.filter((item) => !item.tapped)) {
    const label = manaSourceLabel(card);
    if (!label) continue;
    sourceGroups.set(label, (sourceGroups.get(label) || 0) + 1);
  }
  const available = [...sourceGroups.entries()]
    .map(([label, count]) => `<span class="source-chip">${escapeHtml(label)}${count > 1 ? ` ×${count}` : ''}</span>`)
    .join('');
  const manaPanel = state.settings.manaMode === 'manual'
    ? `<div class="mana-row" style="margin-top:8px">${COLORS.map((color) => `<button class="btn small-btn" data-action="mana" data-player-id="${playerId}" data-color="${color}" data-delta="1" title="Add ${color} mana">${color}<b>${player.mana[color]}</b></button>`).join('')}<button class="btn small-btn ghost" data-action="clear-mana" data-player-id="${playerId}" title="Clear mana">×</button></div>`
    : `<div class="automatic-mana"><div><span class="mana-caption">Untapped sources</span><div class="mana-chip-row">${available || '<span class="muted small">None</span>'}</div></div><div><span class="mana-caption">Floating pool</span><div class="mana-chip-row">${floating || '<span class="muted small">Empty</span>'}${floating ? `<button class="icon-btn tiny" data-action="clear-mana" data-player-id="${playerId}" title="Clear floating mana">×</button>` : ''}</div></div></div>`;
  return `
    <div class="player-status ${active ? 'active' : ''}">
      <div class="player-name-row"><span class="player-name">${escapeHtml(player.name)}</span>${active ? '<span class="active-dot" title="Active player"></span>' : ''}</div>
      <div class="trackers">
        ${renderTracker(playerId, 'life', 'Life', player.life, [-5, -1, 1, 5])}
        ${renderTracker(playerId, 'poison', 'Poison', player.poison, [-1, 1])}
      </div>
      ${manaPanel}
    </div>`;
}

function renderTracker(playerId, field, label, value, deltas) {
  return `<div class="tracker"><div class="tracker-label">${label}</div><div class="tracker-value">${value}</div><div class="tracker-controls">${deltas.map((delta) => `<button data-action="adjust-player" data-player-id="${playerId}" data-field="${field}" data-delta="${delta}">${delta > 0 ? '+' : ''}${delta}</button>`).join('')}</div></div>`;
}

function renderZonePile(playerId, zone, count) {
  return `<button class="zone-pile" data-action="open-zone" data-player-id="${playerId}" data-zone="${zone}" data-drop-zone="${zone}"><strong>${ZONE_LABELS[zone]}</strong><span>${count} card${count === 1 ? '' : 's'}</span></button>`;
}

function renderHiddenHand(count) {
  return Array.from({ length: Math.min(count, 12) }, (_, index) => `<div class="game-card hidden-hand-card" aria-label="Hidden card ${index + 1}"><img src="./card-back.svg" alt="Card back" /></div>`).join('');
}

function renderCard(card, state, { compact = false } = {}) {
  const selected = state.selected?.instanceId === card.instanceId;
  const badges = [];
  if (card.commander) badges.push('<span class="card-badge">CMD</span>');
  if (card.summoningSick) badges.push('<span class="card-badge blue">NEW</span>');
  if (card.attacking) badges.push('<span class="card-badge red">ATK</span>');
  if (card.blocking) badges.push('<span class="card-badge blue">BLK</span>');
  if (card.attachedTo) badges.push('<span class="card-badge purple">ATT</span>');
  const manaLabel = manaSourceLabel(card);
  if (manaLabel) badges.push(`<span class="card-badge mana" title="Mana choices">${escapeHtml(manaLabel)}</span>`);
  const counterTotal = Object.values(card.counters || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (counterTotal) badges.push(`<span class="card-badge purple">${counterTotal}</span>`);
  const image = card.faceDown ? './card-back.svg' : cardSmallImage(card);
  return `<article class="game-card ${selected ? 'selected' : ''} ${card.tapped ? 'tapped' : ''} ${card.attacking ? 'attacking' : ''} ${compact ? 'compact' : ''}" data-card-id="${card.instanceId}" title="${escapeHtml(card.name)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(card.name)}" draggable="false" onerror="this.src='./card-back.svg'" /><div class="badge-row">${badges.join('')}</div>${state.settings.showCardNames ? `<div class="card-name-strip">${escapeHtml(card.name)}</div>` : ''}</article>`;
}

function renderStack(state) {
  return `<section class="stack-area" data-drop-zone="stack" data-player-id="${state.activePlayerId}"><span class="stack-label">Stack</span><div class="stack-cards">${state.stack.map((card) => `<img class="stack-mini" src="${escapeHtml(cardSmallImage(card))}" alt="${escapeHtml(card.name)}" data-card-id="${card.instanceId}" />`).join('') || '<span class="muted small">Drag spells here when responses matter</span>'}</div>${state.stack.length ? `<button class="btn small-btn" data-action="resolve-stack">Resolve top</button><button class="btn small-btn danger" data-action="counter-stack">Counter top</button>` : ''}</section>`;
}

function renderInspector(state) {
  if (ui.inspectorMode === 'coach') return renderCoachInspector(state);
  const selected = state.selected?.instanceId ? findCard(state.selected.instanceId, state) : null;
  if (!selected) return `<div class="inspector-empty"><div><div style="font-size:2rem">🃏</div><h3>Select a card</h3><p>Tap a card for actions. Drag it directly between visible zones.</p><button class="btn primary" data-action="coach">Open strategy coach</button></div></div>`;
  const card = selected.card;
  const effects = recognizedEffects(card);
  const counterButtons = ['+1/+1', '-1/-1', 'charge', 'loyalty', 'stun'];
  return `
    <div class="inspector-section" style="display:flex;justify-content:space-between;align-items:center"><h3>Card actions</h3><button class="icon-btn" data-action="close-inspector">×</button></div>
    <div class="inspector-section">
      <img class="inspector-card-image" src="${escapeHtml(cardImage(card))}" alt="${escapeHtml(card.name)}" onerror="this.src='./card-back.svg'" />
      <h2>${escapeHtml(card.name)}</h2>
      <div class="muted small">${escapeHtml(card.manaCost)} · ${escapeHtml(card.typeLine)}</div>
      ${card.power ? `<div class="small">${escapeHtml(card.power)}/${escapeHtml(card.toughness)}</div>` : ''}${card.commander ? `<div class="small" style="margin-top:5px;color:var(--gold-2)">Cast ${getState().players[card.owner].commanderCastCount[card.instanceId] || 0} time(s) · current tax +${2 * (getState().players[card.owner].commanderCastCount[card.instanceId] || 0)}</div>` : ''}
    </div>
    <div class="inspector-section"><h3>Quick actions</h3><div class="action-grid">
      ${selected.zone === 'battlefield' ? `${renderManaTapActions(card, state)}<button class="btn" data-action="toggle-attack" data-card-id="${card.instanceId}">${card.attacking ? 'Stop attack' : '⚔ Attack'}</button>${renderBlockActions(card, state)}${renderAttachActions(card, state)}` : ''}
      ${zoneMoveButton(card, 'battlefield', 'Battlefield')}
      ${zoneMoveButton(card, 'hand', 'Hand')}
      ${zoneMoveButton(card, 'graveyard', 'Graveyard')}
      ${zoneMoveButton(card, 'exile', 'Exile')}
      ${card.commander ? zoneMoveButton(card, 'command', 'Command zone') : ''}
      ${zoneMoveButton(card, 'stack', 'Stack')}
      <button class="btn" data-action="move-library" data-card-id="${card.instanceId}" data-position="top">Library top</button>
      <button class="btn" data-action="move-library" data-card-id="${card.instanceId}" data-position="bottom">Library bottom</button>
      <button class="btn" data-action="flip-card" data-card-id="${card.instanceId}">${card.faceDown ? 'Turn face up' : 'Turn face down'}</button>
      <button class="btn" data-action="reveal-public" data-card-id="${card.instanceId}">Reveal publicly</button>
      <button class="btn" data-action="copy-token" data-card-id="${card.instanceId}">Create copy</button>
    </div></div>
    <div class="inspector-section"><h3>Counters</h3><div class="counter-row">${counterButtons.map((counter) => `<button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${counter}" data-delta="1">+ ${counter}</button>`).join('')}</div>${Object.entries(card.counters || {}).map(([counter, count]) => `<div class="counter-row" style="margin-top:6px"><span>${escapeHtml(counter)}: ${count}</span><button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="-1">−</button><button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="1">+</button></div>`).join('')}</div>
    <div class="inspector-section"><h3>Oracle text</h3><div class="oracle">${escapeHtml(card.oracleText || 'No Oracle text.')}</div>${effects.length ? `<p class="small muted">Recognized: ${effects.map(escapeHtml).join(' · ')}</p>` : ''}</div>
    <div class="inspector-section"><h3>Notes</h3><textarea class="card-note" data-card-id="${card.instanceId}" style="min-height:70px">${escapeHtml(card.notes || '')}</textarea></div>`;
}



function renderBlockActions(card, state) {
  if (!isCreature(card)) return '';
  const opposingAttackers = Object.values(state.players)
    .filter((player) => player.id !== card.controller)
    .flatMap((player) => player.zones.battlefield)
    .filter((attacker) => attacker.attacking);
  if (!opposingAttackers.length) return '';
  return `<div class="mana-choice-group"><div class="small muted wide">Declare blocker</div>${opposingAttackers.map((attacker) => `<button class="btn" data-action="assign-block" data-card-id="${card.instanceId}" data-attacker-id="${attacker.instanceId}">${card.blocking === attacker.instanceId ? 'Stop blocking' : `Block ${escapeHtml(attacker.name)}`}</button>`).join('')}</div>`;
}

function renderAttachActions(card, state) {
  const type = String(card.typeLine || '');
  if (!/Aura|Equipment/.test(type)) return '';
  const targets = state.players[card.controller]?.zones.battlefield.filter((target) => target.instanceId !== card.instanceId && isCreature(target)) || [];
  if (!targets.length) return '';
  return `<div class="mana-choice-group"><div class="small muted wide">Attach to</div>${targets.slice(0, 12).map((target) => `<button class="btn" data-action="attach-card" data-card-id="${card.instanceId}" data-target-id="${target.instanceId}">${escapeHtml(target.name)}</button>`).join('')}</div>`;
}

function renderManaTapActions(card, state) {
  if (card.tapped) return `<button class="btn" data-action="toggle-tap" data-card-id="${card.instanceId}">↺ Untap</button>`;
  const choices = manaProductionChoices(card);
  if (state.settings.manaMode === 'manual' || !choices.length) {
    return `<button class="btn" data-action="toggle-tap" data-card-id="${card.instanceId}">↻ Tap</button>`;
  }
  const manaButtons = choices.map((choice, index) => `<button class="btn mana-choice" data-action="tap-mana" data-card-id="${card.instanceId}" data-choice-index="${index}">↻ Tap → ${escapeHtml(choice.label)}</button>`).join('');
  return `<div class="mana-choice-group"><div class="small muted wide">Choose what this source produces</div>${manaButtons}<button class="btn ghost" data-action="toggle-tap-only" data-card-id="${card.instanceId}">Tap without adding mana</button></div>`;
}

function zoneMoveButton(card, zone, label) {
  return `<button class="btn" data-action="move-card" data-card-id="${card.instanceId}" data-zone="${zone}">${label}</button>`;
}

function renderCoachInspector(state) {
  const active = state.players[state.activePlayerId];
  const basicMoves = possibleMoves(state);
  const defense = defenseAdvice(state);
  const defenseHtml = defense ? `<div class="inspector-section"><h3>Defense suggestion for ${escapeHtml(defense.defenderName)}</h3>${defense.assignments.map((item) => `<div class="coach-result"><strong>${escapeHtml(item.blocker)} blocks ${escapeHtml(item.attacker)}</strong><p class="small muted">${escapeHtml(item.reason)}</p></div>`).join('') || '<div class="validation">No useful legal-looking blocks found.</div>'}<p class="small">Estimated unblocked/trample damage: ${defense.expectedDamage}</p></div>` : '';
  const resultsHtml = ui.coach
    ? ui.coach.results.slice(0, 6).map((result, index) => {
      const details = result.explanationDetails || {};
      const visible = (details.visibleReasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
      const memory = (details.publicMemoryReasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
      const safer = index === 0 && result.saferAlternative
        ? `<div class="coach-safe"><strong>Safer alternative:</strong> ${escapeHtml(result.saferAlternative.label)} <span class="muted">(${escapeHtml(result.saferAlternative.riskLevel)} risk)</span></div>`
        : '';
      return `<article class="coach-result ${index === 0 ? 'best' : ''}"><div class="coach-title-row"><span class="score-pill">${result.score >= 0 ? '+' : ''}${result.score}</span><strong>${index + 1}. ${escapeHtml(result.label)}</strong></div><p class="small">${escapeHtml(details.headline || result.explanation || '')}</p>${visible ? `<div class="coach-detail"><strong>Visible board:</strong><ul>${visible}</ul></div>` : ''}${memory ? `<div class="coach-detail"><strong>Public memory:</strong><ul>${memory}</ul></div>` : ''}<div class="coach-risk"><strong>${escapeHtml(details.riskLevel || 'Low')} risk</strong> · ${escapeHtml(details.hiddenRisk || '')}</div>${safer}<div class="small muted">Confidence: ${result.confidence || 0}% · sampled range ${result.range[0]} to ${result.range[1]}</div></article>`;
    }).join('')
    : '<div class="validation">Run analysis to rank plays, sequences, attacks, activated abilities, and passing.</div>';
  const audit = ui.coach?.informationSetAudit;
  const auditHtml = audit ? `<details class="coach-audit"><summary>Information used by the coach</summary><div class="small"><div>✓ Your full hand and public zones</div><div>✓ Both visible battlefields and individual card text/state</div><div>✓ Public game memory and opponent hand size/behavior</div><div>✗ No opponent hidden card names or hidden library identities</div></div></details>` : '';
  return `<div class="inspector-section" style="display:flex;justify-content:space-between;align-items:center"><h3>Information-set coach</h3><button class="icon-btn" data-action="close-inspector">×</button></div><div class="coach-panel"><p class="small muted">Samples plausible hidden interaction from public colors, open mana, known cards, hand size, and behavior. It never reads the opponent's hidden hand or decklist.</p><button class="btn primary wide" data-action="run-coach">Analyze ${escapeHtml(active.name)}'s position</button><p class="small">${basicMoves.length} legal-looking move and sequence candidates · ${state.settings.coachRollouts} samples per candidate.</p>${resultsHtml}${auditHtml}</div>${defenseHtml}`;
}

function renderDrawer(state) {
  if (!ui.drawer) return '<section class="zone-drawer" aria-hidden="true"></section>';
  const { playerId, zone } = ui.drawer;
  const player = state.players[playerId];
  let cards = player.zones[zone] || [];
  if (ui.drawerSearch.trim()) cards = cards.filter((card) => card.name.toLocaleLowerCase().includes(ui.drawerSearch.trim().toLocaleLowerCase()));
  else if (zone === 'library' && ui.libraryReveal?.playerId === playerId) cards = cards.slice(0, 1);
  const hideLibrary = zone === 'library' && !ui.drawerSearch.trim() && ui.libraryReveal?.playerId !== playerId;
  return `<section class="zone-drawer open" aria-label="${ZONE_LABELS[zone]}"><div class="drawer-header"><div><div class="drawer-title">${escapeHtml(player.name)} · ${ZONE_LABELS[zone]}</div><div class="small muted">${player.zones[zone].length} card${player.zones[zone].length === 1 ? '' : 's'}</div></div><div class="drawer-tools">${zone === 'library' ? `<input type="search" id="drawer-search" value="${escapeHtml(ui.drawerSearch)}" placeholder="Search library by name" /><button class="btn small-btn" data-action="shuffle-library" data-player-id="${playerId}">Shuffle</button><button class="btn small-btn" data-action="reveal-top" data-player-id="${playerId}">Reveal top</button><button class="btn small-btn" data-action="draw" data-player-id="${playerId}" data-amount="1">Draw</button><button class="btn small-btn" data-action="mill" data-player-id="${playerId}" data-amount="1">Mill</button>` : `<input type="search" id="drawer-search" value="${escapeHtml(ui.drawerSearch)}" placeholder="Filter cards" />`}<button class="icon-btn" data-action="close-drawer">×</button></div></div><div class="drawer-carousel" data-drop-zone="${zone}" data-player-id="${playerId}">${hideLibrary ? renderLibraryBacks(player.zones.library.length) : cards.map((card) => renderCard(card, state)).join('') || '<span class="muted">No matching cards.</span>'}</div></section>`;
}

function renderLibraryBacks(count) {
  const visible = Math.min(7, count);
  return `${Array.from({ length: visible }, () => `<div class="game-card card-back-stack"><img src="./card-back.svg" alt="Hidden library card" /></div>`).join('')}<div class="validation"><strong>Library is hidden.</strong><br />Use search when a tutor effect lets you find a card, or reveal the top card.</div>`;
}

function renderBottomBar() {
  return `<nav class="bottom-bar"><button data-action="next-phase"><strong>›</strong>Phase</button><button data-action="coach"><strong>✦</strong>Coach</button><button data-action="open-token"><strong>＋</strong>Token</button><button data-action="undo"><strong>↶</strong>Undo</button><button data-action="open-settings"><strong>⚙</strong>Tools</button></nav>`;
}

function renderModals(state) {
  return `${ui.setupOpen ? renderSetupModal(state) : ''}${ui.settingsOpen ? renderSettingsModal(state) : ''}${ui.tokenOpen ? renderTokenModal(state) : ''}${ui.damageOpen ? renderDamageModal(state) : ''}${ui.logOpen ? renderLogModal(state) : ''}`;
}

function renderSetupModal(state) {
  return `<div class="modal-backdrop"><section class="modal"><header class="modal-header"><div><h2>Set up the Commander table</h2><div class="small muted">Paste a 100-card list or search an official precon.</div></div>${state.started ? '<button class="icon-btn" data-action="close-setup">×</button>' : ''}</header><div class="modal-body"><div class="setup-grid">${renderDeckPanel('p1')}${renderDeckPanel('p2')}</div><div class="setup-footer"><div><button class="btn" data-action="demo-game">Load interactive demo</button> <button class="btn" data-action="import-save">Import saved game</button></div><button class="btn primary" data-action="start-game" ${bothDraftsReady() ? '' : 'disabled'}>Shuffle, draw 7, and start</button></div><input id="save-file-input" class="hidden" type="file" accept="application/json" /></div></section></div>`;
}

function renderDeckPanel(playerId) {
  const draft = ui.drafts[playerId];
  return `<section class="deck-panel" data-deck-panel="${playerId}"><h3>${playerId === 'p1' ? 'Player 1 / You' : 'Player 2'}</h3><div class="field"><label>Player name</label><input data-draft-field="name" data-player-id="${playerId}" value="${escapeHtml(draft.name)}" /></div><div class="segmented"><button class="${draft.source === 'custom' ? 'active' : ''}" data-action="deck-source" data-player-id="${playerId}" data-source="custom">Paste decklist</button><button class="${draft.source === 'precon' ? 'active' : ''}" data-action="deck-source" data-player-id="${playerId}" data-source="precon">Official precon</button></div>${draft.source === 'custom' ? renderCustomDraft(playerId, draft) : renderPreconDraft(playerId, draft)}${draft.cards.length ? renderCommanderSelection(playerId, draft) : ''}${draft.validation ? renderValidation(draft.validation) : ''}</section>`;
}

function renderCustomDraft(playerId, draft) {
  return `<div class="field"><label>Decklist format: <code>1 Satoru Umezawa</code></label><textarea data-draft-field="text" data-player-id="${playerId}" placeholder="1 Commander Name\n1 Sol Ring\n1 Arcane Signet\n...">${escapeHtml(draft.text)}</textarea></div><button class="btn primary" data-action="prepare-custom" data-player-id="${playerId}">Load cards and validate</button>`;
}

function renderPreconDraft(playerId, draft) {
  return `<div class="field"><label>Search official deck name</label><div style="display:flex;gap:6px"><input data-draft-field="preconQuery" data-player-id="${playerId}" value="${escapeHtml(draft.preconQuery)}" placeholder="Grave Danger" /><button class="btn" data-action="search-precon" data-player-id="${playerId}">Search</button></div></div><div class="precon-results">${draft.preconResults.map((deck) => `<button class="precon-item" data-action="load-precon" data-player-id="${playerId}" data-file-name="${escapeHtml(deck.fileName)}"><span><strong>${escapeHtml(deck.name)}</strong><br /><span class="small muted">${escapeHtml(deck.type || deck.code)} · ${escapeHtml(deck.releaseDate || '')}</span></span><span>Load ›</span></button>`).join('') || '<div class="validation">Search MTGJSON for a preconstructed deck.</div>'}</div>`;
}

function renderCommanderSelection(playerId, draft) {
  const options = draft.candidates.map((card) => `<option value="${escapeHtml(card.name)}" ${draft.commanders[0] === card.name ? 'selected' : ''}>${escapeHtml(card.name)}</option>`).join('');
  const secondaryOptions = `<option value="">No second commander</option>${draft.candidates.map((card) => `<option value="${escapeHtml(card.name)}" ${draft.commanders[1] === card.name ? 'selected' : ''}>${escapeHtml(card.name)}</option>`).join('')}`;
  return `<div class="field" style="margin-top:10px"><label>Commander</label><select data-commander-select="primary" data-player-id="${playerId}"><option value="">Choose commander</option>${options}</select></div><div class="field"><label>Second commander, only when rules allow</label><select data-commander-select="secondary" data-player-id="${playerId}">${secondaryOptions}</select></div>`;
}

function renderValidation(validation) {
  return `<div class="validation ${validation.errors.length ? 'error' : 'ok'}" style="margin-top:10px"><strong>${validation.errors.length ? 'Deck needs changes' : `Ready · ${validation.total}/100 cards`}</strong>${validation.errors.length ? `<ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>` : ''}${validation.warnings.length ? `<ul>${validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}</div>`;
}

function renderSettingsModal(state) {
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>Table tools</h2><button class="icon-btn" data-action="close-settings">×</button></header><div class="modal-body"><div class="field"><label>Rules enforcement</label><select id="rules-mode"><option value="free" ${state.settings.rulesMode === 'free' ? 'selected' : ''}>Free table: never block moves</option><option value="learning" ${state.settings.rulesMode === 'learning' ? 'selected' : ''}>Learning: explain and allow override</option><option value="strict" ${state.settings.rulesMode === 'strict' ? 'selected' : ''}>Strict basics: block known illegal moves</option></select></div><div class="field"><label>Mana handling</label><select id="mana-mode"><option value="manual" ${state.settings.manaMode === 'manual' ? 'selected' : ''}>Manual: tap and edit counters yourself</option><option value="assisted" ${state.settings.manaMode === 'assisted' ? 'selected' : ''}>Assisted: tapping a source adds its mana</option><option value="auto" ${state.settings.manaMode === 'auto' || !state.settings.manaMode ? 'selected' : ''}>Auto-pay: casting taps suggested sources</option></select><div class="small muted" style="margin-top:5px">Dual and hybrid-looking sources appear as choices such as U / B. The floating pool still stores the actual color chosen.</div></div><label><input type="checkbox" id="hide-opponent" ${state.settings.hideOpponentHand ? 'checked' : ''}/> Hide Player 2 hand</label><br /><label><input type="checkbox" id="auto-draw" ${state.settings.autoDraw ? 'checked' : ''}/> Auto draw during draw step</label><br /><label><input type="checkbox" id="show-names" ${state.settings.showCardNames ? 'checked' : ''}/> Show card-name strips</label><div class="field" style="margin-top:10px"><label>Information-set samples per move</label><input id="coach-rollouts" type="number" min="60" max="1000" step="40" value="${state.settings.coachRollouts}" /></div><div class="action-grid"><button class="btn" data-action="switch-player">Switch active player</button><button class="btn" data-action="open-token">Create token</button><button class="btn" data-action="mulligan" data-player-id="p1">Mulligan Player 1</button><button class="btn" data-action="mulligan" data-player-id="p2">Mulligan Player 2</button><button class="btn" data-action="random-tool" data-kind="d6">Roll D6</button><button class="btn" data-action="random-tool" data-kind="d20">Roll D20</button><button class="btn" data-action="random-tool" data-kind="coin">Flip coin</button><button class="btn" data-action="export-save">Export save</button><button class="btn" data-action="import-save">Import save</button><button class="btn danger" data-action="concede" data-player-id="p1">P1 concede</button><button class="btn danger" data-action="concede" data-player-id="p2">P2 concede</button><button class="btn danger wide" data-action="reset-game">Reset entire table</button></div><input id="settings-file-input" class="hidden" type="file" accept="application/json" /></div></section></div>`;
}

function renderTokenModal() {
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>Create a token</h2><button class="icon-btn" data-action="close-token">×</button></header><div class="modal-body"><div class="field"><label>Controller</label><select id="token-player"><option value="p1">Player 1</option><option value="p2">Player 2</option></select></div><div class="field"><label>Name</label><input id="token-name" value="Zombie" /></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="field"><label>Power</label><input id="token-power" type="number" value="2" /></div><div class="field"><label>Toughness</label><input id="token-toughness" type="number" value="2" /></div></div><div class="field"><label>Type line</label><input id="token-type" value="Token Creature — Zombie" /></div><div class="field"><label>Keywords, comma separated</label><input id="token-keywords" placeholder="Flying, Haste" /></div><button class="btn primary" data-action="create-token">Create on battlefield</button></div></section></div>`;
}

function renderDamageModal(state) {
  const targetId = ui.damageOpen;
  const target = state.players[targetId];
  const sources = Object.values(state.players).flatMap((player) => Object.values(player.zones).flat()).filter((card) => card.commander && card.owner !== targetId);
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>${escapeHtml(target.name)} · Commander damage</h2><button class="icon-btn" data-action="close-damage">×</button></header><div class="modal-body">${sources.length ? sources.map((card) => `<div class="player-status" style="margin-bottom:8px"><div class="player-name-row"><span>${escapeHtml(card.name)}</span><strong>${target.commanderDamage[card.instanceId] || 0}/21</strong></div><div class="tracker-controls"><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="-5">-5</button><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="-1">-1</button><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="1">+1</button><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="5">+5</button></div></div>`).join('') : '<div class="validation">Load an opposing commander first.</div>'}</div></section></div>`;
}

function renderLogModal(state) {
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>Game log</h2><button class="icon-btn" data-action="close-log">×</button></header><div class="modal-body">${state.log.map((item) => `<div class="validation" style="margin-bottom:6px"><span class="small muted">${new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><br />${escapeHtml(item.text)}</div>`).join('') || '<div class="validation">Actions will appear here.</div>'}</div></section></div>`;
}

function renderLoading() {
  return `<div class="loading-overlay"><div class="loading-card"><div class="spinner"></div><strong>${escapeHtml(ui.loading.title || 'Working…')}</strong><p class="muted">${escapeHtml(ui.loading.message || '')}</p></div></div>`;
}

function bothDraftsReady() {
  return ['p1', 'p2'].every((id) => ui.drafts[id].ready && !ui.drafts[id].validation?.errors.length);
}

function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast ${error ? 'error' : ''}`;
  node.textContent = message;
  toastRoot.append(node);
  setTimeout(() => node.remove(), 3100);
}

function showLoading(title, message = '') { ui.loading = { title, message }; render(); }
function updateLoading(message) { if (ui.loading) { ui.loading.message = message; render(); } }
function hideLoading() { ui.loading = null; render(); }

function horizontalWheel(event) {
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  }
}

app.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'next-phase') nextPhase();
    if (action === 'set-phase') setPhase(Number(button.dataset.index));
    if (action === 'undo') { if (!undo()) toast('Nothing to undo.'); }
    if (action === 'coach') { ui.inspectorMode = 'coach'; ui.inspectorOpen = true; render(); }
    if (action === 'run-coach') { showLoading('Analyzing possible lines', 'Sampling public-information-consistent hidden states…'); await new Promise((r) => setTimeout(r, 40)); ui.coach = analyzePosition(getState()); hideLoading(); }
    if (action === 'close-inspector') { ui.inspectorOpen = false; getState().selected = null; ui.inspectorMode = 'card'; render(); }
    if (action === 'open-log') { ui.logOpen = true; render(); }
    if (action === 'close-log') { ui.logOpen = false; render(); }
    if (action === 'open-settings') { ui.settingsOpen = true; render(); }
    if (action === 'close-settings') { saveSettingsFromModal(); ui.settingsOpen = false; render(); }
    if (action === 'open-setup') { ui.setupOpen = true; render(); }
    if (action === 'close-setup') { ui.setupOpen = false; render(); }
    if (action === 'open-token') { ui.settingsOpen = false; ui.tokenOpen = true; render(); }
    if (action === 'close-token') { ui.tokenOpen = false; render(); }
    if (action === 'create-token') createTokenFromModal();
    if (action === 'open-damage') { ui.damageOpen = button.dataset.playerId; render(); }
    if (action === 'close-damage') { ui.damageOpen = null; render(); }
    if (action === 'adjust-player') adjustPlayer(button.dataset.playerId, button.dataset.field, Number(button.dataset.delta));
    if (action === 'commander-damage') adjustCommanderDamage(button.dataset.playerId, button.dataset.sourceId, Number(button.dataset.delta));
    if (action === 'mana') adjustMana(button.dataset.playerId, button.dataset.color, Number(button.dataset.delta));
    if (action === 'clear-mana') clearMana(button.dataset.playerId);
    if (action === 'open-zone') { ui.drawer = { playerId: button.dataset.playerId, zone: button.dataset.zone }; ui.drawerSearch = ''; ui.libraryReveal = null; render(); }
    if (action === 'close-drawer') { ui.drawer = null; ui.drawerSearch = ''; render(); }
    if (action === 'shuffle-library') shuffleLibrary(button.dataset.playerId);
    if (action === 'reveal-top') { handleResult(revealTopPublicly(button.dataset.playerId)); ui.libraryReveal = { playerId: button.dataset.playerId }; render(); }
    if (action === 'draw') draw(button.dataset.playerId, Number(button.dataset.amount || 1));
    if (action === 'mill') mill(button.dataset.playerId, Number(button.dataset.amount || 1));
    if (action === 'toggle-tap') handleResult(toggleTap(button.dataset.cardId));
    if (action === 'toggle-tap-only') handleResult(toggleTap(button.dataset.cardId, { mana: false }));
    if (action === 'tap-mana') handleResult(tapForMana(button.dataset.cardId, Number(button.dataset.choiceIndex || 0)));
    if (action === 'toggle-attack') handleResult(toggleAttack(button.dataset.cardId));
    if (action === 'assign-block') handleResult(assignBlocker(button.dataset.cardId, button.dataset.attackerId));
    if (action === 'attach-card') handleResult(attachCard(button.dataset.cardId, button.dataset.targetId));
    if (action === 'reveal-public') handleResult(revealCardPublicly(button.dataset.cardId));
    if (action === 'move-card') moveSelectedTo(button.dataset.cardId, button.dataset.zone);
    if (action === 'move-library') moveSelectedTo(button.dataset.cardId, 'library', button.dataset.position);
    if (action === 'flip-card') flipCard(button.dataset.cardId);
    if (action === 'copy-token') copyAsToken(button.dataset.cardId);
    if (action === 'counter') addCounter(button.dataset.cardId, button.dataset.counter, Number(button.dataset.delta));
    if (action === 'resolve-stack') handleResult(resolveStackTop());
    if (action === 'counter-stack') counterStackTop();
    if (action === 'switch-player') switchActivePlayer();
    if (action === 'mulligan') { const bottoms = mulligan(button.dataset.playerId); toast(bottoms ? `Draw 7, then put ${bottoms} card(s) from hand on the bottom.` : 'Free Commander mulligan: draw 7.'); }
    if (action === 'concede') { if (confirm(`${getState().players[button.dataset.playerId].name} concedes?`)) concede(button.dataset.playerId); }
    if (action === 'random-tool') runRandomTool(button.dataset.kind);
    if (action === 'export-save') downloadJson(`commander-forge-turn-${getState().turnNumber}.json`, getState());
    if (action === 'import-save') triggerFilePicker();
    if (action === 'reset-game') resetGamePrompt();
    if (action === 'deck-source') { const draft = ui.drafts[button.dataset.playerId]; draft.source = button.dataset.source; if (draft.source === 'precon') await ensurePreconIndex(); render(); }
    if (action === 'prepare-custom') await prepareCustomDeck(button.dataset.playerId);
    if (action === 'search-precon') await searchPrecons(button.dataset.playerId);
    if (action === 'load-precon') await loadPrecon(button.dataset.playerId, button.dataset.fileName);
    if (action === 'start-game') startGame();
    if (action === 'demo-game') loadDemoGame();
  } catch (error) {
    console.error(error);
    hideLoading();
    toast(error.message || 'Something went wrong.', true);
  }
});

app.addEventListener('input', debounce((event) => {
  const target = event.target;
  if (target.matches('[data-draft-field]')) ui.drafts[target.dataset.playerId][target.dataset.draftField] = target.value;
  if (target.id === 'drawer-search') {
    const position = target.selectionStart ?? target.value.length;
    ui.drawerSearch = target.value;
    render();
    requestAnimationFrame(() => {
      const replacement = document.querySelector('#drawer-search');
      replacement?.focus();
      replacement?.setSelectionRange(position, position);
    });
  }
  if (target.matches('.card-note')) updateCardNote(target.dataset.cardId, target.value);
}, 120));

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-commander-select]')) {
    const draft = ui.drafts[target.dataset.playerId];
    const index = target.dataset.commanderSelect === 'primary' ? 0 : 1;
    draft.commanders[index] = target.value;
    draft.commanders = draft.commanders.filter(Boolean);
    refreshDraftValidation(target.dataset.playerId);
    render();
  }
});

function saveSettingsFromModal() {
  const mode = document.querySelector('#rules-mode');
  if (!mode) return;
  updateState((draft) => {
    draft.settings.rulesMode = mode.value;
    draft.settings.manaMode = document.querySelector('#mana-mode')?.value || 'auto';
    draft.settings.hideOpponentHand = document.querySelector('#hide-opponent')?.checked ?? true;
    draft.settings.autoDraw = document.querySelector('#auto-draw')?.checked ?? true;
    draft.settings.showCardNames = document.querySelector('#show-names')?.checked ?? true;
    draft.settings.coachRollouts = Math.max(60, Math.min(1000, Number(document.querySelector('#coach-rollouts')?.value || 240)));
  }, { snapshot: false });
}

function createTokenFromModal() {
  const playerId = document.querySelector('#token-player').value;
  const name = document.querySelector('#token-name').value.trim() || 'Token';
  const power = Number(document.querySelector('#token-power').value || 1);
  const toughness = Number(document.querySelector('#token-toughness').value || 1);
  const typeLine = document.querySelector('#token-type').value.trim() || 'Token Creature';
  const keywords = document.querySelector('#token-keywords').value.split(',').map((v) => v.trim()).filter(Boolean);
  createToken(playerId, { name, power, toughness, typeLine, keywords });
  ui.tokenOpen = false;
  toast(`${name} token created.`);
}

function handleResult(result) {
  if (result && result.ok === false) toast(result.message || 'Action not allowed.', true);
}

function moveSelectedTo(cardId, zone, position = 'top') {
  const found = findCard(cardId, getState());
  if (!found) return;
  const targetPlayerId = zone === 'hand' || zone === 'library' || zone === 'graveyard' || zone === 'exile' || zone === 'command' ? found.card.owner : found.card.controller;
  handleResult(moveCard(cardId, targetPlayerId, zone, { libraryPosition: position }));
}

async function ensurePreconIndex() {
  if (ui.preconIndex) return;
  showLoading('Loading official precons', 'Downloading the MTGJSON deck index…');
  try { ui.preconIndex = await fetchPreconIndex(); }
  finally { hideLoading(); }
}

async function searchPrecons(playerId) {
  await ensurePreconIndex();
  const draft = ui.drafts[playerId];
  const query = draft.preconQuery.trim().toLocaleLowerCase();
  draft.preconResults = (ui.preconIndex || [])
    .filter((deck) => !query || `${deck.name} ${deck.code} ${deck.type}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
    .slice(0, 100);
  render();
}

async function prepareCustomDeck(playerId) {
  const draft = ui.drafts[playerId];
  const liveText = document.querySelector(`[data-draft-field="text"][data-player-id="${playerId}"]`)?.value;
  if (typeof liveText === 'string') draft.text = liveText;
  const liveName = document.querySelector(`[data-draft-field="name"][data-player-id="${playerId}"]`)?.value;
  if (typeof liveName === 'string') draft.name = liveName;
  const parsed = parseDecklist(draft.text);
  if (parsed.errors.length) {
    draft.validation = { errors: parsed.errors, warnings: [], total: parsed.entries.reduce((s, e) => s + e.count, 0) };
    draft.ready = false;
    render();
    return;
  }
  showLoading(`Loading ${draft.name}'s deck`, 'Looking up card names and images with Scryfall…');
  const result = await fetchCardsByNames(parsed.entries, ({ message }) => updateLoading(message));
  draft.entries = parsed.entries;
  draft.byName = result.byName;
  draft.cards = result.cards;
  draft.candidates = commanderCandidates(result.cards);
  if (!draft.commanders.length && draft.candidates.length === 1) draft.commanders = [draft.candidates[0].name];
  if (result.notFound.length) {
    draft.validation = { errors: [`Scryfall could not find: ${result.notFound.join(', ')}.`], warnings: [], total: parsed.entries.reduce((s, e) => s + e.count, 0) };
    draft.ready = false;
  } else refreshDraftValidation(playerId);
  hideLoading();
}

async function loadPrecon(playerId, fileName) {
  const draft = ui.drafts[playerId];
  const entry = (ui.preconIndex || []).find((deck) => deck.fileName === fileName);
  if (!entry) throw new Error('Precon entry not found.');
  showLoading(`Loading ${entry.name}`, 'Downloading the official deck list…');
  const precon = await fetchPreconDeck(entry);
  updateLoading('Loading card images and Oracle text…');
  const result = await fetchCardsByNames(precon.entries, ({ message }) => updateLoading(message));
  draft.entries = precon.entries;
  draft.byName = result.byName;
  draft.cards = result.cards;
  draft.candidates = commanderCandidates(result.cards);
  draft.commanders = precon.commanderNames.filter((name) => result.byName[name.toLocaleLowerCase()]).slice(0, 2);
  draft.text = precon.entries.map((item) => `${item.count} ${item.name}`).join('\n');
  draft.selectedPrecon = entry;
  if (result.notFound.length) draft.validation = { errors: [`Missing card data: ${result.notFound.join(', ')}.`], warnings: [], total: precon.entries.reduce((s, e) => s + e.count, 0) };
  else refreshDraftValidation(playerId);
  hideLoading();
}

function refreshDraftValidation(playerId) {
  const draft = ui.drafts[playerId];
  draft.validation = validateDeck(draft.entries, draft.byName, draft.commanders);
  draft.ready = draft.validation.errors.length === 0;
}

function startGame() {
  if (!bothDraftsReady()) return toast('Both decks must pass validation first.', true);
  const next = createInitialState();
  for (const playerId of ['p1', 'p2']) {
    const draft = ui.drafts[playerId];
    next.players[playerId].name = draft.name.trim() || next.players[playerId].name;
    buildPlayerDeck(next.players[playerId], draft, draft.commanders);
    drawCards(next, playerId, 7);
  }
  next.started = true;
  next.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: 'Both decks shuffled. Each player drew seven cards.' });
  setState(next);
  ui.setupOpen = false;
  ui.inspectorOpen = false;
  ui.drawer = null;
  toast('Game started. Drag cards or tap one for its side menu.');
}

function loadDemoGame() {
  const next = createInitialState();
  next.started = true;
  next.players.p1.name = 'You';
  next.players.p2.name = 'Practice Opponent';
  seedDemoPlayer(next.players.p1, ['Satoru Umezawa', 'Changeling Outcast', 'Sol Ring', 'Island', 'Swamp', 'Baleful Strix', 'Blightsteel Colossus', 'Lightning Greaves', 'Fallen Shinobi']);
  seedDemoPlayer(next.players.p2, ['Gisa and Geralf', 'Mire Triton', 'Gray Merchant of Asphodel', 'Island', 'Swamp', 'Diregraf Captain', 'Murder', 'Sol Ring', 'Zombie Token']);
  next.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: 'Interactive demo loaded.' });
  setState(next);
  ui.setupOpen = false;
  toast('Demo loaded. Try dragging cards between zones.');
}

function seedDemoPlayer(player, names) {
  const cards = names.map((name, index) => demoCard(name, player.id, index));
  cards[0].commander = true;
  player.zones.command = [cards.shift()];
  player.commanderCastCount[player.zones.command[0].instanceId] = 0;
  player.zones.hand = cards.slice(0, 5);
  player.zones.battlefield = cards.slice(5, 7).map((card) => ({ ...card, summoningSick: false }));
  player.zones.library = shuffle([...cards.slice(7), ...Array.from({ length: 20 }, (_, i) => demoCard(`Practice Card ${i + 1}`, player.id, i + 20))]);
}

function demoCard(name, owner, index) {
  const land = /Island|Swamp|Practice Card/.test(name) && index % 3 === 0;
  const creature = !land && !/Sol Ring|Lightning Greaves|Murder/.test(name);
  return {
    instanceId: uid('demo'), scryfallId: null, name,
    manaCost: land ? '' : creature ? '{2}{U}{B}' : '{1}', manaValue: land ? 0 : creature ? 4 : 1,
    typeLine: land ? 'Basic Land' : creature ? 'Creature — Practice' : /Murder/.test(name) ? 'Instant' : 'Artifact',
    oracleText: demoOracleText(name, land),
    producedMana: demoProducedMana(name, land),
    power: creature ? String((index % 5) + 1) : '', toughness: creature ? String((index % 4) + 2) : '',
    keywords: name.includes('Changeling') ? ['Unblockable'] : [], colors: [], colorIdentity: [], legalities: { commander: 'legal' },
    image: './demo-card.svg', imageSmall: './demo-card.svg', owner, controller: owner,
    tapped: false, summoningSick: false, attacking: false, faceDown: false, token: false, commander: false, counters: {}, notes: '',
  };
}


function demoProducedMana(name, land) {
  if (name === 'Island') return ['U'];
  if (name === 'Swamp') return ['B'];
  if (name === 'Sol Ring') return ['C'];
  if (land) return ['C'];
  return [];
}

function demoOracleText(name, land) {
  if (name === 'Island') return '{T}: Add {U}.';
  if (name === 'Swamp') return '{T}: Add {B}.';
  if (name === 'Sol Ring') return '{T}: Add {C}{C}.';
  if (land) return '{T}: Add {C}.';
  return `Demo Oracle text for ${name}. Resolve card-specific effects manually.`;
}

function triggerFilePicker() {
  const input = document.querySelector('#settings-file-input') || document.querySelector('#save-file-input');
  input?.click();
}

document.addEventListener('change', async (event) => {
  if (!['settings-file-input', 'save-file-input'].includes(event.target.id)) return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    importState(parsed);
    ui.settingsOpen = false;
    ui.setupOpen = false;
    toast('Saved game imported.');
  } catch (error) { toast(error.message || 'Could not import save.', true); }
});


function runRandomTool(kind) {
  let result;
  if (kind === 'coin') result = Math.random() < .5 ? 'Heads' : 'Tails';
  else result = String(Math.floor(Math.random() * Number(kind.replace('d', ''))) + 1);
  updateState(() => {}, { snapshot: false, log: `${kind === 'coin' ? 'Coin flip' : kind.toUpperCase()} result: ${result}.` });
  toast(`${kind === 'coin' ? 'Coin' : kind.toUpperCase()}: ${result}`);
}

function resetGamePrompt() {
  if (!confirm('Reset the entire table and remove the current saved game?')) return;
  resetState();
  ui.settingsOpen = false;
  ui.setupOpen = true;
  ui.drafts = { p1: createDraft('Player 1'), p2: createDraft('Player 2') };
}

const dragState = { candidate: null, active: false, ghost: null, over: null };

document.addEventListener('pointerdown', (event) => {
  const card = event.target.closest('.game-card[data-card-id], .stack-mini[data-card-id]');
  if (!card || event.button > 0) return;
  dragState.candidate = {
    cardId: card.dataset.cardId,
    startX: event.clientX,
    startY: event.clientY,
    pointerId: event.pointerId,
    image: card.querySelector('img')?.src || card.src,
  };
});

document.addEventListener('pointermove', (event) => {
  const candidate = dragState.candidate;
  if (!candidate || candidate.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
  if (!dragState.active && distance > 9) {
    dragState.active = true;
    dragState.ghost = document.createElement('div');
    dragState.ghost.className = 'drag-ghost';
    dragState.ghost.innerHTML = `<img src="${escapeHtml(candidate.image)}" alt="Dragging card" />`;
    document.body.append(dragState.ghost);
    document.body.classList.add('dragging');
  }
  if (!dragState.active) return;
  event.preventDefault();
  dragState.ghost.style.left = `${event.clientX}px`;
  dragState.ghost.style.top = `${event.clientY}px`;
  dragState.over?.classList.remove('drag-over');
  dragState.ghost.style.display = 'none';
  const under = document.elementFromPoint(event.clientX, event.clientY);
  dragState.ghost.style.display = '';
  dragState.over = under?.closest('[data-drop-zone]') || null;
  dragState.over?.classList.add('drag-over');
}, { passive: false });

document.addEventListener('pointerup', (event) => {
  const candidate = dragState.candidate;
  if (!candidate || candidate.pointerId !== event.pointerId) return;
  if (dragState.active) {
    const target = dragState.over;
    if (target) {
      const zone = target.dataset.dropZone;
      const playerId = target.dataset.playerId || getState().activePlayerId;
      const result = moveCard(candidate.cardId, playerId, zone);
      handleResult(result);
    }
  } else {
    selectCard(candidate.cardId);
  }
  cleanupDrag();
});

document.addEventListener('pointercancel', cleanupDrag);

function cleanupDrag() {
  dragState.over?.classList.remove('drag-over');
  dragState.ghost?.remove();
  dragState.candidate = null;
  dragState.active = false;
  dragState.ghost = null;
  dragState.over = null;
  document.body.classList.remove('dragging');
}

function selectCard(cardId) {
  if (!findCard(cardId, getState())) return;
  updateState((draft) => { draft.selected = { instanceId: cardId }; }, { snapshot: false });
  ui.inspectorMode = 'card';
  ui.inspectorOpen = true;
  render();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
