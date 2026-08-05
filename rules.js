import { PHASES } from './constants.js';
import { hasFlash, isCreature, isLand, isPermanent, manaBundleAmount, manaProductionChoices, manaRequirement, totalMana, untappedManaSources } from './utils.js';

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


const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function controlsSubtype(player, subtype) {
  const needle = String(subtype || '').toLocaleLowerCase();
  return (player?.zones?.battlefield || []).some((card) => String(card.typeLine || '').toLocaleLowerCase().includes(needle));
}

function handContainsSubtype(player, subtype) {
  const needle = String(subtype || '').toLocaleLowerCase();
  return (player?.zones?.hand || []).some((card) => String(card.typeLine || '').toLocaleLowerCase().includes(needle));
}

/**
 * Applies common land-entry rules using only visible state. It deliberately
 * returns the reasoning so the coach can explain why a land is or is not
 * immediately usable. Unusual replacement effects remain manual.
 */
export function landEntryPlan(card, player, { opponentCount = 1, payLife = 'auto' } = {}) {
  if (!isLand(card)) return { tapped: false, lifePaid: 0, reason: 'Not a land.', choice: null };
  const text = String(card.oracleText || '').replace(/\n/g, ' ').toLocaleLowerCase();
  const battlefield = player?.zones?.battlefield || [];
  const otherLands = battlefield.filter(isLand).length;
  const creatures = battlefield.filter(isCreature);
  const result = { tapped: false, lifePaid: 0, reason: 'No visible effect makes this land enter tapped.', choice: null };

  // Shock-land style optional life payment.
  if (/may pay 2 life[\s\S]*if you don['’]t[\s\S]*enters?(?: the battlefield)? tapped/.test(text)) {
    const shouldPay = payLife === true || (payLife === 'auto' && Number(player?.life || 0) > 8);
    return shouldPay
      ? { tapped: false, lifePaid: 2, reason: 'Pay 2 life so the land enters untapped.', choice: 'pay-life' }
      : { tapped: true, lifePaid: 0, reason: 'The optional 2 life was not paid.', choice: 'enter-tapped' };
  }

  // Reveal-land style condition.
  const revealMatch = text.match(/unless you reveal (?:a|an) ([a-z ]+?) card from your hand/);
  if (revealMatch) {
    const types = revealMatch[1].split(/\s+or\s+|\//).map((value) => value.trim()).filter(Boolean);
    const canReveal = types.some((type) => handContainsSubtype(player, type));
    return { tapped: !canReveal, lifePaid: 0, reason: canReveal ? `A ${types.join(' or ')} card can be revealed.` : `No ${types.join(' or ')} card is visible in hand to reveal.`, choice: canReveal ? 'reveal' : null };
  }

  // Check lands and similar conditional lands.
  const basicTypes = ['plains', 'island', 'swamp', 'mountain', 'forest'];
  if (/enters?(?: the battlefield)? tapped unless you control/.test(text)) {
    if (/two or more other lands/.test(text)) {
      const untapped = otherLands >= 2;
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? 'You control two or more other lands.' : 'You do not control two or more other lands.', choice: null };
    }
    if (/a legendary creature/.test(text)) {
      const untapped = creatures.some((creature) => /Legendary/.test(creature.typeLine || ''));
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? 'You control a legendary creature.' : 'You do not control a legendary creature.', choice: null };
    }
    if (/two or more opponents/.test(text)) {
      const untapped = opponentCount >= 2;
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? 'You have at least two opponents.' : 'You have fewer than two opponents.', choice: null };
    }
    const mentioned = basicTypes.filter((type) => text.includes(type));
    if (mentioned.length) {
      const untapped = mentioned.some((type) => controlsSubtype(player, type));
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? `You control a required ${mentioned.join(' or ')}.` : `You do not control a required ${mentioned.join(' or ')}.`, choice: null };
    }
  }

  // Fast-land style condition.
  if (/enters?(?: the battlefield)? tapped if you control two or more other lands/.test(text)) {
    const tapped = otherLands >= 2;
    return { tapped, lifePaid: 0, reason: tapped ? 'You control two or more other lands.' : 'You control fewer than two other lands.', choice: null };
  }

  // Optional “you may have this enter tapped” is not forced.
  if (/you may have .* enter(?: the battlefield)? tapped/.test(text)) {
    return { tapped: false, lifePaid: 0, reason: 'Entering tapped is optional; the coach assumes untapped unless another effect matters.', choice: 'untapped' };
  }

  if (/enters?(?: the battlefield)? tapped/.test(text)) {
    return { tapped: true, lifePaid: 0, reason: 'Oracle text says this land enters tapped.', choice: null };
  }
  return result;
}

