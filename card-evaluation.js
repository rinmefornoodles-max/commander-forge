import { isCreature, numericStat } from './utils.js';

const KEYWORD_ALIASES = {
  'double strike': 'doubleStrike',
  'first strike': 'firstStrike',
  flying: 'flying',
  reach: 'reach',
  menace: 'menace',
  deathtouch: 'deathtouch',
  trample: 'trample',
  lifelink: 'lifelink',
  indestructible: 'indestructible',
  hexproof: 'hexproof',
  ward: 'ward',
  protection: 'protection',
  vigilance: 'vigilance',
  haste: 'haste',
  flash: 'flash',
  defender: 'defender',
  shroud: 'shroud',
};

function oracle(card) {
  return String(card?.oracleText || card?.oracle_text || '').replace(/\u2212/g, '-');
}

function typeLine(card) {
  return String(card?.typeLine || card?.type_line || '');
}

function keywordSet(card) {
  const set = new Set((card?.keywords || []).map((keyword) => String(keyword).toLocaleLowerCase()));
  const text = oracle(card).toLocaleLowerCase();
  for (const keyword of Object.keys(KEYWORD_ALIASES)) {
    if (new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'i').test(text)) set.add(keyword);
  }
  if (/can't be blocked/i.test(text)) set.add('unblockable');
  return set;
}

function parseWard(text) {
  const match = text.match(/ward\s*[—-]?\s*(\{[^}]+\}|\d+|pay\s+\d+\s+life)/i);
  return match?.[1] || '';
}

function parseAnthem(text) {
  const matches = [...text.matchAll(/(?:other\s+)?(?:[A-Za-z]+\s+)?creatures you control get \+([0-9]+)\/\+([0-9]+)/gi)];
  return matches.reduce((best, match) => ({
    power: Math.max(best.power, Number(match[1] || 0)),
    toughness: Math.max(best.toughness, Number(match[2] || 0)),
  }), { power: 0, toughness: 0 });
}

