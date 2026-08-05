import { PHASES } from './constants.js';
import { cardTraits, canBlock, combatOutcome, combatTradeScore, effectiveStats, permanentValue, publicCardSnapshot } from './card-evaluation.js';
import { ensureKnowledge, knownHandCards, publicMemorySummary, visibleManaSnapshot } from './knowledge.js';
import { attackLegality, planManaPayment, spendMana } from './rules.js';
import { clamp, deepClone, isCreature, isLand, isPermanent, manaProductionChoices, numericStat, totalMana } from './utils.js';

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const INTERACTION_MODELS = {
  counterspell: { label: 'counterspell', identities: ['U'], requiredOpenColors: ['U'], minMana: 2, base: 0.11, timing: 'now' },
  removal: { label: 'creature removal', identities: ['W', 'U', 'B', 'R', 'G'], requiredOpenColors: ['W', 'U', 'B', 'R', 'G'], minMana: 1, base: 0.14, timing: 'now' },
  combatTrick: { label: 'combat trick', identities: ['W', 'U', 'R', 'G'], requiredOpenColors: ['W', 'U', 'R', 'G'], minMana: 1, base: 0.09, timing: 'now' },
  protection: { label: 'protection spell', identities: ['W', 'U', 'G'], requiredOpenColors: ['W', 'U', 'G'], minMana: 1, base: 0.08, timing: 'now' },
  boardWipe: { label: 'board wipe next turn', identities: ['W', 'U', 'B', 'R'], requiredOpenColors: ['W', 'U', 'B', 'R'], minMana: 4, base: 0.08, timing: 'nextTurn' },
  graveyardInteraction: { label: 'graveyard interaction', identities: ['W', 'B', 'G'], requiredOpenColors: ['W', 'B', 'G'], minMana: 1, base: 0.07, timing: 'now' },
  flashThreat: { label: 'flash creature or instant-speed permanent', identities: ['W', 'U', 'G'], requiredOpenColors: ['W', 'U', 'G'], minMana: 2, base: 0.07, timing: 'now' },
  engine: { label: 'additional creature or engine piece', identities: ['W', 'U', 'B', 'R', 'G', 'C'], requiredOpenColors: [], minMana: 2, base: 0.18, timing: 'nextTurn' },
};

function otherPlayerId(state, playerId) {
  return Object.keys(state.players).find((id) => id !== playerId);
}

function phaseId(state) {
  return PHASES[state.phaseIndex]?.id || 'main1';
}

function cardById(state, instanceId) {
  for (const player of Object.values(state.players)) {
    for (const cards of Object.values(player.zones)) {
      const card = cards.find((item) => item.instanceId === instanceId);
      if (card) return card;
    }
  }
  return state.stack?.find((card) => card.instanceId === instanceId) || null;
}

function inferredColorIdentity(player) {
  const explicit = new Set(player.colorIdentity || []);
  for (const card of player.zones.command || []) for (const color of card.colorIdentity || []) explicit.add(color);
  if (!explicit.size) {
    for (const zone of ['battlefield', 'graveyard', 'exile']) {
      for (const card of player.zones[zone] || []) for (const color of card.colorIdentity || card.colors || []) explicit.add(color);
    }
  }
  if (!explicit.size) explicit.add('C');
  return [...explicit];
}

function publicPlayerView(player, perspectiveId, memory) {
  const self = player.id === perspectiveId;
  return {
    id: player.id,
    name: player.name,
    life: player.life,
    poison: player.poison,
    mana: { ...player.mana },
    colorIdentity: inferredColorIdentity(player),
    hand: self ? (player.zones.hand || []).map(publicCardSnapshot) : undefined,
    handSize: player.zones.hand.length,
    librarySize: player.zones.library.length,
    battlefield: (player.zones.battlefield || []).map(publicCardSnapshotWithState),
    graveyard: (player.zones.graveyard || []).map(publicCardSnapshotWithState),
    exile: (player.zones.exile || []).map(publicCardSnapshotWithState),
    command: (player.zones.command || []).map(publicCardSnapshotWithState),
    knownHand: self ? [] : Object.values(memory?.knownHand || {}).map((entry) => entry.card).filter(Boolean),
    commanderDamage: { ...(player.commanderDamage || {}) },
    commanderCastCount: { ...(player.commanderCastCount || {}) },
    behavior: deepClone(memory?.behavior || {}),
    usedInteraction: { ...(memory?.usedInteraction || {}) },
  };
}

function publicCardSnapshotWithState(card) {
  return {
    ...publicCardSnapshot(card),
    owner: card.owner,
    controller: card.controller,
    tapped: Boolean(card.tapped),
    summoningSick: Boolean(card.summoningSick),
    attacking: Boolean(card.attacking),
    blocking: card.blocking || null,
    blockedBy: [...(card.blockedBy || [])],
    faceDown: Boolean(card.faceDown),
    counters: { ...(card.counters || {}) },
    attachedTo: card.attachedTo || null,
    attachments: [...(card.attachments || [])],
  };
}

/**
 * Returns exactly the information available to a skilled human from one seat.
 * Opponent hand/library card identities are deliberately omitted, even when the
 * solo-table UI happens to display them to the user controlling both players.
 */
export function buildInformationSet(state, perspectiveId = state.activePlayerId) {
  ensureKnowledge(state);
  const players = {};
  for (const [playerId, player] of Object.entries(state.players)) {
    players[playerId] = publicPlayerView(player, perspectiveId, state.knowledge.players[playerId]);
  }
  return {
    perspectiveId,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    phase: phaseId(state),
    players,
    stack: (state.stack || []).map(publicCardSnapshotWithState),
    publicEvents: (state.knowledge.events || []).map((event) => deepClone(event)),
    audit: {
      ownFullHand: true,
      ownBattlefield: true,
      opponentsVisibleBattlefields: true,
      publicZones: true,
      opponentExactHiddenHand: false,
      opponentDecklistOrLibraryIdentities: false,
      opponentHandSize: true,
      publicMemory: true,
    },
  };
}

function placeholderCards(count, prefix) {
  return Array.from({ length: Math.max(0, Number(count || 0)) }, (_, index) => ({
    instanceId: `${prefix}-${index}`,
    name: 'Unknown card',
    hidden: true,
    typeLine: '',
    oracleText: '',
    keywords: [],
    counters: {},
  }));
}

