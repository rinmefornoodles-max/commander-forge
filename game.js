import { PHASES, ZONE_LABELS } from './constants.js';
import { drawCards, findCard, updateState } from './state.js';
import { recordPublicEvent, recordTurnPass, recordZoneTransition } from './knowledge.js';
import { applySpellPayment, attackLegality, landEntryPlan, moveLegality, spellCastLegality, stackDestination } from './rules.js';
import { deepClone, formatManaBundle, isCreature, isLand, manaProductionChoices, shuffle, uid } from './utils.js';

function otherPlayerId(state, playerId) {
  return Object.keys(state.players).find((id) => id !== playerId);
}

function clearCardRelations(draft, card) {
  for (const player of Object.values(draft.players)) {
    for (const permanent of player.zones.battlefield) {
      if (permanent.attachedTo === card.instanceId) permanent.attachedTo = null;
      permanent.attachments = (permanent.attachments || []).filter((id) => id !== card.instanceId);
      if (permanent.blocking === card.instanceId) permanent.blocking = null;
      permanent.blockedBy = (permanent.blockedBy || []).filter((id) => id !== card.instanceId);
    }
  }
}

export function moveCard(instanceId, targetPlayerId, targetZone, { force = false, libraryPosition = 'top' } = {}) {
  const currentState = window.CommanderForge.getState();
  const source = findCard(instanceId, currentState);
  if (!source) return { ok: false, message: 'Card not found.' };

  const targetPlayer = currentState.players[targetPlayerId];
  const castAttempt = ['hand', 'command'].includes(source.zone)
    && (targetZone === 'stack' || (targetZone === 'battlefield' && !isLand(source.card)));
  const tax = source.zone === 'command' ? 2 * (targetPlayer.commanderCastCount[source.card.instanceId] || 0) : 0;
  let autoPlan = null;
  const legalityState = currentState;
  const landPlan = source.zone === 'hand' && targetZone === 'battlefield' && isLand(source.card)
    ? landEntryPlan(source.card, targetPlayer, { opponentCount: Math.max(1, Object.keys(currentState.players).length - 1), payLife: 'auto' })
    : null;

  if (castAttempt) {
    const castLegality = spellCastLegality(currentState, targetPlayerId, source.card, source.zone, {
      useUntappedSources: currentState.settings.manaMode === 'auto',
    });
    autoPlan = castLegality.payment;
  }

  const legality = moveLegality(legalityState, source.card, source, targetPlayerId, targetZone);
  if (!legality.legal && !force) {
    if (currentState.settings.rulesMode === 'strict') return { ok: false, message: legality.reasons.join(' ') };
    const override = confirm(`${legality.reasons.join('\n')}\n\nUse a manual rules override for this move?`);
    if (!override) return { ok: false, message: 'Move cancelled.' };
  }

  if (source.card.commander && source.zone !== 'command' && ['graveyard', 'exile', 'hand', 'library'].includes(targetZone) && currentState.settings.confirmCommanderMoves) {
    const toCommand = confirm(`${source.card.name} is a commander.\n\nPress OK to move it to the command zone.\nPress Cancel to leave it in ${ZONE_LABELS[targetZone]}.`);
    if (toCommand) targetZone = 'command';
  }

  const autoManaText = autoPlan?.sources?.length
    ? ` Auto-paid by tapping ${autoPlan.sources.map((item) => `${item.name} for ${item.label || formatManaBundle(item.mana)}`).join(', ')}.`
    : '';
  const landEntryText = landPlan
    ? ` ${landPlan.tapped ? 'Entered tapped' : 'Entered untapped'}${landPlan.lifePaid ? ` after paying ${landPlan.lifePaid} life` : ''}.`
    : '';

  updateState((draft) => {
    const located = findCard(instanceId, draft);
    if (!located) return;
    const card = located.container.splice(located.index, 1)[0];
    const destinationPlayer = draft.players[targetPlayerId];
    const originalZone = located.zone;

    if (castAttempt && autoPlan?.ok) applySpellPayment(draft, targetPlayerId, autoPlan);

    if (targetZone === 'stack') {
      card.controller = targetPlayerId;
      card.attacking = false;
      if (['hand', 'command'].includes(originalZone)) {
        if (originalZone === 'command') destinationPlayer.commanderCastCount[card.instanceId] = (destinationPlayer.commanderCastCount[card.instanceId] || 0) + 1;
      }
      draft.stack.push(card);
      draft.priorityPlayerId = targetPlayerId;
      draft.consecutivePasses = 0;
    } else {
      card.controller = targetPlayerId;
      card.attacking = false;
      if (targetZone === 'battlefield') {
        if (isLand(card) && originalZone === 'hand') destinationPlayer.landPlaysThisTurn += 1;
        if (!isLand(card) && ['hand', 'command'].includes(originalZone)) {
              if (originalZone === 'command') destinationPlayer.commanderCastCount[card.instanceId] = (destinationPlayer.commanderCastCount[card.instanceId] || 0) + 1;
        }
        card.summoningSick = isCreature(card);
        if (isLand(card) && originalZone === 'hand' && landPlan) {
          card.tapped = Boolean(landPlan.tapped);
          destinationPlayer.life -= Number(landPlan.lifePaid || 0);
        } else card.tapped = false;
      } else {
        card.summoningSick = false;
        card.tapped = false;
      }
      if (targetZone === 'library') {
        if (libraryPosition === 'bottom') destinationPlayer.zones.library.push(card);
        else destinationPlayer.zones.library.unshift(card);
      } else destinationPlayer.zones[targetZone].push(card);
    }
    if (originalZone === 'battlefield' && targetZone !== 'battlefield') clearCardRelations(draft, card);
    recordZoneTransition(draft, {
      card,
      actorId: targetPlayerId,
      subjectPlayerId: card.owner,
      fromZone: originalZone,
      toZone: targetZone,
      libraryPosition,
      castAttempt,
    });
    draft.selected = { instanceId: card.instanceId };
  }, { log: `${source.card.name}: ${ZONE_LABELS[source.zone]} → ${ZONE_LABELS[targetZone]}.${autoManaText}${landEntryText}` });
  return { ok: true, message: autoManaText ? autoManaText.trim() : 'Card moved.' };
}

