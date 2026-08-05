import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePosition, buildInteractionRisk, possibleMoves } from '../coach.js';
import { landEntryPlan, moveLegality, planManaPayment, spellCastLegality, strategicPaymentColors } from '../rules.js';
import { createInitialState } from '../state.js';

function card(overrides = {}) {
  return {
    instanceId: overrides.instanceId || `c-${Math.random()}`,
    name: overrides.name || 'Test Card',
    manaCost: overrides.manaCost || '', manaValue: overrides.manaValue || 0,
    typeLine: overrides.typeLine || 'Creature — Test', oracleText: overrides.oracleText || '',
    power: overrides.power ?? '1', toughness: overrides.toughness ?? '1', keywords: overrides.keywords || [],
    colors: overrides.colors || [], colorIdentity: overrides.colorIdentity || [],
    tapped: Boolean(overrides.tapped), summoningSick: Boolean(overrides.summoningSick),
    attacking: false, blocking: null, blockedBy: [], counters: {},
    owner: overrides.owner || 'p1', controller: overrides.controller || overrides.owner || 'p1',
    commander: Boolean(overrides.commander), token: false, faceDown: false,
  };
}

function land(name, oracleText, typeLine = 'Land', tapped = false, owner = 'p1') {
  return card({ name, oracleText, typeLine, tapped, owner, controller: owner, power: '', toughness: '' });
}

test('tapped lands are unavailable to the mana planner', () => {
  const state = createInitialState();
  state.players.p1.zones.battlefield.push(
    land('Tapped Island', '{T}: Add {U}.', 'Basic Land — Island', true),
    land('Swamp', '{T}: Add {B}.', 'Basic Land — Swamp', false),
  );
  assert.equal(planManaPayment(state.players.p1, '{U}').ok, false);
  const black = planManaPayment(state.players.p1, '{B}');
  assert.equal(black.ok, true);
  assert.deepEqual(black.sources.map((source) => source.name), ['Swamp']);
});

test('a land that enters tapped does not enable a same-turn cast sequence', () => {
  const state = createInitialState();
  state.phaseIndex = 3;
  state.players.p1.zones.hand.push(
    land('Slow Blue Land', 'Slow Blue Land enters the battlefield tapped.\n{T}: Add {U}.', 'Land'),
    card({ instanceId: 'blue-spell', name: 'Blue One Drop', manaCost: '{U}', manaValue: 1, typeLine: 'Creature — Wizard', owner: 'p1' }),
  );
  const labels = possibleMoves(state, 'p1').map((move) => move.label);
  assert(labels.some((label) => /Play Slow Blue Land/.test(label)));
  assert.equal(labels.some((label) => /Slow Blue Land.*Blue One Drop/.test(label)), false);
});

test('an untapped land can enable a same-turn cast sequence', () => {
  const state = createInitialState();
  state.phaseIndex = 3;
  state.players.p1.zones.hand.push(
    land('Island', '{T}: Add {U}.', 'Basic Land — Island'),
    card({ instanceId: 'blue-spell', name: 'Blue One Drop', manaCost: '{U}', manaValue: 1, typeLine: 'Creature — Wizard', owner: 'p1' }),
  );
  const labels = possibleMoves(state, 'p1').map((move) => move.label);
  assert.ok(labels.some((label) => /Play Island.*Cast Blue One Drop/.test(label)));
});

test('mana planning can preserve blue interaction while paying black', () => {
  const state = createInitialState();
  const island = land('Island', '{T}: Add {U}.', 'Basic Land — Island');
  const dual = land('Underground River', '{T}: Add {U} or {B}.', 'Land');
  const removal = card({ instanceId: 'removal', name: 'Black Spell', manaCost: '{B}', manaValue: 1, typeLine: 'Sorcery', owner: 'p1' });
  const counter = card({ instanceId: 'counter', name: 'Visible Counter', manaCost: '{U}', manaValue: 1, typeLine: 'Instant', oracleText: 'Counter target spell.', owner: 'p1' });
  state.players.p1.zones.battlefield.push(island, dual);
  state.players.p1.zones.hand.push(removal, counter);
  const preserve = strategicPaymentColors(state.players.p1, removal.instanceId);
  const plan = planManaPayment(state.players.p1, removal.manaCost, 0, { preserveColors: preserve });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.sources.map((source) => source.name), ['Underground River']);
  assert.deepEqual(plan.sources[0].mana, { W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 });
  assert.ok(plan.preservedColors.includes('U'));
});

