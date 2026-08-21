import test from 'node:test';
import assert from 'node:assert/strict';
import { directManaOracleLines, manaProductionChoices } from '../utils.js';

function card(name, typeLine, oracleText, producedMana = []) {
  return { name, typeLine, oracleText, producedMana };
}

function labels(value) {
  return manaProductionChoices(value).map((choice) => choice.label).sort();
}

test('Pawn of Ulamog is not treated as the Spawn token mana source', () => {
  const pawn = card(
    'Pawn of Ulamog',
    'Creature — Vampire Shaman',
    'Whenever Pawn of Ulamog or another nontoken creature you control dies, you may create a 0/1 colorless Eldrazi Spawn creature token. It has "Sacrifice this creature: Add {C}."',
    ['C'],
  );
  assert.deepEqual(directManaOracleLines(pawn), []);
  assert.deepEqual(manaProductionChoices(pawn), []);
});

test('Treasure reminder text does not turn the spell/permanent creating it into a mana source', () => {
  const maker = card(
    'Treasure Maker',
    'Enchantment',
    'At the beginning of your upkeep, create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this artifact: Add one mana of any color.")',
    ['W', 'U', 'B', 'R', 'G'],
  );
  assert.deepEqual(manaProductionChoices(maker), []);
});

test('granted mana abilities belong to the granted objects, not the source card', () => {
  const rite = card(
    'Cryptolith Rite',
    'Enchantment',
    'Creatures you control have "{T}: Add one mana of any color."',
    ['W', 'U', 'B', 'R', 'G'],
  );
  assert.deepEqual(manaProductionChoices(rite), []);
});

test('triggered mana generation is not exposed as an on-demand payment source', () => {
  const cobra = card(
    'Lotus Cobra',
    'Creature — Snake',
    'Landfall — Whenever a land enters the battlefield under your control, add one mana of any color.',
    ['W', 'U', 'B', 'R', 'G'],
  );
  assert.deepEqual(manaProductionChoices(cobra), []);
});

test('real activated mana abilities still work', () => {
  const solRing = card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.', ['C']);
  assert.equal(manaProductionChoices(solRing).length, 1);
  assert.equal(manaProductionChoices(solRing)[0].mana.C, 2);

  const spawn = card('Eldrazi Spawn', 'Token Creature — Eldrazi Spawn', 'Sacrifice this creature: Add {C}.', ['C']);
  assert.equal(manaProductionChoices(spawn).length, 1);
  assert.equal(manaProductionChoices(spawn)[0].mana.C, 1);
});

test('Chromatic Lantern ignores the granted land ability but keeps its own mana ability', () => {
  const lantern = card(
    'Chromatic Lantern',
    'Artifact',
    'Lands you control have "{T}: Add one mana of any color."\n{T}: Add one mana of any color.',
    ['W', 'U', 'B', 'R', 'G'],
  );
  assert.deepEqual(labels(lantern), ['B', 'G', 'R', 'U', 'W']);
  assert.equal(directManaOracleLines(lantern).length, 1);
});

test('basic land type fallback still produces mana when Oracle text is omitted', () => {
  const forest = card('Forest', 'Basic Land — Forest', '', ['G']);
  assert.deepEqual(labels(forest), ['G']);
});