export function tapForMana(instanceId, choiceIndex = 0) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'Only battlefield permanents can produce mana here.' };
  if (found.card.tapped) return { ok: false, message: `${found.card.name} is already tapped.` };
  const choices = manaProductionChoices(found.card);
  const choice = choices[Number(choiceIndex)];
  if (!choice) return { ok: false, message: `${found.card.name} does not have that listed mana choice.` };
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    located.card.tapped = true;
    const player = draft.players[located.card.controller];
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
      player.mana[color] = Number(player.mana[color] || 0) + Number(choice.mana?.[color] || 0);
    }
  }, { log: `${found.card.name} tapped for ${choice.label || formatManaBundle(choice.mana)}.` });
  return { ok: true, message: `Added ${choice.label || formatManaBundle(choice.mana)} mana.` };
}

export function toggleTap(instanceId, { mana = true } = {}) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'Only battlefield permanents can be tapped here.' };
  if (!found.card.tapped && mana && ['assisted', 'auto'].includes(current.settings.manaMode)) {
    const choices = manaProductionChoices(found.card);
    if (choices.length === 1) return tapForMana(instanceId, 0);
    if (choices.length > 1) return { ok: false, message: `Choose ${choices.map((choice) => choice.label).join(' or ')} from the card menu.` };
  }
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
    located.card.blocking = null;
    if (located.card.attacking) {
      located.card.tapped = true;
      recordPublicEvent(draft, {
        type: 'attack',
        actorId: located.card.controller,
        subjectPlayerId: located.card.controller,
        card: located.card,
        cards: [located.card],
        meaningful: true,
      });
    } else {
      recordPublicEvent(draft, {
        type: 'attack_cancelled',
        actorId: located.card.controller,
        subjectPlayerId: located.card.controller,
        card: located.card,
      });
    }
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
    image: './token.svg',
    imageSmall: './token.svg',
    owner: playerId,
    controller: playerId,
    tapped: Boolean(token.tapped),
    summoningSick: true,
    attacking: false,
    blocking: null,
    blockedBy: [],
    faceDown: false,
    token: true,
    commander: false,
    counters: {},
    notes: '',
    attachedTo: null,
    attachments: [],
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
    copy.blocking = null;
    copy.blockedBy = [];
    copy.attachedTo = null;
    copy.attachments = [];
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
      recordPublicEvent(draft, {
        type: 'milled',
        actorId: playerId,
        subjectPlayerId: playerId,
        card,
        fromZone: 'library',
        toZone: 'graveyard',
        meaningful: true,
      });
    }
  }, { log: `${draftName(playerId)} milled ${amount} card${amount === 1 ? '' : 's'}.` });
}

