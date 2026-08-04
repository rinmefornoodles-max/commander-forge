import { DEFAULT_SETTINGS, PHASES, STORAGE_KEY, ZONES } from './constants.js';
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
    landPlaysThisTurn: 0,
    mulligans: 0,
    lost: false,
  };
}

export function createInitialState() {
  return {
    version: 3,
    players: { p1: createPlayer('p1', 'Player 1'), p2: createPlayer('p2', 'Player 2') },
    activePlayerId: 'p1',
    turnNumber: 1,
    phaseIndex: 0,
    stack: [],
    selected: null,
    log: [],
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

export function setState(next, { save = true } = {}) {
  state = next;
  if (save) persist();
  notify();
}

export function updateState(mutator, { snapshot = true, log = null } = {}) {
  if (snapshot) pushHistory();
  const next = deepClone(state);
  mutator(next);
  if (log) next.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: log });
  state = next;
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
  state = prior;
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
    if (![2, 3].includes(parsed.version)) return false;
    const previousSettings = parsed.settings || {};
    parsed.settings = { ...DEFAULT_SETTINGS, ...previousSettings };
    if (!previousSettings.manaAutomationV3) parsed.settings.manaMode = 'auto';
    parsed.settings.manaAutomationV3 = true;
    parsed.version = 3;
    state = parsed;
    notify();
    return true;
  } catch { return false; }
}

export function importState(imported) {
  if (!imported || ![2, 3].includes(imported.version) || !imported.players) throw new Error('This is not a compatible Commander Forge save file.');
  history = [];
  imported.settings = { ...DEFAULT_SETTINGS, ...(imported.settings || {}), manaAutomationV3: true };
  imported.version = 3;
  state = imported;
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
      instances.push({
        ...deepClone(data),
        instanceId: uid('card'),
        owner: player.id,
        controller: player.id,
        tapped: false,
        summoningSick: false,
        attacking: false,
        faceDown: false,
        token: false,
        commander: commanderNames.includes(data.name),
        counters: {},
        notes: '',
      });
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
  player.landPlaysThisTurn = 0;
  player.mulligans = 0;
  player.lost = false;
}

export function drawCards(draft, playerId, amount = 1) {
  const player = draft.players[playerId];
  for (let i = 0; i < amount; i += 1) {
    const card = player.zones.library.shift();
    if (!card) {
      player.lost = true;
      draft.winner = Object.keys(draft.players).find((id) => id !== playerId) || null;
      draft.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: `${player.name} tried to draw from an empty library.` });
      break;
    }
    player.zones.hand.push(card);
  }
}
