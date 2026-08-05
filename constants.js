export const PHASES = [
  { id: 'untap', label: 'Untap' },
  { id: 'upkeep', label: 'Upkeep' },
  { id: 'draw', label: 'Draw' },
  { id: 'main1', label: 'Main 1' },
  { id: 'combat', label: 'Combat' },
  { id: 'main2', label: 'Main 2' },
  { id: 'end', label: 'End' },
];

export const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];
export const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
export const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
export const ZONE_LABELS = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command Zone',
  stack: 'Stack',
};

export const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
export const LOCAL_PRECON_INDEX_URL = './data/precons/index.json';
export const LOCAL_PRECON_BASE_URL = './data/precons';
export const MTGJSON_DECK_LIST_URLS = [
  'https://mtgjson.com/api/v5/DeckList.json',
  'https://www.mtgjson.com/api/v5/DeckList.json',
  'https://mtgjson.net/api/v5/DeckList.json',
];
export const MTGJSON_DECK_BASE_URLS = [
  'https://mtgjson.com/api/v5/decks',
  'https://www.mtgjson.com/api/v5/decks',
  'https://mtgjson.net/api/v5/decks',
];

export const STORAGE_KEY = 'commander-forge-state-v2';
export const DECK_CACHE_KEY = 'commander-forge-deck-cache-v5-card-ids';
export const DECK_PAYLOAD_CACHE_KEY = 'commander-forge-precon-payload-cache-v3-card-ids';
export const CARD_CACHE_KEY = 'commander-forge-card-cache-v3-split-fix';

export const DEFAULT_SETTINGS = {
  rulesMode: 'learning',
  hideOpponentHand: true,
  autoDraw: true,
  coachRollouts: 240,
  coachInformationSetV4: true,
  confirmCommanderMoves: true,
  showCardNames: true,
  manaMode: 'auto',
  manaAutomationV3: true,
};
