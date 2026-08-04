import { PHASES, ZONE_LABELS } from './constants.js';
import { drawCards, findCard, updateState } from './state.js';
import { attackLegality, moveLegality, spendMana, stackDestination } from './rules.js';
import { deepClone, isCreature, isLand, shuffle, uid } from './utils.js';

function otherPlayerId(state, playerId) {
  return Object.keys(state.players).find((id) => id !== playerId);
}

export function moveCard(instanceId, targetPlayerId, targetZone, { force = false, libraryPosition = 'top' } = {}) {
  const currentState = window.CommanderForge.getState();
  const source = findCard(instanceId, currentState);
  if (!source) return { ok: false, message: 'Card not found.' };
  const legality = moveLegality(currentState, source.card, source, targetPlayerId, targetZone);
  if (!legality.legal && !force) {
    if (currentState.settings.rulesMode === 'strict') return { ok: false, message: legality.reasons.join(' ') };
    const override = confirm(`${legality.reasons.join('\n')}\n\nUse a manual rules override for this move?`);
    if (!override) return { ok: false, message: 'Move cancelled.' };
  }

  if (source.card.commander && source.zone !== 'command' && ['graveyard', 'exile', 'hand', 'library'].includes(targetZone) && currentState.settings.confirmCommanderMoves) {
    const toCommand = confirm(`${source.card.name} is a commander.\n\nPress OK to move it to the command zone.\nPress Cancel to leave it in ${ZONE_LABELS[targetZone]}.`);
    if (toCommand) targetZone = 'command';
  }

  updateState((draft) => {
    const located = findCard(instanceId, draft);
    if (!located) return;
    const card = located.container.splice(located.index, 1)[0];
    const targetPlayer = draft.players[targetPlayerId];
    const originalZone = located.zone;

    if (targetZone === 'stack') {
      card.controller = targetPlayerId;
      card.attacking = false;
      if (['hand', 'command'].includes(originalZone)) {
        const tax = originalZone === 'command' ? 2 * (targetPlayer.commanderCastCount[card.instanceId] || 0) : 0;
        targetPlayer.mana = spendMana(targetPlayer.mana, card.manaCost, tax);
        if (originalZone === 'command') targetPlayer.commanderCastCount[card.instanceId] = (targetPlayer.commanderCastCount[card.instanceId] || 0) + 1;
      }
      draft.stack.push(card);
    } else {
      card.controller = targetPlayerId;
      card.attacking = false;
      if (targetZone === 'battlefield') {
        if (isLand(card) && originalZone === 'hand') targetPlayer.landPlaysThisTurn += 1;
        if (!isLand(card) && ['hand', 'command'].includes(originalZone)) {
          const tax = originalZone === 'command' ? 2 * (targetPlayer.commanderCastCount[card.instanceId] || 0) : 0;
          targetPlayer.mana = spendMana(targetPlayer.mana, card.manaCost, tax);
          if (originalZone === 'command') targetPlayer.commanderCastCount[card.instanceId] = (targetPlayer.commanderCastCount[card.instanceId] || 0) + 1;
        }
        card.summoningSick = isCreature(card);
        card.tapped = false;
      } else {
        card.summoningSick = false;
        card.tapped = false;
      }
      if (targetZone === 'library') {
        if (libraryPosition === 'bottom') targetPlayer.zones.library.push(card);
        else targetPlayer.zones.library.unshift(card);
      } else targetPlayer.zones[targetZone].push(card);
    }
    draft.selected = { instanceId: card.instanceId };
  }, { log: `${source.card.name}: ${ZONE_LABELS[source.zone]} → ${ZONE_LABELS[targetZone]}.` });
  return { ok: true, message: 'Card moved.' };
}

export function toggleTap(instanceId) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'Only battlefield permanents can be tapped here.' };
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    located.card.tapped = !located.card.tapped;
  }, { log: `${found.card.name} ${found.card.tapped ? 'untapped' : 'tapped'}.` });
  return { ok: true };
}

export function toggleAttack(instanceId) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return { ok: false, message: 'Card not found.' };
  if (!found.card.attacking) {
    const legality = attackLegality(current, found.card);
    if (!legality.legal) {
      if (current.settings.rulesMode === 'strict') return { ok: false, message: legality.reasons.join(' ') };
      if (!confirm(`${legality.reasons.join('\n')}\n\nMark as attacking anyway?`)) return { ok: false, message: 'Cancelled.' };
    }
  }
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    located.card.attacking = !located.card.attacking;
    if (located.card.attacking) located.card.tapped = true;
  }, { log: `${found.card.name} ${found.card.attacking ? 'stopped attacking' : 'was declared as an attacker'}.` });
  return { ok: true };
}

