import { PHASES } from './constants.js';
import { hasFlash, isCreature, isLand, isPermanent, manaRequirement, totalMana } from './utils.js';

export function validateDeck(entries, byName, commanderNames = []) {
  const errors = [];
  const warnings = [];
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total !== 100) errors.push(`Commander decks need exactly 100 cards including the commander. This list has ${total}.`);
  const unknown = entries.filter((entry) => !byName[entry.name.toLocaleLowerCase()]);
  if (unknown.length) errors.push(`Unknown card${unknown.length === 1 ? '' : 's'}: ${unknown.map((entry) => entry.name).join(', ')}.`);
  if (!commanderNames.length) errors.push('Choose at least one commander.');
  if (commanderNames.length > 2) errors.push('This build supports at most two commanders.');

  const commanders = commanderNames.map((name) => byName[name.toLocaleLowerCase()]).filter(Boolean);
  const identity = new Set(commanders.flatMap((card) => card.colorIdentity || []));
  for (const entry of entries) {
    const card = byName[entry.name.toLocaleLowerCase()];
    if (!card) continue;
    const isBasic = card.typeLine.includes('Basic Land');
    const anyNumber = /deck can have any number of cards named/i.test(card.oracleText || '');
    const upTo = (card.oracleText || '').match(/deck can have up to (\w+) cards named/i);
    if (entry.count > 1 && !isBasic && !anyNumber && !upTo) errors.push(`${card.name} appears ${entry.count} times, but Commander is singleton.`);
    const offColor = (card.colorIdentity || []).filter((color) => !identity.has(color));
    if (commanders.length && offColor.length) errors.push(`${card.name} has ${offColor.join('/')} in its color identity, outside the selected commander identity.`);
    if (card.legalities?.commander === 'banned') errors.push(`${card.name} is banned in Commander.`);
    if (card.legalities?.commander === 'not_legal') warnings.push(`${card.name} is marked not legal in Commander by Scryfall.`);
  }

  for (const commander of commanders) {
    const eligible = commander.typeLine.includes('Legendary Creature') || /can be your commander/i.test(commander.oracleText || '');
    if (!eligible) errors.push(`${commander.name} is not normally eligible to be a commander.`);
  }
  if (commanders.length === 2) warnings.push('Two-commander pairing rules such as Partner, Background, and Friends forever are not fully validated yet.');
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], total, identity: [...identity] };
}

export function commanderCandidates(cards) {
  return cards.filter((card) => card.typeLine.includes('Legendary Creature') || /can be your commander/i.test(card.oracleText || ''));
}

