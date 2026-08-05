import { cardTraits } from './card-evaluation.js';
import { isCreature, isLand } from './utils.js';

const ARCHETYPES = [
  'evasive', 'ninjutsu', 'graveyard', 'zombies', 'tokens', 'sacrifice',
  'artifacts', 'equipment', 'spellslinger', 'counters', 'lifegain',
  'ramp', 'control', 'goWide', 'voltron', 'reanimator',
];

function blankScores() {
  return Object.fromEntries(ARCHETYPES.map((name) => [name, 0]));
}

function textOf(card) {
  return `${card?.name || ''}\n${card?.typeLine || ''}\n${card?.oracleText || ''}`.toLocaleLowerCase();
}

function addCardSignals(scores, card, weight = 1) {
  const text = textOf(card);
  const traits = cardTraits(card);
  if (/ninjutsu|ninja/.test(text)) { scores.ninjutsu += 3.4 * weight; scores.evasive += 0.75 * weight; }
  if (/can't be blocked|unblockable|flying|menace|shadow|fear|skulk/.test(text)) scores.evasive += 1.35 * weight;
  if (/graveyard|mill|dies|died|discard/.test(text)) scores.graveyard += 1.05 * weight;
  if (/zombie/.test(text)) scores.zombies += 1.65 * weight;
  if (/return .*graveyard|reanimate|from your graveyard to the battlefield|put .* from .*graveyard onto the battlefield/.test(text)) scores.reanimator += 2.1 * weight;
  if (traits.tokenMaker || /create .* token/.test(text)) scores.tokens += 1.7 * weight;
  if (traits.sacrificeValue || /sacrifice/.test(text)) scores.sacrifice += 1.45 * weight;
  if (/artifact/.test(card?.typeLine || '') || /artifact/.test(text)) scores.artifacts += 0.8 * weight;
  if (traits.equipment || /equipped creature|equip /.test(text)) scores.equipment += 1.8 * weight;
  if (/instant|sorcery/.test(card?.typeLine || '') || /whenever you cast (?:an instant|an instant or sorcery|a noncreature spell)/.test(text)) scores.spellslinger += 0.72 * weight;
  if (/\+1\/\+1 counter|proliferate|counter on/.test(text)) scores.counters += 1.25 * weight;
  if (/gain life|lifelink|life total/.test(text)) scores.lifegain += 1.05 * weight;
  if (isLand(card) || /add \{|search your library for .* land|additional land/.test(text)) scores.ramp += 0.55 * weight;
  if (traits.counterspell || traits.targetedRemoval || traits.boardWipe || /players can't|opponents can't/.test(text)) scores.control += 1.15 * weight;
  if (traits.anthem.power || traits.anthem.toughness || /creatures you control get|for each creature you control/.test(text)) scores.goWide += 1.15 * weight;
  if (traits.equipment || traits.aura || /commander you control|target creature gets/.test(text)) scores.voltron += 0.72 * weight;
  if (isCreature(card) && Number(card?.manaValue || 0) >= 6 && (/graveyard|ninjutsu|put .* onto the battlefield/.test(text))) scores.reanimator += 0.9 * weight;
}

export function buildStrategyProfile(player) {
  const scores = blankScores();
  const commanders = [
    ...(player?.zones?.command || []),
    ...(player?.zones?.battlefield || []).filter((card) => card.commander),
  ];
  for (const commander of commanders) addCardSignals(scores, commander, 3.2);
  for (const zone of ['battlefield', 'graveyard', 'exile']) {
    for (const card of player?.zones?.[zone] || []) addCardSignals(scores, card, zone === 'battlefield' ? 0.9 : 0.42);
  }
  for (const card of player?.zones?.hand || []) addCardSignals(scores, card, 0.33);

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[1] > 1 ? ranked[0][0] : 'midrange';
  const secondary = ranked[1]?.[1] > 1.25 ? ranked[1][0] : null;
  return { scores, primary, secondary, commanders: commanders.map((card) => card.name) };
}

export function cardStrategySynergy(card, profile, context = {}) {
  if (!card || !profile) return 0;
  const traits = cardTraits(card);
  const text = textOf(card);
  const s = profile.scores || {};
  let value = 0;
  if (s.ninjutsu > 2) {
    if (/ninjutsu|ninja/.test(text)) value += 3.2;
    if (traits.unblockable || traits.flying || traits.menace || Number(card.manaValue || 0) <= 2 && isCreature(card)) value += 1.5;
    if (Number(card.manaValue || 0) >= 6 && isCreature(card)) value += 0.8;
  }
  if (s.evasive > 2 && (traits.flying || traits.unblockable || traits.menace)) value += 1.2;
  if (s.graveyard > 2) {
    if (traits.deathTrigger || traits.recursion || /mill|discard|graveyard/.test(text)) value += 1.45;
    if (context.zone === 'graveyard' && (traits.recursion || /cast .* from your graveyard/.test(text))) value += 1.1;
  }
  if (s.zombies > 2 && /zombie/.test(text)) value += 1.45;
  if (s.reanimator > 2 && (traits.recursion || Number(card.manaValue || 0) >= 6 && isCreature(card))) value += 1.35;
  if (s.tokens > 2 && traits.tokenMaker) value += 1.4;
  if (s.sacrifice > 2 && (traits.sacrificeValue || traits.deathTrigger || card.token)) value += 1.2;
  if (s.artifacts > 2 && /artifact/.test(card.typeLine || '')) value += 0.9;
  if (s.equipment > 2 && traits.equipment) value += 1.3;
  if (s.spellslinger > 2 && /Instant|Sorcery/.test(card.typeLine || '')) value += 1.0;
  if (s.counters > 2 && /counter|proliferate/.test(text)) value += 0.9;
  if (s.lifegain > 2 && (traits.lifelink || /gain life/.test(text))) value += 0.9;
  if (s.control > 2 && (traits.counterspell || traits.targetedRemoval || traits.boardWipe)) value += 1.1;
  if (s.goWide > 2 && (traits.tokenMaker || traits.anthem.power || traits.anthem.toughness)) value += 1.0;
  if (s.voltron > 2 && (traits.equipment || traits.aura || card.commander)) value += 0.9;
  return value;
}

export function actionStrategyBonus(action, state, playerId, profile = buildStrategyProfile(state.players[playerId])) {
  const player = state.players[playerId];
  const cards = [];
  const find = (id) => {
    for (const zone of Object.values(player.zones || {})) {
      const card = zone.find((item) => item.instanceId === id);
      if (card) return card;
    }
    return null;
  };
  if (action.cardId) cards.push(find(action.cardId));
  for (const step of action.steps || []) if (step.cardId) cards.push(find(step.cardId));
  let bonus = cards.filter(Boolean).reduce((sum, card) => sum + cardStrategySynergy(card, profile), 0);
  if (action.type === 'attack') {
    const attackers = (action.cardIds || []).map(find).filter(Boolean);
    if (profile.scores.ninjutsu > 2 && attackers.some((card) => cardTraits(card).unblockable || cardTraits(card).flying)) bonus += 2.2;
    if (profile.scores.graveyard > 2 && attackers.some((card) => cardTraits(card).deathTrigger)) bonus += 0.8;
  }
  if (action.type === 'hold' && profile.scores.control > 3) bonus += 0.65;
  return bonus;
}

export function strategyLabel(profile) {
  if (!profile) return 'balanced midrange';
  const labels = {
    evasive: 'evasive combat', ninjutsu: 'Ninja/ninjutsu', graveyard: 'graveyard value', zombies: 'Zombie synergy',
    tokens: 'token development', sacrifice: 'sacrifice value', artifacts: 'artifact synergy', equipment: 'Equipment/Voltron',
    spellslinger: 'spellslinger', counters: 'counter growth', lifegain: 'lifegain', ramp: 'mana development', control: 'interaction/control',
    goWide: 'go-wide combat', voltron: 'commander damage', reanimator: 'reanimation', midrange: 'balanced midrange',
  };
  return profile.secondary ? `${labels[profile.primary] || profile.primary} with ${labels[profile.secondary] || profile.secondary}` : (labels[profile.primary] || profile.primary);
}