export function manaDevelopmentSnapshot(player) {
  const floating = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(player?.mana || {}) };
  const colors = new Set(Object.entries(floating).filter(([, amount]) => Number(amount) > 0).map(([color]) => color));
  let available = totalMana(floating);
  let nextTurn = totalMana(floating);
  let untappedSourceCount = 0;
  let tappedSourceCount = 0;
  const sources = [];
  for (const card of player?.zones?.battlefield || []) {
    const choices = manaProductionChoices(card);
    if (!choices.length) continue;
    const capacity = Math.max(0, ...choices.map((choice) => manaBundleAmount(choice.mana)));
    nextTurn += capacity;
    if (card.tapped) tappedSourceCount += 1;
    else {
      available += capacity;
      untappedSourceCount += 1;
      for (const choice of choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount) > 0) colors.add(color);
    }
    sources.push({ instanceId: card.instanceId, name: card.name, tapped: Boolean(card.tapped), capacity, choices });
  }
  return { floating, available, nextTurn, colors: [...colors], untappedSourceCount, tappedSourceCount, sources };
}

/** Colors worth preserving because another visible instant/flash card may use them. */
export function strategicPaymentColors(player, excludedCardId = null) {
  const colors = new Set();
  const candidates = [
    ...(player?.zones?.hand || []),
    ...(player?.zones?.command || []).filter((card) => hasFlash(card)),
  ];
  for (const card of candidates) {
    if (card.instanceId === excludedCardId) continue;
    const instantSpeed = String(card.typeLine || '').includes('Instant') || hasFlash(card);
    if (!instantSpeed) continue;
    const req = manaRequirement(card.manaCost || '');
    for (const color of MANA_COLORS) if (Number(req[color] || 0) > 0) colors.add(color);
    for (const flexible of req.flexible || []) for (const color of flexible) if (MANA_COLORS.includes(color)) colors.add(color);
  }
  return [...colors];
}

export function landPlayLegality(state, playerId, card) {
  const reasons = [];
  const player = state.players[playerId];
  const phase = PHASES[state.phaseIndex]?.id;
  if (!isLand(card)) reasons.push('Only a land card can be played as a land.');
  if (playerId !== state.activePlayerId) reasons.push('Only the active player may play a land.');
  if (!['main1', 'main2'].includes(phase)) reasons.push('A land can normally be played only during a main phase.');
  if ((state.stack || []).length) reasons.push('A land can be played only while the stack is empty.');
  if (Number(player?.landPlaysThisTurn || 0) >= 1) reasons.push('That player has already used the normal land play for this turn.');
  return { legal: reasons.length === 0, reasons };
}

export function spellCastLegality(state, playerId, card, sourceZone = 'hand', options = {}) {
  const { useUntappedSources = true } = options;
  const reasons = [];
  const player = state.players[playerId];
  const phase = PHASES[state.phaseIndex]?.id;
  if (isLand(card)) reasons.push('Lands are played, not cast as spells.');
  const instantSpeed = String(card.typeLine || '').includes('Instant') || hasFlash(card);
  if (!instantSpeed) {
    if (playerId !== state.activePlayerId) reasons.push('A noninstant spell normally requires your own turn.');
    if (!['main1', 'main2'].includes(phase)) reasons.push('A noninstant spell normally requires a main phase.');
    if ((state.stack || []).length) reasons.push('A noninstant spell normally requires an empty stack.');
  }
  const costPlan = buildCostPlan(state, playerId, card, sourceZone, options);
  const payment = useUntappedSources
    ? planSpellPayment(state, playerId, card, sourceZone, { ...options, costPlan })
    : { ...canPayMana(player?.mana || {}, costPlan.finalManaCost, 0), sources: [], projectedPool: { ...(player?.mana || {}) }, costPlan };
  if (!payment.ok) reasons.push(payment.reason || `The available resources cannot pay ${costPlan.displayCost || card.manaCost || 'this cost'}.`);
  return { legal: reasons.length === 0, reasons, tax: costPlan.commanderTax, payment, costPlan };
}

