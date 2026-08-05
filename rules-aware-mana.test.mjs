import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePosition, buildInformationSet, buildInteractionRisk } from '../coach.js';
import { recordPublicEvent } from '../knowledge.js';
import { createInitialState } from '../state.js';

function card(overrides = {}) {
  return {
    instanceId: overrides.instanceId || `c-${Math.random()}`,
    name: overrides.name || 'Test Card',
    manaCost: overrides.manaCost || '',
    manaValue: overrides.manaValue || 0,
    typeLine: overrides.typeLine || 'Creature — Test',
    oracleText: overrides.oracleText || '',
    power: overrides.power ?? '1',
    toughness: overrides.toughness ?? '1',
    keywords: overrides.keywords || [],
    colors: overrides.colors || [],
    colorIdentity: overrides.colorIdentity || [],
    tapped: Boolean(overrides.tapped),
    summoningSick: Boolean(overrides.summoningSick),
    attacking: Boolean(overrides.attacking),
    blocking: null,
    blockedBy: [],
    counters: overrides.counters || {},
    owner: overrides.owner || 'p1',
    controller: overrides.controller || overrides.owner || 'p1',
    commander: Boolean(overrides.commander),
    token: false,
    faceDown: false,
  };
}

function land(name, color, owner = 'p2', tapped = false) {
  const basics = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes' };
  return card({
    instanceId: `${owner}-${name}-${Math.random()}`,
    name,
    typeLine: `Basic Land — ${basics[color]}`,
    power: '', toughness: '', owner, controller: owner, tapped,
    oracleText: `{T}: Add {${color}}.`,
    colorIdentity: color === 'C' ? [] : [color],
  });
}

function setHandSize(state, playerId, count) {
  state.players[playerId].zones.hand = Array.from({ length: count }, (_, index) => card({
    instanceId: `${playerId}-hidden-${index}`,
    name: `SECRET-${index}`,
    typeLine: 'Instant', owner: playerId, controller: playerId,
  }));
}

function attackScore(state, attackerId) {
  const analysis = analyzePosition(state, 'p1', 90);
  return analysis.results.find((result) => result.type === 'attack' && result.cardIds?.length === 1 && result.cardIds[0] === attackerId)?.score;
}

test('coach treats a 1/1 deathtouch blocker differently from a normal 5/5', () => {
  const normal = createInitialState();
  normal.phaseIndex = 4;
  const attacker = card({ instanceId: 'attacker', name: 'Valuable 6/6', power: '6', toughness: '6', owner: 'p1', controller: 'p1' });
  normal.players.p1.zones.battlefield.push(attacker);
  normal.players.p2.zones.battlefield.push(card({ instanceId: 'normal-blocker', name: 'Normal 5/5', power: '5', toughness: '5', owner: 'p2', controller: 'p2' }));

  const deadly = createInitialState();
  deadly.phaseIndex = 4;
  deadly.players.p1.zones.battlefield.push({ ...attacker });
  deadly.players.p2.zones.battlefield.push(card({ instanceId: 'dt-blocker', name: 'Deadly 1/1', power: '1', toughness: '1', keywords: ['Deathtouch'], owner: 'p2', controller: 'p2' }));

  assert.ok(attackScore(normal, 'attacker') > attackScore(deadly, 'attacker'));
});

test('open blue and black mana raises interaction risk compared with no open mana', () => {
  const closed = createInitialState();
  closed.players.p2.colorIdentity = ['U', 'B'];
  setHandSize(closed, 'p2', 5);
  const closedRisk = buildInteractionRisk(closed, 'p1');

  const open = createInitialState();
  open.players.p2.colorIdentity = ['U', 'B'];
  setHandSize(open, 'p2', 5);
  open.players.p2.zones.battlefield.push(land('Island', 'U'), land('Swamp', 'B'));
  const openRisk = buildInteractionRisk(open, 'p1');

  assert.equal(closedRisk.categories.counterspell.probability, 0);
  assert.equal(closedRisk.categories.removal.probability, 0);
  assert.ok(openRisk.categories.counterspell.probability > 0);
  assert.ok(openRisk.categories.removal.probability > 0);
});

test('seeing a board wipe used lowers the sampled probability of another wipe', () => {
  const state = createInitialState();
  state.players.p2.colorIdentity = ['W'];
  setHandSize(state, 'p2', 6);
  state.players.p2.zones.battlefield.push(land('Plains 1', 'W'), land('Plains 2', 'W'), land('Plains 3', 'W'), land('Plains 4', 'W'));
  const before = buildInteractionRisk(state, 'p1').categories.boardWipe.probability;
  recordPublicEvent(state, {
    type: 'cast', actorId: 'p2', subjectPlayerId: 'p2',
    card: card({ instanceId: 'wipe', name: 'Wrath Test', typeLine: 'Sorcery', oracleText: 'Destroy all creatures.', owner: 'p2', controller: 'p2', colorIdentity: ['W'] }),
  });
  const after = buildInteractionRisk(state, 'p1').categories.boardWipe.probability;
  assert.ok(before > after);
});