function simulationStateFromInformationSet(state, info) {
  const draft = {
    version: state.version,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    phaseIndex: state.phaseIndex,
    stack: info.stack.map((card) => deepClone(card)),
    players: {},
    _coach: { virtual: {}, newPermanents: [], castCards: [], actionNotes: [], combatDamage: 0, effectsBySource: {} },
  };
  for (const [playerId, view] of Object.entries(info.players)) {
    const original = state.players[playerId];
    const self = playerId === info.perspectiveId;
    draft.players[playerId] = {
      id: playerId,
      name: view.name,
      life: view.life,
      poison: view.poison,
      mana: { ...view.mana },
      colorIdentity: [...view.colorIdentity],
      commanderDamage: { ...view.commanderDamage },
      commanderCastCount: { ...view.commanderCastCount },
      landPlaysThisTurn: Number(original.landPlaysThisTurn || 0),
      lost: Boolean(original.lost),
      zones: {
        hand: self ? (original.zones.hand || []).map((card) => deepClone(card)) : placeholderCards(view.handSize, `${playerId}-hand`),
        library: placeholderCards(view.librarySize, `${playerId}-library`),
        battlefield: (original.zones.battlefield || []).map((card) => deepClone(card)),
        graveyard: (original.zones.graveyard || []).map((card) => deepClone(card)),
        exile: (original.zones.exile || []).map((card) => deepClone(card)),
        command: (original.zones.command || []).map((card) => deepClone(card)),
      },
    };
    draft._coach.virtual[playerId] = 0;
  }
  return draft;
}

export function possibleMoves(state, playerId = state.activePlayerId) {
  const player = state.players[playerId];
  const opponentId = otherPlayerId(state, playerId);
  const moves = [];
  const phase = phaseId(state);

  if (['untap', 'upkeep', 'draw'].includes(phase) && player.landPlaysThisTurn < 1) {
    const openingLand = player.zones.hand.find((card) => isLand(card));
    if (openingLand) moves.push({ type: 'advance-land', cardId: openingLand.instanceId, label: `Advance to Main 1 → play ${openingLand.name}` });
    else moves.push({ type: 'advance-phase', label: 'Advance toward Main 1' });
  }

  for (const card of player.zones.hand) {
    if (isLand(card)) {
      if (['main1', 'main2'].includes(phase) && player.landPlaysThisTurn < 1) moves.push({ type: 'play-land', cardId: card.instanceId, label: `Play ${card.name}` });
      continue;
    }
    const traits = cardTraits(card);
    const instantSpeed = traits.instant || traits.flash;
    if ((['main1', 'main2'].includes(phase) || instantSpeed) && planManaPayment(player, card.manaCost, 0).ok) {
      moves.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, label: `Cast ${card.name}` });
    }
  }

  for (const card of player.zones.command) {
    const tax = 2 * (player.commanderCastCount[card.instanceId] || 0);
    if ((['main1', 'main2'].includes(phase) || cardTraits(card).flash) && planManaPayment(player, card.manaCost, tax).ok) {
      moves.push({ type: 'cast-commander', cardId: card.instanceId, label: `Cast ${card.name}${tax ? ` (+${tax} tax)` : ''}` });
    }
  }

  for (const card of player.zones.battlefield) {
    const traits = cardTraits(card);
    if (traits.activatedAbility && (!traits.tapAbility || !card.tapped)) {
      moves.push({ type: 'activate-ability', cardId: card.instanceId, label: `Activate ${card.name}` });
    }
  }

  addCastSequences(state, playerId, moves);
  addLandCastSequences(state, playerId, moves);
  addAttackMoves(state, playerId, opponentId, moves);

  moves.push({ type: 'hold', label: 'Pass / hold resources' });
  return dedupeMoves(moves).slice(0, 34);
}