export function moveLegality(state, card, source, targetPlayerId, targetZone) {
  const mode = state.settings.rulesMode;
  if (mode === 'free') return { legal: true, reasons: [] };
  const reasons = [];
  const targetPlayer = state.players[targetPlayerId];

  if (targetZone === 'command' && !card.commander) reasons.push('Only a designated commander should be placed in the command zone.');

  if (targetZone === 'battlefield' && source.zone === 'hand') {
    if (isLand(card)) reasons.push(...landPlayLegality(state, targetPlayerId, card).reasons);
    else {
      if (!isPermanent(card)) reasons.push('Instants and sorceries are cast onto the stack, not placed directly onto the battlefield.');
      reasons.push(...spellCastLegality(state, targetPlayerId, card, source.zone, { useUntappedSources: state.settings.manaMode === 'auto' }).reasons);
    }
  }

  if (targetZone === 'battlefield' && source.zone === 'command') {
    reasons.push(...spellCastLegality(state, targetPlayerId, card, source.zone, { useUntappedSources: state.settings.manaMode === 'auto' }).reasons);
  }

  if (targetZone === 'stack' && ['hand', 'command'].includes(source.zone)) {
    reasons.push(...spellCastLegality(state, targetPlayerId, card, source.zone, { useUntappedSources: state.settings.manaMode === 'auto' }).reasons);
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


export function planManaPayment(player, manaCost, tax = 0, options = {}) {
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(player?.mana || {}) };
  if (canPayMana(pool, manaCost, tax).ok) {
    return { ok: true, sources: [], projectedPool: pool, remainingPool: spendMana(pool, manaCost, tax), preservedColors: [] };
  }

  const preserveColors = [...new Set((options.preserveColors || []).filter((color) => MANA_COLORS.includes(color)))];
  const sources = untappedManaSources(player)
    .filter((source) => !(options.excludeSourceIds || []).includes(source.card.instanceId))
    .filter((source) => !options.spellCard || manaSourceCanPaySpell(source.card, options.spellCard))
    .map((source) => ({ ...source, flexibility: source.choices.length, maxAmount: Math.max(...source.choices.map((choice) => manaBundleAmount(choice.mana))) }))
    .sort((a, b) => (b.maxAmount - a.maxAmount) || (a.flexibility - b.flexibility));
  const requirement = manaRequirement(manaCost, tax);
  const costUnits = requirement.generic
    + MANA_COLORS.reduce((sum, color) => sum + Number(requirement[color] || 0), 0)
    + Number(requirement.flexible?.length || 0);
  const shortfall = Math.max(0, costUnits - totalMana(pool));
  const largestSource = Math.max(1, ...sources.map((source) => source.maxAmount));
  const minimumSources = Math.max(1, Math.ceil(shortfall / largestSource));
  const maxNodesPerDepth = Math.max(3000, Number(options.maxNodes || 12000));
  let best = null;

  const addBundle = (poolValue, mana) => {
    const next = { ...poolValue };
    for (const color of MANA_COLORS) next[color] = Number(next[color] || 0) + Number(mana?.[color] || 0);
    return next;
  };

  const availableColorsAfter = (working, selectedIds) => {
    const remaining = spendMana(working, manaCost, tax);
    const colors = new Set(Object.entries(remaining).filter(([, amount]) => Number(amount) > 0).map(([color]) => color));
    for (const source of sources) {
      if (selectedIds.has(source.card.instanceId)) continue;
      for (const choice of source.choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount) > 0) colors.add(color);
    }
    return { remaining, colors };
  };

  const consider = (working, selected) => {
    if (!canPayMana(working, manaCost, tax).ok) return;
    const selectedIds = new Set(selected.map((item) => item.instanceId));
    const { remaining, colors } = availableColorsAfter(working, selectedIds);
    const missingPreserved = preserveColors.filter((color) => !colors.has(color));
    const flexPenalty = selected.reduce((sum, item) => sum + Math.max(0, Number(item.flexibility || 1) - 1) * 0.45, 0);
    const utilityPenalty = selected.reduce((sum, item) => {
      const source = sources.find((candidate) => candidate.card.instanceId === item.instanceId);
      const text = String(source?.card?.oracleText || '');
      const nonManaAbility = /(?:^|\n)(?!\{T\}:\s*Add)[^\n.]{0,120}:/.test(text);
      return sum + (nonManaAbility ? 0.8 : 0);
    }, 0);
    const score = missingPreserved.length * 12
      + flexPenalty
      + utilityPenalty
      - totalMana(remaining) * 0.12;
    if (!best || selected.length < best.sources.length || (selected.length === best.sources.length && score < best.score)) {
      best = {
        score,
        ok: true,
        sources: selected.map(({ flexibility, ...item }) => ({ ...item, ...manaSourcePaymentCost(sources.find((candidate) => candidate.card.instanceId === item.instanceId)?.card) })),
        projectedPool: { ...working },
        remainingPool: remaining,
        preservedColors: preserveColors.filter((color) => colors.has(color)),
      };
    }
  };

  // Iterative deepening guarantees that the planner first finds the fewest
  // physical permanents that must be tapped, then optimizes color preservation.
  for (let sourceLimit = minimumSources; sourceLimit <= sources.length; sourceLimit += 1) {
    let nodes = 0;
    best = null;
    const dfs = (index, working, selected) => {
      if (nodes++ >= maxNodesPerDepth) return;
      if (canPayMana(working, manaCost, tax).ok) {
        consider(working, selected);
        return;
      }
      if (index >= sources.length || selected.length >= sourceLimit) return;
      if (selected.length + (sources.length - index) < minimumSources) return;

      const source = sources[index];
      for (let choiceIndex = 0; choiceIndex < source.choices.length; choiceIndex += 1) {
        const choice = source.choices[choiceIndex];
        dfs(index + 1, addBundle(working, choice.mana), [...selected, {
          instanceId: source.card.instanceId,
          name: source.card.name,
          choiceIndex,
          mana: { ...choice.mana },
          label: choice.label,
          flexibility: source.flexibility,
        }]);
      }
      dfs(index + 1, working, selected);
    };
    dfs(0, pool, []);
    if (best) return best;
  }

  return { ok: false, sources: [], projectedPool: pool, remainingPool: pool, preservedColors: [], reason: `The untapped mana sources cannot pay ${manaCost || 'this cost'}${tax ? ` plus ${tax} commander tax` : ''}.` };
}


