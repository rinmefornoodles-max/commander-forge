import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundlePath = path.join(root, `commander-forge-${pkg.commanderForge.bundleVersion}.js`);

const ctx = { console, structuredClone: globalThis.structuredClone, crypto: globalThis.crypto, setTimeout, clearTimeout };
ctx.globalThis = ctx;
ctx.window = ctx;
ctx.confirm = () => true;
ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'commander-forge-oracle-compiler-v7.js'), 'utf8'), ctx, { filename: 'compiler.js' });
let code = fs.readFileSync(bundlePath, 'utf8');
code = code.split('// ---- main.js ----')[0];
vm.runInContext(code, ctx, { filename: path.basename(bundlePath) });
const api = vm.runInContext(`(()=>({state:__modules['./state.js'], game:__modules['./game.js'], rules:__modules['./rules.js'], coach:__modules['./coach.js']}))()`, ctx);
ctx.window.CommanderForge = { getState: api.state.getState };

function creature(id, controller, name = 'Bear', oracleText = '') {
  return { instanceId:id, name, owner:controller, controller, typeLine:'Creature — Bear', oracleText, manaCost:'{1}{G}', manaValue:2, power:'2', toughness:'2', tapped:false, summoningSick:false, attacking:false, blocking:null, blockedBy:[], counters:{}, attachments:[], manualKeywords:[] };
}
function permanent(id, controller, name, oracleText, typeLine = 'Enchantment', manaValue = 3) {
  return { instanceId:id, name, owner:controller, controller, typeLine, oracleText, manaCost:'', manaValue, tapped:false, summoningSick:false, attacking:false, blocking:null, blockedBy:[], counters:{}, attachments:[], manualKeywords:[] };
}
function setup(playerCount = 2) {
  const state = api.state.createInitialState();
  if (playerCount > 2) for (let i=3;i<=playerCount;i+=1) { state.players[`p${i}`]=api.state.createPlayer(`p${i}`,`Player ${i}`); state.turnOrder.push(`p${i}`); }
  state.started=true; state.activePlayerId='p1'; state.priorityPlayerId='p1'; state.phaseIndex=4; state.settings.rulesMode='strict'; state.settings.manaMode='auto';
  api.state.setState(state,{persist:false}); return state;
}

test('normal two-player attack declares successfully',()=>{const state=setup(2);state.players.p1.zones.battlefield=[creature('a','p1')];api.state.setState(state,{persist:false});const result=api.game.toggleAttack('a','p2');assert.equal(result.ok,true);assert.equal(api.state.getState().players.p1.zones.battlefield[0].attacking,true);});
test('multiplayer attack requires and honors a defender choice',()=>{const state=setup(4);state.players.p1.zones.battlefield=[creature('a','p1')];api.state.setState(state,{persist:false});const pending=api.game.toggleAttack('a');assert.equal(pending.ok,false);assert.equal(pending.needsAttackTarget,true);assert.deepEqual([...pending.choices],['p2','p3','p4']);const chosen=api.game.toggleAttack('a','p3');assert.equal(chosen.ok,true);assert.equal(chosen.attackTax.defenderId,'p3');});
test('Void Winnower does not prohibit declaring attackers',()=>{const state=setup(2);state.players.p1.zones.battlefield=[creature('a','p1')];state.players.p2.zones.battlefield=[permanent('v','p2','Void Winnower',"Your opponents can't cast spells with even mana values. (Zero is even.)\nYour opponents can't block with creatures with even mana values.",'Creature — Eldrazi',9)];api.state.setState(state,{persist:false});assert.equal(api.game.toggleAttack('a','p2').ok,true);});
test('Propaganda rejects unpaid attack tax and accepts a paid one',()=>{const text="Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.";const noMana=setup(2);noMana.players.p1.zones.battlefield=[creature('a','p1')];noMana.players.p2.zones.battlefield=[permanent('p','p2','Propaganda',text)];api.state.setState(noMana,{persist:false});const rejected=api.game.toggleAttack('a','p2');assert.equal(rejected.ok,false);assert.equal(rejected.attackTax.required,true);const paid=setup(2);paid.players.p1.zones.battlefield=[creature('a','p1')];paid.players.p1.mana.C=2;paid.players.p2.zones.battlefield=[permanent('p','p2','Propaganda',text)];api.state.setState(paid,{persist:false});const accepted=api.game.toggleAttack('a','p2');assert.equal(accepted.ok,true);assert.equal(api.state.getState().players.p1.mana.C,0);});
test('attack triggers still queue',()=>{const state=setup(2);state.players.p1.zones.battlefield=[creature('a','p1','Goblin','Whenever this creature attacks, draw a card.')];api.state.setState(state,{persist:false});assert.equal(api.game.toggleAttack('a','p2').ok,true);assert.equal(api.state.getState().pendingTriggers.length,1);assert.equal(api.state.getState().pendingTriggers[0].kind,'attack-trigger');});
test('bot defense can block normally after a human attack',()=>{const state=setup(2);state.players.p1.zones.battlefield=[creature('a','p1')];state.players.p2.zones.battlefield=[creature('b','p2')];api.state.setState(state,{persist:false});api.game.toggleAttack('a','p2');const advice=api.coach.defenseAdvice(api.state.getState());assert.equal(advice.assignments.length,1);assert.deepEqual([...advice.assignments[0].blockerIds],['b']);});
test('Void Winnower prevents opponent even-MV blocker',()=>{const state=setup(2);state.players.p1.zones.battlefield=[creature('a','p1'),permanent('v','p1','Void Winnower',"Your opponents can't cast spells with even mana values. (Zero is even.)\nYour opponents can't block with creatures with even mana values.",'Creature — Eldrazi',9)];state.players.p2.zones.battlefield=[creature('b','p2')];api.state.setState(state,{persist:false});api.game.toggleAttack('a','p2');const advice=api.coach.defenseAdvice(api.state.getState());assert.equal(advice.assignments.length,0);assert.equal(advice.expectedDamage,2);});
