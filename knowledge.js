import { PHASES } from './constants.js';
import { cardTraits, publicCardSnapshot } from './card-evaluation.js';
import { manaProductionChoices, uid } from './utils.js';

export function createKnowledgePlayer() {
  return {
    knownHand: {},
    knownLibraryTop: [],
    knownLibraryBottom: [],
    observedCards: {},
    usedInteraction: {
      removal: 0,
      counterspell: 0,
      combatTrick: 0,
      protection: 0,
      boardWipe: 0,
      graveyardInteraction: 0,
      flashThreat: 0,
    },
    behavior: {
      passesWithOpenMana: 0,
      consecutivePassesWithOpenMana: 0,
      openManaHistory: [],
      attacks: [],
      blocks: [],
      spellsCast: 0,
      landsPlayed: 0,
      cardsHeldAcrossTurns: 0,
      lastEndingHandSize: null,
      meaningfulDecisions: [],
    },
  };
}

export function createKnowledgeState(playerIds = ['p1', 'p2']) {
  return {
    events: [],
    players: Object.fromEntries(playerIds.map((id) => [id, createKnowledgePlayer()])),
  };
}

export function ensureKnowledge(draft) {
  draft.knowledge ||= createKnowledgeState(Object.keys(draft.players || {}));
  draft.knowledge.events ||= [];
  draft.knowledge.players ||= {};
  for (const playerId of Object.keys(draft.players || {})) {
    const existing = draft.knowledge.players[playerId] || {};
    const fresh = createKnowledgePlayer();
    draft.knowledge.players[playerId] = {
      ...fresh,
      ...existing,
      knownHand: { ...fresh.knownHand, ...(existing.knownHand || {}) },
      observedCards: { ...fresh.observedCards, ...(existing.observedCards || {}) },
      usedInteraction: { ...fresh.usedInteraction, ...(existing.usedInteraction || {}) },
      behavior: { ...fresh.behavior, ...(existing.behavior || {}) },
    };
  }
  return draft.knowledge;
}

function observedKey(card) {
  return card?.oracleId || card?.scryfallId || String(card?.name || '').toLocaleLowerCase();
}

function rememberObserved(playerMemory, card, zone, turn) {
  if (!card?.name) return;
  const key = observedKey(card);
  const prior = playerMemory.observedCards[key] || {
    card: publicCardSnapshot(card),
    seenCount: 0,
    zones: {},
    firstSeenTurn: turn,
    lastSeenTurn: turn,
  };
  prior.card = publicCardSnapshot(card);
  prior.seenCount += 1;
  prior.zones[zone || 'unknown'] = Number(prior.zones[zone || 'unknown'] || 0) + 1;
  prior.lastSeenTurn = turn;
  playerMemory.observedCards[key] = prior;
}

function removeKnownHand(playerMemory, instanceId, cardName = '') {
  if (instanceId && playerMemory.knownHand[instanceId]) delete playerMemory.knownHand[instanceId];
  if (!instanceId && cardName) {
    const entry = Object.entries(playerMemory.knownHand).find(([, known]) => known.card?.name === cardName);
    if (entry) delete playerMemory.knownHand[entry[0]];
  }
}

function addKnownHand(playerMemory, card, event) {
  if (!card?.instanceId) return;
  playerMemory.knownHand[card.instanceId] = {
    card: publicCardSnapshot(card),
    sinceTurn: event.turn,
    reason: event.type,
    confidence: 1,
  };
}

export function recordPublicEvent(draft, event) {
  const knowledge = ensureKnowledge(draft);
  const normalized = {
    id: event.id || uid('public'),
    time: event.time || new Date().toISOString(),
    turn: Number(event.turn ?? draft.turnNumber ?? 1),
    phase: event.phase || PHASES[draft.phaseIndex || 0]?.id || 'unknown',
    public: event.public !== false,
    ...event,
    card: event.card ? publicCardSnapshot(event.card) : null,
  };
  if (!normalized.public) return normalized;
  knowledge.events.unshift(normalized);
  if (knowledge.events.length > 800) knowledge.events.length = 800;

  const subjectId = event.subjectPlayerId || event.playerId || event.actorId || event.card?.owner;
  const memory = subjectId ? knowledge.players[subjectId] : null;
  if (memory && normalized.card) rememberObserved(memory, normalized.card, event.toZone || event.zone || event.fromZone, normalized.turn);

  if (memory) {
    const card = normalized.card;
    if (['returned_to_hand', 'revealed_in_hand', 'draw_known'].includes(normalized.type)) addKnownHand(memory, card, normalized);
    if (['cast', 'played', 'discarded', 'exiled', 'countered', 'library_top', 'library_bottom', 'shuffled_away'].includes(normalized.type)) {
      removeKnownHand(memory, card?.instanceId, card?.name);
    }
    if (normalized.type === 'revealed' && normalized.zone === 'hand') addKnownHand(memory, card, normalized);
    if (normalized.type === 'library_top') {
      memory.knownLibraryTop = [{ card, turn: normalized.turn, reason: normalized.type }];
    }
    if (normalized.type === 'library_bottom') {
      memory.knownLibraryBottom.push({ card, turn: normalized.turn, reason: normalized.type });
      if (memory.knownLibraryBottom.length > 12) memory.knownLibraryBottom.shift();
    }
    if (normalized.type === 'shuffled') {
      memory.knownLibraryTop = [];
      memory.knownLibraryBottom = [];
    }
    if (normalized.type === 'cast' && card) {
      const traits = cardTraits(card);
      for (const category of traits.interactionCategories) {
        memory.usedInteraction[category] = Number(memory.usedInteraction[category] || 0) + 1;
      }
      if (normalized.type === 'cast') memory.behavior.spellsCast += 1;
    }
    if (normalized.type === 'played' && /Land/.test(card?.typeLine || '')) memory.behavior.landsPlayed += 1;
    if (normalized.type === 'attack') {
      memory.behavior.attacks.push({ turn: normalized.turn, cards: normalized.cards || (card ? [card] : []) });
      if (memory.behavior.attacks.length > 60) memory.behavior.attacks.shift();
    }
    if (normalized.type === 'block') {
      memory.behavior.blocks.push({ turn: normalized.turn, blocker: card, attacker: normalized.targetCard || null });
      if (memory.behavior.blocks.length > 60) memory.behavior.blocks.shift();
    }
    if (normalized.meaningful) {
      memory.behavior.meaningfulDecisions.push({ turn: normalized.turn, type: normalized.type, text: normalized.text || '' });
      if (memory.behavior.meaningfulDecisions.length > 100) memory.behavior.meaningfulDecisions.shift();
    }
  }
  return normalized;
}