function requirementClone(req) {
  return { W: Number(req.W || 0), U: Number(req.U || 0), B: Number(req.B || 0), R: Number(req.R || 0), G: Number(req.G || 0), C: Number(req.C || 0), generic: Number(req.generic || 0), flexible: (req.flexible || []).map((entry) => [...entry]) };
}

function combineRequirements(...requirements) {
  const out = requirementClone({});
  for (const req of requirements) {
    for (const color of MANA_COLORS) out[color] += Number(req?.[color] || 0);
    out.generic += Number(req?.generic || 0);
    out.flexible.push(...(req?.flexible || []).map((entry) => [...entry]));
  }
  return out;
}

export function requirementToManaCost(requirement) {
  const symbols = [];
  if (Number(requirement?.generic || 0) > 0) symbols.push(`{${Number(requirement.generic)}}`);
  for (const color of MANA_COLORS) for (let i = 0; i < Number(requirement?.[color] || 0); i += 1) symbols.push(`{${color}}`);
  for (const choices of requirement?.flexible || []) if (choices.length) symbols.push(`{${choices.join('/')}}`);
  return symbols.join('');
}

function spellMatchesCostText(card, text) {
  const type = String(card?.typeLine || '').toLocaleLowerCase();
  if (/creature spells?/.test(text) && !type.includes('creature')) return false;
  if (/artifact spells?/.test(text) && !type.includes('artifact')) return false;
  if (/enchantment spells?/.test(text) && !type.includes('enchantment')) return false;
  if (/instant spells?/.test(text) && !type.includes('instant')) return false;
  if (/sorcery spells?/.test(text) && !type.includes('sorcery')) return false;
  if (/noncreature spells?/.test(text) && type.includes('creature')) return false;
  return true;
}