export function cardTraits(card) {
  const text = oracle(card);
  const type = typeLine(card);
  const keywords = keywordSet(card);
  const instant = /\bInstant\b/.test(type);
  const aura = /\bAura\b/.test(type);
  const equipment = /\bEquipment\b/.test(type);
  const creature = isCreature(card);

  const traits = {
    creature,
    instant,
    aura,
    equipment,
    flying: keywords.has('flying'),
    reach: keywords.has('reach'),
    menace: keywords.has('menace'),
    deathtouch: keywords.has('deathtouch'),
    firstStrike: keywords.has('first strike'),
    doubleStrike: keywords.has('double strike'),
    trample: keywords.has('trample'),
    lifelink: keywords.has('lifelink'),
    indestructible: keywords.has('indestructible'),
    hexproof: keywords.has('hexproof'),
    ward: keywords.has('ward'),
    wardCost: parseWard(text),
    protection: keywords.has('protection'),
    vigilance: keywords.has('vigilance'),
    haste: keywords.has('haste'),
    flash: keywords.has('flash'),
    defender: keywords.has('defender'),
    shroud: keywords.has('shroud'),
    unblockable: keywords.has('unblockable'),
    deathTrigger: /whenever .* dies|when .* dies|put into a graveyard from the battlefield/i.test(text),
    attackTrigger: /whenever .* attacks|when .* attacks|at the beginning of combat/i.test(text),
    combatDamageTrigger: /whenever .* deals combat damage|combat damage to (?:a player|an opponent)/i.test(text),
    enterTrigger: /when(?:ever)? .* enters(?: the battlefield)?/i.test(text),
    activatedAbility: /(?:^|\n)[^\n.]{0,120}:\s/i.test(text),
    tapAbility: /\{T\}\s*:/i.test(text),
    staticEffect: /creatures you control get|other .* get|players can't|spells .* cost|you may|each opponent|cards? in .* have/i.test(text),
    draw: /draw (?:a|one|two|three|four|five|six|\d+) cards?/i.test(text),
    tutor: /search (?:your|target player's) library/i.test(text),
    tokenMaker: /create .* token/i.test(text),
    recursion: /return target .* card from .*graveyard|cast .* from your graveyard|from your graveyard to/i.test(text),
    sacrificeValue: /sacrifice .*:/i.test(text) || /whenever you sacrifice/i.test(text),
    graveyardInteraction: /exile target card from a graveyard|cards? in graveyards? can't|target player's graveyard|graveyard to exile/i.test(text),
    counterspell: /counter target (?:spell|activated ability|triggered ability)/i.test(text),
    boardWipe: /destroy all|exile all|all creatures get -\d+\/-\d+|deals? \d+ damage to each creature|return all .* to their owners?' hands/i.test(text),
    targetedRemoval: /destroy target|exile target|return target .* to (?:its owner's|their owner's|your) hand|target creature gets -\d+\/-\d+|deals? \d+ damage to target creature/i.test(text),
    protectionSpell: instant && /gains? (?:hexproof|indestructible|protection)|phase[s]? out|regenerate target/i.test(text),
    combatTrick: instant && /gets? \+[0-9X]+\/\+[0-9X]+|gains? (?:first strike|double strike|trample|deathtouch|lifelink|flying)/i.test(text),
    flashThreat: creature && (keywords.has('flash') || /you may cast .* as though it had flash/i.test(text)),
    anthem: parseAnthem(text),
  };
  traits.interactionCategories = [
    traits.counterspell && 'counterspell',
    traits.targetedRemoval && 'removal',
    traits.boardWipe && 'boardWipe',
    traits.combatTrick && 'combatTrick',
    traits.protectionSpell && 'protection',
    traits.graveyardInteraction && 'graveyardInteraction',
    traits.flashThreat && 'flashThreat',
  ].filter(Boolean);
  return traits;
}

export function effectiveStats(card, battlefield = []) {
  const counters = card?.counters || {};
  let power = numericStat(card?.power, 0) + Number(counters['+1/+1'] || 0) - Number(counters['-1/-1'] || 0);
  let toughness = numericStat(card?.toughness, 0) + Number(counters['+1/+1'] || 0) - Number(counters['-1/-1'] || 0);
  for (const permanent of battlefield) {
    if (permanent.instanceId === card?.instanceId) continue;
    const traits = cardTraits(permanent);
    power += Number(traits.anthem.power || 0);
    toughness += Number(traits.anthem.toughness || 0);
  }
  return { power, toughness };
}

export function canBlock(attacker, blocker, battlefield = []) {
  if (!isCreature(blocker) || blocker.tapped) return false;
  const attackTraits = cardTraits(attacker);
  const blockTraits = cardTraits(blocker);
  if (attackTraits.unblockable) return false;
  if (attackTraits.flying && !(blockTraits.flying || blockTraits.reach)) return false;
  if (/can't block/i.test(oracle(blocker))) return false;
  return effectiveStats(blocker, battlefield).toughness > 0;
}

export function combatOutcome(attacker, blockers = [], attackerBattlefield = [], blockerBattlefield = []) {
  const attackTraits = cardTraits(attacker);
  const attackerStats = effectiveStats(attacker, attackerBattlefield);
  const legalBlockers = blockers.filter((blocker) => canBlock(attacker, blocker, blockerBattlefield));
  if (!legalBlockers.length || (attackTraits.menace && legalBlockers.length < 2)) {
    return {
      playerDamage: Math.max(0, attackerStats.power),
      attackerDies: false,
      blockersDie: [],
      lifelinkGain: attackTraits.lifelink ? Math.max(0, attackerStats.power) : 0,
      unblocked: true,
    };
  }

  const blockersDie = [];
  let remainingPower = Math.max(0, attackerStats.power);
  let blockerCanDealBack = true;
  for (const blocker of legalBlockers) {
    const blockTraits = cardTraits(blocker);
    const blockerStats = effectiveStats(blocker, blockerBattlefield);
    const lethalNeeded = attackTraits.deathtouch && remainingPower > 0 ? 1 : Math.max(0, blockerStats.toughness);
    const killsBlocker = remainingPower >= lethalNeeded && !blockTraits.indestructible;
    if (killsBlocker) blockersDie.push(blocker.instanceId);
    remainingPower = Math.max(0, remainingPower - lethalNeeded);
    if ((attackTraits.firstStrike || attackTraits.doubleStrike) && killsBlocker && !blockTraits.firstStrike && !blockTraits.doubleStrike) {
      blockerCanDealBack = false;
    }
  }

  let returnDamage = 0;
  let returnDeathtouch = false;
  if (blockerCanDealBack || attackTraits.doubleStrike) {
    for (const blocker of legalBlockers) {
      const blockTraits = cardTraits(blocker);
      const blockerStats = effectiveStats(blocker, blockerBattlefield);
      returnDamage += Math.max(0, blockerStats.power) * (blockTraits.doubleStrike ? 2 : 1);
      if (blockTraits.deathtouch && blockerStats.power > 0) returnDeathtouch = true;
    }
  }
  const attackerDies = !attackTraits.indestructible
    && (returnDeathtouch || returnDamage >= Math.max(0, attackerStats.toughness));
  const playerDamage = attackTraits.trample ? Math.max(0, remainingPower) * (attackTraits.doubleStrike ? 2 : 1) : 0;
  return {
    playerDamage,
    attackerDies,
    blockersDie,
    lifelinkGain: attackTraits.lifelink ? Math.max(0, attackerStats.power - remainingPower + playerDamage) : 0,
    unblocked: false,
  };
}

export function permanentValue(card, friendlyBattlefield = [], opposingBattlefield = [], context = {}) {
  const traits = cardTraits(card);
  const stats = effectiveStats(card, friendlyBattlefield);
  let value = Number(card?.manaValue || 0) * 0.9;
  if (traits.creature) {
    value += stats.power * 0.82 + stats.toughness * 0.58;
    if (traits.flying) {
      const flyingBlocks = opposingBattlefield.filter((blocker) => {
        const t = cardTraits(blocker);
        return !blocker.tapped && (t.flying || t.reach);
      }).length;
      value += flyingBlocks ? 0.9 : 2.2;
    }
    if (traits.reach) value += opposingBattlefield.some((opponent) => cardTraits(opponent).flying) ? 1.4 : 0.45;
    if (traits.menace) value += opposingBattlefield.filter((blocker) => isCreature(blocker) && !blocker.tapped).length < 2 ? 1.8 : 0.8;
    if (traits.deathtouch) value += stats.power <= 2 ? 2.4 : 1.4;
    if (traits.firstStrike) value += 1.0;
    if (traits.doubleStrike) value += 2.6 + Math.max(0, stats.power) * 0.28;
    if (traits.trample) value += 1.1;
    if (traits.lifelink) value += context.lowLife ? 2.0 : 1.0;
    if (traits.indestructible) value += 2.4;
    if (traits.hexproof || traits.shroud) value += 1.8;
    if (traits.ward) value += 1.15;
    if (traits.protection) value += 1.35;
    if (traits.vigilance) value += 0.7;
    if (traits.haste) value += card?.summoningSick ? 1.2 : 0.45;
    if (traits.deathTrigger) value += 1.65;
    if (traits.attackTrigger) value += 1.7;
    if (traits.combatDamageTrigger) value += traits.flying || traits.unblockable ? 2.2 : 1.2;
    if (traits.activatedAbility) value += 1.15;
    if (card?.summoningSick && !traits.haste) value -= 0.25;
  }
  if (traits.equipment || traits.aura) value += 1.2;
  if (traits.staticEffect) value += 1.5;
  if (traits.anthem.power || traits.anthem.toughness) value += 1.5 + friendlyBattlefield.filter(isCreature).length * 0.45;
  if (traits.draw) value += 1.25;
  if (traits.tutor) value += 1.7;
  if (traits.tokenMaker) value += 1.25;
  if (traits.recursion) value += 1.15;
  if (traits.sacrificeValue) value += 0.8;
  if (traits.targetedRemoval) value += 1.3;
  if (traits.boardWipe) value += 2.1;
  if (traits.counterspell) value += 1.25;
  if (card?.commander) value += 1.7;
  if (card?.token) value -= 0.15;
  if (card?.tapped) value -= traits.vigilance ? 0.1 : 0.45;
  if (card?.faceDown) value *= 0.8;
  value += Object.values(card?.counters || {}).reduce((sum, amount) => sum + Math.abs(Number(amount || 0)) * 0.28, 0);
  if (card?.attachedTo) value += 0.6;
  return value;
}

export function combatTradeScore(attacker, blockers, attackerBattlefield = [], blockerBattlefield = []) {
  const outcome = combatOutcome(attacker, blockers, attackerBattlefield, blockerBattlefield);
  const attackerValue = permanentValue(attacker, attackerBattlefield, blockerBattlefield);
  const killedBlockerValue = blockers
    .filter((blocker) => outcome.blockersDie.includes(blocker.instanceId))
    .reduce((sum, blocker) => sum + permanentValue(blocker, blockerBattlefield, attackerBattlefield), 0);
  return outcome.playerDamage * 1.15 + killedBlockerValue - (outcome.attackerDies ? attackerValue : 0) + outcome.lifelinkGain * 0.35;
}

export function publicCardSnapshot(card) {
  if (!card) return null;
  return {
    instanceId: card.instanceId,
    scryfallId: card.scryfallId || null,
    oracleId: card.oracleId || null,
    name: card.name,
    manaCost: card.manaCost || '',
    manaValue: Number(card.manaValue || 0),
    typeLine: card.typeLine || '',
    oracleText: card.oracleText || '',
    power: card.power || '',
    toughness: card.toughness || '',
    keywords: [...(card.keywords || [])],
    colors: [...(card.colors || [])],
    colorIdentity: [...(card.colorIdentity || [])],
    commander: Boolean(card.commander),
    token: Boolean(card.token),
  };
}