test('common land-entry conditions are evaluated from visible state', () => {
  const state = createInitialState();
  const checkland = land('Drowned Catacomb', 'Drowned Catacomb enters the battlefield tapped unless you control an Island or a Swamp.\n{T}: Add {U} or {B}.');
  assert.equal(landEntryPlan(checkland, state.players.p1).tapped, true);
  state.players.p1.zones.battlefield.push(land('Island', '{T}: Add {U}.', 'Basic Land — Island'));
  assert.equal(landEntryPlan(checkland, state.players.p1).tapped, false);
});

test('noninstant spells require main-phase timing and an empty stack', () => {
  const state = createInitialState();
  state.phaseIndex = 4;
  state.players.p1.zones.battlefield.push(land('Island', '{T}: Add {U}.', 'Basic Land — Island'));
  const sorcery = card({ name: 'Test Sorcery', manaCost: '{U}', typeLine: 'Sorcery', owner: 'p1' });
  assert.equal(spellCastLegality(state, 'p1', sorcery, 'hand').legal, false);
  state.phaseIndex = 3;
  state.stack.push(card({ name: 'Spell on Stack', typeLine: 'Instant', owner: 'p2', controller: 'p2' }));
  assert.equal(spellCastLegality(state, 'p1', sorcery, 'hand').legal, false);
});

test('tapped blue and black lands do not create immediate interaction risk', () => {
  const state = createInitialState();
  state.players.p2.colorIdentity = ['U', 'B'];
  state.players.p2.zones.hand = Array.from({ length: 7 }, (_, index) => card({ name: `Hidden ${index}`, typeLine: 'Instant', owner: 'p2', controller: 'p2' }));
  state.players.p2.zones.battlefield.push(
    land('Island', '{T}: Add {U}.', 'Basic Land — Island', true, 'p2'),
    land('Swamp', '{T}: Add {B}.', 'Basic Land — Swamp', true, 'p2'),
  );
  const risk = buildInteractionRisk(state, 'p1');
  assert.equal(risk.categories.counterspell.probability, 0);
  assert.equal(risk.categories.removal.probability, 0);
});

test('the coach prefers an untapped early land over an otherwise similar tapped land', () => {
  const state = createInitialState();
  state.phaseIndex = 3;
  state.turnNumber = 1;
  state.players.p1.zones.hand.push(
    land('Slow Island', 'Slow Island enters the battlefield tapped.\n{T}: Add {U}.', 'Land'),
    land('Island', '{T}: Add {U}.', 'Basic Land — Island'),
  );
  const analysis = analyzePosition(state, 'p1', 70);
  const islandMove = analysis.results.find((result) => result.label === 'Play Island');
  const slowMove = analysis.results.find((result) => /Play Slow Island/.test(result.label));
  assert.ok(islandMove.score > slowMove.score);
});


test('strict legality uses untapped sources only in auto-pay mode', () => {
  const state = createInitialState();
  state.phaseIndex = 3;
  const island = land('Island', '{T}: Add {U}.', 'Basic Land — Island');
  const spell = card({ instanceId: 'cast-me', name: 'Blue Permanent', manaCost: '{U}', typeLine: 'Creature — Wizard', owner: 'p1' });
  state.players.p1.zones.battlefield.push(island);
  state.players.p1.zones.hand.push(spell);
  const source = { card: spell, playerId: 'p1', zone: 'hand' };
  state.settings.manaMode = 'manual';
  assert.equal(moveLegality(state, spell, source, 'p1', 'battlefield').legal, false);
  state.settings.manaMode = 'auto';
  assert.equal(moveLegality(state, spell, source, 'p1', 'battlefield').legal, true);
});