function genericCostModifierFromText(text, card, direction = 'less') {
  let total = 0;
  const normalized = String(text || '').replace(/\n/g, ' ');
  const re = direction === 'less'
    ? /(?:spells|creature spells|artifact spells|enchantment spells|instant spells|sorcery spells|noncreature spells) you cast cost \{(\d+)\} less/gi
    : /(?:spells|creature spells|artifact spells|enchantment spells|instant spells|sorcery spells|noncreature spells) (?:your opponents|opponents) cast cost \{(\d+)\} more/gi;
  for (const match of normalized.matchAll(re)) {
    const phrase = match[0].toLocaleLowerCase();
    if (spellMatchesCostText(card, phrase)) total += Number(match[1] || 0);
  }
  return total;
}

function additionalCostPlan(player, card) {
  const text = String(card?.oracleText || '').replace(/\n/g, ' ');
  const result = { life: 0, sacrifices: [], discards: [], errors: [] };
  const life = text.match(/as an additional cost to cast this spell,? pay (\d+) life/i);
  if (life) {
    result.life = Number(life[1]);
    if (Number(player?.life || 0) <= result.life) result.errors.push(`Paying ${result.life} life would leave no life available.`);
  }
  if (/as an additional cost to cast this spell,? discard a card/i.test(text)) {
    const candidate = [...(player?.zones?.hand || [])]
      .filter((item) => item.instanceId !== card.instanceId)
      .sort((a, b) => Number(a.manaValue || 0) - Number(b.manaValue || 0))[0];
    if (candidate) result.discards.push(candidate.instanceId);
    else result.errors.push('An additional card must be discarded.');
  }
  const sacrificeCreature = /as an additional cost to cast this spell,? sacrifice a creature/i.test(text);
  const sacrificePermanent = /as an additional cost to cast this spell,? sacrifice a permanent/i.test(text);
  if (sacrificeCreature || sacrificePermanent) {
    const candidates = (player?.zones?.battlefield || [])
      .filter((item) => sacrificePermanent || isCreature(item))
      .sort((a, b) => (a.commander === b.commander ? 0 : a.commander ? 1 : -1) || (a.token === b.token ? 0 : a.token ? -1 : 1) || Number(a.manaValue || 0) - Number(b.manaValue || 0));
    if (candidates[0]) result.sacrifices.push(candidates[0].instanceId);
    else result.errors.push(`An additional ${sacrificeCreature ? 'creature' : 'permanent'} must be sacrificed.`);
  }
  return result;
}

function kickerCost(card) {
  const match = String(card?.oracleText || '').match(/(?:multi)?kicker\s+(\{[^\n.]+?\})/i);
  return match?.[1]?.replace(/\}\s*\{/g, '}{') || '';
}

export function buildCostPlan(state, playerId, card, sourceZone = 'hand', options = {}) {
  const player = state.players[playerId];
  const baseManaCost = options.alternativeManaCost || card.manaCost || '';
  const commanderTax = sourceZone === 'command' ? 2 * Number(player?.commanderCastCount?.[card.instanceId] || 0) : 0;
  const optionalMana = options.additionalManaCost || (options.kicked ? kickerCost(card) : '');
  const base = combineRequirements(manaRequirement(baseManaCost), manaRequirement(optionalMana));
  let reductions = 0;
  let increases = commanderTax;
  for (const permanent of player?.zones?.battlefield || []) reductions += genericCostModifierFromText(permanent.oracleText, card, 'less');
  for (const [opponentId, opponent] of Object.entries(state.players || {})) {
    if (opponentId === playerId) continue;
    for (const permanent of opponent?.zones?.battlefield || []) increases += genericCostModifierFromText(permanent.oracleText, card, 'more');
  }
  const finalRequirement = requirementClone(base);
  finalRequirement.generic = Math.max(0, finalRequirement.generic + increases - reductions);
  const additional = additionalCostPlan(player, card);
  return {
    baseManaCost,
    optionalMana,
    commanderTax,
    increases,
    reductions,
    finalRequirement,
    finalManaCost: requirementToManaCost(finalRequirement),
    displayCost: requirementToManaCost(finalRequirement) || 'no mana',
    additional,
    mechanics: {
      convoke: /\bconvoke\b/i.test(card.oracleText || '') || (card.keywords || []).includes('Convoke'),
      delve: /\bdelve\b/i.test(card.oracleText || '') || (card.keywords || []).includes('Delve'),
      improvise: /\bimprovise\b/i.test(card.oracleText || '') || (card.keywords || []).includes('Improvise'),
      kicker: kickerCost(card),
    },
  };
}