function dedupeMoves(moves) {
  const seen = new Set();
  return moves.filter((move) => {
    const key = `${move.type}:${move.cardId || ''}:${(move.cardIds || []).join(',')}:${(move.steps || []).map((step) => `${step.type}-${step.cardId}`).join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addCastSequences(state, playerId, moves) {
  const player = state.players[playerId];
  const castMoves = moves.filter((move) => ['cast-permanent', 'cast-spell', 'cast-commander'].includes(move.type)).slice(0, 9);
  for (let i = 0; i < castMoves.length; i += 1) {
    for (let j = 0; j < castMoves.length; j += 1) {
      if (i === j) continue;
      const simulation = simulationStateFromInformationSet(state, buildInformationSet(state, playerId));
      if (!applyMoveToDraft(simulation, playerId, castMoves[i]).ok) continue;
      if (!canApplyMove(simulation, playerId, castMoves[j])) continue;
      moves.push({
        type: 'sequence',
        steps: [castMoves[i], castMoves[j]],
        label: `${castMoves[i].label} → ${castMoves[j].label.replace(/^Cast /, '')}`,
      });
      if (moves.filter((move) => move.type === 'sequence').length >= 8) return;
    }
  }
}

function addLandCastSequences(state, playerId, moves) {
  const phase = phaseId(state);
  const landMoves = moves.filter((move) => ['play-land', 'advance-land'].includes(move.type)).slice(0, 4);
  for (const landMove of landMoves) {
    const simulation = simulationStateFromInformationSet(state, buildInformationSet(state, playerId));
    if (!applyMoveToDraft(simulation, playerId, landMove).ok) continue;
    for (const card of simulation.players[playerId].zones.hand.filter((item) => !isLand(item)).slice(0, 12)) {
      const traits = cardTraits(card);
      if (!['main1', 'main2'].includes(phase) && landMove.type !== 'advance-land' && !(traits.instant || traits.flash)) continue;
      const castMove = { type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, label: `Cast ${card.name}` };
      if (!canApplyMove(simulation, playerId, castMove)) continue;
      moves.push({ type: 'sequence', steps: [landMove, castMove], label: `${landMove.label} → Cast ${card.name}` });
      if (moves.filter((move) => move.type === 'sequence').length >= 12) return;
    }
  }
}

function addAttackMoves(state, playerId, opponentId, moves) {
  const attackers = state.players[playerId].zones.battlefield.filter((card) => attackLegality(state, card).legal);
  if (!attackers.length) return;
  attackers.slice(0, 8).forEach((card) => moves.push({ type: 'attack', cardIds: [card.instanceId], opponentId, label: `Attack with ${card.name}` }));
  if (attackers.length > 1) {
    moves.push({ type: 'attack', cardIds: attackers.map((card) => card.instanceId), opponentId, label: 'Attack with all legal creatures' });
    const evasive = attackers.filter((card) => {
      const traits = cardTraits(card);
      return traits.flying || traits.unblockable || traits.menace;
    });
    if (evasive.length && evasive.length !== attackers.length) moves.push({ type: 'attack', cardIds: evasive.map((card) => card.instanceId), opponentId, label: 'Attack with evasive creatures' });
    const favorable = attackers.filter((attacker) => visibleAttackValue(state, playerId, attacker) > 0.8);
    if (favorable.length && favorable.length !== attackers.length) moves.push({ type: 'attack', cardIds: favorable.map((card) => card.instanceId), opponentId, label: 'Attack with favorable creatures' });
  }
}

function visibleAttackValue(state, playerId, attacker) {
  const opponentId = otherPlayerId(state, playerId);
  const blockers = state.players[opponentId].zones.battlefield.filter((blocker) => canBlock(attacker, blocker, state.players[opponentId].zones.battlefield));
  if (!blockers.length) return effectiveStats(attacker, state.players[playerId].zones.battlefield).power;
  return Math.min(...blockers.map((blocker) => combatTradeScore(attacker, [blocker], state.players[playerId].zones.battlefield, state.players[opponentId].zones.battlefield)));
}

function identityAllows(identity, model) {
  return model.identities.some((color) => identity.includes(color));
}

function nextTurnManaPotential(player) {
  let total = totalMana(player.mana || {});
  const colors = new Set(Object.entries(player.mana || {}).filter(([, amount]) => Number(amount) > 0).map(([color]) => color));
  for (const card of player.zones.battlefield || []) {
    const choices = manaProductionChoices(card);
    total += choices.map((choice) => Object.values(choice.mana).reduce((sum, amount) => sum + Number(amount || 0), 0)).sort((a, b) => b - a)[0] || 0;
    for (const choice of choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount || 0) > 0) colors.add(color);
  }
  return { total, colors: [...colors] };
}

function knownCategoryCards(state, opponentId, category) {
  return knownHandCards(state, opponentId).filter((card) => {
    const traits = cardTraits(card);
    return category === 'engine'
      ? !traits.interactionCategories.length
      : traits.interactionCategories.includes(category);
  });
}

function observedCategoryEvidence(state, opponentId, category) {
  const player = state.players[opponentId];
  const seen = new Map();
  const publicCards = [
    ...(player.zones.battlefield || []),
    ...(player.zones.graveyard || []),
    ...(player.zones.exile || []),
    ...(player.zones.command || []),
    ...Object.values(state.knowledge?.players?.[opponentId]?.observedCards || {}).map((entry) => entry.card).filter(Boolean),
  ];
  for (const card of publicCards) {
    const key = card.oracleId || card.scryfallId || card.name;
    if (seen.has(key)) continue;
    seen.set(key, card);
  }
  return [...seen.values()].filter((card) => {
    const traits = cardTraits(card);
    if (category === 'engine') return traits.draw || traits.tutor || traits.tokenMaker || traits.staticEffect || traits.activatedAbility;
    return traits.interactionCategories.includes(category);
  });
}

function visibleStrategySignals(state, opponentId) {
  const player = state.players[opponentId];
  const cards = [...(player.zones.command || []), ...(player.zones.battlefield || []), ...(player.zones.graveyard || [])];
  const text = cards.map((card) => `${card.typeLine || ''} ${card.oracleText || ''}`).join(' ').toLocaleLowerCase();
  return {
    spellslinger: /instant|sorcery|cast .* spell|noncreature spell/.test(text),
    graveyard: /graveyard|dies|discard|mill/.test(text),
    combat: /attacks|combat damage|creature you control/.test(text),
    artifacts: /artifact/.test(text),
  };
}

/** Builds probability/risk estimates using public information only. */
export function buildInteractionRisk(state, perspectiveId = state.activePlayerId) {
  ensureKnowledge(state);
  const opponentId = otherPlayerId(state, perspectiveId);
  const opponent = state.players[opponentId];
  const memory = state.knowledge.players[opponentId];
  const strategySignals = visibleStrategySignals(state, opponentId);
  const open = visibleManaSnapshot(opponent);
  const nextTurn = nextTurnManaPotential(opponent);
  const identity = inferredColorIdentity(opponent);
  const handSize = opponent.zones.hand.length;
  const handFactor = handSize <= 0 ? 0 : Math.min(1.25, 0.25 + handSize / 6.2);
  const behavior = memory.behavior || {};
  const passFactor = Math.min(0.18, Number(behavior.consecutivePassesWithOpenMana || 0) * 0.045 + Number(behavior.passesWithOpenMana || 0) * 0.012);
  const heldFactor = Math.min(0.12, Number(behavior.cardsHeldAcrossTurns || 0) * 0.018);
  const categories = {};

  for (const [category, model] of Object.entries(INTERACTION_MODELS)) {
    const possibleByIdentity = identityAllows(identity, model);
    const mana = model.timing === 'now' ? open : nextTurn;
    const hasRequiredColor = !model.requiredOpenColors.length || model.requiredOpenColors.some((color) => mana.colors.includes(color));
    const castable = possibleByIdentity && mana.total >= model.minMana && hasRequiredColor;
    const knownCards = knownCategoryCards(state, opponentId, category);
    const observedEvidence = observedCategoryEvidence(state, opponentId, category);
    const knownCastable = knownCards.some((card) => planManaPayment(opponent, card.manaCost || '', 0).ok);
    let probability = castable && handSize > 0 ? model.base * handFactor : 0;
    if (castable && observedEvidence.length) probability += Math.min(0.10, observedEvidence.length * 0.018);
    if (castable && category === 'counterspell' && strategySignals.spellslinger) probability += 0.035;
    if (castable && category === 'graveyardInteraction' && strategySignals.graveyard) probability += 0.03;
    if (castable && ['combatTrick', 'protection', 'flashThreat'].includes(category) && strategySignals.combat) probability += 0.025;
    if (castable && model.timing === 'now') probability += passFactor + heldFactor;
    if (castable && model.timing === 'nextTurn') probability += Math.min(0.12, handSize * 0.012);
    const usedCount = Number(memory.usedInteraction?.[category] || 0);
    if (usedCount > 0) {
      const depletion = category === 'boardWipe' ? 0.52 : 0.82;
      probability *= Math.pow(depletion, Math.min(3, usedCount));
    }
    if (knownCards.length) probability = Math.max(probability, knownCastable ? 0.94 : 0.58);
    probability = clamp(probability, 0, 0.96);

    const reasons = [];
    if (!possibleByIdentity) reasons.push(`not supported by the opponent's known ${identity.join('/')} color identity`);
    else if (!castable) reasons.push(model.timing === 'now' ? 'not supported by currently open mana' : 'not supported by projected next-turn mana');
    else {
      reasons.push(`${mana.total} visible mana available${mana.colors.length ? ` in ${mana.colors.join('/')}` : ''}`);
      reasons.push(`${handSize} card${handSize === 1 ? '' : 's'} in hand`);
    }
    if (knownCards.length) reasons.push(`publicly known in hand: ${knownCards.map((card) => card.name).join(', ')}`);
    if (observedEvidence.length) reasons.push(`visible strategy evidence: ${observedEvidence.slice(0, 3).map((card) => card.name).join(', ')}`);
    if (usedCount) reasons.push(`${usedCount} ${model.label}${usedCount === 1 ? '' : 's'} already used`);
    if (behavior.consecutivePassesWithOpenMana) reasons.push(`passed ${behavior.consecutivePassesWithOpenMana} consecutive turn${behavior.consecutivePassesWithOpenMana === 1 ? '' : 's'} with mana open`);

    categories[category] = {
      category,
      label: model.label,
      probability,
      possibleByIdentity,
      castable,
      timing: model.timing,
      knownCards: knownCards.map(publicCardSnapshot),
      observedEvidence: observedEvidence.map(publicCardSnapshot),
      reasons,
    };
  }

  return {
    perspectiveId,
    opponentId,
    opponentName: opponent.name,
    handSize,
    colorIdentity: identity,
    openMana: open,
    nextTurnMana: nextTurn,
    categories,
    publicMemory: publicMemorySummary(state, perspectiveId, opponentId),
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function analysisSeed(state, playerId) {
  const publicShape = {
    turn: state.turnNumber,
    phase: state.phaseIndex,
    playerId,
    events: state.knowledge?.events?.length || 0,
    boards: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, player.zones.battlefield.map((card) => [card.name, card.tapped, card.counters])])),
    hands: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, player.zones.hand.length])),
  };
  return hashString(JSON.stringify(publicShape));
}

