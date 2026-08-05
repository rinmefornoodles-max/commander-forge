import { DEFAULT_SETTINGS, PHASES, STORAGE_KEY, ZONES } from './constants.js';
import { createKnowledgeState, ensureKnowledge, recordPublicEvent } from './knowledge.js';
import { deepClone, shuffle, uid } from './utils.js';

export function createPlayer(id, name) {
  return {
    id,
    name,
    life: 40,
    poison: 0,
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    zones: Object.fromEntries(ZONES.map((zone) => [zone, []])),
    commanderDamage: {},
    commanderCastCount: {},
    colorIdentity: [],
    landPlaysThisTurn: 0,
    mulligans: 0,
    lost: false,
  };
}

export function createInitialState() {
  const players = { p1: createPlayer('p1', 'Player 1'), p2: createPlayer('p2', 'Player 2') };
  return {
    version: 4,
    players,
    activePlayerId: 'p1',
    turnNumber: 1,
    phaseIndex: 0,
    stack: [],
    selected: null,
    log: [],
    knowledge: createKnowledgeState(Object.keys(players)),
    settings: { ...DEFAULT_SETTINGS },
    winner: null,
    started: false,
    createdAt: new Date().toISOString(),
  };
}

let state = createInitialState();
let history = [];
let listeners = new Set();

export function getState() { return state; }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach((listener) => listener(state)); }

function normalizeCardShape(card) {
  card.tapped = Boolean(card.tapped);
  card.summoningSick = Boolean(card.summoningSick);
  card.attacking = Boolean(card.attacking);
  card.blocking ||= null;
  card.blockedBy ||= [];
  card.faceDown = Boolean(card.faceDown);
  card.token = Boolean(card.token);
  card.commander = Boolean(card.commander);
  card.counters ||= {};
  card.notes ||= '';
  card.attachedTo ||= null;
  card.attachments ||= [];
  return card;
}

function ensureStateShape(next) {
  next.version = 4;
  const previousSettings = next.settings || {};
  next.settings = { ...DEFAULT_SETTINGS, ...previousSettings, manaAutomationV3: true, coachInformationSetV4: true };
  if (!previousSettings.coachInformationSetV4 && Number(previousSettings.coachRollouts || 0) === 450) next.settings.coachRollouts = 240;
  next.stack ||= [];
  next.log ||= [];
  next.turnNumber ||= 1;
  next.phaseIndex ||= 0;
  next.players ||= {};
  for (const [playerId, player] of Object.entries(next.players)) {
    const defaults = createPlayer(playerId, player.name || playerId);
    Object.assign(defaults, player);
    defaults.mana = { ...createPlayer(playerId, '').mana, ...(player.mana || {}) };
    defaults.zones = Object.fromEntries(ZONES.map((zone) => [zone, [...(player.zones?.[zone] || [])].map(normalizeCardShape)]));
    defaults.commanderDamage ||= {};
    defaults.commanderCastCount ||= {};
    defaults.colorIdentity ||= [...new Set(defaults.zones.command.flatMap((card) => card.colorIdentity || []))];
    next.players[playerId] = defaults;
  }
  next.stack = next.stack.map(normalizeCardShape);
  ensureKnowledge(next);
  return next;
}

export function setState(next, { save = true } = {}) {
  state = ensureStateShape(next);
  if (save) persist();
  notify();
}

export function updateState(mutator, { snapshot = true, log = null } = {}) {
  if (snapshot) pushHistory();
  const next = deepClone(state);
  ensureStateShape(next);
  mutator(next);
  if (log) next.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: log });
  state = ensureStateShape(next);
  persist();
  notify();
}

export function pushHistory() {
  history.push(deepClone(state));
  if (history.length > 60) history.shift();
}

export function undo() {
  const prior = history.pop();
  if (!prior) return false;
  state = ensureStateShape(prior);
  persist();
  notify();
  return true;
}

export function resetState() {
  history = [];
  state = createInitialState();
  persist();
  notify();
}

export function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* optional */ }
}

export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (![2, 3, 4].includes(parsed.version)) return false;
    const previousSettings = parsed.settings || {};
    parsed.settings = { ...DEFAULT_SETTINGS, ...previousSettings };
    if (!previousSettings.manaAutomationV3) parsed.settings.manaMode = 'auto';
    state = ensureStateShape(parsed);
    notify();
    return true;
  } catch { return false; }
}

export function importState(imported) {
  if (!imported || ![2, 3, 4].includes(imported.version) || !imported.players) throw new Error('This is not a compatible Commander Forge save file.');
  history = [];
  state = ensureStateShape(imported);
  persist();
  notify();
}

export function phase() { return PHASES[state.phaseIndex]; }

export function findCard(instanceId, source = state) {
  for (const player of Object.values(source.players)) {
    for (const [zone, cards] of Object.entries(player.zones)) {
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      if (index >= 0) return { card: cards[index], playerId: player.id, zone, index, container: cards };
    }
  }
  const stackIndex = source.stack.findIndex((card) => card.instanceId === instanceId);
  if (stackIndex >= 0) return { card: source.stack[stackIndex], playerId: source.stack[stackIndex].controller, zone: 'stack', index: stackIndex, container: source.stack };
  return null;
}

export function buildPlayerDeck(player, deck, commanderNames = []) {
  const instances = [];
  for (const entry of deck.entries) {
    const data = deck.byName[entry.name.toLocaleLowerCase()];
    if (!data) continue;
    for (let i = 0; i < entry.count; i += 1) {
      instances.push(normalizeCardShape({
        ...deepClone(data),
        instanceId: uid('card'),
        owner: player.id,
        controller: player.id,
        tapped: false,
        summoningSick: false,
        attacking: false,
        blocking: null,
        blockedBy: [],
        faceDown: false,
        token: false,
        commander: commanderNames.includes(data.name),
        counters: {},
        notes: '',
        attachedTo: null,
        attachments: [],
      }));
    }
  }
  const command = [];
  for (const name of commanderNames) {
    const index = instances.findIndex((card) => card.name === name);
    if (index >= 0) command.push(instances.splice(index, 1)[0]);
  }
  player.zones = Object.fromEntries(ZONES.map((zone) => [zone, []]));
  player.zones.command = command;
  player.zones.library = shuffle(instances);
  player.life = 40;
  player.poison = 0;
  player.commanderDamage = {};
  player.commanderCastCount = Object.fromEntries(command.map((card) => [card.instanceId, 0]));
  player.colorIdentity = [...new Set(command.flatMap((card) => card.colorIdentity || []))];
  player.landPlaysThisTurn = 0;
  player.mulligans = 0;
  player.lost = false;
}

export function drawCards(draft, playerId, amount = 1) {
  ensureKnowledge(draft);
  const player = draft.players[playerId];
  const memory = draft.knowledge.players[playerId];
  for (let i = 0; i < amount; i += 1) {
    const card = player.zones.library.shift();
    if (!card) {
      player.lost = true;
      draft.winner = Object.keys(draft.players).find((id) => id !== playerId) || null;
      draft.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: `${player.name} tried to draw from an empty library.` });
      break;
    }
    player.zones.hand.push(card);
    const knownTop = memory.knownLibraryTop?.[0]?.card;
    if (knownTop && (knownTop.instanceId === card.instanceId || knownTop.name === card.name)) {
      recordPublicEvent(draft, {
        type: 'draw_known',
        actorId: playerId,
        subjectPlayerId: playerId,
        card,
        fromZone: 'library',
        toZone: 'hand',
        meaningful: true,
      });
      memory.knownLibraryTop.shift();
    }
  }
}