function manaSourceCanPaySpell(source, spell) {
  const text = String(source?.oracleText || '').toLocaleLowerCase();
  const type = String(spell?.typeLine || '').toLocaleLowerCase();
  if (/spend this mana only to activate abilities/.test(text)) return false;
  if (/spend this mana only to cast (?:a )?creature spell/.test(text) && !type.includes('creature')) return false;
  if (/spend this mana only to cast (?:an )?artifact spell/.test(text) && !type.includes('artifact')) return false;
  if (/spend this mana only to cast (?:an )?instant or sorcery spell/.test(text) && !(type.includes('instant') || type.includes('sorcery'))) return false;
  if (/spend this mana only to cast your commander/.test(text) && !spell?.commander) return false;
  return true;
}

function manaSourcePaymentCost(source) {
  const text = String(source?.oracleText || '');
  return {
    sacrificeSource: /sacrifice (?:this artifact|this permanent|~|treasure|clue|food)/i.test(text) && /add\s+\{/i.test(text),
    lifeCost: Number(text.match(/pay (\d+) life[^:]*:\s*add/i)?.[1] || 0),
  };
}

function specialPaymentCandidates(player, card, costPlan) {
  const generic = Number(costPlan.finalRequirement.generic || 0);
  const colored = MANA_COLORS.reduce((sum, color) => sum + Number(costPlan.finalRequirement[color] || 0), 0) + Number(costPlan.finalRequirement.flexible?.length || 0);
  const candidates = [];
  if (costPlan.mechanics.convoke) {
    const creatures = (player?.zones?.battlefield || [])
      .filter((item) => isCreature(item) && !item.tapped)
      .sort((a, b) => (a.commander === b.commander ? 0 : a.commander ? 1 : -1) || (a.token === b.token ? 0 : a.token ? -1 : 1) || Number(a.manaValue || 0) - Number(b.manaValue || 0));
    candidates.push(...creatures.slice(0, generic + colored).map((item) => ({ kind: 'convoke', instanceId: item.instanceId, colors: [...(item.colors || [])], opportunity: item.commander ? 4 : item.token ? 0.25 : 0.7 + Number(item.manaValue || 0) * 0.18 })));
  }
  if (costPlan.mechanics.improvise) {
    const artifacts = (player?.zones?.battlefield || [])
      .filter((item) => /Artifact/.test(item.typeLine || '') && !item.tapped)
      .sort((a, b) => Number(a.manaValue || 0) - Number(b.manaValue || 0));
    candidates.push(...artifacts.slice(0, generic).map((item) => ({ kind: 'improvise', instanceId: item.instanceId, opportunity: item.token ? 0.2 : 0.55 + Number(item.manaValue || 0) * 0.12 })));
  }
  if (costPlan.mechanics.delve) {
    const grave = [...(player?.zones?.graveyard || [])]
      .sort((a, b) => (/flashback|escape|unearth|from your graveyard/i.test(a.oracleText || '') ? 1 : 0) - (/flashback|escape|unearth|from your graveyard/i.test(b.oracleText || '') ? 1 : 0) || Number(a.manaValue || 0) - Number(b.manaValue || 0));
    candidates.push(...grave.slice(0, generic).map((item) => ({ kind: 'delve', instanceId: item.instanceId, opportunity: /flashback|escape|unearth|from your graveyard/i.test(item.oracleText || '') ? 2.2 : 0.28 })));
  }
  return candidates.sort((a, b) => a.opportunity - b.opportunity);
}

function applySpecialPaymentResources(requirement, resources) {
  const req = requirementClone(requirement);
  const used = [];
  for (const resource of resources) {
    let paid = false;
    if (resource.kind === 'convoke') {
      const color = (resource.colors || []).find((candidate) => Number(req[candidate] || 0) > 0);
      if (color) { req[color] -= 1; paid = true; }
      if (!paid) {
        const flexIndex = (req.flexible || []).findIndex((choices) => choices.some((candidate) => (resource.colors || []).includes(candidate)));
        if (flexIndex >= 0) { req.flexible.splice(flexIndex, 1); paid = true; }
      }
    }
    if (!paid && Number(req.generic || 0) > 0) { req.generic -= 1; paid = true; }
    if (paid) used.push(resource);
  }
  return { requirement: req, used };
}

export function planSpellPayment(state, playerId, card, sourceZone = 'hand', options = {}) {
  const player = state.players[playerId];
  const costPlan = options.costPlan || buildCostPlan(state, playerId, card, sourceZone, options);
  if (costPlan.additional.errors.length) return { ok: false, reason: costPlan.additional.errors.join(' '), costPlan };
  const preserveColors = options.preserveColors || strategicPaymentColors(player, card.instanceId);
  const candidates = specialPaymentCandidates(player, card, costPlan);
  const maxSpecial = candidates.length;
  let best = null;
  for (let count = 0; count <= maxSpecial; count += 1) {
    const candidateResources = candidates.slice(0, count);
    const special = applySpecialPaymentResources(costPlan.finalRequirement, candidateResources);
    const resources = special.used;
    const adjustedCost = requirementToManaCost(special.requirement);
    const manaPlan = planManaPayment(player, adjustedCost, 0, { preserveColors, spellCard: card, excludeSourceIds: resources.map((item) => item.instanceId) });
    if (!manaPlan.ok) continue;
    const opportunity = resources.reduce((sum, item) => sum + item.opportunity, 0)
      + (manaPlan.sources || []).reduce((sum, item) => sum + Number(item.lifeCost || 0) * 0.45 + (item.sacrificeSource ? 1.15 : 0), 0);
    const score = opportunity + (manaPlan.sources?.length || 0) * 0.08;
    if (!best || score < best.score) {
      best = {
        ...manaPlan,
        score,
        costPlan,
        finalManaCost: adjustedCost,
        convoke: resources.filter((item) => item.kind === 'convoke').map((item) => item.instanceId),
        improvise: resources.filter((item) => item.kind === 'improvise').map((item) => item.instanceId),
        delve: resources.filter((item) => item.kind === 'delve').map((item) => item.instanceId),
        sacrifices: [...costPlan.additional.sacrifices],
        discards: [...costPlan.additional.discards],
        lifePaid: Number(costPlan.additional.life || 0) + (manaPlan.sources || []).reduce((sum, item) => sum + Number(item.lifeCost || 0), 0),
      };
    }
  }
  return best || { ok: false, reason: `The visible resources cannot pay ${costPlan.displayCost}.`, costPlan, sources: [] };
}

function findBattlefieldCard(draft, instanceId) {
  for (const player of Object.values(draft.players || {})) {
    const card = (player.zones?.battlefield || []).find((item) => item.instanceId === instanceId);
    if (card) return { player, card };
  }
  return null;
}

export function applySpellPayment(draft, playerId, payment) {
  if (!payment?.ok) return false;
  const player = draft.players[playerId];
  for (const item of payment.sources || []) {
    const found = findBattlefieldCard(draft, item.instanceId);
    if (!found || found.card.tapped) continue;
    found.card.tapped = true;
    for (const color of MANA_COLORS) player.mana[color] = Number(player.mana[color] || 0) + Number(item.mana?.[color] || 0);
    if (item.sacrificeSource) {
      const index = found.player.zones.battlefield.findIndex((card) => card.instanceId === item.instanceId);
      const [sacrificed] = found.player.zones.battlefield.splice(index, 1);
      found.player.zones.graveyard.push(sacrificed);
    }
  }
  for (const id of [...(payment.convoke || []), ...(payment.improvise || [])]) {
    const found = findBattlefieldCard(draft, id);
    if (found) found.card.tapped = true;
  }
  for (const id of payment.delve || []) {
    const index = player.zones.graveyard.findIndex((card) => card.instanceId === id);
    if (index >= 0) player.zones.exile.push(player.zones.graveyard.splice(index, 1)[0]);
  }
  for (const id of payment.sacrifices || []) {
    const index = player.zones.battlefield.findIndex((card) => card.instanceId === id);
    if (index >= 0) player.zones.graveyard.push(player.zones.battlefield.splice(index, 1)[0]);
  }
  for (const id of payment.discards || []) {
    const index = player.zones.hand.findIndex((card) => card.instanceId === id);
    if (index >= 0) player.zones.graveyard.push(player.zones.hand.splice(index, 1)[0]);
  }
  player.life -= Number(payment.lifePaid || 0);
  player.mana = spendMana(player.mana, payment.finalManaCost || payment.costPlan?.finalManaCost || '', 0);
  return true;
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
