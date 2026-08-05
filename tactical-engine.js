import { PHASES } from './constants.js';
import { cardTraits, canBlock, combatOutcome, combatTradeScore, effectiveStats, permanentValue } from './card-evaluation.js';
import { actionStrategyBonus, buildStrategyProfile, cardStrategySynergy } from './strategy-profile.js';
import { applySpellPayment, attackLegality, landEntryPlan, landPlayLegality, manaDevelopmentSnapshot, spellCastLegality } from './rules.js';
import { deepClone, isCreature, isLand, isPermanent, numericStat } from './utils.js';

const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function otherPlayerId(state, playerId) {
  return Object.keys(state.players).find((id) => id !== playerId);
}

export function findTacticalCard(state, instanceId) {
  for (const [playerId, player] of Object.entries(state.players || {})) {
    for (const [zone, cards] of Object.entries(player.zones || {})) {
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      if (index >= 0) return { card: cards[index], playerId, zone, index, cards };
    }
  }
  const index = (state.stack || []).findIndex((card) => card.instanceId === instanceId);
  return index >= 0 ? { card: state.stack[index], playerId: state.stack[index].controller, zone: 'stack', index, cards: state.stack } : null;
}

function phaseId(state) {
  return PHASES[state.phaseIndex]?.id || 'main1';
}