function sampleHiddenScenario(risk, rng) {
  const unknownSlots = Math.max(0, risk.handSize - Object.values(risk.publicMemory?.knownHand || {}).length);
  let slots = unknownSlots;
  const scenario = { categories: new Set(), exactKnown: [] };
  for (const [category, entry] of Object.entries(risk.categories)) {
    if (entry.knownCards.length) {
      scenario.categories.add(category);
      scenario.exactKnown.push(...entry.knownCards);
      continue;
    }
    if (slots <= 0 || entry.probability <= 0) continue;
    if (rng() < entry.probability) {
      scenario.categories.add(category);
      slots -= 1;
    }
  }
  return scenario;
}

function findSimCard(player, instanceId) {
  for (const [zone, cards] of Object.entries(player.zones)) {
    const index = cards.findIndex((card) => card.instanceId === instanceId);
    if (index >= 0) return { zone, cards, index, card: cards[index] };
  }
  return null;
}

function canApplyMove(draft, playerId, move) {
  const player = draft.players[playerId];
  if (move.type === 'sequence') return (move.steps || []).every((step) => canApplyMove(draft, playerId, step));
  if (['play-land', 'advance-land'].includes(move.type)) {
    const found = findSimCard(player, move.cardId);
    return Boolean(found?.zone === 'hand' && isLand(found.card) && player.landPlaysThisTurn < 1);
  }
  if (['cast-permanent', 'cast-spell'].includes(move.type)) {
    const found = findSimCard(player, move.cardId);
    return Boolean(found?.zone === 'hand' && planManaPayment(player, found.card.manaCost, 0).ok);
  }
  if (move.type === 'cast-commander') {
    const found = findSimCard(player, move.cardId);
    const tax = found ? 2 * Number(player.commanderCastCount[found.card.instanceId] || 0) : 0;
    return Boolean(found?.zone === 'command' && planManaPayment(player, found.card.manaCost, tax).ok);
  }
  return true;
}

function payApproximateMana(player, card, tax = 0) {
  const plan = planManaPayment(player, card.manaCost || '', tax);
  if (!plan.ok) return false;
  for (const source of plan.sources || []) {
    const found = findSimCard(player, source.instanceId);
    if (!found || found.card.tapped) continue;
    found.card.tapped = true;
    for (const color of COLORS) player.mana[color] = Number(player.mana[color] || 0) + Number(source.mana?.[color] || 0);
  }
  player.mana = spendMana(player.mana, card.manaCost || '', tax);
  return true;
}

function applyMoveToDraft(draft, playerId, move) {
  const player = draft.players[playerId];
  const opponentId = otherPlayerId(draft, playerId);
  const opponent = draft.players[opponentId];
  if (!draft._coach) draft._coach = { virtual: { [playerId]: 0, [opponentId]: 0 }, newPermanents: [], castCards: [], actionNotes: [], combatDamage: 0, effectsBySource: {} };

  if (move.type === 'sequence') {
    for (const step of move.steps || []) {
      const result = applyMoveToDraft(draft, playerId, step);
      if (!result.ok) return result;
    }
    return { ok: true };
  }
  if (move.type === 'advance-phase') {
    draft.phaseIndex = 3;
    return { ok: true };
  }
  if (['advance-land', 'play-land'].includes(move.type)) {
    if (move.type === 'advance-land') draft.phaseIndex = 3;
    const found = findSimCard(player, move.cardId);
    if (!found || found.zone !== 'hand' || !isLand(found.card) || player.landPlaysThisTurn >= 1) return { ok: false };
    const card = found.cards.splice(found.index, 1)[0];
    player.zones.battlefield.push(card);
    player.landPlaysThisTurn += 1;
    draft._coach.newPermanents.push(card.instanceId);
    return { ok: true };
  }
  if (['cast-permanent', 'cast-spell', 'cast-commander'].includes(move.type)) {
    const sourceZone = move.type === 'cast-commander' ? 'command' : 'hand';
    const found = findSimCard(player, move.cardId);
    if (!found || found.zone !== sourceZone) return { ok: false };
    const tax = sourceZone === 'command' ? 2 * Number(player.commanderCastCount[found.card.instanceId] || 0) : 0;
    if (!payApproximateMana(player, found.card, tax)) return { ok: false };
    const card = found.cards.splice(found.index, 1)[0];
    draft._coach.castCards.push(card.instanceId);
    draft._coach.lastCastCardId = card.instanceId;
    if (sourceZone === 'command') player.commanderCastCount[card.instanceId] = Number(player.commanderCastCount[card.instanceId] || 0) + 1;
    if (move.type === 'cast-spell') {
      player.zones.graveyard.push(card);
      applyApproximateOracleEffect(draft, playerId, card);
    } else {
      card.summoningSick = isCreature(card);
      card.tapped = false;
      player.zones.battlefield.push(card);
      draft._coach.newPermanents.push(card.instanceId);
      if (cardTraits(card).enterTrigger) applyApproximateOracleEffect(draft, playerId, card, { enterOnly: true });
    }
    return { ok: true };
  }
  if (move.type === 'activate-ability') {
    const found = findSimCard(player, move.cardId);
    if (!found || found.zone !== 'battlefield') return { ok: false };
    const traits = cardTraits(found.card);
    if (traits.tapAbility) found.card.tapped = true;
    applyApproximateOracleEffect(draft, playerId, found.card, { activatedOnly: true });
    return { ok: true };
  }
  if (move.type === 'attack') {
    applyVisibleCombat(draft, playerId, move.cardIds || []);
    return { ok: true };
  }
  if (move.type === 'hold') return { ok: true };
  return { ok: true };
}

function applyApproximateOracleEffect(draft, playerId, card, options = {}) {
  const opponentId = otherPlayerId(draft, playerId);
  const traits = cardTraits(card);
  let virtual = 0;
  const record = { virtual: 0, moves: [] };
  if (traits.draw) virtual += 3.4;
  if (traits.tutor) virtual += 4.0;
  if (traits.tokenMaker) virtual += 2.2;
  if (traits.recursion) virtual += 2.3;
  if (traits.graveyardInteraction) virtual += 1.4;
  if (traits.protectionSpell) virtual += 2.0;
  if (traits.combatTrick) virtual += 1.4;
  if (traits.counterspell && !options.enterOnly) virtual += 1.2;
  if (traits.targetedRemoval && !options.enterOnly) {
    const targets = draft.players[opponentId].zones.battlefield;
    const target = [...targets].sort((a, b) => permanentValue(b, targets, draft.players[playerId].zones.battlefield) - permanentValue(a, targets, draft.players[playerId].zones.battlefield))[0];
    if (target) {
      targets.splice(targets.findIndex((item) => item.instanceId === target.instanceId), 1);
      draft.players[opponentId].zones.graveyard.push(target);
      record.moves.push({ cardId: target.instanceId, playerId: opponentId, from: 'battlefield', to: 'graveyard' });
      virtual += 1.0;
      draft._coach.actionNotes.push(`${card.name} can answer ${target.name}`);
    }
  }
  if (traits.boardWipe && !options.enterOnly) {
    record.moves.push(...applyBoardWipe(draft, playerId, { knownSpell: true }));
  }
  draft._coach.virtual[playerId] = Number(draft._coach.virtual[playerId] || 0) + virtual;
  record.virtual = virtual;
  draft._coach.effectsBySource[card.instanceId] = record;
}