export function shuffleLibrary(playerId) {
  updateState((draft) => {
    draft.players[playerId].zones.library = shuffle(draft.players[playerId].zones.library);
    recordPublicEvent(draft, {
      type: 'shuffled',
      actorId: playerId,
      subjectPlayerId: playerId,
      meaningful: true,
    });
  }, { log: `${draftName(playerId)} shuffled their library.` });
}

export function nextPhase() {
  const current = window.CommanderForge.getState();
  const nextIndex = (current.phaseIndex + 1) % PHASES.length;
  updateState((draft) => {
    if (nextIndex === 0) {
      recordTurnPass(draft, draft.activePlayerId);
      draft.turnNumber += 1;
      draft.activePlayerId = otherPlayerId(draft, draft.activePlayerId);
      const active = draft.players[draft.activePlayerId];
      active.landPlaysThisTurn = 0;
      active.zones.battlefield.forEach((card) => {
        card.tapped = false;
        card.attacking = false;
        card.blocking = null;
        card.blockedBy = [];
        card.summoningSick = false;
        card.damageMarked = 0;
        card.deathtouchDamaged = false;
      });
      Object.values(active.mana).forEach((_, key) => key);
      active.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    }
    draft.phaseIndex = nextIndex;
    const active = draft.players[draft.activePlayerId];
    if (PHASES[nextIndex].id === 'draw' && draft.settings.autoDraw) drawCards(draft, active.id, 1);
    if (PHASES[nextIndex].id !== 'combat') active.zones.battlefield.forEach((card) => { card.attacking = false; card.blocking = null; card.blockedBy = []; });
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
    draft.priorityPlayerId = draft.activePlayerId;
    draft.consecutivePasses = 0;
    recordPublicEvent(draft, {
      type: 'resolved',
      actorId: resolved.controller,
      subjectPlayerId: resolved.owner,
      card: resolved,
      fromZone: 'stack',
      toZone: destination,
      meaningful: true,
    });
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
    const destination = toCommand ? 'command' : 'graveyard';
    draft.players[countered.owner].zones[destination].push(countered);
    draft.priorityPlayerId = draft.activePlayerId;
    draft.consecutivePasses = 0;
    recordPublicEvent(draft, {
      type: 'countered',
      actorId: countered.controller,
      subjectPlayerId: countered.owner,
      card: countered,
      fromZone: 'stack',
      toZone: destination,
      meaningful: true,
    });
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


export function revealTopPublicly(playerId) {
  const current = window.CommanderForge.getState();
  const card = current.players[playerId]?.zones.library?.[0];
  if (!card) return { ok: false, message: 'The library is empty.' };
  updateState((draft) => {
    const top = draft.players[playerId].zones.library[0];
    recordPublicEvent(draft, {
      type: 'revealed',
      actorId: playerId,
      subjectPlayerId: playerId,
      card: top,
      zone: 'library',
      position: 'top',
      meaningful: true,
    });
    draft.knowledge.players[playerId].knownLibraryTop = [{ card: { ...top }, turn: draft.turnNumber, reason: 'revealed' }];
  }, { log: `${draftName(playerId)} publicly revealed ${card.name} from the top of their library.` });
  return { ok: true, card };
}

export function revealCardPublicly(instanceId) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return { ok: false, message: 'Card not found.' };
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    recordPublicEvent(draft, {
      type: located.zone === 'hand' ? 'revealed_in_hand' : 'revealed',
      actorId: located.card.controller,
      subjectPlayerId: located.card.owner,
      card: located.card,
      zone: located.zone,
      meaningful: true,
    });
  }, { log: `${found.card.name} was publicly revealed from ${found.zone}.` });
  return { ok: true };
}