function parseAmount(text, fallback = 1) {
  const value = String(text || '').toLocaleLowerCase();
  const digit = value.match(/\d+/);
  if (digit) return Number(digit[0]);
  for (const [word, amount] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\b`).test(value)) return amount;
  return fallback;
}

function uniqueActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = JSON.stringify([action.type, action.cardId || '', action.cardIds || [], (action.steps || []).map((step) => [step.type, step.cardId])]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function attackValue(state, playerId, card) {
  const opponentId = otherPlayerId(state, playerId);
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  const blockers = opponent.zones.battlefield.filter((blocker) => canBlock(card, blocker, opponent.zones.battlefield));
  if (!blockers.length) {
    const stats = effectiveStats(card, player.zones.battlefield);
    const traits = cardTraits(card);
    return stats.power * 1.25 + (traits.combatDamageTrigger ? 2.2 : 0) + (card.commander ? 0.65 : 0);
  }
  return Math.max(...blockers.map((blocker) => combatTradeScore(card, [blocker], player.zones.battlefield, opponent.zones.battlefield)), -1.5);
}

function generatedAttackPlans(state, playerId) {
  if (state.activePlayerId !== playerId || phaseId(state) !== 'combat') return [];
  const player = state.players[playerId];
  const legal = player.zones.battlefield.filter((card) => attackLegality(state, card).legal);
  if (!legal.length) return [];
  const scored = legal.map((card) => ({ card, score: attackValue(state, playerId, card) }));
  const actions = [];
  for (const item of scored.slice(0, 8)) {
    actions.push({ type: 'attack', cardIds: [item.card.instanceId], label: `Attack with ${item.card.name}` });
  }
  const favorable = scored.filter((item) => item.score > 0.55).map((item) => item.card.instanceId);
  if (favorable.length > 1) actions.push({ type: 'attack', cardIds: favorable, label: `Attack with ${favorable.length} favorable attacker${favorable.length === 1 ? '' : 's'}` });
  const evasive = scored.filter(({ card }) => {
    const traits = cardTraits(card);
    return traits.flying || traits.unblockable || traits.menace;
  }).map(({ card }) => card.instanceId);
  if (evasive.length) actions.push({ type: 'attack', cardIds: evasive, label: `Attack with the evasive creatures` });
  const all = legal.map((card) => card.instanceId);
  if (all.length > 1) actions.push({ type: 'attack', cardIds: all, label: `Attack with all legal creatures` });
  return uniqueActions(actions);
}

function kickerCost(card) {
  return String(card?.oracleText || '').match(/(?:multi)?kicker\s+(\{[^\n.]+?\})/i)?.[1]?.replace(/\}\s*\{/g, '}{') || '';
}

export function generateTacticalActions(state, playerId = state.activePlayerId, options = {}) {
  const player = state.players[playerId];
  if (!player) return [];
  const actions = [];
  const phase = phaseId(state);
  const opponentCount = Math.max(1, Object.keys(state.players).length - 1);

  if (['untap', 'upkeep', 'draw'].includes(phase) && playerId === state.activePlayerId) {
    const lands = player.zones.hand.filter(isLand).slice(0, 5);
    for (const card of lands) {
      const entryPlan = landEntryPlan(card, player, { opponentCount, payLife: 'auto' });
      actions.push({ type: 'advance-land', cardId: card.instanceId, entryPlan, label: `Advance to Main 1 → play ${card.name}${entryPlan.tapped ? ' tapped' : ''}` });
    }
    if (!lands.length) actions.push({ type: 'advance-phase', label: 'Advance toward Main 1' });
  }

  for (const card of player.zones.hand || []) {
    if (isLand(card)) {
      const legality = landPlayLegality(state, playerId, card);
      if (legality.legal) {
        const entryPlan = landEntryPlan(card, player, { opponentCount, payLife: 'auto' });
        actions.push({ type: 'play-land', cardId: card.instanceId, entryPlan, label: `Play ${card.name}${entryPlan.tapped ? ' (enters tapped)' : ''}` });
      }
      continue;
    }
    const legality = spellCastLegality(state, playerId, card, 'hand');
    if (legality.legal) actions.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, paymentPlan: legality.payment, costPlan: legality.costPlan, label: `Cast ${card.name}` });
    const kicker = kickerCost(card);
    if (kicker) {
      const kicked = spellCastLegality(state, playerId, card, 'hand', { kicked: true });
      if (kicked.legal) actions.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, paymentPlan: kicked.payment, costPlan: kicked.costPlan, kicked: true, label: `Cast ${card.name} kicked` });
    }
  }
  for (const card of player.zones.command || []) {
    const legality = spellCastLegality(state, playerId, card, 'command');
    if (legality.legal) actions.push({ type: 'cast-commander', cardId: card.instanceId, paymentPlan: legality.payment, costPlan: legality.costPlan, label: `Cast ${card.name}${legality.tax ? ` (+${legality.tax} commander tax)` : ''}` });
  }
  for (const card of player.zones.battlefield || []) {
    const traits = cardTraits(card);
    if (traits.activatedAbility && (!traits.tapAbility || !card.tapped)) actions.push({ type: 'activate-ability', cardId: card.instanceId, label: `Activate ${card.name}` });
  }
  actions.push(...generatedAttackPlans(state, playerId));
  actions.push({ type: 'hold', label: 'Hold resources and pass priority' });
  return uniqueActions(actions).slice(0, Number(options.limit || 36));
}

function removeFromZone(player, zone, cardId) {
  const cards = player.zones[zone] || [];
  const index = cards.findIndex((card) => card.instanceId === cardId);
  return index >= 0 ? cards.splice(index, 1)[0] : null;
}

function chooseBestTarget(state, playerId, kind = 'remove') {
  const opponentId = otherPlayerId(state, playerId);
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  return [...opponent.zones.battlefield]
    .filter((card) => {
      const traits = cardTraits(card);
      if (kind === 'destroy' && traits.indestructible) return false;
      return !traits.hexproof && !traits.shroud;
    })
    .sort((a, b) => permanentValue(b, opponent.zones.battlefield, player.zones.battlefield) - permanentValue(a, opponent.zones.battlefield, player.zones.battlefield))[0] || null;
}

function createSimpleToken(playerId, name, power, toughness, keywords = []) {
  return {
    instanceId: `sim-token-${playerId}-${Math.random().toString(36).slice(2)}`,
    name, manaCost: '', manaValue: 0, typeLine: 'Token Creature', oracleText: '',
    power: String(power), toughness: String(toughness), keywords, colors: [], colorIdentity: [],
    owner: playerId, controller: playerId, token: true, commander: false, tapped: false,
    summoningSick: true, attacking: false, blocking: null, blockedBy: [], counters: {}, attachments: [],
  };
}

function applyDraw(state, playerId, amount) {
  const player = state.players[playerId];
  for (let i = 0; i < amount; i += 1) {
    const card = player.zones.library.shift();
    if (!card) { player.lost = true; break; }
    player.zones.hand.push(card);
  }
}

function applyMill(state, playerId, amount) {
  const player = state.players[playerId];
  for (let i = 0; i < amount; i += 1) {
    const card = player.zones.library.shift();
    if (!card) break;
    player.zones.graveyard.push(card);
  }
}

export function applyCommonEffects(state, playerId, card, context = {}) {
  const player = state.players[playerId];
  const opponentId = otherPlayerId(state, playerId);
  const opponent = state.players[opponentId];
  const text = String(card?.oracleText || '').replace(/\n/g, ' ');
  const notes = state._coach?.actionNotes || [];
  const draw = text.match(/draw (a|an|one|two|three|four|five|six|\d+) cards?/i);
  if (draw) { const amount = parseAmount(draw[1]); applyDraw(state, playerId, amount); notes.push(`${card.name} drew ${amount}`); }
  const millSelf = text.match(/(?:you |target player )?mill(?:s)? (a|an|one|two|three|four|five|six|\d+) cards?/i);
  if (millSelf) { const amount = parseAmount(millSelf[1]); applyMill(state, playerId, amount); notes.push(`${card.name} milled ${amount}`); }
  const gain = text.match(/you gain (a|an|one|two|three|four|five|six|\d+) life/i);
  if (gain) player.life += parseAmount(gain[1]);
  const eachLose = text.match(/each opponent loses (a|an|one|two|three|four|five|six|\d+) life/i);
  if (eachLose) opponent.life -= parseAmount(eachLose[1]);
  const token = text.match(/create (a|an|one|two|three|four|five|six|\d+) (\d+)\/(\d+) [^.]*?([A-Za-z]+) creature tokens?/i);
  if (token) {
    const amount = parseAmount(token[1]);
    for (let i = 0; i < Math.min(12, amount); i += 1) player.zones.battlefield.push(createSimpleToken(playerId, `${token[4]} Token`, Number(token[2]), Number(token[3])));
  }
  const traits = cardTraits(card);
  if (traits.boardWipe) {
    for (const owner of Object.values(state.players)) {
      const survivors = [];
      for (const permanent of owner.zones.battlefield) {
        if (!isCreature(permanent) || cardTraits(permanent).indestructible) survivors.push(permanent);
        else owner.zones.graveyard.push(permanent);
      }
      owner.zones.battlefield = survivors;
    }
    notes.push(`${card.name} cleared most creatures`);
  } else if (traits.targetedRemoval) {
    const target = chooseBestTarget(state, playerId, /destroy target/i.test(text) ? 'destroy' : 'remove');
    if (target) {
      const index = opponent.zones.battlefield.findIndex((item) => item.instanceId === target.instanceId);
      const [removed] = opponent.zones.battlefield.splice(index, 1);
      if (/exile target/i.test(text)) opponent.zones.exile.push(removed);
      else if (/return target .* hand/i.test(text)) opponent.zones.hand.push(removed);
      else opponent.zones.graveyard.push(removed);
      notes.push(`${card.name} answered ${target.name}`);
    }
  }
  if (traits.tutor) {
    state._coach.virtual[playerId] += 2.2;
    notes.push(`${card.name} found a useful card`);
  }
  if (traits.recursion) {
    const target = [...player.zones.graveyard].sort((a, b) => Number(b.manaValue || 0) - Number(a.manaValue || 0))[0];
    if (target) {
      player.zones.graveyard.splice(player.zones.graveyard.findIndex((item) => item.instanceId === target.instanceId), 1);
      player.zones.hand.push(target);
      notes.push(`${card.name} recovered ${target.name}`);
    }
  }
  if (context.kicked) state._coach.virtual[playerId] += 1.25;
}

function resolveCard(state, playerId, card, context = {}) {
  const player = state.players[playerId];
  if (isPermanent(card)) {
    card.controller = playerId;
    card.tapped = false;
    card.summoningSick = isCreature(card);
    player.zones.battlefield.push(card);
    applyCommonEffects(state, playerId, card, context);
  } else {
    applyCommonEffects(state, playerId, card, context);
    player.zones.graveyard.push(card);
  }
}

function chooseBlocks(state, attackerId, attackers) {
  const defender = state.players[otherPlayerId(state, attackerId)];
  const attackerPlayer = state.players[attackerId];
  const available = defender.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
  const result = new Map();
  const ordered = [...attackers].sort((a, b) => permanentValue(b, attackerPlayer.zones.battlefield, defender.zones.battlefield) - permanentValue(a, attackerPlayer.zones.battlefield, defender.zones.battlefield));
  for (const attacker of ordered) {
    const traits = cardTraits(attacker);
    const legal = available.filter((blocker) => canBlock(attacker, blocker, defender.zones.battlefield));
    if (traits.menace) {
      let best = null;
      for (let i = 0; i < legal.length; i += 1) for (let j = i + 1; j < legal.length; j += 1) {
        const pair = [legal[i], legal[j]];
        const score = combatTradeScore(attacker, pair, attackerPlayer.zones.battlefield, defender.zones.battlefield);
        if (!best || score < best.score) best = { pair, score };
      }
      if (best && best.score <= Math.max(2, effectiveStats(attacker, attackerPlayer.zones.battlefield).power * 1.15)) result.set(attacker.instanceId, best.pair);
    } else if (legal.length) {
      legal.sort((a, b) => combatTradeScore(attacker, [a], attackerPlayer.zones.battlefield, defender.zones.battlefield) - combatTradeScore(attacker, [b], attackerPlayer.zones.battlefield, defender.zones.battlefield));
      const blocker = legal[0];
      const trade = combatTradeScore(attacker, [blocker], attackerPlayer.zones.battlefield, defender.zones.battlefield);
      if (trade <= Math.max(2.2, effectiveStats(attacker, attackerPlayer.zones.battlefield).power * 1.2)) result.set(attacker.instanceId, [blocker]);
    }
    for (const blocker of result.get(attacker.instanceId) || []) available.splice(available.findIndex((item) => item.instanceId === blocker.instanceId), 1);
  }
  return result;
}

function resolveCombat(state, playerId, cardIds) {
  const player = state.players[playerId];
  const opponentId = otherPlayerId(state, playerId);
  const opponent = state.players[opponentId];
  const attackers = player.zones.battlefield.filter((card) => cardIds.includes(card.instanceId));
  const blocks = chooseBlocks(state, playerId, attackers);
  const deadAttackers = new Set();
  const deadBlockers = new Set();
  for (const attacker of attackers) {
    const traits = cardTraits(attacker);
    if (!traits.vigilance) attacker.tapped = true;
    const outcome = combatOutcome(attacker, blocks.get(attacker.instanceId) || [], player.zones.battlefield, opponent.zones.battlefield);
    opponent.life -= outcome.playerDamage;
    player.life += outcome.lifelinkGain;
    if (attacker.commander && outcome.playerDamage > 0) opponent.commanderDamage[attacker.instanceId] = Number(opponent.commanderDamage[attacker.instanceId] || 0) + outcome.playerDamage;
    if (outcome.attackerDies) deadAttackers.add(attacker.instanceId);
    for (const id of outcome.blockersDie) deadBlockers.add(id);
    if (traits.attackTrigger) state._coach.virtual[playerId] += 1.0;
    if (outcome.playerDamage && traits.combatDamageTrigger) state._coach.virtual[playerId] += 1.8;
  }
  for (const card of player.zones.battlefield.filter((item) => deadAttackers.has(item.instanceId))) player.zones.graveyard.push(card);
  for (const card of opponent.zones.battlefield.filter((item) => deadBlockers.has(item.instanceId))) opponent.zones.graveyard.push(card);
  player.zones.battlefield = player.zones.battlefield.filter((item) => !deadAttackers.has(item.instanceId));
  opponent.zones.battlefield = opponent.zones.battlefield.filter((item) => !deadBlockers.has(item.instanceId));
}

export function applyStateBasedActions(state) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const player of Object.values(state.players || {})) {
      if (player.life <= 0 || player.poison >= 10 || Object.values(player.commanderDamage || {}).some((amount) => Number(amount) >= 21)) player.lost = true;
      const survivors = [];
      for (const card of player.zones.battlefield || []) {
        if (isCreature(card) && effectiveStats(card, player.zones.battlefield).toughness <= 0) {
          player.zones.graveyard.push(card);
          changed = true;
        } else survivors.push(card);
      }
      player.zones.battlefield = survivors;
    }
  }
  return state;
}

export function applyTacticalAction(original, playerId, action, options = {}) {
  const state = options.mutate ? original : deepClone(original);
  state.stack ||= [];
  state._coach ||= { virtual: {}, actionNotes: [], newPermanents: [], castCards: [], combatDamage: 0, effectsBySource: {} };
  state._coach.virtual ||= Object.fromEntries(Object.keys(state.players).map((id) => [id, 0]));
  state._coach.actionNotes ||= [];
  const player = state.players[playerId];
  if (!player) return { ok: false, state, reason: 'Player not found.' };

  if (action.type === 'sequence') {
    let working = state;
    for (const step of action.steps || []) {
      const result = applyTacticalAction(working, playerId, step, { mutate: true, autoResolve: options.autoResolve !== false });
      if (!result.ok) return result;
      working = result.state;
    }
    return { ok: true, state: applyStateBasedActions(working) };
  }
  if (action.type === 'advance-phase') {
    state.phaseIndex = PHASES.findIndex((phase) => phase.id === 'main1');
    return { ok: true, state };
  }
  if (action.type === 'advance-land') state.phaseIndex = PHASES.findIndex((phase) => phase.id === 'main1');
  if (['play-land', 'advance-land'].includes(action.type)) {
    const found = findTacticalCard(state, action.cardId);
    if (!found || found.zone !== 'hand') return { ok: false, state, reason: 'Land is no longer in hand.' };
    const legality = landPlayLegality(state, playerId, found.card);
    if (!legality.legal) return { ok: false, state, reason: legality.reasons.join(' ') };
    const card = removeFromZone(player, 'hand', action.cardId);
    const entry = action.entryPlan || landEntryPlan(card, player, { opponentCount: Math.max(1, Object.keys(state.players).length - 1), payLife: 'auto' });
    card.tapped = Boolean(entry.tapped);
    player.life -= Number(entry.lifePaid || 0);
    player.landPlaysThisTurn = Number(player.landPlaysThisTurn || 0) + 1;
    player.zones.battlefield.push(card);
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (['cast-permanent', 'cast-spell', 'cast-commander'].includes(action.type)) {
    const found = findTacticalCard(state, action.cardId);
    if (!found) return { ok: false, state, reason: 'Spell is no longer available.' };
    const sourceZone = found.zone;
    const legality = spellCastLegality(state, playerId, found.card, sourceZone, { kicked: Boolean(action.kicked) });
    if (!legality.legal) return { ok: false, state, reason: legality.reasons.join(' ') };
    const card = removeFromZone(player, sourceZone, action.cardId);
    applySpellPayment(state, playerId, action.paymentPlan?.ok ? action.paymentPlan : legality.payment);
    if (sourceZone === 'command') player.commanderCastCount[card.instanceId] = Number(player.commanderCastCount[card.instanceId] || 0) + 1;
    state.stack.push(card);
    state.priorityPlayerId = playerId;
    state.consecutivePasses = 0;
    if (options.autoResolve !== false) {
      state.stack.pop();
      resolveCard(state, playerId, card, { kicked: Boolean(action.kicked) });
    }
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (action.type === 'attack') {
    const legalIds = (action.cardIds || []).filter((id) => {
      const found = findTacticalCard(state, id);
      return found && attackLegality(state, found.card).legal;
    });
    if (!legalIds.length) return { ok: false, state, reason: 'No listed attacker is currently legal.' };
    resolveCombat(state, playerId, legalIds);
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (action.type === 'activate-ability') {
    const found = findTacticalCard(state, action.cardId);
    if (!found || found.zone !== 'battlefield') return { ok: false, state, reason: 'Permanent is not on the battlefield.' };
    const traits = cardTraits(found.card);
    if (traits.tapAbility) found.card.tapped = true;
    applyCommonEffects(state, playerId, found.card, { activated: true });
    state._coach.virtual[playerId] += traits.activatedAbility ? 0.8 : 0;
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (action.type === 'hold') return { ok: true, state };
  return { ok: false, state, reason: `Unsupported tactical action: ${action.type}` };
}

function availableInteractionValue(player) {
  const mana = manaDevelopmentSnapshot(player);
  let value = 0;
  for (const card of player.zones.hand || []) {
    const traits = cardTraits(card);
    if (!(traits.counterspell || traits.targetedRemoval || traits.protectionSpell || traits.combatTrick)) continue;
    if (Number(card.manaValue || 0) <= mana.available + 0.1) value += 1.2 + Number(card.manaValue || 0) * 0.12;
  }
  return value;
}

export function tacticalStateScore(state, playerId, profile = buildStrategyProfile(state.players[playerId])) {
  const opponentId = otherPlayerId(state, playerId);
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  const valueBoard = (owner, enemy) => owner.zones.battlefield.reduce((sum, card) => sum + permanentValue(card, owner.zones.battlefield, enemy.zones.battlefield, { lowLife: owner.life <= 12 }) + cardStrategySynergy(card, profile, { zone: 'battlefield' }) * 0.65, 0);
  const ownBoard = valueBoard(player, opponent);
  const enemyBoard = opponent.zones.battlefield.reduce((sum, card) => sum + permanentValue(card, opponent.zones.battlefield, player.zones.battlefield, { lowLife: opponent.life <= 12 }), 0);
  const ownMana = manaDevelopmentSnapshot(player);
  const enemyMana = manaDevelopmentSnapshot(opponent);
  const hand = (player.zones.hand.length - opponent.zones.hand.length) * 1.25;
  const life = (player.life - opponent.life) * 0.18;
  const mana = (ownMana.nextTurn - enemyMana.nextTurn) * 0.58 + (ownMana.available - enemyMana.available) * 0.34;
  const poison = (opponent.poison - player.poison) * 1.8;
  const commanderPressure = Object.values(opponent.commanderDamage || {}).reduce((max, amount) => Math.max(max, Number(amount || 0)), 0) * 0.32
    - Object.values(player.commanderDamage || {}).reduce((max, amount) => Math.max(max, Number(amount || 0)), 0) * 0.38;
  const virtual = Number(state._coach?.virtual?.[playerId] || 0) - Number(state._coach?.virtual?.[opponentId] || 0);
  const interaction = availableInteractionValue(player) - availableInteractionValue(opponent) * 0.55;
  const loss = player.lost ? -1000 : opponent.lost ? 1000 : 0;
  return ownBoard - enemyBoard + hand + life + mana + poison + commanderPressure + virtual + interaction + loss;
}

export function generateShortSequences(state, playerId, options = {}) {
  const depth = Math.max(1, Math.min(4, Number(options.depth || 3)));
  const beamWidth = Math.max(4, Math.min(30, Number(options.beamWidth || 12)));
  const profile = buildStrategyProfile(state.players[playerId]);
  let beam = [{ state: deepClone(state), steps: [], score: tacticalStateScore(state, playerId, profile) }];
  const sequences = [];
  for (let ply = 0; ply < depth; ply += 1) {
    const next = [];
    for (const node of beam) {
      const actions = generateTacticalActions(node.state, playerId, { limit: ply === 0 ? 28 : 16 });
      for (const action of actions) {
        if (action.type === 'hold') continue;
        const result = applyTacticalAction(node.state, playerId, action, { autoResolve: true });
        if (!result.ok) continue;
        const score = tacticalStateScore(result.state, playerId, profile) + actionStrategyBonus(action, node.state, playerId, profile);
        const item = { state: result.state, steps: [...node.steps, action], score };
        next.push(item);
        if (item.steps.length > 1) sequences.push({ type: 'sequence', steps: item.steps, label: item.steps.map((step) => step.label).join(' → '), projectedScore: score });
      }
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, beamWidth);
    if (!beam.length) break;
  }
  return uniqueActions(sequences).sort((a, b) => b.projectedScore - a.projectedScore).slice(0, Number(options.limit || 16));
}
