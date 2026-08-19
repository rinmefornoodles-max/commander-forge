'use strict';
const assert = require('assert');
const { createEngine, ZONES, EVENTS } = require('./commander-forge-engine-v6.js');

function manaAll(p, n = 20) { for (const c of ['W','U','B','R','G','C']) p.mana[c] = n; }

// Trigger chain: creature ETB -> Soul Warden -> stack -> life gain.
{
  const e = createEngine(); e.createGame([{id:'p1',name:'P1'},{id:'p2',name:'P2'}]);
  const warden = e.addCard('soul-warden','p1',ZONES.BATTLEFIELD);
  const bear = e.addCard('grizzly-bears','p1',ZONES.HAND);
  e.moveCard(bear,ZONES.BATTLEFIELD,{controllerId:'p1',cause:'test'});
  assert.equal(e.state.stack.length,1,'ETB should create one trigger');
  e.resolveTop();
  assert.equal(e.state.players.p1.life,41,'Soul Warden trigger should gain 1 life');
  assert.ok(warden);
}

// Real stack spell resolution.
{
  const e = createEngine(); e.createGame([{id:'p1'},{id:'p2'}]); manaAll(e.state.players.p1);
  const bolt=e.addCard('lightning-bolt','p1',ZONES.HAND);
  e.castSpell('p1',bolt,{targetIds:['p2']});
  assert.equal(e.state.stack.length,1);
  e.resolveTop();
  assert.equal(e.state.players.p2.life,37);
  assert.equal(e.card(bolt).zone,ZONES.GRAVEYARD);
}

// Commander tax increments on command-zone cast.
{
  const e=createEngine(); e.createGame([{id:'p1'},{id:'p2'}]); manaAll(e.state.players.p1);
  const n=e.addCard('nethroi-apex-of-death','p1',ZONES.COMMAND,{commander:true});
  e.castSpell('p1',n);
  assert.equal(e.state.players.p1.commanderCastCount[n],1);
  e.counterStackObject(e.state.stack[0].id);
  e.moveCard(n,ZONES.COMMAND,{cause:'commander-return'});
  assert.ok(e.canPay('p1','{2}{W}{B}{G}',2));
}

// Mutate from command zone, combined abilities, Nethroi target constraint.
{
  const e=createEngine(); e.createGame([{id:'p1'},{id:'p2'}]); manaAll(e.state.players.p1);
  e.registerDefinitions([
    {id:'five-power',name:'Five Power',typeLine:'Creature — Beast',manaCost:'{5}',power:5,toughness:5},
    {id:'six-power',name:'Six Power',typeLine:'Creature — Beast',manaCost:'{6}',power:6,toughness:6},
    {id:'ninja-test',name:'Test Ninja',typeLine:'Creature — Ninja',manaCost:'{3}{U}',power:3,toughness:2,abilities:[{type:'ninjutsu',cost:'{1}{U}'}]}
  ]);
  const target=e.addCard('grizzly-bears','p1',ZONES.BATTLEFIELD);
  const n=e.addCard('nethroi-apex-of-death','p1',ZONES.COMMAND,{commander:true});
  const g1=e.addCard('five-power','p1',ZONES.GRAVEYARD);
  const g2=e.addCard('six-power','p1',ZONES.GRAVEYARD);
  e.castMutate('p1',n,target,{ignoreCost:true,position:'top'});
  assert.equal(e.state.players.p1.commanderCastCount[n],1,'mutate from command should count as commander cast');
  assert.equal(e.definition(target).name,'Nethroi, Apex of Death');
  assert.ok(e._abilitiesForCard(target).some(a=>a.type==='mutate'));
  assert.equal(e.state.stack.length,1,'Nethroi mutate trigger should be on stack');
  const trigger=e.state.stack[0];
  assert.equal(e.validateTargetSelection(trigger.target,[g1],{controllerId:'p1'}).legal,true);
  assert.equal(e.validateTargetSelection(trigger.target,[g1,g2],{controllerId:'p1'}).legal,false,'11 total power should be rejected');
  e.resolveTop({targetIds:[g1]});
  assert.equal(e.card(g1).zone,ZONES.BATTLEFIELD);
}

// Ninjutsu returns unblocked attacker and puts Ninja tapped/attacking.
{
  const e=createEngine(); e.createGame([{id:'p1'},{id:'p2'}]); manaAll(e.state.players.p1);
  e.registerDefinition({id:'ninja-test',name:'Test Ninja',typeLine:'Creature — Ninja',manaCost:'{3}{U}',power:3,toughness:2,abilities:[{type:'ninjutsu',cost:'{1}{U}'}]});
  const attacker=e.addCard('grizzly-bears','p1',ZONES.BATTLEFIELD); e.card(attacker).summoningSick=false;
  e.state.turn.activePlayerId='p1'; e.declareAttackers('p1',[{cardId:attacker,defenderId:'p2'}]);
  const ninja=e.addCard('ninja-test','p1',ZONES.HAND);
  e.activateNinjutsu('p1',ninja,attacker,{ignoreCost:true});
  assert.equal(e.card(attacker).zone,ZONES.HAND);
  assert.equal(e.card(ninja).zone,ZONES.BATTLEFIELD);
  assert.equal(e.card(ninja).tapped,true);
  assert.equal(e.card(ninja).attackingPlayerId,'p2');
}

// Commander damage SBA loss.
{
  const e=createEngine(); e.createGame([{id:'p1'},{id:'p2'}]);
  const commander=e.addCard('serra-angel','p1',ZONES.BATTLEFIELD,{commander:true});
  e.dealDamage(commander,'p2',21,{combat:true});
  assert.equal(e.state.players.p2.lost,true);
  assert.equal(e.state.winnerId,'p1');
}

console.log('Commander Forge Engine 6 alpha tests: PASS');