export function assignBlocker(blockerId, attackerId) {
  const current = window.CommanderForge.getState();
  const blocker = findCard(blockerId, current);
  const attacker = findCard(attackerId, current);
  if (!blocker || !attacker || blocker.zone !== 'battlefield' || attacker.zone !== 'battlefield') return { ok: false, message: 'Both cards must be on the battlefield.' };
  if (!attacker.card.attacking) return { ok: false, message: `${attacker.card.name} is not marked as attacking.` };
  updateState((draft) => {
    const draftBlocker = findCard(blockerId, draft).card;
    const draftAttacker = findCard(attackerId, draft).card;
    if (draftBlocker.blocking === attackerId) {
      draftBlocker.blocking = null;
      draftAttacker.blockedBy = (draftAttacker.blockedBy || []).filter((id) => id !== blockerId);
      recordPublicEvent(draft, { type: 'block_cancelled', actorId: draftBlocker.controller, subjectPlayerId: draftBlocker.controller, card: draftBlocker, targetCard: draftAttacker });
    } else {
      if (draftBlocker.blocking) {
        const prior = findCard(draftBlocker.blocking, draft);
        if (prior) prior.card.blockedBy = (prior.card.blockedBy || []).filter((id) => id !== blockerId);
      }
      draftBlocker.blocking = attackerId;
      draftAttacker.blockedBy ||= [];
      if (!draftAttacker.blockedBy.includes(blockerId)) draftAttacker.blockedBy.push(blockerId);
      recordPublicEvent(draft, {
        type: 'block',
        actorId: draftBlocker.controller,
        subjectPlayerId: draftBlocker.controller,
        card: draftBlocker,
        targetCard: draftAttacker,
        meaningful: true,
      });
    }
  }, { log: `${blocker.card.name} ${blocker.card.blocking === attackerId ? 'stopped blocking' : `blocks ${attacker.card.name}`}.` });
  return { ok: true };
}

export function attachCard(instanceId, targetId) {
  const current = window.CommanderForge.getState();
  const source = findCard(instanceId, current);
  const target = findCard(targetId, current);
  if (!source || !target || source.zone !== 'battlefield' || target.zone !== 'battlefield') return { ok: false, message: 'Both cards must be on the battlefield.' };
  updateState((draft) => {
    const attachment = findCard(instanceId, draft).card;
    const permanent = findCard(targetId, draft).card;
    if (attachment.attachedTo) {
      const prior = findCard(attachment.attachedTo, draft);
      if (prior) prior.card.attachments = (prior.card.attachments || []).filter((id) => id !== instanceId);
    }
    attachment.attachedTo = targetId;
    permanent.attachments ||= [];
    if (!permanent.attachments.includes(instanceId)) permanent.attachments.push(instanceId);
    recordPublicEvent(draft, {
      type: 'attached',
      actorId: attachment.controller,
      subjectPlayerId: attachment.controller,
      card: attachment,
      targetCard: permanent,
      meaningful: true,
    });
  }, { log: `${source.card.name} attached to ${target.card.name}.` });
  return { ok: true };
}

function checkLosses(draft) {
  for (const player of Object.values(draft.players)) {
    const commanderLoss = Math.max(0, ...Object.values(player.commanderDamage).map(Number)) >= 21;
    player.lost = player.life <= 0 || player.poison >= 10 || commanderLoss;
    if (player.lost) draft.winner = otherPlayerId(draft, player.id);
  }
}