function undoSourceEffects(draft, playerId, sourceCardId) {
  const record = draft._coach?.effectsBySource?.[sourceCardId];
  if (!record) return;
  draft._coach.virtual[playerId] = Number(draft._coach.virtual[playerId] || 0) - Number(record.virtual || 0);
  for (const move of [...(record.moves || [])].reverse()) {
    const player = draft.players[move.playerId];
    const index = player.zones[move.to].findIndex((card) => card.instanceId === move.cardId);
    if (index < 0) continue;
    const [card] = player.zones[move.to].splice(index, 1);
    player.zones[move.from].push(card);
  }
  delete draft._coach.effectsBySource[sourceCardId];
}

function chooseBlockersForAttack(draft, playerId, attackers) {
  const opponentId = otherPlayerId(draft, playerId);
  const attackBoard = draft.players[playerId].zones.battlefield;
  const blockBoard = draft.players[opponentId].zones.battlefield;
  const available = blockBoard.filter((card) => isCreature(card) && !card.tapped);
  const assignments = new Map();
  const orderedAttackers = [...attackers].sort((a, b) => permanentValue(b, attackBoard, blockBoard) - permanentValue(a, attackBoard, blockBoard));
  for (const attacker of orderedAttackers) {
    const legal = available.filter((blocker) => canBlock(attacker, blocker, blockBoard));
    if (!legal.length) continue;
    const traits = cardTraits(attacker);
    if (traits.menace) {
      if (legal.length < 2) continue;
      const pairs = [];
      for (let i = 0; i < legal.length; i += 1) for (let j = i + 1; j < legal.length; j += 1) pairs.push([legal[i], legal[j]]);
      pairs.sort((a, b) => combatTradeScore(attacker, a, attackBoard, blockBoard) - combatTradeScore(attacker, b, attackBoard, blockBoard));
      const pair = pairs[0];
      if (pair && combatTradeScore(attacker, pair, attackBoard, blockBoard) <= effectiveStats(attacker, attackBoard).power * 1.2) {
        assignments.set(attacker.instanceId, pair);
        for (const blocker of pair) available.splice(available.findIndex((item) => item.instanceId === blocker.instanceId), 1);
      }
      continue;
    }
    legal.sort((a, b) => combatTradeScore(attacker, [a], attackBoard, blockBoard) - combatTradeScore(attacker, [b], attackBoard, blockBoard));
    const blocker = legal[0];
    const noBlockDamage = effectiveStats(attacker, attackBoard).power;
    if (combatTradeScore(attacker, [blocker], attackBoard, blockBoard) <= noBlockDamage * 1.25) {
      assignments.set(attacker.instanceId, [blocker]);
      available.splice(available.findIndex((item) => item.instanceId === blocker.instanceId), 1);
    }
  }
  return assignments;
}

function applyVisibleCombat(draft, playerId, cardIds) {
  const opponentId = otherPlayerId(draft, playerId);
  const attackBoard = draft.players[playerId].zones.battlefield;
  const blockBoard = draft.players[opponentId].zones.battlefield;
  const attackers = attackBoard.filter((card) => cardIds.includes(card.instanceId));
  const assignments = chooseBlockersForAttack(draft, playerId, attackers);
  const deadAttackers = new Set();
  const deadBlockers = new Set();
  let totalDamage = 0;
  for (const attacker of attackers) {
    const traits = cardTraits(attacker);
    attacker.tapped = !traits.vigilance;
    const blockers = assignments.get(attacker.instanceId) || [];
    const outcome = combatOutcome(attacker, blockers, attackBoard, blockBoard);
    totalDamage += outcome.playerDamage;
    if (outcome.attackerDies) deadAttackers.add(attacker.instanceId);
    outcome.blockersDie.forEach((id) => deadBlockers.add(id));
    draft.players[playerId].life += outcome.lifelinkGain;
    if (traits.attackTrigger) draft._coach.virtual[playerId] += 1.25;
    if (outcome.playerDamage > 0 && traits.combatDamageTrigger) draft._coach.virtual[playerId] += 2.0;
    if (attacker.commander && outcome.playerDamage > 0) {
      draft.players[opponentId].commanderDamage[attacker.instanceId] = Number(draft.players[opponentId].commanderDamage[attacker.instanceId] || 0) + outcome.playerDamage;
    }
  }
  draft.players[opponentId].life -= totalDamage;
  draft._coach.combatDamage += totalDamage;
  for (const card of attackBoard.filter((item) => deadAttackers.has(item.instanceId))) draft.players[playerId].zones.graveyard.push(card);
  for (const card of blockBoard.filter((item) => deadBlockers.has(item.instanceId))) draft.players[opponentId].zones.graveyard.push(card);
  draft.players[playerId].zones.battlefield = attackBoard.filter((item) => !deadAttackers.has(item.instanceId));
  draft.players[opponentId].zones.battlefield = blockBoard.filter((item) => !deadBlockers.has(item.instanceId));
}

function bestTarget(player, opponent) {
  return [...player.zones.battlefield]
    .filter((card) => {
      const traits = cardTraits(card);
      return !traits.hexproof && !traits.shroud;
    })
    .sort((a, b) => permanentValue(b, player.zones.battlefield, opponent.zones.battlefield) - permanentValue(a, player.zones.battlefield, opponent.zones.battlefield))[0] || null;
}

function removePermanent(player, target) {
  const index = player.zones.battlefield.findIndex((card) => card.instanceId === target.instanceId);
  if (index < 0) return false;
  const [removed] = player.zones.battlefield.splice(index, 1);
  player.zones.graveyard.push(removed);
  return true;
}

function applyBoardWipe(draft, perspectiveId, { knownSpell = false } = {}) {
  const opponentId = otherPlayerId(draft, perspectiveId);
  const moves = [];
  for (const playerId of [perspectiveId, opponentId]) {
    const player = draft.players[playerId];
    const survivors = [];
    const dead = [];
    for (const card of player.zones.battlefield) {
      if (!isCreature(card) || cardTraits(card).indestructible) survivors.push(card);
      else dead.push(card);
    }
    player.zones.battlefield = survivors;
    player.zones.graveyard.push(...dead);
    moves.push(...dead.map((card) => ({ cardId: card.instanceId, playerId, from: 'battlefield', to: 'graveyard' })));
  }
  draft._coach.actionNotes.push(knownSpell ? 'resolved a visible board wipe' : 'sampled a plausible board wipe next turn');
  return moves;
}