export function addCounter(instanceId, counter, delta) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return;
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    const next = Math.max(0, Number(located.card.counters[counter] || 0) + delta);
    if (next === 0) delete located.card.counters[counter];
    else located.card.counters[counter] = next;
  }, { log: `${found.card.name}: ${delta > 0 ? 'added' : 'removed'} ${counter} counter.` });
}

export function createToken(playerId, token) {
  const card = {
    instanceId: uid('token'),
    scryfallId: null,
    name: token.name || 'Token',
    manaCost: '',
    manaValue: 0,
    typeLine: token.typeLine || 'Token Creature',
    oracleText: token.oracleText || '',
    power: String(token.power ?? 1),
    toughness: String(token.toughness ?? 1),
    keywords: token.keywords || [],
    colors: [],
    colorIdentity: [],
    legalities: {},
    image: './assets/token.svg',
    imageSmall: './assets/token.svg',
    owner: playerId,
    controller: playerId,
    tapped: Boolean(token.tapped),
    summoningSick: true,
    attacking: false,
    faceDown: false,
    token: true,
    commander: false,
    counters: {},
    notes: '',
  };
  updateState((draft) => { draft.players[playerId].zones.battlefield.push(card); }, { log: `${draftName(playerId)} created a ${card.name} token.` });
  return card;
}

function draftName(playerId) {
  return window.CommanderForge.getState().players[playerId]?.name || 'Player';
}

export function copyAsToken(instanceId) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return;
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    const copy = deepClone(located.card);
    copy.instanceId = uid('copy');
    copy.token = true;
    copy.commander = false;
    copy.tapped = false;
    copy.attacking = false;
    copy.summoningSick = isCreature(copy);
    copy.counters = {};
    draft.players[located.card.controller].zones.battlefield.push(copy);
  }, { log: `Created a token copy of ${found.card.name}.` });
}

export function adjustPlayer(playerId, field, delta) {
  updateState((draft) => {
    const player = draft.players[playerId];
    player[field] = Number(player[field] || 0) + delta;
    if (field === 'poison') player[field] = Math.max(0, player[field]);
    checkLosses(draft);
  }, { log: `${draftName(playerId)}: ${field} ${delta >= 0 ? '+' : ''}${delta}.` });
}

export function adjustCommanderDamage(targetPlayerId, sourceCardId, delta) {
  updateState((draft) => {
    const target = draft.players[targetPlayerId];
    target.commanderDamage[sourceCardId] = Math.max(0, Number(target.commanderDamage[sourceCardId] || 0) + delta);
    checkLosses(draft);
  }, { log: `${draftName(targetPlayerId)}: commander damage ${delta >= 0 ? '+' : ''}${delta}.` });
}

export function adjustMana(playerId, color, delta) {
  updateState((draft) => {
    const player = draft.players[playerId];
    player.mana[color] = Math.max(0, Number(player.mana[color] || 0) + delta);
  }, { snapshot: false });
}

export function clearMana(playerId) {
  updateState((draft) => { draft.players[playerId].mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }; }, { log: `${draftName(playerId)} cleared their mana pool.` });
}

export function draw(playerId, amount = 1) {
  updateState((draft) => { drawCards(draft, playerId, amount); }, { log: `${draftName(playerId)} drew ${amount} card${amount === 1 ? '' : 's'}.` });
}

export function mill(playerId, amount = 1) {
  updateState((draft) => {
    const player = draft.players[playerId];
    for (let i = 0; i < amount; i += 1) {
      const card = player.zones.library.shift();
      if (!card) break;
      player.zones.graveyard.push(card);
    }
  }, { log: `${draftName(playerId)} milled ${amount} card${amount === 1 ? '' : 's'}.` });
}

export function shuffleLibrary(playerId) {
  updateState((draft) => { draft.players[playerId].zones.library = shuffle(draft.players[playerId].zones.library); }, { log: `${draftName(playerId)} shuffled their library.` });
}