test('a publicly known removal spell returned to hand creates high exact-card risk', () => {
  const state = createInitialState();
  state.players.p2.colorIdentity = ['B'];
  setHandSize(state, 'p2', 3);
  state.players.p2.zones.battlefield.push(land('Swamp 1', 'B'), land('Swamp 2', 'B'));
  const removal = card({ instanceId: 'known-removal', name: 'Known Murder', manaCost: '{1}{B}', manaValue: 2, typeLine: 'Instant', oracleText: 'Destroy target creature.', owner: 'p2', controller: 'p2', colorIdentity: ['B'] });
  recordPublicEvent(state, { type: 'returned_to_hand', actorId: 'p2', subjectPlayerId: 'p2', card: removal, fromZone: 'graveyard', toZone: 'hand' });
  const risk = buildInteractionRisk(state, 'p1');
  assert.ok(risk.categories.removal.probability >= 0.9);
  assert.equal(risk.categories.removal.knownCards[0].name, 'Known Murder');
});

test('seven cards in hand creates more hidden interaction risk than one card', () => {
  const one = createInitialState();
  one.players.p2.colorIdentity = ['U'];
  one.players.p2.zones.battlefield.push(land('Island 1', 'U'), land('Island 2', 'U'));
  setHandSize(one, 'p2', 1);

  const seven = createInitialState();
  seven.players.p2.colorIdentity = ['U'];
  seven.players.p2.zones.battlefield.push(land('Island 1', 'U'), land('Island 2', 'U'));
  setHandSize(seven, 'p2', 7);

  assert.ok(buildInteractionRisk(seven, 'p1').categories.counterspell.probability > buildInteractionRisk(one, 'p1').categories.counterspell.probability);
});

test('flying attacker is valued when the opponent lacks flying or reach blockers', () => {
  const ground = createInitialState();
  ground.phaseIndex = 4;
  ground.players.p1.zones.battlefield.push(card({ instanceId: 'ground', name: 'Ground 3/3', power: '3', toughness: '3', owner: 'p1', controller: 'p1' }));
  ground.players.p2.zones.battlefield.push(card({ instanceId: 'blocker', name: 'Ground Blocker', power: '2', toughness: '4', owner: 'p2', controller: 'p2' }));

  const flying = createInitialState();
  flying.phaseIndex = 4;
  flying.players.p1.zones.battlefield.push(card({ instanceId: 'flyer', name: 'Flying 3/3', power: '3', toughness: '3', keywords: ['Flying'], owner: 'p1', controller: 'p1' }));
  flying.players.p2.zones.battlefield.push(card({ instanceId: 'blocker', name: 'Ground Blocker', power: '2', toughness: '4', owner: 'p2', controller: 'p2' }));

  assert.ok(attackScore(flying, 'flyer') > attackScore(ground, 'ground'));
});

test('early available land drop outranks passing', () => {
  const state = createInitialState();
  state.phaseIndex = 3;
  state.turnNumber = 1;
  state.players.p1.zones.hand.push(land('Island', 'U', 'p1'));
  const analysis = analyzePosition(state, 'p1', 80);
  assert.match(analysis.results[0].label, /Play Island/);
  const pass = analysis.results.find((result) => result.type === 'hold');
  assert.ok(analysis.results[0].score > pass.score);
});

test('sampled counterspells are impossible outside the opponent color identity', () => {
  const state = createInitialState();
  state.players.p2.colorIdentity = ['R'];
  setHandSize(state, 'p2', 7);
  state.players.p2.zones.battlefield.push(land('Mountain 1', 'R'), land('Mountain 2', 'R'), land('Mountain 3', 'R'));
  const risk = buildInteractionRisk(state, 'p1');
  assert.equal(risk.categories.counterspell.possibleByIdentity, false);
  assert.equal(risk.categories.counterspell.probability, 0);
});

test('information set never includes exact hidden opponent hand or library names', () => {
  const state = createInitialState();
  state.players.p2.zones.hand.push(card({ instanceId: 'secret', name: 'SECRET COUNTERSPELL', typeLine: 'Instant', owner: 'p2', controller: 'p2' }));
  state.players.p2.zones.library.push(card({ instanceId: 'secret-deck', name: 'SECRET DECK CARD', owner: 'p2', controller: 'p2' }));
  const info = buildInformationSet(state, 'p1');
  const serialized = JSON.stringify(info);
  assert.equal(info.players.p2.hand, undefined);
  assert.equal(info.players.p2.handSize, 1);
  assert.equal(info.players.p2.librarySize, 1);
  assert.doesNotMatch(serialized, /SECRET COUNTERSPELL|SECRET DECK CARD/);
});