function respondToMove(draft, playerId, move, scenario, rng) {
  const opponentId = otherPlayerId(draft, playerId);
  const player = draft.players[playerId];
  const opponent = draft.players[opponentId];
  const castMove = move.type === 'sequence'
    ? [...(move.steps || [])].reverse().find((step) => ['cast-permanent', 'cast-spell', 'cast-commander'].includes(step.type))
    : (['cast-permanent', 'cast-spell', 'cast-commander'].includes(move.type) ? move : null);

  if (castMove && scenario.categories.has('counterspell')) {
    const card = cardById(draft, castMove.cardId);
    if (card && rng() < 0.78) {
      undoSourceEffects(draft, playerId, card.instanceId);
      const found = findSimCard(player, card.instanceId);
      if (found?.zone === 'battlefield') {
        const countered = found.cards.splice(found.index, 1)[0];
        player.zones.graveyard.push(countered);
      }
      draft._coach.virtual[playerId] -= Math.max(1.5, permanentValue(card, player.zones.battlefield, opponent.zones.battlefield) * 0.65);
      draft._coach.actionNotes.push(`sampled ${opponent.name} countering ${card.name}`);
    }
  }

  if (scenario.categories.has('removal') && rng() < 0.72) {
    const target = bestTarget(player, opponent);
    if (target) {
      const traits = cardTraits(target);
      const wardResistance = traits.ward ? 0.22 : 0;
      const protectionResistance = traits.protection ? 0.24 : 0;
      if (rng() > wardResistance + protectionResistance && removePermanent(player, target)) {
        draft._coach.actionNotes.push(`sampled removal on ${target.name}`);
      }
    }
  }

  if (move.type === 'attack' || (move.type === 'sequence' && move.steps.some((step) => step.type === 'attack'))) {
    if (scenario.categories.has('combatTrick')) {
      draft._coach.virtual[playerId] -= 3.0 + rng() * 2.5;
      draft._coach.actionNotes.push('sampled an opposing combat trick');
    }
    if (scenario.categories.has('protection')) {
      draft._coach.virtual[playerId] -= 1.8 + rng() * 1.8;
      draft._coach.actionNotes.push('sampled protection changing combat');
    }
    if (scenario.categories.has('flashThreat')) {
      draft._coach.virtual[playerId] -= 1.6 + rng() * 2.2;
      draft._coach.actionNotes.push('sampled a flash blocker');
    }
  }

  if (scenario.categories.has('boardWipe')) {
    const ourCreatures = player.zones.battlefield.filter((card) => isCreature(card) && !cardTraits(card).indestructible);
    const theirCreatures = opponent.zones.battlefield.filter((card) => isCreature(card) && !cardTraits(card).indestructible);
    const ourValue = ourCreatures.reduce((sum, card) => sum + permanentValue(card, player.zones.battlefield, opponent.zones.battlefield), 0);
    const theirValue = theirCreatures.reduce((sum, card) => sum + permanentValue(card, opponent.zones.battlefield, player.zones.battlefield), 0);
    if (ourValue > theirValue * 0.78 && rng() < 0.62) applyBoardWipe(draft, playerId);
  }

  if (scenario.categories.has('graveyardInteraction')) {
    const graveyardValue = player.zones.graveyard.reduce((sum, card) => sum + (cardTraits(card).recursion || cardTraits(card).deathTrigger ? 0.8 : 0.12), 0);
    draft._coach.virtual[playerId] -= Math.min(4, graveyardValue);
  }
  if (scenario.categories.has('engine')) draft._coach.virtual[opponentId] += 2.2 + rng() * 2.0;
}

function strategicAdjustment(state, playerId, move, risk) {
  const player = state.players[playerId];
  const earlyTurn = Number(state.turnNumber || 1) <= 5;
  const availableLand = hasAvailableLandDrop(state, playerId);
  const includesLand = ['play-land', 'advance-land'].includes(move.type)
    || (move.type === 'sequence' && (move.steps || []).some((step) => ['play-land', 'advance-land'].includes(step.type)));
  let adjustment = 0;
  if (includesLand) adjustment += earlyTurn ? 12 : 7.5;
  const beginningWithLand = ['untap', 'upkeep', 'draw'].includes(phaseId(state)) && player.zones.hand.some((card) => isLand(card));
  if (move.type === 'hold' && (availableLand || beginningWithLand)) adjustment -= earlyTurn ? 15 : 9;
  if (move.type === 'advance-phase') adjustment += 2;
  if (move.type === 'hold' && state.turnNumber <= 3 && !playerHasUsefulInstant(player)) adjustment -= 3;

  const cards = moveCards(state, move);
  for (const card of cards) adjustment += commanderSynergy(player, card);
  if (move.type === 'sequence') adjustment += 0.8;
  if (move.type === 'attack') adjustment += (move.cardIds || []).reduce((sum, id) => sum + Math.max(-2, visibleAttackValue(state, playerId, cardById(state, id)) * 0.45), 0);

  const boardWipeRisk = risk.categories.boardWipe.probability;
  if (['cast-permanent', 'cast-commander', 'sequence'].includes(move.type) && boardWipeRisk > 0.28) {
    const newCreatureCount = cards.filter(isCreature).length;
    adjustment -= newCreatureCount * boardWipeRisk * 3.2;
  }
  return adjustment;
}

function moveCards(state, move) {
  if (move.type === 'sequence') return (move.steps || []).map((step) => cardById(state, step.cardId)).filter(Boolean);
  const card = cardById(state, move.cardId);
  return card ? [card] : [];
}

function commanderSynergy(player, card) {
  const commanders = player.zones.command.length ? player.zones.command : player.zones.battlefield.filter((permanent) => permanent.commander);
  let score = 0;
  for (const commander of commanders) {
    const commanderText = String(commander.oracleText || '').toLocaleLowerCase();
    const cardText = String(card.oracleText || '').toLocaleLowerCase();
    const subtypes = String(card.typeLine || '').split('—')[1]?.trim().split(/\s+/) || [];
    if (subtypes.some((subtype) => subtype.length > 3 && commanderText.includes(subtype.toLocaleLowerCase()))) score += 1.5;
    if (/ninjutsu|combat damage/.test(commanderText) && (cardTraits(card).unblockable || cardTraits(card).flying || cardTraits(card).menace)) score += 1.4;
    if (/graveyard|dies|zombie/.test(commanderText) && (/graveyard|dies|zombie/.test(cardText) || /Zombie/.test(card.typeLine || ''))) score += 1.2;
    if (/artifact/.test(commanderText) && /Artifact/.test(card.typeLine || '')) score += 1.0;
    if (/enchantment/.test(commanderText) && /Enchantment/.test(card.typeLine || '')) score += 1.0;
  }
  return Math.min(3.5, score);
}

function playerHasUsefulInstant(player) {
  return player.zones.hand.some((card) => {
    const traits = cardTraits(card);
    return traits.instant && (traits.counterspell || traits.targetedRemoval || traits.protectionSpell || traits.combatTrick);
  });
}

function hasAvailableLandDrop(state, playerId) {
  const player = state.players[playerId];
  return ['main1', 'main2'].includes(phaseId(state))
    && Number(player.landPlaysThisTurn || 0) < 1
    && player.zones.hand.some((card) => isLand(card));
}