export function moveLegality(state, card, source, targetPlayerId, targetZone) {
  const mode = state.settings.rulesMode;
  if (mode === 'free') return { legal: true, reasons: [] };
  const reasons = [];
  const active = state.activePlayerId;
  const phase = PHASES[state.phaseIndex].id;
  const controller = card.controller || source.playerId;
  const targetPlayer = state.players[targetPlayerId];

  if (targetZone === 'command' && !card.commander) reasons.push('Only a designated commander should be placed in the command zone.');
  if (targetZone === 'battlefield' && source.zone === 'hand') {
    if (!isLand(card) && !isPermanent(card)) reasons.push('Instants and sorceries are cast onto the stack, not placed directly onto the battlefield.');
    if (controller !== active) reasons.push('You normally cast spells only when that player is active.');
    if (isLand(card)) {
      if (!['main1', 'main2'].includes(phase)) reasons.push('A land can normally be played only during a main phase.');
      if (targetPlayer.landPlaysThisTurn >= 1) reasons.push('That player has already used the normal land play for this turn.');
    } else {
      const instantSpeed = card.typeLine.includes('Instant') || hasFlash(card);
      if (!instantSpeed && !['main1', 'main2'].includes(phase)) reasons.push('This spell normally requires main-phase timing.');
      const tax = source.zone === 'command' ? 2 * (targetPlayer.commanderCastCount[card.instanceId] || 0) : 0;
      const payment = canPayMana(targetPlayer.mana, card.manaCost, tax);
      if (!payment.ok) reasons.push(payment.reason);
    }
  }
  if (targetZone === 'battlefield' && source.zone === 'command') {
    if (controller !== active) reasons.push('You normally cast your commander while that player is active.');
    const instantSpeed = hasFlash(card);
    if (!instantSpeed && !['main1', 'main2'].includes(phase)) reasons.push('The commander normally requires main-phase timing.');
    const tax = 2 * (targetPlayer.commanderCastCount[card.instanceId] || 0);
    const payment = canPayMana(targetPlayer.mana, card.manaCost, tax);
    if (!payment.ok) reasons.push(payment.reason);
  }

  if (targetZone === 'stack' && ['hand', 'command'].includes(source.zone)) {
    if (isLand(card)) reasons.push('Lands are played, not cast onto the stack.');
    if (controller !== active) reasons.push('You normally cast spells only while that player has priority.');
    const instantSpeed = card.typeLine.includes('Instant') || hasFlash(card);
    if (!instantSpeed && !['main1', 'main2'].includes(phase)) reasons.push('This spell normally requires main-phase timing.');
    const tax = source.zone === 'command' ? 2 * (targetPlayer.commanderCastCount[card.instanceId] || 0) : 0;
    const payment = canPayMana(targetPlayer.mana, card.manaCost, tax);
    if (!payment.ok) reasons.push(payment.reason);
  }
  if (['graveyard', 'exile', 'library'].includes(source.zone) && !['graveyard', 'exile', 'library'].includes(targetZone)) {
    reasons.push(`Moving a card from ${source.zone} to ${targetZone} normally requires a card effect. Use an override when resolving that effect manually.`);
  }
  return { legal: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function canPayMana(pool, manaCost, tax = 0) {
  const req = manaRequirement(manaCost, tax);
  const working = { ...pool };
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
    if ((working[color] || 0) < req[color]) return { ok: false, reason: `Not enough ${color} mana for ${manaCost || 'this cost'}${tax ? ` plus ${tax} commander tax` : ''}.` };
    working[color] -= req[color];
  }
  for (const choices of req.flexible) {
    const available = choices.find((color) => (working[color] || 0) > 0);
    if (!available) return { ok: false, reason: `The mana pool cannot satisfy ${manaCost}.` };
    working[available] -= 1;
  }
  if (totalMana(working) < req.generic) return { ok: false, reason: `Not enough total mana for ${manaCost || 'this cost'}${tax ? ` plus ${tax} commander tax` : ''}.` };
  return { ok: true, reason: '' };
}

export function spendMana(pool, manaCost, tax = 0) {
  const req = manaRequirement(manaCost, tax);
  const next = { ...pool };
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) next[color] = Math.max(0, next[color] - req[color]);
  for (const choices of req.flexible) {
    const available = choices.find((color) => next[color] > 0);
    if (available) next[available] -= 1;
  }
  let generic = req.generic;
  for (const color of ['C', 'W', 'U', 'B', 'R', 'G']) {
    const amount = Math.min(next[color], generic);
    next[color] -= amount;
    generic -= amount;
  }
  return next;
}

export function attackLegality(state, card) {
  const reasons = [];
  if (!isCreature(card)) reasons.push('Only creatures can attack.');
  if (card.tapped) reasons.push('Tapped creatures cannot attack.');
  if (card.summoningSick && !(card.keywords || []).includes('Haste')) reasons.push('This creature has summoning sickness and does not have haste.');
  if (card.controller !== state.activePlayerId) reasons.push('Only the active player declares attackers.');
  if (PHASES[state.phaseIndex].id !== 'combat') reasons.push('Attackers are normally declared during combat.');
  return { legal: reasons.length === 0, reasons };
}

export function recognizedEffects(card) {
  const text = card?.oracleText || '';
  const effects = [];
  if (/draw (?:a|one|two|three|four|five|\d+) cards?/i.test(text)) effects.push('Draw cards');
  if (/destroy target/i.test(text)) effects.push('Targeted destruction');
  if (/exile target/i.test(text)) effects.push('Targeted exile');
  if (/create .* token/i.test(text)) effects.push('Creates token');
  if (/search your library/i.test(text)) effects.push('Searches library');
  if (/mill (?:a|one|two|three|four|five|\d+)/i.test(text)) effects.push('Mills cards');
  if (/counter target spell/i.test(text)) effects.push('Counters a spell');
  if (/return target .* to (?:its owner's|your) hand/i.test(text)) effects.push('Returns a permanent/card');
  if (/when(?:ever)? .* enters/i.test(text)) effects.push('Triggered ability');
  return effects;
}

export function stackDestination(card) {
  return isPermanent(card) ? 'battlefield' : 'graveyard';
}
