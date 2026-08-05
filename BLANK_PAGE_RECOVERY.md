import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../state.js';
import { buildCostPlan, planSpellPayment, spellCastLegality } from '../rules.js';
import { applyTacticalAction, generateShortSequences, generateTacticalActions } from '../tactical-engine.js';
import { buildStrategyProfile } from '../strategy-profile.js';

function card(overrides = {}) {
  return {
    instanceId: overrides.instanceId || `c-${Math.random()}`,
    name: overrides.name || 'Test Card',
    manaCost: overrides.manaCost || '',
    manaValue: overrides.manaValue ?? 0,
    typeLine: overrides.typeLine || 'Creature — Test',
    oracleText: overrides.oracleText || '',
    power: overrides.power ?? '1', toughness: overrides.toughness ?? '1',
    keywords: overrides.keywords || [], colors: overrides.colors || [], colorIdentity: overrides.colorIdentity || [],
    tapped: Boolean(overrides.tapped), summoningSick: Boolean(overrides.summoningSick), attacking: false,
    blocking: null, blockedBy: [], counters: {}, owner: overrides.owner || 'p1', controller: overrides.controller || overrides.owner || 'p1',
    commander: Boolean(overrides.commander), token: Boolean(overrides.token), faceDown: false, attachments: [],
  };
}

function land(id, color = 'U', owner = 'p1', text = null) {
  const basics = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes' };
  return card({ instanceId: id, name: id, typeLine: `Basic Land — ${basics[color]}`, oracleText: text || `{T}: Add {${color}}.`, power: '', toughness: '', owner, controller: owner, colorIdentity: color === 'C' ? [] : [color] });
}

test('generic cost reducers change actual spell payment', () => {
  const state = createInitialState(); state.phaseIndex = 3;
  state.players.p1.zones.battlefield.push(land('island', 'U'), card({ instanceId: 'reducer', name: 'Reducer', typeLine: 'Artifact', oracleText: 'Creature spells you cast cost {1} less.' }));
  const spell = card({ instanceId: 'bear', name: 'Bear', manaCost: '{1}{U}', manaValue: 2 });
  state.players.p1.zones.hand.push(spell);
  const plan = buildCostPlan(state, 'p1', spell, 'hand');
  assert.equal(plan.reductions, 1);
  assert.equal(plan.finalManaCost, '{U}');
  assert.equal(spellCastLegality(state, 'p1', spell, 'hand').legal, true);
});

test('convoke can cover generic mana with an untapped creature', () => {
  const state = createInitialState(); state.phaseIndex = 3;
  state.players.p1.zones.battlefield.push(land('plains', 'W'), card({ instanceId: 'helper', name: 'Helper', manaValue: 1 }));
  const spell = card({ instanceId: 'convoke', name: 'Convoke Spell', manaCost: '{1}{W}', manaValue: 2, oracleText: 'Convoke' });
  state.players.p1.zones.hand.push(spell);
  const payment = planSpellPayment(state, 'p1', spell, 'hand');
  assert.equal(payment.ok, true);
  assert.deepEqual(payment.convoke, ['helper']);
});

test('delve can use graveyard cards for generic mana', () => {
  const state = createInitialState(); state.phaseIndex = 3;
  state.players.p1.zones.battlefield.push(land('swamp', 'B'));
  for (let i = 0; i < 4; i += 1) state.players.p1.zones.graveyard.push(card({ instanceId: `g${i}`, name: `Grave ${i}` }));
  const spell = card({ instanceId: 'delve', name: 'Delve Spell', manaCost: '{4}{B}', manaValue: 5, oracleText: 'Delve' });
  state.players.p1.zones.hand.push(spell);
  const payment = planSpellPayment(state, 'p1', spell, 'hand');
  assert.equal(payment.ok, true);
  assert.equal(payment.delve.length, 4);
});

test('restricted creature-only mana cannot cast a noncreature spell', () => {
  const state = createInitialState(); state.phaseIndex = 3;
  state.players.p1.zones.battlefield.push(land('restricted', 'U', 'p1', '{T}: Add {U}. Spend this mana only to cast a creature spell.'));
  const instant = card({ instanceId: 'instant', name: 'Instant', typeLine: 'Instant', manaCost: '{U}', manaValue: 1 });
  state.players.p1.zones.hand.push(instant);
  assert.equal(spellCastLegality(state, 'p1', instant, 'hand').legal, false);
});

test('short sequence search finds play land into cast spell', () => {
  const state = createInitialState(); state.phaseIndex = 3;
  state.players.p1.zones.hand.push(land('island', 'U'), card({ instanceId: 'one-drop', name: 'One Drop', manaCost: '{U}', manaValue: 1 }));
  const sequences = generateShortSequences(state, 'p1', { depth: 2, beamWidth: 10, limit: 20 });
  assert.ok(sequences.some((sequence) => sequence.steps.some((step) => step.type === 'play-land') && sequence.steps.some((step) => step.cardId === 'one-drop')));
});

test('Satoru commander produces a ninjutsu/evasive strategy profile', () => {
  const state = createInitialState();
  state.players.p1.zones.command.push(card({ instanceId: 'satoru', name: 'Satoru Umezawa', commander: true, oracleText: 'Whenever you activate a ninjutsu ability, look at the top three cards. Each creature card in your hand has ninjutsu {2}{U}{B}.', typeLine: 'Legendary Creature — Human Ninja' }));
  const profile = buildStrategyProfile(state.players.p1);
  assert.equal(profile.primary, 'ninjutsu');
  assert.ok(profile.scores.evasive > 0);
});

test('tactical casting taps the exact planned land and resolves the permanent', () => {
  const state = createInitialState(); state.phaseIndex = 3;
  state.players.p1.zones.battlefield.push(land('island', 'U'));
  state.players.p1.zones.hand.push(card({ instanceId: 'one-drop', name: 'One Drop', manaCost: '{U}', manaValue: 1 }));
  const action = generateTacticalActions(state, 'p1').find((item) => item.cardId === 'one-drop');
  const result = applyTacticalAction(state, 'p1', action, { autoResolve: true });
  assert.equal(result.ok, true);
  assert.equal(result.state.players.p1.zones.battlefield.find((item) => item.instanceId === 'island').tapped, true);
  assert.ok(result.state.players.p1.zones.battlefield.some((item) => item.instanceId === 'one-drop'));
});

test('a colored creature can convoke a matching colored symbol', () => {
  const state = createInitialState(); state.phaseIndex = 3;
  state.players.p1.zones.battlefield.push(card({ instanceId: 'white-helper', name: 'White Helper', colors: ['W'], colorIdentity: ['W'] }));
  const spell = card({ instanceId: 'white-convoke', name: 'White Convoke', manaCost: '{W}', manaValue: 1, oracleText: 'Convoke' });
  state.players.p1.zones.hand.push(spell);
  const payment = planSpellPayment(state, 'p1', spell, 'hand');
  assert.equal(payment.ok, true);
  assert.deepEqual(payment.convoke, ['white-helper']);
});