function playerScore(player, opponent, virtual = 0) {
  let score = Number(player.life || 0) * 0.34 - Number(player.poison || 0) * 3.8 + player.zones.hand.length * 2.25 + player.zones.library.length * 0.012 + virtual;
  const lowLife = player.life <= 12;
  for (const card of player.zones.battlefield) score += permanentValue(card, player.zones.battlefield, opponent.zones.battlefield, { lowLife });
  for (const card of player.zones.graveyard) {
    const traits = cardTraits(card);
    score += traits.recursion || traits.deathTrigger ? 0.38 : 0.05;
  }
  for (const card of player.zones.command) score += card.commander ? 1.0 : 0.2;
  for (const card of player.zones.exile) {
    if (/cast .* from exile|play .* from exile|suspend|foretell|adventure/i.test(card.oracleText || '')) score += 0.35;
  }
  score += estimatedManaCapacity(player) * 0.55;
  const highestCommanderDamage = Math.max(0, ...Object.values(player.commanderDamage || {}).map(Number));
  score -= highestCommanderDamage * 0.68;
  if (player.life <= 0 || player.poison >= 10 || highestCommanderDamage >= 21 || player.lost) score -= 1000;
  return score;
}

function boardScore(state, playerId) {
  const opponentId = otherPlayerId(state, playerId);
  return playerScore(state.players[playerId], state.players[opponentId], state._coach?.virtual?.[playerId] || 0)
    - playerScore(state.players[opponentId], state.players[playerId], state._coach?.virtual?.[opponentId] || 0);
}

function estimatedManaCapacity(player) {
  return visibleManaSnapshot(player).total;
}

function moveExposure(move, risk) {
  const categories = risk.categories;
  let probability = 0;
  if (['cast-permanent', 'cast-commander', 'cast-spell'].includes(move.type)) {
    probability = 1 - (1 - categories.counterspell.probability) * (1 - categories.removal.probability * (move.type === 'cast-spell' ? 0.15 : 1));
  }
  if (move.type === 'sequence') {
    const casts = move.steps.filter((step) => step.type.startsWith('cast')).length;
    probability = 1 - Math.pow((1 - categories.counterspell.probability) * (1 - categories.removal.probability * 0.65), Math.max(1, casts));
    probability = Math.max(probability, categories.boardWipe.probability * 0.7);
  }
  if (move.type === 'attack') {
    probability = 1 - (1 - categories.combatTrick.probability) * (1 - categories.protection.probability) * (1 - categories.flashThreat.probability);
  }
  if (move.type === 'hold') probability = 0.06;
  return clamp(probability, 0, 0.98);
}

function riskLabel(probability) {
  if (probability >= 0.6) return 'High';
  if (probability >= 0.32) return 'Moderate';
  if (probability >= 0.14) return 'Low–moderate';
  return 'Low';
}

function relevantRisks(move, risk) {
  const keys = move.type === 'attack'
    ? ['combatTrick', 'protection', 'flashThreat', 'removal']
    : ['counterspell', 'removal', 'boardWipe'];
  return keys.map((key) => risk.categories[key]).filter((entry) => entry.probability > 0.08).sort((a, b) => b.probability - a.probability);
}

function visibleReasonsForMove(state, playerId, move) {
  const player = state.players[playerId];
  const opponent = state.players[otherPlayerId(state, playerId)];
  const reasons = [];
  if (['play-land', 'advance-land'].includes(move.type)) reasons.push('Makes the normal land drop and permanently increases future mana without spending mana.');
  if (move.type === 'sequence') reasons.push('Uses sequencing rather than evaluating each spell in isolation.');
  for (const card of moveCards(state, move)) {
    const traits = cardTraits(card);
    const abilities = [];
    if (traits.flying) abilities.push('flying');
    if (traits.deathtouch) abilities.push('deathtouch');
    if (traits.doubleStrike) abilities.push('double strike');
    if (traits.indestructible) abilities.push('indestructible');
    if (traits.hexproof || traits.ward) abilities.push(traits.hexproof ? 'hexproof' : 'ward');
    if (traits.deathTrigger) abilities.push('a death trigger');
    if (traits.attackTrigger) abilities.push('an attack trigger');
    if (traits.combatDamageTrigger) abilities.push('a combat-damage trigger');
    if (traits.activatedAbility) abilities.push('an activated ability');
    if (traits.staticEffect) abilities.push('a static effect');
    if (traits.targetedRemoval) abilities.push('targeted removal');
    if (traits.draw) abilities.push('card draw');
    if (abilities.length) reasons.push(`${card.name} contributes ${abilities.slice(0, 4).join(', ')}.`);
    const synergy = commanderSynergy(player, card);
    if (synergy >= 1) reasons.push(`${card.name} directly supports the visible commander/deck plan.`);
  }
  if (move.type === 'attack') {
    const attackers = (move.cardIds || []).map((id) => cardById(state, id)).filter(Boolean);
    const blockers = opponent.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
    const evasive = attackers.filter((card) => {
      const traits = cardTraits(card);
      return traits.flying || traits.unblockable || traits.menace;
    });
    if (evasive.length) reasons.push(`${evasive.map((card) => card.name).join(', ')} has relevant evasion against the visible blockers.`);
    if (!blockers.length) reasons.push('The opponent has no untapped visible creature blockers.');
  }
  if (move.type === 'hold' && playerHasUsefulInstant(player)) reasons.push('Holding preserves a visible instant-speed answer in your hand.');
  return reasons.slice(0, 5);
}

function memoryReasons(risk) {
  const reasons = [];
  if (risk.publicMemory.knownHand.length) reasons.push(`Known in the opponent's hand: ${risk.publicMemory.knownHand.join(', ')}.`);
  const used = Object.entries(risk.publicMemory.usedInteraction || {});
  if (used.length) reasons.push(`Already observed: ${used.map(([type, count]) => `${count} ${INTERACTION_MODELS[type]?.label || type}`).join(', ')}.`);
  if (risk.publicMemory.behavior?.consecutivePassesWithOpenMana) reasons.push(`The opponent has repeatedly passed with mana open (${risk.publicMemory.behavior.consecutivePassesWithOpenMana} consecutive turn(s)).`);
  return reasons.slice(0, 3);
}

function explainMove(state, playerId, move, average, risk, responseStats) {
  const exposure = moveExposure(move, risk);
  const relevant = relevantRisks(move, risk);
  const visibleReasons = visibleReasonsForMove(state, playerId, move);
  const publicReasons = memoryReasons(risk);
  const riskText = relevant.length
    ? `${relevant.map((entry) => `${Math.round(entry.probability * 100)}% ${entry.label}`).join('; ')} based on open mana, hand size, colors, and public history.`
    : 'No major instant-speed interaction is strongly suggested by the current public information.';
  const headline = visibleReasons[0] || (average >= 0 ? 'This line improves the visible position.' : 'This line limits immediate downside but may lose tempo.');
  return {
    headline,
    visibleReasons,
    publicMemoryReasons: publicReasons,
    hiddenRisk: riskText,
    riskLevel: riskLabel(exposure),
    riskProbability: exposure,
    sampledResponses: responseStats,
  };
}

