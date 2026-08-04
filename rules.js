import { PHASES } from './constants.js';
import { hasFlash, isCreature, isLand, isPermanent, manaRequirement, totalMana, untappedManaSources } from './utils.js';

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
    const available = choices
      .filter((color) => next[color] > 0)
      .sort((a, b) => Number(next[b] || 0) - Number(next[a] || 0))[0];
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


export function planManaPayment(player, manaCost, tax = 0) {
  const requirement = manaRequirement(manaCost, tax);
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(player?.mana || {}) };
  if (canPayMana(pool, manaCost, tax).ok) return { ok: true, sources: [], projectedPool: pool };

  const sources = untappedManaSources(player).map((source) => ({ ...source, used: false }));
  const selected = [];
  const working = { ...pool };

  const addBundle = (mana) => {
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
      working[color] = Number(working[color] || 0) + Number(mana?.[color] || 0);
    }
  };

  const chooseSource = (allowedColors, preference = null) => {
    const candidates = [];
    for (const source of sources) {
      if (source.used) continue;
      for (let choiceIndex = 0; choiceIndex < source.choices.length; choiceIndex += 1) {
        const choice = source.choices[choiceIndex];
        const relevant = allowedColors.reduce((sum, color) => sum + Number(choice.mana?.[color] || 0), 0);
        if (!relevant) continue;
        const needScore = allowedColors.reduce((sum, color) => {
          const unmet = Math.max(0, Number(preference?.[color] || 0) - Number(working[color] || 0));
          return sum + Math.min(unmet, Number(choice.mana?.[color] || 0)) * 8;
        }, 0);
        const total = Object.values(choice.mana || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
        const flexibilityPenalty = source.choices.length * 0.18;
        candidates.push({ source, choice, choiceIndex, rank: needScore + relevant * 2 + total - flexibilityPenalty });
      }
    }
    candidates.sort((a, b) => b.rank - a.rank);
    const pick = candidates[0];
    if (!pick) return false;
    pick.source.used = true;
    addBundle(pick.choice.mana);
    selected.push({
      instanceId: pick.source.card.instanceId,
      name: pick.source.card.name,
      choiceIndex: pick.choiceIndex,
      mana: { ...pick.choice.mana },
      label: pick.choice.label,
    });
    return true;
  };

  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
    while (Number(working[color] || 0) < Number(requirement[color] || 0)) {
      if (!chooseSource([color], requirement)) {
        return { ok: false, sources: [], projectedPool: pool, reason: `No untapped source can produce enough ${color} mana.` };
      }
    }
  }

  const spendableAfterFixed = () => {
    const spendable = { ...working };
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) spendable[color] -= Number(requirement[color] || 0);
    return spendable;
  };

  const flexibleSpent = [];
  for (const choices of requirement.flexible) {
    let spendable = spendableAfterFixed();
    for (const prior of flexibleSpent) spendable[prior] -= 1;
    let chosen = choices
      .filter((color) => Number(spendable[color] || 0) > 0)
      .sort((a, b) => Number(spendable[b] || 0) - Number(spendable[a] || 0))[0];
    if (!chosen) {
      if (!chooseSource(choices, requirement)) {
        return { ok: false, sources: [], projectedPool: pool, reason: `No untapped source can satisfy ${choices.join('/')} mana.` };
      }
      spendable = spendableAfterFixed();
      for (const prior of flexibleSpent) spendable[prior] -= 1;
      chosen = choices
        .filter((color) => Number(spendable[color] || 0) > 0)
        .sort((a, b) => Number(spendable[b] || 0) - Number(spendable[a] || 0))[0];
    }
    if (!chosen) return { ok: false, sources: [], projectedPool: pool, reason: 'Could not satisfy a hybrid mana symbol.' };
    flexibleSpent.push(chosen);
  }

  const genericAvailable = () => {
    const spendable = spendableAfterFixed();
    for (const color of flexibleSpent) spendable[color] -= 1;
    return totalMana(spendable);
  };

  while (genericAvailable() < requirement.generic) {
    if (!chooseSource(['C', 'W', 'U', 'B', 'R', 'G'])) {
      return { ok: false, sources: [], projectedPool: pool, reason: 'Not enough untapped mana sources for the generic cost.' };
    }
  }

  const finalCheck = canPayMana(working, manaCost, tax);
  return finalCheck.ok
    ? { ok: true, sources: selected, projectedPool: working }
    : { ok: false, sources: [], projectedPool: pool, reason: finalCheck.reason };
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
