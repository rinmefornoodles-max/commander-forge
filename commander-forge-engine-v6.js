/*
 * Commander Forge Rules Engine 6 alpha
 * Browser-native deterministic Magic/Commander rules core.
 * Architecture inspired by mature rules engines such as XMage, but implemented
 * independently for Commander Forge's web runtime.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CommanderForgeRulesV6 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENGINE_VERSION = '6.0.0-alpha.1';
  const ZONES = Object.freeze({
    LIBRARY: 'library', HAND: 'hand', BATTLEFIELD: 'battlefield',
    GRAVEYARD: 'graveyard', EXILE: 'exile', COMMAND: 'command', STACK: 'stack'
  });
  const STEPS = Object.freeze([
    'untap', 'upkeep', 'draw', 'main1', 'begin_combat', 'declare_attackers',
    'declare_blockers', 'combat_damage', 'end_combat', 'main2', 'end', 'cleanup'
  ]);
  const EVENTS = Object.freeze({
    GAME_START: 'GAME_START', TURN_START: 'TURN_START', STEP_START: 'STEP_START',
    SPELL_CAST: 'SPELL_CAST', SPELL_RESOLVED: 'SPELL_RESOLVED', SPELL_COUNTERED: 'SPELL_COUNTERED',
    ABILITY_ACTIVATED: 'ABILITY_ACTIVATED', ENTERS_BATTLEFIELD: 'ENTERS_BATTLEFIELD',
    LEAVES_BATTLEFIELD: 'LEAVES_BATTLEFIELD', DIES: 'DIES', DRAW: 'DRAW', DISCARD: 'DISCARD',
    MILL: 'MILL', LIFE_GAINED: 'LIFE_GAINED', LIFE_LOST: 'LIFE_LOST', DAMAGE: 'DAMAGE',
    ATTACKS: 'ATTACKS', BLOCKS: 'BLOCKS', COMBAT_DAMAGE: 'COMBAT_DAMAGE',
    COUNTER_ADDED: 'COUNTER_ADDED', COUNTER_REMOVED: 'COUNTER_REMOVED',
    TAPPED: 'TAPPED', UNTAPPED: 'UNTAPPED', CONTROL_CHANGED: 'CONTROL_CHANGED',
    MUTATED: 'MUTATED', NINJUTSU: 'NINJUTSU'
  });

  function uid(prefix = 'id') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function clone(v) { return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }
  function asArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
  function typeHas(card, word) { return new RegExp(`\\b${word}\\b`, 'i').test(card?.typeLine || ''); }
  function isCreature(card) { return typeHas(card, 'Creature'); }
  function isLand(card) { return typeHas(card, 'Land'); }
  function isPermanent(card) { return /(Creature|Artifact|Enchantment|Planeswalker|Battle|Land)/i.test(card?.typeLine || ''); }
  function hasSubtype(card, subtype) { return String(card?.typeLine || '').split(/[—-]/)[1]?.split(/\s+/).includes(subtype) || false; }
  function parseMana(cost = '') {
    const out = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], X: 0 };
    for (const m of String(cost).matchAll(/\{([^}]+)\}/g)) {
      const s = m[1].toUpperCase();
      if (/^\d+$/.test(s)) out.generic += Number(s);
      else if (Object.prototype.hasOwnProperty.call(out, s)) out[s] += 1;
      else if (s === 'X') out.X += 1;
      else if (s.includes('/')) out.hybrid.push(s.split('/'));
    }
    return out;
  }

  class RulesError extends Error {
    constructor(message, code = 'RULES_ERROR', data = {}) {
      super(message); this.name = 'RulesError'; this.code = code; this.data = data;
    }
  }

  class EventBus {
    constructor() { this.listeners = new Map(); }
    on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.listeners.get(type)?.delete(fn); }
    emit(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); for (const fn of this.listeners.get('*') || []) fn(event); }
  }

  const EFFECTS = Object.freeze({
    DRAW: 'DRAW', DISCARD: 'DISCARD', MILL: 'MILL', MOVE: 'MOVE', DESTROY: 'DESTROY',
    EXILE: 'EXILE', SACRIFICE: 'SACRIFICE', DAMAGE: 'DAMAGE', GAIN_LIFE: 'GAIN_LIFE',
    LOSE_LIFE: 'LOSE_LIFE', ADD_COUNTER: 'ADD_COUNTER', REMOVE_COUNTER: 'REMOVE_COUNTER',
    TAP: 'TAP', UNTAP: 'UNTAP', CREATE_TOKEN: 'CREATE_TOKEN', CHANGE_CONTROL: 'CHANGE_CONTROL',
    COUNTER_SPELL: 'COUNTER_SPELL', SEARCH_LIBRARY: 'SEARCH_LIBRARY', SHUFFLE: 'SHUFFLE',
    RETURN_FROM_GRAVEYARD: 'RETURN_FROM_GRAVEYARD'
  });

  class Engine {
    constructor(options = {}) {
      this.options = { commander: true, strict: true, ...options };
      this.definitions = new Map();
      this.bus = new EventBus();
      this.state = this._blankState();
      this.history = [];
      this.replacements = [];
      this.continuousEffects = [];
      this._processingEvent = false;
    }

    _blankState() {
      return {
        engineVersion: ENGINE_VERSION,
        gameId: uid('game'),
        players: {},
        playerOrder: [],
        cards: {},
        stack: [],
        triggerQueue: [],
        pendingChoice: null,
        turn: { number: 0, activePlayerId: null, stepIndex: 0, priorityPlayerId: null, consecutivePasses: 0 },
        combat: { attackers: {}, blockers: {} },
        log: [],
        winnerId: null,
        ended: false
      };
    }

    reset() { this.state = this._blankState(); this.history = []; }
    registerDefinition(def) {
      if (!def?.id && !def?.name) throw new RulesError('Card definition requires id or name.', 'BAD_DEFINITION');
      const normalized = clone({ abilities: [], keywords: [], ...def, id: def.id || def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
      this.definitions.set(normalized.id, normalized);
      this.definitions.set(normalized.name.toLowerCase(), normalized);
      return normalized.id;
    }
    registerDefinitions(defs = []) { defs.forEach((d) => this.registerDefinition(d)); }
    getDefinition(idOrName) { return this.definitions.get(idOrName) || this.definitions.get(String(idOrName || '').toLowerCase()) || null; }

    createGame(players = []) {
      this.reset();
      for (const p of players) {
        const id = p.id || uid('player');
        this.state.playerOrder.push(id);
        this.state.players[id] = {
          id, name: p.name || id, life: p.life ?? (this.options.commander ? 40 : 20), poison: 0,
          mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
          zones: { library: [], hand: [], battlefield: [], graveyard: [], exile: [], command: [] },
          commanderCastCount: {}, commanderDamage: {}, lost: false
        };
      }
      if (this.state.playerOrder.length) {
        this.state.turn.activePlayerId = this.state.playerOrder[0];
        this.state.turn.priorityPlayerId = this.state.playerOrder[0];
      }
      this.emit({ type: EVENTS.GAME_START, playerIds: [...this.state.playerOrder] });
      return this.snapshot();
    }

    addCard(definitionId, ownerId, zone = ZONES.LIBRARY, options = {}) {
      const def = this.getDefinition(definitionId);
      if (!def) throw new RulesError(`Unknown card definition: ${definitionId}`, 'UNKNOWN_CARD');
      if (!this.state.players[ownerId]) throw new RulesError('Unknown owner.', 'UNKNOWN_PLAYER');
      const id = options.id || uid('card');
      const card = {
        id, definitionId: def.id, name: def.name, ownerId, controllerId: options.controllerId || ownerId,
        zone, commander: Boolean(options.commander), token: Boolean(options.token), tapped: Boolean(options.tapped),
        counters: {}, damageMarked: 0, summoningSick: zone === ZONES.BATTLEFIELD && isCreature(def),
        attackingPlayerId: null, blockedBy: [], blocking: [], attachedTo: null, mutationPile: [id], mutationComponentDefinitions: [def.id],
        castXValue: 0, face: 0
      };
      this.state.cards[id] = card;
      if (zone !== ZONES.STACK) this._zone(ownerId, zone).push(id);
      return id;
    }

    _zone(playerId, zone) {
      const p = this.state.players[playerId];
      if (!p?.zones?.[zone]) throw new RulesError(`Invalid zone ${zone} for ${playerId}.`, 'BAD_ZONE');
      return p.zones[zone];
    }
    _removeFromZones(cardId) {
      for (const p of Object.values(this.state.players)) {
        for (const zone of Object.keys(p.zones)) {
          const i = p.zones[zone].indexOf(cardId); if (i >= 0) p.zones[zone].splice(i, 1);
        }
      }
    }
    card(cardId) { return this.state.cards[cardId] || null; }
    definition(cardOrId) { const card = typeof cardOrId === 'string' ? this.card(cardOrId) : cardOrId; return card ? this.getDefinition(card.definitionId) : null; }
    _abilitiesForCard(cardOrId) {
      const card = typeof cardOrId === 'string' ? this.card(cardOrId) : cardOrId;
      if (!card) return [];
      const ids = card.mutationComponentDefinitions?.length ? card.mutationComponentDefinitions : [card.definitionId];
      return ids.flatMap((id) => this.getDefinition(id)?.abilities || []);
    }
    _keywordsForCard(cardOrId) {
      const card = typeof cardOrId === 'string' ? this.card(cardOrId) : cardOrId;
      if (!card) return [];
      const ids = card.mutationComponentDefinitions?.length ? card.mutationComponentDefinitions : [card.definitionId];
      return [...new Set(ids.flatMap((id) => this.getDefinition(id)?.keywords || []))];
    }
    controller(cardId) { return this.state.players[this.card(cardId)?.controllerId] || null; }
    owner(cardId) { return this.state.players[this.card(cardId)?.ownerId] || null; }

    snapshot() { return clone(this.state); }
    loadSnapshot(state) { this.state = clone(state); return this.snapshot(); }
    saveHistory(label = '') { this.history.push({ label, state: this.snapshot() }); if (this.history.length > 80) this.history.shift(); }
    undo() { const item = this.history.pop(); if (!item) return false; this.state = item.state; return true; }

    log(text, data = {}) { this.state.log.unshift({ id: uid('log'), at: Date.now(), text, ...clone(data) }); if (this.state.log.length > 400) this.state.log.length = 400; }

    emit(event) {
      const enriched = { id: uid('event'), at: Date.now(), ...clone(event) };
      this.bus.emit(enriched);
      this._collectTriggers(enriched);
      return enriched;
    }

    _collectTriggers(event) {
      const triggered = [];
      for (const card of Object.values(this.state.cards)) {
        if (card.zone !== ZONES.BATTLEFIELD) continue;
        const def = this.definition(card);
        for (const ability of this._abilitiesForCard(card)) {
          if (ability.type !== 'trigger' || ability.event !== event.type) continue;
          if (!this._conditionMatches(ability.condition, { event, source: card })) continue;
          triggered.push({
            id: uid('trigger'), type: 'triggeredAbility', sourceId: card.id, controllerId: card.controllerId,
            label: ability.label || `${card.name} trigger`, effects: clone(asArray(ability.effects || ability.effect)),
            event: clone(event), target: clone(ability.target || null)
          });
        }
      }
      // Active player, nonactive player ordering for simultaneous triggers.
      const order = this._apnapOrder();
      triggered.sort((a, b) => order.indexOf(a.controllerId) - order.indexOf(b.controllerId));
      this.state.triggerQueue.push(...triggered);
      this._putQueuedTriggersOnStack();
    }

    _apnapOrder() {
      const order = [...this.state.playerOrder]; const active = this.state.turn.activePlayerId; const i = order.indexOf(active);
      return i < 0 ? order : order.slice(i).concat(order.slice(0, i));
    }

    _putQueuedTriggersOnStack() {
      while (this.state.triggerQueue.length) {
        const t = this.state.triggerQueue.shift();
        this.state.stack.push(t);
        this.log(`${this.card(t.sourceId)?.name || 'An ability'} triggered.`);
      }
    }

    _conditionMatches(condition, ctx) {
      if (!condition) return true;
      if (Array.isArray(condition)) return condition.every((c) => this._conditionMatches(c, ctx));
      const { event, source } = ctx;
      switch (condition.type) {
        case 'AND': return asArray(condition.conditions).every((c) => this._conditionMatches(c, ctx));
        case 'OR': return asArray(condition.conditions).some((c) => this._conditionMatches(c, ctx));
        case 'NOT': return !this._conditionMatches(condition.condition, ctx);
        case 'SOURCE_IS_SUBJECT': return event.cardId === source.id || event.sourceId === source.id;
        case 'SUBJECT_IS_OTHER': return event.cardId !== source.id && event.sourceId !== source.id;
        case 'SUBJECT_IS_CREATURE': return isCreature(this.definition(event.cardId || event.sourceId));
        case 'SUBJECT_CONTROLLER_IS_YOU': return this.card(event.cardId || event.sourceId)?.controllerId === source.controllerId || event.playerId === source.controllerId;
        case 'PLAYER_IS_YOU': return event.playerId === source.controllerId;
        case 'PLAYER_IS_OPPONENT': return event.playerId && event.playerId !== source.controllerId;
        default: return true;
      }
    }

    addReplacement(replacement) { this.replacements.push(clone(replacement)); }
    applyReplacements(event) {
      let current = clone(event);
      for (const r of this.replacements) {
        if (r.event !== current.type) continue;
        if (r.condition && !this._conditionMatches(r.condition, { event: current, source: this.card(r.sourceId) })) continue;
        if (typeof r.apply === 'function') current = r.apply(current, this) || current;
        else if (r.replaceWith) current = { ...current, ...clone(r.replaceWith) };
      }
      return current;
    }

    addContinuousEffect(effect) { this.continuousEffects.push(clone(effect)); }
    deriveCard(cardId) {
      const card = clone(this.card(cardId)); if (!card) return null;
      const def = clone(this.definition(card));
      let out = { ...def, runtime: card, power: Number(def.power ?? 0), toughness: Number(def.toughness ?? 0), keywords: this._keywordsForCard(card), abilities: this._abilitiesForCard(card), typeLine: def.typeLine || '' };
      // Lightweight layer framework; individual effect modules can target specific layers.
      const layerOrder = ['copy', 'control', 'text', 'type', 'color', 'abilities', 'pt-set', 'pt-mod', 'counters', 'switch'];
      for (const layer of layerOrder) {
        for (const e of this.continuousEffects.filter((x) => x.layer === layer)) {
          if (e.targetId && e.targetId !== cardId) continue;
          if (e.controllerId && e.controllerId !== card.controllerId) continue;
          if (e.addPower) out.power += Number(e.addPower);
          if (e.addToughness) out.toughness += Number(e.addToughness);
          if (e.setPower != null) out.power = Number(e.setPower);
          if (e.setToughness != null) out.toughness = Number(e.setToughness);
          if (e.addKeyword && !out.keywords.includes(e.addKeyword)) out.keywords.push(e.addKeyword);
          if (e.removeKeyword) out.keywords = out.keywords.filter((k) => k !== e.removeKeyword);
          if (e.typeLine) out.typeLine = e.typeLine;
        }
      }
      const plus = Object.entries(card.counters || {}).reduce((acc, [k, n]) => {
        const m = k.match(/^([+-]\d+)\/([+-]\d+)$/); if (m) { acc.p += Number(m[1]) * n; acc.t += Number(m[2]) * n; } return acc;
      }, { p: 0, t: 0 });
      out.power += plus.p; out.toughness += plus.t;
      return out;
    }

    canPay(playerId, cost, extraGeneric = 0, xValue = 0) {
      const p = this.state.players[playerId]; if (!p) return false;
      const req = parseMana(cost); req.generic += Number(extraGeneric || 0) + req.X * Number(xValue || 0);
      const pool = { ...p.mana };
      for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) { if (pool[c] < req[c]) return false; pool[c] -= req[c]; }
      for (const opts of req.hybrid) {
        const c = opts.find((x) => pool[x] > 0); if (!c) return false; pool[c]--;
      }
      return Object.values(pool).reduce((a, b) => a + Number(b || 0), 0) >= req.generic;
    }

    payMana(playerId, cost, extraGeneric = 0, xValue = 0) {
      if (!this.canPay(playerId, cost, extraGeneric, xValue)) throw new RulesError('Mana cost cannot be paid.', 'CANNOT_PAY');
      const p = this.state.players[playerId]; const req = parseMana(cost); req.generic += Number(extraGeneric || 0) + req.X * Number(xValue || 0);
      for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) { p.mana[c] -= req[c]; }
      for (const opts of req.hybrid) { const c = opts.find((x) => p.mana[x] > 0); p.mana[c]--; }
      for (const c of ['C', 'W', 'U', 'B', 'R', 'G']) { const take = Math.min(req.generic, p.mana[c]); p.mana[c] -= take; req.generic -= take; }
    }

    castSpell(playerId, cardId, options = {}) {
      const card = this.card(cardId); const def = this.definition(card);
      if (!card || card.controllerId !== playerId) throw new RulesError('You do not control that card.', 'NOT_CONTROLLER');
      if (![ZONES.HAND, ZONES.COMMAND].includes(card.zone)) throw new RulesError('Card is not castable from this zone.', 'BAD_CAST_ZONE');
      if (isLand(def)) throw new RulesError('Lands are played, not cast.', 'LAND_NOT_SPELL');
      const tax = card.zone === ZONES.COMMAND && card.commander ? 2 * (this.state.players[playerId].commanderCastCount[card.id] || 0) : 0;
      if (!options.ignoreCost) this.payMana(playerId, options.altCost || def.manaCost || '', tax, options.xValue || 0);
      this.saveHistory(`Cast ${card.name}`);
      this._removeFromZones(cardId); card.zone = ZONES.STACK; card.castXValue = options.xValue || 0;
      const stackObj = { id: uid('spell'), type: 'spell', sourceId: cardId, cardId, controllerId: playerId, effects: clone(asArray(options.effects || def.spellEffects || [])), targetIds: clone(options.targetIds || []) };
      this.state.stack.push(stackObj);
      if (card.commander && options.fromCommand !== false && card.ownerId === playerId) this.state.players[playerId].commanderCastCount[card.id] = (this.state.players[playerId].commanderCastCount[card.id] || 0) + 1;
      this.emit({ type: EVENTS.SPELL_CAST, playerId, cardId, stackId: stackObj.id });
      this._resetPriority(playerId);
      this.log(`${this.state.players[playerId].name} cast ${card.name}.`);
      return stackObj.id;
    }

    playLand(playerId, cardId) {
      const card = this.card(cardId); const def = this.definition(card);
      if (!card || card.zone !== ZONES.HAND || card.controllerId !== playerId || !isLand(def)) throw new RulesError('That land cannot be played.', 'ILLEGAL_LAND_PLAY');
      this.saveHistory(`Play ${card.name}`);
      this.moveCard(cardId, ZONES.BATTLEFIELD, { controllerId: playerId, cause: 'land-play' });
      return true;
    }

    counterStackObject(stackId) {
      const i = this.state.stack.findIndex((s) => s.id === stackId); if (i < 0) throw new RulesError('Stack object not found.', 'NO_STACK_OBJECT');
      const [obj] = this.state.stack.splice(i, 1);
      if (obj.type === 'spell') {
        const card = this.card(obj.cardId); card.zone = ZONES.GRAVEYARD; this._zone(card.ownerId, ZONES.GRAVEYARD).push(card.id);
        this.emit({ type: EVENTS.SPELL_COUNTERED, cardId: card.id, playerId: obj.controllerId });
      }
      return obj;
    }

    resolveTop(options = {}) {
      if (!this.state.stack.length) return null;
      const obj = this.state.stack.pop();
      const selectedTargets = options.targetIds || obj.targetIds || [];
      if (obj.target) {
        const validation = this.validateTargetSelection(obj.target, selectedTargets, { sourceId: obj.sourceId, controllerId: obj.controllerId });
        if (!validation.legal) { this.state.stack.push(obj); throw new RulesError(validation.reason, 'ILLEGAL_TARGET_SELECTION', validation); }
      }
      if (obj.type === 'spell') {
        const targetedSpecs = (obj.effects || []).map((e) => e?.target).filter((t) => t && t.fromContextIndex == null && !t.fromContextAll && t.type !== 'SOURCE');
        if (targetedSpecs.length === 1) {
          const validation = this.validateTargetSelection(targetedSpecs[0], selectedTargets, { sourceId: obj.sourceId, controllerId: obj.controllerId });
          if (!validation.legal) { this.state.stack.push(obj); throw new RulesError(validation.reason, 'ILLEGAL_TARGET_SELECTION', validation); }
        }
        const card = this.card(obj.cardId); const def = this.definition(card);
        for (const effect of obj.effects) this.executeEffect(effect, { sourceId: card.id, controllerId: obj.controllerId, targetIds: selectedTargets, event: null });
        if (isPermanent(def)) this.moveCard(card.id, ZONES.BATTLEFIELD, { controllerId: obj.controllerId, cause: 'spell-resolve' });
        else { this._removeFromZones(card.id); card.zone = ZONES.GRAVEYARD; this._zone(card.ownerId, ZONES.GRAVEYARD).push(card.id); }
        this.emit({ type: EVENTS.SPELL_RESOLVED, playerId: obj.controllerId, cardId: card.id });
      } else {
        for (const effect of obj.effects || []) this.executeEffect(effect, { sourceId: obj.sourceId, controllerId: obj.controllerId, targetIds: selectedTargets || [], event: obj.event || null });
      }
      this.runStateBasedActions(); this._resetPriority(this.state.turn.activePlayerId);
      return obj;
    }

    executeEffect(effect, ctx = {}) {
      if (!effect) return;
      if (Array.isArray(effect)) { effect.forEach((e) => this.executeEffect(e, ctx)); return; }
      const controllerId = effect.playerId === 'YOU' ? ctx.controllerId : (effect.playerId || ctx.controllerId);
      const targets = this.resolveTargets(effect.target, ctx);
      switch (effect.type) {
        case EFFECTS.DRAW: return this.draw(controllerId, effect.amount || 1);
        case EFFECTS.MILL: return this.mill(controllerId, effect.amount || 1);
        case EFFECTS.GAIN_LIFE: return this.gainLife(controllerId, effect.amount || 1);
        case EFFECTS.LOSE_LIFE: return this.loseLife(controllerId, effect.amount || 1);
        case EFFECTS.DAMAGE: return targets.forEach((id) => this.dealDamage(ctx.sourceId, id, effect.amount || 1, { combat: Boolean(effect.combat) }));
        case EFFECTS.DESTROY: return targets.forEach((id) => this.destroy(id, ctx.sourceId));
        case EFFECTS.EXILE: return targets.forEach((id) => this.moveCard(id, ZONES.EXILE, { cause: 'exile', sourceId: ctx.sourceId }));
        case EFFECTS.SACRIFICE: return targets.forEach((id) => this.sacrifice(id, controllerId));
        case EFFECTS.MOVE: return targets.forEach((id) => this.moveCard(id, effect.zone, { cause: effect.cause || 'effect', controllerId: effect.controllerId || undefined }));
        case EFFECTS.ADD_COUNTER: return targets.forEach((id) => this.addCounter(id, effect.counter || '+1/+1', effect.amount || 1));
        case EFFECTS.REMOVE_COUNTER: return targets.forEach((id) => this.removeCounter(id, effect.counter || '+1/+1', effect.amount || 1));
        case EFFECTS.TAP: return targets.forEach((id) => this.tap(id));
        case EFFECTS.UNTAP: return targets.forEach((id) => this.untap(id));
        case EFFECTS.CHANGE_CONTROL: return targets.forEach((id) => this.changeControl(id, effect.controllerId === 'YOU' ? ctx.controllerId : effect.controllerId));
        case EFFECTS.CREATE_TOKEN: return this.createToken(controllerId, effect.token, effect.amount || 1);
        case EFFECTS.COUNTER_SPELL: if (targets[0]) return this.counterStackObject(targets[0]); break;
        case EFFECTS.RETURN_FROM_GRAVEYARD: return targets.forEach((id) => this.moveCard(id, ZONES.BATTLEFIELD, { controllerId: this.card(id).ownerId, cause: 'return' }));
        case EFFECTS.SHUFFLE: return this.shuffleLibrary(controllerId);
        default: return null;
      }
    }

    resolveTargets(targetSpec, ctx = {}) {
      if (!targetSpec) return ctx.targetIds || [];
      if (Array.isArray(targetSpec.ids)) return targetSpec.ids;
      if (targetSpec.fromContextAll) return [...(ctx.targetIds || [])];
      if (targetSpec.fromContextIndex != null) return ctx.targetIds?.[targetSpec.fromContextIndex] ? [ctx.targetIds[targetSpec.fromContextIndex]] : [];
      if (targetSpec.type === 'SOURCE') return ctx.sourceId ? [ctx.sourceId] : [];
      const selected = [...(ctx.targetIds || [])];
      if (!selected.length) return [];
      const legal = new Set(this.legalTargets(targetSpec, ctx));
      return selected.filter((id) => legal.has(id));
    }

    legalTargets(spec = {}, ctx = {}) {
      const ids = [];
      if (spec.kind === 'STACK_OBJECT') return this.state.stack.map((s) => s.id);
      for (const card of Object.values(this.state.cards)) {
        if (spec.zone && card.zone !== spec.zone) continue;
        const def = this.definition(card);
        if (spec.kind === 'CREATURE' && !isCreature(def)) continue;
        if (spec.kind === 'PERMANENT' && card.zone !== ZONES.BATTLEFIELD) continue;
        if (spec.controller === 'YOU' && card.controllerId !== ctx.controllerId) continue;
        if (spec.controller === 'OPPONENT' && card.controllerId === ctx.controllerId) continue;
        if (spec.owner === 'YOU' && card.ownerId !== ctx.controllerId) continue;
        if (spec.nonHuman && hasSubtype(def, 'Human')) continue;
        ids.push(card.id);
      }
      return ids;
    }

    validateTargetSelection(spec = {}, ids = [], ctx = {}) {
      const legal = new Set(this.legalTargets(spec, ctx));
      const selected = [...new Set(ids || [])];
      const min = Number(spec.min ?? (spec.target ? 1 : 0));
      const max = spec.max === 'ANY' || spec.max == null ? Infinity : Number(spec.max);
      if (selected.length < min || selected.length > max) return { legal: false, reason: `Choose ${min}${max !== Infinity ? `-${max}` : ' or more'} legal target(s).` };
      if (selected.some((id) => !legal.has(id))) return { legal: false, reason: 'One or more selected targets are illegal.' };
      if (spec.aggregate?.field === 'power') {
        const total = selected.reduce((sum, id) => sum + Number(this.deriveCard(id)?.power || this.definition(id)?.power || 0), 0);
        if (spec.aggregate.max != null && total > Number(spec.aggregate.max)) return { legal: false, reason: `Selected total power ${total} exceeds ${spec.aggregate.max}.`, total };
        return { legal: true, total };
      }
      return { legal: true };
    }

    moveCard(cardId, destination, options = {}) {
      const card = this.card(cardId); if (!card) throw new RulesError('Card not found.', 'NO_CARD');
      const from = card.zone;
      if (from === destination && destination !== ZONES.BATTLEFIELD) return cardId;
      let event = this.applyReplacements({ type: 'ZONE_CHANGE', cardId, from, to: destination, controllerId: card.controllerId, ownerId: card.ownerId, cause: options.cause || 'move' });
      destination = event.to || destination;
      const wasBattlefield = from === ZONES.BATTLEFIELD;
      const wasCreature = isCreature(this.definition(card));
      if (wasBattlefield) this.emit({ type: EVENTS.LEAVES_BATTLEFIELD, cardId, playerId: card.controllerId, to: destination, cause: options.cause || 'move' });
      this._removeFromZones(cardId);
      card.zone = destination;
      if (destination === ZONES.BATTLEFIELD) {
        card.controllerId = options.controllerId || card.controllerId || card.ownerId;
        card.summoningSick = isCreature(this.definition(card)); card.damageMarked = 0; card.attackingPlayerId = null; card.blockedBy = []; card.blocking = [];
        this._zone(card.controllerId, ZONES.BATTLEFIELD).push(cardId);
        this.emit({ type: EVENTS.ENTERS_BATTLEFIELD, cardId, playerId: card.controllerId, cause: options.cause || 'move' });
      } else if (destination !== ZONES.STACK) {
        card.controllerId = card.ownerId;
        this._zone(card.ownerId, destination).push(cardId);
      }
      if (wasBattlefield && destination === ZONES.GRAVEYARD && wasCreature) this.emit({ type: EVENTS.DIES, cardId, playerId: card.ownerId, lastControllerId: event.controllerId });
      return cardId;
    }

    destroy(cardId, sourceId = null) { const card = this.card(cardId); if (!card || card.zone !== ZONES.BATTLEFIELD) return false; const view = this.deriveCard(cardId); if (view.keywords.includes('indestructible')) return false; this.moveCard(cardId, ZONES.GRAVEYARD, { cause: 'destroy', sourceId }); return true; }
    sacrifice(cardId, playerId) { const card = this.card(cardId); if (!card || card.zone !== ZONES.BATTLEFIELD || card.controllerId !== playerId) return false; this.moveCard(cardId, ZONES.GRAVEYARD, { cause: 'sacrifice' }); return true; }
    draw(playerId, amount = 1) { const p = this.state.players[playerId]; let n = 0; for (let i = 0; i < amount; i++) { const id = p.zones.library.shift(); if (!id) break; const card = this.card(id); card.zone = ZONES.HAND; p.zones.hand.push(id); n++; this.emit({ type: EVENTS.DRAW, playerId, cardId: id }); } return n; }
    mill(playerId, amount = 1) { const p = this.state.players[playerId]; let n = 0; for (let i = 0; i < amount; i++) { const id = p.zones.library.shift(); if (!id) break; const card = this.card(id); card.zone = ZONES.GRAVEYARD; p.zones.graveyard.push(id); n++; this.emit({ type: EVENTS.MILL, playerId, cardId: id }); } return n; }
    discard(playerId, cardId) { const card = this.card(cardId); if (!card || card.zone !== ZONES.HAND || card.ownerId !== playerId) return false; this.moveCard(cardId, ZONES.GRAVEYARD, { cause: 'discard' }); this.emit({ type: EVENTS.DISCARD, playerId, cardId }); return true; }
    gainLife(playerId, amount) { const p = this.state.players[playerId]; const n = Math.max(0, Number(amount || 0)); p.life += n; if (n) this.emit({ type: EVENTS.LIFE_GAINED, playerId, amount: n }); return n; }
    loseLife(playerId, amount) { const p = this.state.players[playerId]; const n = Math.max(0, Number(amount || 0)); p.life -= n; if (n) this.emit({ type: EVENTS.LIFE_LOST, playerId, amount: n }); this.runStateBasedActions(); return n; }

    dealDamage(sourceId, targetId, amount, options = {}) {
      const n = Math.max(0, Number(amount || 0)); if (!n) return 0;
      const source = sourceId ? this.deriveCard(sourceId) : null;
      if (this.state.players[targetId]) {
        this.state.players[targetId].life -= n;
        if (sourceId && this.card(sourceId)?.commander && options.combat) {
          const p = this.state.players[targetId]; p.commanderDamage[sourceId] = (p.commanderDamage[sourceId] || 0) + n;
        }
        this.emit({ type: EVENTS.DAMAGE, sourceId, playerId: targetId, amount: n, combat: Boolean(options.combat) });
        if (source?.keywords.includes('lifelink')) this.gainLife(this.card(sourceId).controllerId, n);
      } else {
        const target = this.card(targetId); if (!target || target.zone !== ZONES.BATTLEFIELD) return 0;
        target.damageMarked += n;
        this.emit({ type: EVENTS.DAMAGE, sourceId, cardId: targetId, amount: n, combat: Boolean(options.combat) });
        if (source?.keywords.includes('deathtouch') && n > 0) target.deathtouchDamage = true;
        if (source?.keywords.includes('lifelink')) this.gainLife(this.card(sourceId).controllerId, n);
      }
      this.runStateBasedActions(); return n;
    }

    addCounter(cardId, counter, amount = 1) { const c = this.card(cardId); c.counters[counter] = (c.counters[counter] || 0) + Number(amount || 0); this.emit({ type: EVENTS.COUNTER_ADDED, cardId, counter, amount }); }
    removeCounter(cardId, counter, amount = 1) { const c = this.card(cardId); const n = Math.min(c.counters[counter] || 0, Number(amount || 0)); c.counters[counter] = (c.counters[counter] || 0) - n; if (c.counters[counter] <= 0) delete c.counters[counter]; this.emit({ type: EVENTS.COUNTER_REMOVED, cardId, counter, amount: n }); }
    tap(cardId) { const c = this.card(cardId); if (!c || c.tapped) return false; c.tapped = true; this.emit({ type: EVENTS.TAPPED, cardId, playerId: c.controllerId }); return true; }
    untap(cardId) { const c = this.card(cardId); if (!c || !c.tapped) return false; c.tapped = false; this.emit({ type: EVENTS.UNTAPPED, cardId, playerId: c.controllerId }); return true; }
    changeControl(cardId, controllerId) { const c = this.card(cardId); if (!c || c.zone !== ZONES.BATTLEFIELD) return false; this._removeFromZones(cardId); c.controllerId = controllerId; this._zone(controllerId, ZONES.BATTLEFIELD).push(cardId); this.emit({ type: EVENTS.CONTROL_CHANGED, cardId, playerId: controllerId }); return true; }
    createToken(playerId, tokenDef, amount = 1) { const ids = []; const def = typeof tokenDef === 'string' ? this.getDefinition(tokenDef) : tokenDef; if (!def) throw new RulesError('Token definition missing.', 'NO_TOKEN_DEF'); if (!this.getDefinition(def.id || def.name)) this.registerDefinition(def); for (let i = 0; i < amount; i++) ids.push(this.addCard(def.id || def.name, playerId, ZONES.BATTLEFIELD, { token: true, controllerId: playerId })); ids.forEach((id) => this.emit({ type: EVENTS.ENTERS_BATTLEFIELD, cardId: id, playerId, token: true })); return ids; }
    shuffleLibrary(playerId) { const a = this.state.players[playerId].zones.library; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

    runStateBasedActions() {
      let changed = true; let loops = 0;
      while (changed && loops++ < 12) {
        changed = false;
        for (const card of Object.values(this.state.cards)) {
          if (card.zone !== ZONES.BATTLEFIELD || !isCreature(this.definition(card))) continue;
          const view = this.deriveCard(card.id);
          if (view.toughness <= 0 || card.damageMarked >= view.toughness || card.deathtouchDamage) {
            card.deathtouchDamage = false; this.moveCard(card.id, ZONES.GRAVEYARD, { cause: 'state-based-action' }); changed = true;
          }
        }
        for (const p of Object.values(this.state.players)) {
          const commanderLethal = Math.max(0, ...Object.values(p.commanderDamage || {}).map(Number)) >= 21;
          if (!p.lost && (p.life <= 0 || p.poison >= 10 || commanderLethal)) { p.lost = true; changed = true; }
        }
      }
      const alive = Object.values(this.state.players).filter((p) => !p.lost);
      if (alive.length === 1 && this.state.playerOrder.length > 1) { this.state.winnerId = alive[0].id; this.state.ended = true; }
    }

    startTurn(playerId = null) {
      const id = playerId || this.state.turn.activePlayerId || this.state.playerOrder[0];
      this.state.turn.number += 1; this.state.turn.activePlayerId = id; this.state.turn.stepIndex = 0; this.state.turn.priorityPlayerId = id; this.state.turn.consecutivePasses = 0;
      for (const cId of this.state.players[id].zones.battlefield) { const c = this.card(cId); c.summoningSick = false; c.damageMarked = 0; c.attackingPlayerId = null; c.blockedBy = []; c.blocking = []; if (STEPS[0] === 'untap') c.tapped = false; }
      this.emit({ type: EVENTS.TURN_START, playerId: id, turnNumber: this.state.turn.number });
      this.emit({ type: EVENTS.STEP_START, playerId: id, step: STEPS[0] });
    }
    advanceStep() {
      let i = this.state.turn.stepIndex + 1;
      if (i >= STEPS.length) {
        const order = this.state.playerOrder; const current = order.indexOf(this.state.turn.activePlayerId); return this.startTurn(order[(current + 1) % order.length]);
      }
      this.state.turn.stepIndex = i; this.state.turn.consecutivePasses = 0; this.state.turn.priorityPlayerId = this.state.turn.activePlayerId;
      if (STEPS[i] === 'cleanup') { for (const c of Object.values(this.state.cards)) { c.damageMarked = 0; c.deathtouchDamage = false; } }
      this.emit({ type: EVENTS.STEP_START, playerId: this.state.turn.activePlayerId, step: STEPS[i] });
      return STEPS[i];
    }
    _resetPriority(playerId) { this.state.turn.priorityPlayerId = playerId; this.state.turn.consecutivePasses = 0; }
    _nextPlayer(playerId) { const order = this.state.playerOrder; const i = order.indexOf(playerId); return order[(i + 1) % order.length]; }
    passPriority(playerId) {
      if (this.state.turn.priorityPlayerId !== playerId) throw new RulesError('That player does not have priority.', 'NO_PRIORITY');
      this.state.turn.consecutivePasses += 1;
      if (this.state.turn.consecutivePasses >= this.state.playerOrder.filter((id) => !this.state.players[id].lost).length) {
        this.state.turn.consecutivePasses = 0;
        if (this.state.stack.length) this.resolveTop(); else this.advanceStep();
      } else this.state.turn.priorityPlayerId = this._nextPlayer(playerId);
    }

    declareAttackers(playerId, attacks = []) {
      if (this.state.turn.activePlayerId !== playerId) throw new RulesError('Only active player may attack.', 'NOT_ACTIVE_PLAYER');
      this.state.combat.attackers = {}; this.state.combat.blockers = {};
      for (const a of attacks) {
        const c = this.card(a.cardId); const view = this.deriveCard(a.cardId);
        if (!c || c.zone !== ZONES.BATTLEFIELD || c.controllerId !== playerId || !isCreature(view) || c.summoningSick || c.tapped) throw new RulesError(`${c?.name || 'Creature'} cannot attack.`, 'ILLEGAL_ATTACKER');
        c.attackingPlayerId = a.defenderId; this.state.combat.attackers[c.id] = a.defenderId;
        if (!view.keywords.includes('vigilance')) c.tapped = true;
        this.emit({ type: EVENTS.ATTACKS, cardId: c.id, playerId, defenderId: a.defenderId });
      }
    }
    declareBlockers(playerId, blocks = []) {
      for (const b of blocks) {
        const blocker = this.card(b.blockerId); const attacker = this.card(b.attackerId);
        if (!blocker || !attacker || blocker.controllerId !== playerId || blocker.zone !== ZONES.BATTLEFIELD || blocker.tapped || !this.state.combat.attackers[attacker.id]) throw new RulesError('Illegal block.', 'ILLEGAL_BLOCK');
        blocker.blocking.push(attacker.id); attacker.blockedBy.push(blocker.id); this.state.combat.blockers[blocker.id] = attacker.id;
        this.emit({ type: EVENTS.BLOCKS, cardId: blocker.id, attackerId: attacker.id, playerId });
      }
    }
    resolveCombatDamage() {
      for (const [attackerId, defenderId] of Object.entries(this.state.combat.attackers)) {
        const attacker = this.card(attackerId); if (!attacker || attacker.zone !== ZONES.BATTLEFIELD) continue;
        const a = this.deriveCard(attackerId); const blockers = (attacker.blockedBy || []).map((id) => this.card(id)).filter((c) => c?.zone === ZONES.BATTLEFIELD);
        if (!blockers.length) this.dealDamage(attackerId, defenderId, a.power, { combat: true });
        else {
          const blocker = blockers[0]; const b = this.deriveCard(blocker.id);
          this.dealDamage(attackerId, blocker.id, a.power, { combat: true });
          this.dealDamage(blocker.id, attackerId, b.power, { combat: true });
        }
      }
      this.emit({ type: EVENTS.COMBAT_DAMAGE, playerId: this.state.turn.activePlayerId }); this.runStateBasedActions();
    }

    castMutate(playerId, mutatingCardId, targetId, options = {}) {
      const card = this.card(mutatingCardId); const target = this.card(targetId); const def = this.definition(card);
      const mutate = (def?.abilities || []).find((a) => a.type === 'mutate');
      if (!mutate) throw new RulesError('Card does not have Mutate.', 'NO_MUTATE');
      if (![ZONES.HAND, ZONES.COMMAND].includes(card.zone)) throw new RulesError('Mutate spell must be cast from a legal cast zone.', 'BAD_MUTATE_ZONE');
      if (!target || target.zone !== ZONES.BATTLEFIELD || target.controllerId !== playerId || !isCreature(this.definition(target)) || hasSubtype(this.definition(target), 'Human')) throw new RulesError('Mutate requires a non-Human creature you own/control.', 'ILLEGAL_MUTATE_TARGET');
      const tax = card.zone === ZONES.COMMAND && card.commander ? 2 * (this.state.players[playerId].commanderCastCount[card.id] || 0) : 0;
      if (!options.ignoreCost) this.payMana(playerId, mutate.cost, tax, options.xValue || 0);
      this.saveHistory(`Mutate ${card.name}`); this._removeFromZones(card.id);
      if (card.commander && card.zone === ZONES.COMMAND) this.state.players[playerId].commanderCastCount[card.id] = (this.state.players[playerId].commanderCastCount[card.id] || 0) + 1;
      const pile = [...(target.mutationPile || [target.id])];
      const components = [...(target.mutationComponentDefinitions || [target.definitionId])];
      if (options.position === 'bottom') { pile.push(card.id); components.push(card.definitionId); }
      else { pile.unshift(card.id); components.unshift(card.definitionId); }
      target.mutationPile = pile; target.mutationComponentDefinitions = components;
      // Top component determines base characteristics while all component abilities/keywords remain active.
      if (options.position !== 'bottom') { target.definitionId = card.definitionId; target.name = card.name; }
      delete this.state.cards[card.id];
      this.emit({ type: EVENTS.MUTATED, cardId: target.id, sourceCardDefinitionId: def.id, playerId });
      this.log(`${card.name} mutated onto ${target.name}.`);
      return target.id;
    }

    activateNinjutsu(playerId, ninjaCardId, attackerId, options = {}) {
      const ninja = this.card(ninjaCardId); const attacker = this.card(attackerId); const def = this.definition(ninja);
      const ability = (def?.abilities || []).find((a) => a.type === 'ninjutsu');
      if (!ability || ninja.zone !== ZONES.HAND) throw new RulesError('Ninjutsu is unavailable.', 'NO_NINJUTSU');
      if (!attacker || attacker.controllerId !== playerId || !attacker.attackingPlayerId || (attacker.blockedBy || []).length) throw new RulesError('Ninjutsu requires an unblocked attacker you control.', 'ILLEGAL_NINJUTSU_ATTACKER');
      if (!options.ignoreCost) this.payMana(playerId, ability.cost);
      const defenderId = attacker.attackingPlayerId; this.moveCard(attacker.id, ZONES.HAND, { cause: 'ninjutsu-cost' });
      this._removeFromZones(ninja.id); ninja.zone = ZONES.BATTLEFIELD; ninja.controllerId = playerId; ninja.tapped = true; ninja.summoningSick = false; ninja.attackingPlayerId = defenderId; this._zone(playerId, ZONES.BATTLEFIELD).push(ninja.id);
      this.state.combat.attackers[ninja.id] = defenderId; delete this.state.combat.attackers[attacker.id];
      this.emit({ type: EVENTS.ENTERS_BATTLEFIELD, cardId: ninja.id, playerId, cause: 'ninjutsu' });
      this.emit({ type: EVENTS.NINJUTSU, cardId: ninja.id, returnedAttackerId: attacker.id, playerId });
      return ninja.id;
    }

    legalActions(playerId) {
      const p = this.state.players[playerId]; if (!p || p.lost) return [];
      const actions = [{ id: 'pass-priority', type: 'PASS_PRIORITY', playerId }];
      for (const id of p.zones.hand) {
        const def = this.definition(id); const c = this.card(id);
        if (isLand(def)) actions.push({ id: `play-${id}`, type: 'PLAY_LAND', cardId: id, playerId });
        else if (this.canPay(playerId, def.manaCost || '')) actions.push({ id: `cast-${id}`, type: 'CAST', cardId: id, playerId });
        const ninjutsu = (def?.abilities || []).find((a) => a.type === 'ninjutsu');
        if (ninjutsu && this.canPay(playerId, ninjutsu.cost)) {
          for (const a of Object.keys(this.state.combat.attackers)) { const ac = this.card(a); if (ac?.controllerId === playerId && !(ac.blockedBy || []).length) actions.push({ id: `ninjutsu-${id}-${a}`, type: 'NINJUTSU', cardId: id, attackerId: a, playerId }); }
        }
        const mutate = (def?.abilities || []).find((a) => a.type === 'mutate');
        if (mutate && this.canPay(playerId, mutate.cost)) {
          for (const targetId of p.zones.battlefield) { const t = this.card(targetId); const td = this.definition(t); if (isCreature(td) && !hasSubtype(td, 'Human')) actions.push({ id: `mutate-${id}-${targetId}`, type: 'MUTATE', cardId: id, targetId, playerId }); }
        }
      }
      for (const id of p.zones.command) {
        const def = this.definition(id); const c = this.card(id); const tax = c.commander ? 2 * (p.commanderCastCount[id] || 0) : 0;
        if (!isLand(def) && this.canPay(playerId, def.manaCost || '', tax)) actions.push({ id: `cast-command-${id}`, type: 'CAST', cardId: id, playerId, fromCommand: true, commanderTax: tax });
        const mutate = (def?.abilities || []).find((a) => a.type === 'mutate');
        if (mutate && this.canPay(playerId, mutate.cost, tax)) for (const targetId of p.zones.battlefield) { const td = this.definition(targetId); if (isCreature(td) && !hasSubtype(td, 'Human')) actions.push({ id: `mutate-command-${id}-${targetId}`, type: 'MUTATE', cardId: id, targetId, playerId, fromCommand: true, commanderTax: tax }); }
      }
      return actions;
    }

    performAction(action) {
      switch (action.type) {
        case 'PASS_PRIORITY': return this.passPriority(action.playerId);
        case 'PLAY_LAND': return this.playLand(action.playerId, action.cardId);
        case 'CAST': return this.castSpell(action.playerId, action.cardId, action);
        case 'MUTATE': return this.castMutate(action.playerId, action.cardId, action.targetId, action);
        case 'NINJUTSU': return this.activateNinjutsu(action.playerId, action.cardId, action.attackerId, action);
        default: throw new RulesError(`Unknown action ${action.type}.`, 'UNKNOWN_ACTION');
      }
    }

    // Migration helper: mirrors the current 5.x table into a normalized read-only
    // snapshot. This lets Engine 6 run alongside the existing UI while card-by-card
    // authority is migrated safely.
    importLegacyState(legacy) {
      const shadow = {
        engineVersion: ENGINE_VERSION, source: 'commander-forge-5x-shadow',
        turn: { number: legacy?.turnNumber || 0, activePlayerId: legacy?.activePlayerId || null, step: legacy?.phaseIndex ?? 0 },
        players: {}, cards: {}, stack: clone(legacy?.stack || [])
      };
      for (const [pid, p] of Object.entries(legacy?.players || {})) {
        shadow.players[pid] = { id: pid, name: p.name, life: p.life, poison: p.poison, commanderDamage: clone(p.commanderDamage || {}), zones: {} };
        for (const [zone, cards] of Object.entries(p.zones || {})) {
          shadow.players[pid].zones[zone] = (cards || []).map((c) => c.instanceId || c.id);
          for (const c of cards || []) shadow.cards[c.instanceId || c.id] = { id: c.instanceId || c.id, name: c.name, ownerId: c.owner || pid, controllerId: c.controller || pid, zone, tapped: Boolean(c.tapped), typeLine: c.typeLine || '', oracleText: c.oracleText || '' };
        }
      }
      this.shadowState = shadow;
      return clone(shadow);
    }
  }

  const BuiltinCards = [
    { id: 'plains', name: 'Plains', typeLine: 'Basic Land — Plains', manaCost: '', abilities: [] },
    { id: 'forest', name: 'Forest', typeLine: 'Basic Land — Forest', manaCost: '', abilities: [] },
    { id: 'grizzly-bears', name: 'Grizzly Bears', typeLine: 'Creature — Bear', manaCost: '{1}{G}', power: 2, toughness: 2 },
    { id: 'serra-angel', name: 'Serra Angel', typeLine: 'Creature — Angel', manaCost: '{3}{W}{W}', power: 4, toughness: 4, keywords: ['flying', 'vigilance'] },
    { id: 'soul-warden', name: 'Soul Warden', typeLine: 'Creature — Human Cleric', manaCost: '{W}', power: 1, toughness: 1, abilities: [
      { type: 'trigger', event: EVENTS.ENTERS_BATTLEFIELD, condition: [{ type: 'SUBJECT_IS_OTHER' }, { type: 'SUBJECT_IS_CREATURE' }], effects: [{ type: EFFECTS.GAIN_LIFE, playerId: 'YOU', amount: 1 }] }
    ] },
    { id: 'lightning-bolt', name: 'Lightning Bolt', typeLine: 'Instant', manaCost: '{R}', spellEffects: [{ type: EFFECTS.DAMAGE, amount: 3, target: { fromContextIndex: 0 } }] },
    { id: 'counterspell', name: 'Counterspell', typeLine: 'Instant', manaCost: '{U}{U}', spellEffects: [{ type: EFFECTS.COUNTER_SPELL, target: { kind: 'STACK_OBJECT' } }] },
    { id: 'nethroi-apex-of-death', name: 'Nethroi, Apex of Death', typeLine: 'Legendary Creature — Cat Nightmare Beast', manaCost: '{2}{W}{B}{G}', power: 5, toughness: 5, keywords: ['deathtouch', 'lifelink'], abilities: [
      { type: 'mutate', cost: '{4}{G/W}{B}{B}' },
      { type: 'trigger', event: EVENTS.MUTATED, condition: { type: 'SOURCE_IS_SUBJECT' }, target: { zone: ZONES.GRAVEYARD, kind: 'CREATURE', owner: 'YOU', min: 0, max: 'ANY', aggregate: { field: 'power', max: 10 } }, effects: [{ type: EFFECTS.RETURN_FROM_GRAVEYARD, target: { fromContextAll: true } }] }
    ] }
  ];

  function createEngine(options = {}) { const e = new Engine(options); e.registerDefinitions(BuiltinCards); return e; }

  return { ENGINE_VERSION, ZONES, STEPS, EVENTS, EFFECTS, RulesError, EventBus, Engine, BuiltinCards, createEngine, parseMana };
});