function evaluateMove(state, info, risk, playerId, move, rollouts, seed) {
  let total = 0;
  let high = -Infinity;
  let low = Infinity;
  const scores = [];
  const responseCounts = {};
  const baseSimulation = simulationStateFromInformationSet(state, info);
  for (let i = 0; i < rollouts; i += 1) {
    const rng = mulberry32(seed + i * 2654435761 + hashString(move.label));
    const simulated = deepClone(baseSimulation);
    const result = applyMoveToDraft(simulated, playerId, move);
    if (!result.ok) {
      scores.push(-999);
      total -= 999;
      low = Math.min(low, -999);
      high = Math.max(high, -999);
      continue;
    }
    const scenario = sampleHiddenScenario(risk, rng);
    for (const category of scenario.categories) responseCounts[category] = Number(responseCounts[category] || 0) + 1;
    respondToMove(simulated, playerId, move, scenario, rng);
    const score = boardScore(simulated, playerId) + strategicAdjustment(state, playerId, move, risk);
    scores.push(score);
    total += score;
    high = Math.max(high, score);
    low = Math.min(low, score);
  }
  const average = total / Math.max(1, rollouts);
  const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / Math.max(1, scores.length);
  const stdev = Math.sqrt(variance);
  const responseStats = Object.fromEntries(Object.entries(responseCounts).map(([key, count]) => [key, Number((count / Math.max(1, rollouts)).toFixed(3))]));
  return {
    ...move,
    score: Number(average.toFixed(2)),
    range: [Number(low.toFixed(1)), Number(high.toFixed(1))],
    stdev: Number(stdev.toFixed(2)),
    riskProbability: moveExposure(move, risk),
    explanationDetails: explainMove(state, playerId, move, average, risk, responseStats),
  };
}

export function analyzePosition(state, playerId = state.activePlayerId, rollouts = state.settings.coachRollouts || 450) {
  ensureKnowledge(state);
  const informationSet = buildInformationSet(state, playerId);
  const risk = buildInteractionRisk(state, playerId);
  const moves = possibleMoves(state, playerId);
  const seed = analysisSeed(state, playerId);
  const perMoveRollouts = Math.max(60, Math.min(1600, Number(rollouts || 450)));
  const results = moves.map((move) => evaluateMove(state, informationSet, risk, playerId, move, perMoveRollouts, seed));
  results.sort((a, b) => b.score - a.score);

  const best = results[0];
  const second = results[1];
  if (best) {
    const margin = second ? best.score - second.score : Math.max(1, Math.abs(best.score) * 0.15);
    const uncertainty = best.stdev + best.riskProbability * 6;
    best.confidence = Math.round(clamp(56 + margin * 4.5 + Math.sqrt(perMoveRollouts) * 0.7 - uncertainty * 2.2, 20, 96));
    const safer = results
      .slice(1)
      .filter((result) => result.riskProbability + 0.08 < best.riskProbability && result.score >= best.score - 5.5)
      .sort((a, b) => (a.riskProbability - b.riskProbability) || (b.score - a.score))[0];
    best.saferAlternative = safer ? { label: safer.label, score: safer.score, riskLevel: riskLabel(safer.riskProbability) } : null;
    best.explanation = best.explanationDetails.headline;
  }
  for (const result of results.slice(1)) {
    result.confidence = Math.round(clamp(48 + Math.sqrt(perMoveRollouts) * 0.5 - result.stdev * 1.8 - result.riskProbability * 18, 18, 88));
    result.saferAlternative = null;
    result.explanation = result.explanationDetails.headline;
  }

  return {
    moves,
    results,
    baseline: boardScore(simulationStateFromInformationSet(state, informationSet), playerId),
    rollouts: perMoveRollouts,
    searchType: 'Information-set sampled Monte Carlo search',
    informationSetAudit: informationSet.audit,
    risk,
  };
}

export function defenseAdvice(state) {
  const attackerPlayer = Object.values(state.players).find((player) => player.zones.battlefield.some((card) => card.attacking));
  if (!attackerPlayer) return null;
  const defenderId = otherPlayerId(state, attackerPlayer.id);
  const defender = state.players[defenderId];
  const attackers = attackerPlayer.zones.battlefield.filter((card) => card.attacking);
  const blockers = defender.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
  const assignments = [];
  const unused = [...blockers];
  const ordered = [...attackers].sort((a, b) => permanentValue(b, attackerPlayer.zones.battlefield, defender.zones.battlefield) - permanentValue(a, attackerPlayer.zones.battlefield, defender.zones.battlefield));
  let expectedDamage = 0;

  for (const attacker of ordered) {
    const legal = unused.filter((blocker) => canBlock(attacker, blocker, defender.zones.battlefield));
    const traits = cardTraits(attacker);
    let chosen = [];
    if (traits.menace && legal.length >= 2) {
      const pairs = [];
      for (let i = 0; i < legal.length; i += 1) for (let j = i + 1; j < legal.length; j += 1) pairs.push([legal[i], legal[j]]);
      pairs.sort((a, b) => combatTradeScore(attacker, a, attackerPlayer.zones.battlefield, defender.zones.battlefield) - combatTradeScore(attacker, b, attackerPlayer.zones.battlefield, defender.zones.battlefield));
      chosen = pairs[0] || [];
    } else if (legal.length) {
      legal.sort((a, b) => combatTradeScore(attacker, [a], attackerPlayer.zones.battlefield, defender.zones.battlefield) - combatTradeScore(attacker, [b], attackerPlayer.zones.battlefield, defender.zones.battlefield));
      chosen = [legal[0]];
    }
    const outcome = combatOutcome(attacker, chosen, attackerPlayer.zones.battlefield, defender.zones.battlefield);
    expectedDamage += outcome.playerDamage;
    if (chosen.length) {
      const attackerValue = permanentValue(attacker, attackerPlayer.zones.battlefield, defender.zones.battlefield);
      const blockerValue = chosen.reduce((sum, blocker) => sum + permanentValue(blocker, defender.zones.battlefield, attackerPlayer.zones.battlefield), 0);
      const deathtouchWarning = chosen.some((blocker) => cardTraits(blocker).deathtouch);
      assignments.push({
        attacker: attacker.name,
        attackerId: attacker.instanceId,
        blocker: chosen.map((card) => card.name).join(' + '),
        blockerIds: chosen.map((card) => card.instanceId),
        reason: deathtouchWarning
          ? `deathtouch makes this block trade up despite the blocker's size`
          : outcome.attackerDies && blockerValue < attackerValue
            ? 'trades lower-value material for the more valuable attacker'
            : outcome.playerDamage === 0
              ? 'prevents the most useful visible attack'
              : `limits trample damage to ${outcome.playerDamage}`,
      });
      for (const blocker of chosen) unused.splice(unused.findIndex((card) => card.instanceId === blocker.instanceId), 1);
    }
  }
  return { attackerName: attackerPlayer.name, defenderId, defenderName: defender.name, assignments, expectedDamage };
}