export function recordZoneTransition(draft, { card, actorId, subjectPlayerId, fromZone, toZone, libraryPosition = 'top', castAttempt = false }) {
  let type = 'zone_move';
  if (castAttempt) type = 'cast';
  else if (fromZone === 'hand' && toZone === 'battlefield' && /Land/.test(card?.typeLine || '')) type = 'played';
  else if (fromZone === 'library' && toZone === 'graveyard') type = 'milled';
  else if (fromZone === 'hand' && toZone === 'graveyard') type = 'discarded';
  else if (toZone === 'exile') type = 'exiled';
  else if (toZone === 'hand' && fromZone !== 'library') type = 'returned_to_hand';
  else if (fromZone === 'battlefield' && toZone === 'graveyard') type = 'destroyed_or_died';
  else if (toZone === 'library') type = libraryPosition === 'bottom' ? 'library_bottom' : 'library_top';
  return recordPublicEvent(draft, {
    type,
    actorId,
    subjectPlayerId,
    card,
    fromZone,
    toZone,
    position: toZone === 'library' ? libraryPosition : undefined,
    meaningful: ['cast', 'played', 'discarded', 'milled', 'exiled', 'returned_to_hand', 'destroyed_or_died'].includes(type),
  });
}

export function visibleManaSnapshot(player) {
  const colors = new Set();
  let total = Object.values(player?.mana || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
  for (const [color, amount] of Object.entries(player?.mana || {})) if (Number(amount || 0) > 0) colors.add(color);
  for (const card of player?.zones?.battlefield || []) {
    if (card.tapped) continue;
    const choices = manaProductionChoices(card);
    const best = choices.map((choice) => Object.values(choice.mana).reduce((sum, amount) => sum + Number(amount || 0), 0)).sort((a, b) => b - a)[0] || 0;
    total += best;
    for (const choice of choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount || 0) > 0) colors.add(color);
  }
  return { total, colors: [...colors] };
}

export function recordTurnPass(draft, playerId) {
  const knowledge = ensureKnowledge(draft);
  const player = draft.players[playerId];
  const memory = knowledge.players[playerId];
  const mana = visibleManaSnapshot(player);
  const handSize = player.zones.hand.length;
  const passedOpen = mana.total > 0 && handSize > 0;
  if (passedOpen) {
    memory.behavior.passesWithOpenMana += 1;
    memory.behavior.consecutivePassesWithOpenMana += 1;
  } else {
    memory.behavior.consecutivePassesWithOpenMana = 0;
  }
  if (memory.behavior.lastEndingHandSize === handSize && handSize > 0) memory.behavior.cardsHeldAcrossTurns += 1;
  memory.behavior.lastEndingHandSize = handSize;
  memory.behavior.openManaHistory.push({
    turn: draft.turnNumber,
    total: mana.total,
    colors: mana.colors,
    handSize,
  });
  if (memory.behavior.openManaHistory.length > 40) memory.behavior.openManaHistory.shift();
  recordPublicEvent(draft, {
    type: 'turn_pass',
    actorId: playerId,
    subjectPlayerId: playerId,
    openMana: mana,
    handSize,
    meaningful: passedOpen,
    text: passedOpen ? `${player.name} passed with ${mana.total} mana available and ${handSize} cards.` : `${player.name} passed the turn.`,
  });
}

export function knownHandCards(state, playerId) {
  ensureKnowledge(state);
  return Object.values(state.knowledge.players[playerId]?.knownHand || {}).map((entry) => entry.card).filter(Boolean);
}

export function publicMemorySummary(state, observerId, opponentId) {
  ensureKnowledge(state);
  const memory = state.knowledge.players[opponentId] || createKnowledgePlayer();
  const known = Object.values(memory.knownHand || {}).map((entry) => entry.card?.name).filter(Boolean);
  const used = Object.entries(memory.usedInteraction || {}).filter(([, count]) => Number(count) > 0);
  const recent = (state.knowledge.events || [])
    .filter((event) => event.subjectPlayerId === opponentId || event.actorId === opponentId)
    .slice(0, 12);
  return {
    observerId,
    opponentId,
    knownHand: known,
    usedInteraction: Object.fromEntries(used),
    behavior: memory.behavior,
    recent,
  };
}