export function nextPhase() {
  const current = window.CommanderForge.getState();
  const nextIndex = (current.phaseIndex + 1) % PHASES.length;
  updateState((draft) => {
    if (nextIndex === 0) {
      draft.turnNumber += 1;
      draft.activePlayerId = otherPlayerId(draft, draft.activePlayerId);
      const active = draft.players[draft.activePlayerId];
      active.landPlaysThisTurn = 0;
      active.zones.battlefield.forEach((card) => {
        card.tapped = false;
        card.attacking = false;
        card.summoningSick = false;
      });
      Object.values(active.mana).forEach((_, key) => key);
      active.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    }
    draft.phaseIndex = nextIndex;
    const active = draft.players[draft.activePlayerId];
    if (PHASES[nextIndex].id === 'draw' && draft.settings.autoDraw) drawCards(draft, active.id, 1);
    if (PHASES[nextIndex].id !== 'combat') active.zones.battlefield.forEach((card) => { card.attacking = false; });
  }, { log: nextIndex === 0 ? `Turn passed to ${current.players[otherPlayerId(current, current.activePlayerId)].name}.` : `Phase: ${PHASES[nextIndex].label}.` });
}

export function setPhase(index) {
  updateState((draft) => { draft.phaseIndex = Math.max(0, Math.min(PHASES.length - 1, index)); }, { log: `Phase set to ${PHASES[index].label}.` });
}

export function switchActivePlayer() {
  const current = window.CommanderForge.getState();
  const next = otherPlayerId(current, current.activePlayerId);
  updateState((draft) => { draft.activePlayerId = next; }, { log: `${current.players[next].name} is now active.` });
}

export function resolveStackTop() {
  const current = window.CommanderForge.getState();
  const card = current.stack.at(-1);
  if (!card) return { ok: false, message: 'The stack is empty.' };
  const destination = stackDestination(card);
  updateState((draft) => {
    const resolved = draft.stack.pop();
    if (destination === 'battlefield') {
      resolved.summoningSick = isCreature(resolved);
      draft.players[resolved.controller].zones.battlefield.push(resolved);
    } else draft.players[resolved.owner].zones.graveyard.push(resolved);
  }, { log: `${card.name} resolved to ${ZONE_LABELS[destination]}.` });
  return { ok: true };
}

export function counterStackTop() {
  const current = window.CommanderForge.getState();
  const card = current.stack.at(-1);
  if (!card) return;
  const toCommand = card.commander && current.settings.confirmCommanderMoves
    ? confirm(`${card.name} was countered. Press OK for the command zone, or Cancel for the graveyard.`)
    : false;
  updateState((draft) => {
    const countered = draft.stack.pop();
    draft.players[countered.owner].zones[toCommand ? 'command' : 'graveyard'].push(countered);
  }, { log: `${card.name} was countered${toCommand ? ' and returned to the command zone' : ''}.` });
}

export function mulligan(playerId) {
  const current = window.CommanderForge.getState();
  const playerName = current.players[playerId].name;
  updateState((draft) => {
    const player = draft.players[playerId];
    player.zones.library = shuffle([...player.zones.library, ...player.zones.hand]);
    player.zones.hand = [];
    player.mulligans = Number(player.mulligans || 0) + 1;
    drawCards(draft, playerId, 7);
  }, { log: `${playerName} took mulligan ${Number(current.players[playerId].mulligans || 0) + 1}.` });
  return Math.max(0, Number(current.players[playerId].mulligans || 0));
}

export function concede(playerId) {
  const current = window.CommanderForge.getState();
  const opponentId = Object.keys(current.players).find((id) => id !== playerId);
  updateState((draft) => {
    draft.players[playerId].lost = true;
    draft.winner = opponentId;
  }, { log: `${current.players[playerId].name} conceded.` });
}

export function updateCardNote(instanceId, notes) {
  updateState((draft) => { const found = findCard(instanceId, draft); if (found) found.card.notes = notes; }, { snapshot: false });
}

export function flipCard(instanceId) {
  updateState((draft) => { const found = findCard(instanceId, draft); if (found) found.card.faceDown = !found.card.faceDown; }, { log: 'Card face changed.' });
}

export function revealTop(playerId) {
  const state = window.CommanderForge.getState();
  return state.players[playerId].zones.library[0] || null;
}

function checkLosses(draft) {
  for (const player of Object.values(draft.players)) {
    const commanderLoss = Math.max(0, ...Object.values(player.commanderDamage).map(Number)) >= 21;
    player.lost = player.life <= 0 || player.poison >= 10 || commanderLoss;
    if (player.lost) draft.winner = otherPlayerId(draft, player.id);
  }
}
