'use strict';
const __modules = Object.create(null);

// ---- constants.js ----
__modules["./constants.js"] = (() => {
const PHASES = [
  { id: 'untap', label: 'Untap' },
  { id: 'upkeep', label: 'Upkeep' },
  { id: 'draw', label: 'Draw' },
  { id: 'main1', label: 'Main 1' },
  { id: 'combat', label: 'Combat' },
  { id: 'main2', label: 'Main 2' },
  { id: 'end', label: 'End' },
];

const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
const ZONE_LABELS = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command Zone',
  stack: 'Stack',
};

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const LOCAL_PRECON_INDEX_URL = './data/precons/index.json';
const LOCAL_PRECON_BASE_URL = './data/precons';
const MTGJSON_DECK_LIST_URLS = [
  'https://mtgjson.com/api/v5/DeckList.json',
  'https://www.mtgjson.com/api/v5/DeckList.json',
  'https://mtgjson.net/api/v5/DeckList.json',
];
const MTGJSON_DECK_BASE_URLS = [
  'https://mtgjson.com/api/v5/decks',
  'https://www.mtgjson.com/api/v5/decks',
  'https://mtgjson.net/api/v5/decks',
];

const STORAGE_KEY = 'commander-forge-state-v2';
const DECK_CACHE_KEY = 'commander-forge-deck-cache-v5-card-ids';
const DECK_PAYLOAD_CACHE_KEY = 'commander-forge-precon-payload-cache-v3-card-ids';
const CARD_CACHE_KEY = 'commander-forge-card-cache-v3-split-fix';

const DEFAULT_SETTINGS = {
  rulesMode: 'learning',
  hideOpponentHand: true,
  autoDraw: true,
  coachRollouts: 80,
  coachInformationSetV4: true,
  coachTacticalV5: true,
  confirmCommanderMoves: true,
  showCardNames: true,
  manaMode: 'auto',
  manaAutomationV3: true,
  phaseSafetyV6: true,
  tabletopUXV7: true,
};


return { PHASES, ZONES, COLORS, COLOR_NAMES, ZONE_LABELS, SCRYFALL_COLLECTION_URL, LOCAL_PRECON_INDEX_URL, LOCAL_PRECON_BASE_URL, MTGJSON_DECK_LIST_URLS, MTGJSON_DECK_BASE_URLS, STORAGE_KEY, DECK_CACHE_KEY, DECK_PAYLOAD_CACHE_KEY, CARD_CACHE_KEY, DEFAULT_SETTINGS };
})();

// ---- utils.js ----
__modules["./utils.js"] = (() => {
function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function deepClone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function shuffle(array) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeName(name = '') {
  return name
    .replace(/\s+\([A-Z0-9]+\)\s+\d+[a-z]?$/i, '')
    .replace(/\s+\*[A-Za-z0-9-]+\*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDecklist(text = '') {
  const entries = [];
  const errors = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    line = line.replace(/^[-*]\s*/, '');
    const match = line.match(/^(\d+)\s*(?:x\s*)?(.+)$/i);
    if (!match) {
      errors.push(`Line ${index + 1}: use a quantity followed by a card name.`);
      continue;
    }
    const count = Number(match[1]);
    const name = normalizeName(match[2]);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      errors.push(`Line ${index + 1}: invalid quantity.`);
      continue;
    }
    if (!name) {
      errors.push(`Line ${index + 1}: missing card name.`);
      continue;
    }
    entries.push({ count, name });
  }
  const merged = new Map();
  entries.forEach(({ count, name }) => {
    const key = name.toLocaleLowerCase();
    const prior = merged.get(key) || { name, count: 0 };
    prior.count += count;
    merged.set(key, prior);
  });
  return { entries: [...merged.values()], errors };
}

function manaSymbols(cost = '') {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function manaRequirement(cost = '', tax = 0) {
  const requirement = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: tax, flexible: [] };
  for (const symbol of manaSymbols(cost)) {
    if (/^\d+$/.test(symbol)) requirement.generic += Number(symbol);
    else if (Object.hasOwn(requirement, symbol)) requirement[symbol] += 1;
    else if (symbol.includes('/')) requirement.flexible.push(symbol.split('/').filter((s) => COLORS_SET.has(s)));
    else if (symbol === 'X') requirement.flexible.push(['C']);
  }
  return requirement;
}
const COLORS_SET = new Set(['W', 'U', 'B', 'R', 'G', 'C']);
const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function emptyManaBundle() {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

function bundleFromSymbols(symbols) {
  const mana = emptyManaBundle();
  for (const symbol of symbols) {
    if (MANA_COLORS.includes(symbol)) mana[symbol] += 1;
  }
  return mana;
}

function manaBundleAmount(mana = {}) {
  return MANA_COLORS.reduce((sum, color) => sum + Number(mana[color] || 0), 0);
}

function formatManaBundle(mana = {}) {
  return MANA_COLORS
    .flatMap((color) => Array.from({ length: Number(mana[color] || 0) }, () => color))
    .join('') || '0';
}

function choiceKey(choice) {
  return MANA_COLORS.map((color) => Number(choice.mana?.[color] || 0)).join(':');
}

function dedupeChoices(choices) {
  const seen = new Set();
  return choices.filter((choice) => {
    if (!manaBundleAmount(choice.mana)) return false;
    const key = choiceKey(choice);
    if (seen.has(key)) return false;
    seen.add(key);
    choice.label = choice.label || formatManaBundle(choice.mana);
    return true;
  });
}

/**
 * Returns each distinct way a permanent can produce mana as one choice.
 * A dual land such as “Add {U} or {B}” returns U and B choices.
 * A bounce land such as “Add {G}{U}” returns one GU bundle.
 */
function manaProductionChoices(card) {
  if (!card) return [];
  const text = String(card.oracleText || card.oracle_text || '').replace(/\u2212/g, '-');
  const type = String(card.typeLine || card.type_line || '');
  const choices = [];

  // “Any color” sources should present a color choice, not fake hybrid mana.
  const anyColor = text.match(/add\s+(?:(one|two|three|four|five|six)\s+)?mana\s+of\s+any(?:\s+one)?\s+color/i);
  if (anyColor) {
    const amount = WORD_NUMBERS[(anyColor[1] || 'one').toLowerCase()] || 1;
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      const mana = emptyManaBundle();
      mana[color] = amount;
      choices.push({ mana, label: amount > 1 ? `${amount}${color}` : color });
    }
  }

  // Parse each Oracle “Add …” instruction. This handles most lands and rocks.
  const clauses = [...text.matchAll(/add\s+([^.;\n]+)/gi)].map((match) => match[1].trim());
  for (const clause of clauses) {
    if (/mana\s+of\s+any/i.test(clause)) continue;
    const symbols = manaSymbols(clause).filter((symbol) => MANA_COLORS.includes(symbol));
    if (!symbols.length) continue;

    if (/\bor\b/i.test(clause)) {
      const groups = clause
        .replace(/,/g, ' ')
        .split(/\s+or\s+/i)
        .map((group) => manaSymbols(group).filter((symbol) => MANA_COLORS.includes(symbol)))
        .filter((group) => group.length);
      if (groups.length > 1) {
        groups.forEach((group) => choices.push({ mana: bundleFromSymbols(group) }));
        continue;
      }
    }

    // A comma-separated list such as “{W}, {U}, or {B}” may lose “or” after templating.
    if (symbols.length > 1 && /,/.test(clause) && !/\}\s*\{/i.test(clause.replace(/\s/g, ''))) {
      symbols.forEach((symbol) => choices.push({ mana: bundleFromSymbols([symbol]) }));
      continue;
    }

    choices.push({ mana: bundleFromSymbols(symbols) });
  }

  // Basic land types work even when Oracle text is omitted by Scryfall.
  if (!choices.length) {
    const basics = [
      ['Plains', 'W'], ['Island', 'U'], ['Swamp', 'B'],
      ['Mountain', 'R'], ['Forest', 'G'], ['Wastes', 'C'],
    ];
    for (const [landType, color] of basics) {
      if (!type.includes(landType)) continue;
      const mana = emptyManaBundle();
      mana[color] = 1;
      choices.push({ mana, label: color });
    }
  }

  // Scryfall’s produced_mana is a reliable fallback for unusual wording.
  if (!choices.length) {
    const colors = [...new Set((card.producedMana || card.produced_mana || []).filter((color) => MANA_COLORS.includes(color)))];
    for (const color of colors) {
      const mana = emptyManaBundle();
      mana[color] = 1;
      choices.push({ mana, label: color });
    }
  }

  return dedupeChoices(choices);
}

// Compatibility helper for places that only need color possibilities.
function manaProductionOptions(card) {
  return manaProductionChoices(card).flatMap((choice, choiceIndex) =>
    MANA_COLORS
      .filter((color) => Number(choice.mana[color] || 0) > 0)
      .map((color) => ({ color, amount: Number(choice.mana[color] || 0), choiceIndex, mana: choice.mana, label: choice.label })),
  );
}

function manaSourceLabel(card) {
  const choices = manaProductionChoices(card);
  return choices.map((choice) => choice.label).join(' / ');
}

function untappedManaSources(player) {
  return (player?.zones?.battlefield || [])
    .filter((card) => !card.tapped)
    .map((card) => ({ card, choices: manaProductionChoices(card) }))
    .filter((source) => source.choices.length);
}

function totalMana(pool) {
  return Object.values(pool || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function cardImage(card) {
  if (!card) return './card-back.svg';
  return card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || './card-back.svg';
}

function cardSmallImage(card) {
  if (!card) return './card-back.svg';
  return card.imageSmall || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || cardImage(card);
}

function isCreature(card) {
  return card?.typeLine?.includes('Creature') || card?.type_line?.includes('Creature');
}

function isLand(card) {
  return card?.typeLine?.includes('Land') || card?.type_line?.includes('Land');
}

function isPermanent(card) {
  const type = card?.typeLine || card?.type_line || '';
  return ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'].some((word) => type.includes(word));
}

function hasFlash(card) {
  return (card?.keywords || []).includes('Flash') || /flash/i.test(card?.oracleText || card?.oracle_text || '');
}

function numericStat(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatZone(zone) {
  return zone ? zone[0].toUpperCase() + zone.slice(1) : '';
}

function debounce(fn, delay = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


return { uid, deepClone, shuffle, clamp, escapeHtml, normalizeName, parseDecklist, manaSymbols, manaRequirement, manaBundleAmount, formatManaBundle, manaProductionChoices, manaProductionOptions, manaSourceLabel, untappedManaSources, totalMana, cardImage, cardSmallImage, isCreature, isLand, isPermanent, hasFlash, numericStat, downloadJson, formatZone, debounce };
})();

// ---- api.js ----
__modules["./api.js"] = (() => {
const { CARD_CACHE_KEY, DECK_CACHE_KEY, DECK_PAYLOAD_CACHE_KEY, LOCAL_PRECON_BASE_URL, LOCAL_PRECON_INDEX_URL, MTGJSON_DECK_BASE_URLS, MTGJSON_DECK_LIST_URLS, SCRYFALL_COLLECTION_URL } = __modules["./constants.js"];
const { normalizeName } = __modules["./utils.js"];

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cache is optional */ }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLocalJson(url) {
  const response = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Local precon catalog returned ${response.status}.`);
  return response.json();
}

async function fetchJsonFromCandidates(urls, { attempts = 2 } = {}) {
  const errors = [];
  for (const url of [...new Set(urls)]) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
          errors.push(`${response.status} ${url}`);
          // A missing file will not improve by retrying this exact URL.
          if (response.status === 404) break;
        } else {
          const text = await response.text();
          try {
            return { payload: JSON.parse(text), url };
          } catch {
            errors.push(`Invalid JSON from ${url}`);
            break;
          }
        }
      } catch (error) {
        errors.push(`${error?.name === 'AbortError' ? 'Timed out' : error?.message || 'Network error'}: ${url}`);
      }
      if (attempt + 1 < attempts) await delay(350 * (attempt + 1));
    }
  }
  throw new Error(`The precon service could not return readable deck data. ${errors.slice(-3).join(' | ')}`);
}

function normalizeCardRequest(item) {
  const source = typeof item === 'string' ? { name: item } : (item || {});
  return {
    name: normalizeName(source.name || ''),
    scryfallId: String(source.scryfallId || source.scryfall_id || source.identifiers?.scryfallId || '').trim(),
    oracleId: String(source.scryfallOracleId || source.oracleId || source.oracle_id || source.identifiers?.scryfallOracleId || '').trim(),
  };
}

function canonicalCardName(name = '') {
  return normalizeName(name).replace(/\s*\/\/\s*/g, ' // ').toLocaleLowerCase();
}

function cardAliases(raw) {
  const aliases = new Set();
  if (raw?.name) aliases.add(canonicalCardName(raw.name));
  for (const face of raw?.card_faces || []) {
    if (face?.name) aliases.add(canonicalCardName(face.name));
  }
  return aliases;
}

function requestMatchesRaw(request, raw) {
  if (request.scryfallId && request.scryfallId === raw?.id) return true;
  if (request.oracleId && request.oracleId === raw?.oracle_id) return true;
  return cardAliases(raw).has(canonicalCardName(request.name));
}

function cacheRawCard(cache, raw, compact, request = null) {
  if (compact?.name) cache[canonicalCardName(compact.name)] = compact;
  for (const face of raw?.card_faces || []) {
    if (face?.name) cache[canonicalCardName(face.name)] = compact;
  }
  if (request?.name) cache[canonicalCardName(request.name)] = compact;
}

async function fetchNamedFallback(request) {
  const normalized = normalizeName(request.name).replace(/\s*\/\/\s*/g, ' // ');
  const queries = [
    ['exact', normalized],
    ['fuzzy', normalized.replace(/\s*\/\/\s*/g, ' ')],
  ];
  if (normalized.includes(' // ')) {
    queries.push(['fuzzy', normalized.split(' // ')[0]]);
  }

  for (const [mode, value] of queries) {
    if (!value) continue;
    const url = `https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(value)}`;
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 12_000);
      if (response.ok) return response.json();
      if (response.status !== 404) throw new Error(`Scryfall returned ${response.status}.`);
    } catch (error) {
      if (error?.name === 'AbortError') continue;
    }
    await delay(90);
  }
  return null;
}

async function fetchCardsByNames(items, onProgress = () => {}) {
  const requests = (items || [])
    .map(normalizeCardRequest)
    .filter((request) => request.name);
  const uniqueRequests = [];
  const seen = new Set();
  for (const request of requests) {
    const key = request.scryfallId || request.oracleId || canonicalCardName(request.name);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRequests.push(request);
  }

  const cache = readCache(CARD_CACHE_KEY);
  const missing = uniqueRequests.filter((request) => !cache[canonicalCardName(request.name)]);
  const unresolved = [];

  for (let start = 0; start < missing.length; start += 75) {
    const batch = missing.slice(start, start + 75);
    onProgress({ loaded: start, total: missing.length, message: `Loading cards ${start + 1}-${Math.min(start + 75, missing.length)}…` });
    const response = await fetch(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        identifiers: batch.map((request) => {
          if (request.scryfallId) return { id: request.scryfallId };
          if (request.oracleId) return { oracle_id: request.oracleId };
          return { name: request.name };
        }),
      }),
    });
    if (!response.ok) throw new Error(`Scryfall returned ${response.status}. Try again in a moment.`);
    const payload = await response.json();
    const raws = payload.data || [];

    for (const raw of raws) {
      const compact = compactScryfallCard(raw);
      cacheRawCard(cache, raw, compact);
    }

    for (const request of batch) {
      const raw = raws.find((candidate) => requestMatchesRaw(request, candidate));
      if (raw) {
        const compact = compactScryfallCard(raw);
        cacheRawCard(cache, raw, compact, request);
      } else {
        unresolved.push(request);
      }
    }
    await delay(90);
  }

  const notFound = [];
  for (let index = 0; index < unresolved.length; index += 1) {
    const request = unresolved[index];
    onProgress({ loaded: missing.length + index, total: missing.length + unresolved.length, message: `Resolving ${request.name}…` });
    const raw = await fetchNamedFallback(request);
    if (raw?.object === 'card') {
      const compact = compactScryfallCard(raw);
      cacheRawCard(cache, raw, compact, request);
    } else {
      notFound.push(request.name);
    }
    await delay(90);
  }

  writeCache(CARD_CACHE_KEY, cache);
  onProgress({ loaded: missing.length + unresolved.length, total: missing.length + unresolved.length, message: 'Cards loaded.' });
  return {
    cards: uniqueRequests.map((request) => cache[canonicalCardName(request.name)]).filter(Boolean),
    byName: Object.fromEntries(uniqueRequests.map((request) => [canonicalCardName(request.name), cache[canonicalCardName(request.name)]])),
    notFound,
  };
}

function compactScryfallCard(raw) {
  const face = raw.card_faces?.[0];
  return {
    scryfallId: raw.id,
    oracleId: raw.oracle_id,
    name: raw.name,
    manaCost: raw.mana_cost || face?.mana_cost || '',
    manaValue: Number(raw.cmc || 0),
    typeLine: raw.type_line || face?.type_line || '',
    oracleText: raw.oracle_text || raw.card_faces?.map((f) => `${f.name}: ${f.oracle_text || ''}`).join('\n\n') || '',
    power: raw.power || face?.power || '',
    toughness: raw.toughness || face?.toughness || '',
    loyalty: raw.loyalty || face?.loyalty || '',
    keywords: raw.keywords || [],
    colors: raw.colors || face?.colors || [],
    colorIdentity: raw.color_identity || [],
    legalities: raw.legalities || {},
    layout: raw.layout,
    image: raw.image_uris?.normal || face?.image_uris?.normal || './card-back.svg',
    imageSmall: raw.image_uris?.small || face?.image_uris?.small || raw.image_uris?.normal || './card-back.svg',
    backImage: raw.card_faces?.[1]?.image_uris?.normal || null,
    producedMana: raw.produced_mana || [],
  };
}

function normalizeDeckIndex(payload) {
  const data = Array.isArray(payload) ? payload : payload?.data || [];
  return data
    .filter((deck) => deck?.name && deck?.fileName)
    .map((deck) => ({
      name: deck.name,
      fileName: deck.fileName,
      code: deck.code || '',
      releaseDate: deck.releaseDate || '',
      type: deck.type || '',
      cardCount: Number(deck.cardCount || 0),
      localFile: deck.localFile || '',
    }));
}

async function fetchPreconIndex(force = false) {
  const cached = readCache(DECK_CACHE_KEY);
  if (!force && cached.index?.length && Date.now() - cached.updatedAt < 21_600_000) return cached.index;

  // Preferred path: GitHub Actions bundles MTGJSON deck data into this site.
  // This avoids browser CORS failures and makes the catalog same-origin.
  try {
    const payload = await fetchLocalJson(`${LOCAL_PRECON_INDEX_URL}?v=5`);
    const index = normalizeDeckIndex(payload);
    if (!index.length) throw new Error('The bundled precon index was empty.');
    writeCache(DECK_CACHE_KEY, { index, updatedAt: Date.now(), source: 'local' });
    return index;
  } catch (localError) {
    // Local development may not have run scripts/build_precons.py yet. Keep the
    // older direct-download path as a fallback, though some browsers block it.
    try {
      const { payload } = await fetchJsonFromCandidates(MTGJSON_DECK_LIST_URLS, { attempts: 2 });
      const index = normalizeDeckIndex(payload);
      if (!index.length) throw new Error('The deck index was empty.');
      writeCache(DECK_CACHE_KEY, { index, updatedAt: Date.now(), source: 'remote' });
      return index;
    } catch (remoteError) {
      if (cached.index?.length) return cached.index;
      throw new Error(`The deployed precon catalog is missing and the browser could not read MTGJSON directly. Re-run the GitHub Pages workflow. ${localError.message}`);
    }
  }
}

function deckFileCandidates(fileName) {
  const clean = String(fileName || '').trim().replace(/^\/+/, '');
  const withExtension = clean.toLowerCase().endsWith('.json') ? clean : `${clean}.json`;
  const encoded = withExtension.split('/').map(encodeURIComponent).join('/');
  return MTGJSON_DECK_BASE_URLS.flatMap((base) => [
    `${base}/${encoded}`,
    `${base}/${withExtension}`,
  ]);
}

function normalizeDeckPayload(payload, entry) {
  const deck = payload?.data || payload;
  if (!deck || typeof deck !== 'object') throw new Error('The deck response had an unsupported format.');

  // GitHub Actions publishes already-normalized same-origin deck files.
  if (Array.isArray(deck.entries) && deck.entries.some((card) => card?.name)) {
    return {
      name: deck.name || entry.name,
      entries: deck.entries
        .filter((card) => card?.name)
        .map((card) => ({
          name: card.name,
          count: Math.max(1, Number(card.count || 1)),
          ...(card.scryfallId ? { scryfallId: card.scryfallId } : {}),
          ...(card.scryfallOracleId ? { scryfallOracleId: card.scryfallOracleId } : {}),
          ...(card.faceName ? { faceName: card.faceName } : {}),
        })),
      commanderNames: Array.isArray(deck.commanderNames) ? deck.commanderNames.filter(Boolean) : [],
      releaseDate: deck.releaseDate || entry.releaseDate || '',
      type: deck.type || entry.type || '',
    };
  }

  const commanderBoard = deck.commander || deck.commanders || [];
  const mainBoard = deck.mainBoard || deck.mainboard || deck.main || deck.cards || [];
  const sideBoard = deck.sideBoard || deck.sideboard || [];
  const commanderNames = commanderBoard
    .filter((card) => card?.name)
    .flatMap((card) => Array(Math.max(1, Number(card.count ?? card.quantity ?? card.qty ?? 1))).fill(card.name));

  const cardsByName = new Map();
  // Some MTGJSON products place relevant cards in sideBoard, so use it only if
  // the main board is unexpectedly empty.
  const board = mainBoard.length ? mainBoard : sideBoard;
  for (const card of board) {
    if (!card?.name) continue;
    const count = Math.max(1, Number(card.count ?? card.quantity ?? card.qty ?? 1));
    const key = canonicalCardName(card.name);
    const identifiers = card.identifiers || {};
    const prior = cardsByName.get(key) || {
      name: card.name,
      count: 0,
      scryfallId: identifiers.scryfallId || '',
      scryfallOracleId: identifiers.scryfallOracleId || '',
      faceName: card.faceName || '',
    };
    prior.count += count;
    prior.scryfallId ||= identifiers.scryfallId || '';
    prior.scryfallOracleId ||= identifiers.scryfallOracleId || '';
    prior.faceName ||= card.faceName || '';
    cardsByName.set(key, prior);
  }
  for (const commander of commanderNames) {
    const key = canonicalCardName(commander);
    if (!cardsByName.has(key)) cardsByName.set(key, { name: commander, count: 1 });
  }
  if (!cardsByName.size) throw new Error('The deck file contained no readable cards.');

  return {
    name: deck.name || entry.name,
    entries: [...cardsByName.values()].map((card) => ({
      name: card.name,
      count: card.count,
      ...(card.scryfallId ? { scryfallId: card.scryfallId } : {}),
      ...(card.scryfallOracleId ? { scryfallOracleId: card.scryfallOracleId } : {}),
      ...(card.faceName ? { faceName: card.faceName } : {}),
    })),
    commanderNames,
    releaseDate: deck.releaseDate || entry.releaseDate || '',
    type: deck.type || entry.type || '',
  };
}

function matchingFreshEntry(index, entry) {
  const code = String(entry.code || '').toLocaleLowerCase();
  const name = String(entry.name || '').toLocaleLowerCase();
  return index.find((item) => code && String(item.code || '').toLocaleLowerCase() === code && String(item.name || '').toLocaleLowerCase() === name)
    || index.find((item) => String(item.name || '').toLocaleLowerCase() === name)
    || null;
}

async function fetchPreconDeck(entry) {
  const payloadCache = readCache(DECK_PAYLOAD_CACHE_KEY);
  const cacheKey = `${entry.code || ''}|${entry.name || ''}`.toLocaleLowerCase();

  if (entry.localFile) {
    try {
      const payload = await fetchLocalJson(`${LOCAL_PRECON_BASE_URL}/${encodeURIComponent(entry.localFile)}?v=5`);
      const normalized = normalizeDeckPayload(payload, entry);
      payloadCache[cacheKey] = { deck: normalized, updatedAt: Date.now(), fileName: entry.fileName, source: 'local' };
      writeCache(DECK_PAYLOAD_CACHE_KEY, payloadCache);
      return normalized;
    } catch (localError) {
      const cachedDeck = payloadCache[cacheKey]?.deck;
      if (cachedDeck?.entries?.length) return cachedDeck;
      throw new Error(`The bundled deck file for ${entry.name} could not be read. Re-run the GitHub Pages workflow. ${localError.message}`);
    }
  }

  const attemptEntry = async (candidateEntry) => {
    const { payload } = await fetchJsonFromCandidates(deckFileCandidates(candidateEntry.fileName), { attempts: 2 });
    const normalized = normalizeDeckPayload(payload, candidateEntry);
    payloadCache[cacheKey] = { deck: normalized, updatedAt: Date.now(), fileName: candidateEntry.fileName, source: 'remote' };
    writeCache(DECK_PAYLOAD_CACHE_KEY, payloadCache);
    return normalized;
  };

  try {
    return await attemptEntry(entry);
  } catch (firstError) {
    try {
      const freshIndex = await fetchPreconIndex(true);
      const freshEntry = matchingFreshEntry(freshIndex, entry);
      if (freshEntry?.localFile) return fetchPreconDeck(freshEntry);
      if (freshEntry) return await attemptEntry(freshEntry);
    } catch { /* use cached deck or original error below */ }

    const cachedDeck = payloadCache[cacheKey]?.deck;
    if (cachedDeck?.entries?.length) return cachedDeck;
    throw new Error(`${firstError.message} Try Search again to refresh the precon list, or paste the decklist manually.`);
  }
}


return { fetchCardsByNames, fetchPreconIndex, fetchPreconDeck };
})();

// ---- card-evaluation.js ----
__modules["./card-evaluation.js"] = (() => {
const { isCreature, numericStat } = __modules["./utils.js"];

const KEYWORD_ALIASES = {
  'double strike': 'doubleStrike',
  'first strike': 'firstStrike',
  flying: 'flying',
  reach: 'reach',
  menace: 'menace',
  deathtouch: 'deathtouch',
  trample: 'trample',
  lifelink: 'lifelink',
  indestructible: 'indestructible',
  hexproof: 'hexproof',
  ward: 'ward',
  protection: 'protection',
  vigilance: 'vigilance',
  haste: 'haste',
  flash: 'flash',
  defender: 'defender',
  shroud: 'shroud',
};

function oracle(card) {
  return String(card?.oracleText || card?.oracle_text || '').replace(/\u2212/g, '-');
}

function typeLine(card) {
  return String(card?.typeLine || card?.type_line || '');
}

function keywordSet(card) {
  const set = new Set((card?.keywords || []).map((keyword) => String(keyword).toLocaleLowerCase()));
  const text = oracle(card).toLocaleLowerCase();
  for (const keyword of Object.keys(KEYWORD_ALIASES)) {
    if (new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'i').test(text)) set.add(keyword);
  }
  if (/can't be blocked/i.test(text)) set.add('unblockable');
  return set;
}

function parseWard(text) {
  const match = text.match(/ward\s*[—-]?\s*(\{[^}]+\}|\d+|pay\s+\d+\s+life)/i);
  return match?.[1] || '';
}

function parseAnthem(text) {
  const matches = [...text.matchAll(/(?:other\s+)?(?:[A-Za-z]+\s+)?creatures you control get \+([0-9]+)\/\+([0-9]+)/gi)];
  return matches.reduce((best, match) => ({
    power: Math.max(best.power, Number(match[1] || 0)),
    toughness: Math.max(best.toughness, Number(match[2] || 0)),
  }), { power: 0, toughness: 0 });
}

function cardTraits(card) {
  const text = oracle(card);
  const type = typeLine(card);
  const keywords = keywordSet(card);
  const instant = /\bInstant\b/.test(type);
  const aura = /\bAura\b/.test(type);
  const equipment = /\bEquipment\b/.test(type);
  const creature = isCreature(card);

  const traits = {
    creature,
    instant,
    aura,
    equipment,
    flying: keywords.has('flying'),
    reach: keywords.has('reach'),
    menace: keywords.has('menace'),
    deathtouch: keywords.has('deathtouch'),
    firstStrike: keywords.has('first strike'),
    doubleStrike: keywords.has('double strike'),
    trample: keywords.has('trample'),
    lifelink: keywords.has('lifelink'),
    indestructible: keywords.has('indestructible'),
    hexproof: keywords.has('hexproof'),
    ward: keywords.has('ward'),
    wardCost: parseWard(text),
    protection: keywords.has('protection'),
    vigilance: keywords.has('vigilance'),
    haste: keywords.has('haste'),
    flash: keywords.has('flash'),
    defender: keywords.has('defender'),
    shroud: keywords.has('shroud'),
    unblockable: keywords.has('unblockable'),
    deathTrigger: /whenever .* dies|when .* dies|put into a graveyard from the battlefield/i.test(text),
    attackTrigger: /whenever .* attacks|when .* attacks|at the beginning of combat/i.test(text),
    combatDamageTrigger: /whenever .* deals combat damage|combat damage to (?:a player|an opponent)/i.test(text),
    enterTrigger: /when(?:ever)? .* enters(?: the battlefield)?/i.test(text),
    activatedAbility: /(?:^|\n)[^\n.]{0,120}:\s/i.test(text),
    tapAbility: /\{T\}\s*:/i.test(text),
    staticEffect: /creatures you control get|other .* get|players can't|spells .* cost|you may|each opponent|cards? in .* have/i.test(text),
    draw: /draw (?:a|one|two|three|four|five|six|\d+) cards?/i.test(text),
    tutor: /search (?:your|target player's) library/i.test(text),
    tokenMaker: /create .* token/i.test(text),
    recursion: /return target .* card from .*graveyard|cast .* from your graveyard|from your graveyard to/i.test(text),
    sacrificeValue: /sacrifice .*:/i.test(text) || /whenever you sacrifice/i.test(text),
    graveyardInteraction: /exile target card from a graveyard|cards? in graveyards? can't|target player's graveyard|graveyard to exile/i.test(text),
    counterspell: /counter target (?:spell|activated ability|triggered ability)/i.test(text),
    boardWipe: /destroy all|exile all|all creatures get -\d+\/-\d+|deals? \d+ damage to each creature|return all .* to their owners?' hands/i.test(text),
    targetedRemoval: /destroy target|exile target|return target .* to (?:its owner's|their owner's|your) hand|target creature gets -\d+\/-\d+|deals? \d+ damage to target creature/i.test(text),
    protectionSpell: instant && /gains? (?:hexproof|indestructible|protection)|phase[s]? out|regenerate target/i.test(text),
    combatTrick: instant && /gets? \+[0-9X]+\/\+[0-9X]+|gains? (?:first strike|double strike|trample|deathtouch|lifelink|flying)/i.test(text),
    flashThreat: creature && (keywords.has('flash') || /you may cast .* as though it had flash/i.test(text)),
    anthem: parseAnthem(text),
  };
  traits.interactionCategories = [
    traits.counterspell && 'counterspell',
    traits.targetedRemoval && 'removal',
    traits.boardWipe && 'boardWipe',
    traits.combatTrick && 'combatTrick',
    traits.protectionSpell && 'protection',
    traits.graveyardInteraction && 'graveyardInteraction',
    traits.flashThreat && 'flashThreat',
  ].filter(Boolean);
  return traits;
}

function effectiveStats(card, battlefield = []) {
  const counters = card?.counters || {};
  let power = numericStat(card?.power, 0) + Number(counters['+1/+1'] || 0) - Number(counters['-1/-1'] || 0);
  let toughness = numericStat(card?.toughness, 0) + Number(counters['+1/+1'] || 0) - Number(counters['-1/-1'] || 0);
  for (const permanent of battlefield) {
    if (permanent.instanceId === card?.instanceId) continue;
    const traits = cardTraits(permanent);
    power += Number(traits.anthem.power || 0);
    toughness += Number(traits.anthem.toughness || 0);
  }
  return { power, toughness };
}

function canBlock(attacker, blocker, battlefield = []) {
  if (!isCreature(blocker) || blocker.tapped) return false;
  const attackTraits = cardTraits(attacker);
  const blockTraits = cardTraits(blocker);
  if (attackTraits.unblockable) return false;
  if (attackTraits.flying && !(blockTraits.flying || blockTraits.reach)) return false;
  if (/can't block/i.test(oracle(blocker))) return false;
  return effectiveStats(blocker, battlefield).toughness > 0;
}

function combatOutcome(attacker, blockers = [], attackerBattlefield = [], blockerBattlefield = []) {
  const attackTraits = cardTraits(attacker);
  const attackerStats = effectiveStats(attacker, attackerBattlefield);
  const legalBlockers = blockers.filter((blocker) => canBlock(attacker, blocker, blockerBattlefield));
  if (!legalBlockers.length || (attackTraits.menace && legalBlockers.length < 2)) {
    return {
      playerDamage: Math.max(0, attackerStats.power),
      attackerDies: false,
      blockersDie: [],
      lifelinkGain: attackTraits.lifelink ? Math.max(0, attackerStats.power) : 0,
      unblocked: true,
    };
  }

  const blockersDie = [];
  let remainingPower = Math.max(0, attackerStats.power);
  let blockerCanDealBack = true;
  for (const blocker of legalBlockers) {
    const blockTraits = cardTraits(blocker);
    const blockerStats = effectiveStats(blocker, blockerBattlefield);
    const lethalNeeded = attackTraits.deathtouch && remainingPower > 0 ? 1 : Math.max(0, blockerStats.toughness);
    const killsBlocker = remainingPower >= lethalNeeded && !blockTraits.indestructible;
    if (killsBlocker) blockersDie.push(blocker.instanceId);
    remainingPower = Math.max(0, remainingPower - lethalNeeded);
    if ((attackTraits.firstStrike || attackTraits.doubleStrike) && killsBlocker && !blockTraits.firstStrike && !blockTraits.doubleStrike) {
      blockerCanDealBack = false;
    }
  }

  let returnDamage = 0;
  let returnDeathtouch = false;
  if (blockerCanDealBack || attackTraits.doubleStrike) {
    for (const blocker of legalBlockers) {
      const blockTraits = cardTraits(blocker);
      const blockerStats = effectiveStats(blocker, blockerBattlefield);
      returnDamage += Math.max(0, blockerStats.power) * (blockTraits.doubleStrike ? 2 : 1);
      if (blockTraits.deathtouch && blockerStats.power > 0) returnDeathtouch = true;
    }
  }
  const attackerDies = !attackTraits.indestructible
    && (returnDeathtouch || returnDamage >= Math.max(0, attackerStats.toughness));
  const playerDamage = attackTraits.trample ? Math.max(0, remainingPower) * (attackTraits.doubleStrike ? 2 : 1) : 0;
  return {
    playerDamage,
    attackerDies,
    blockersDie,
    lifelinkGain: attackTraits.lifelink ? Math.max(0, attackerStats.power - remainingPower + playerDamage) : 0,
    unblocked: false,
  };
}

function permanentValue(card, friendlyBattlefield = [], opposingBattlefield = [], context = {}) {
  const traits = cardTraits(card);
  const stats = effectiveStats(card, friendlyBattlefield);
  let value = Number(card?.manaValue || 0) * 0.9;
  if (traits.creature) {
    value += stats.power * 0.82 + stats.toughness * 0.58;
    if (traits.flying) {
      const flyingBlocks = opposingBattlefield.filter((blocker) => {
        const t = cardTraits(blocker);
        return !blocker.tapped && (t.flying || t.reach);
      }).length;
      value += flyingBlocks ? 0.9 : 2.2;
    }
    if (traits.reach) value += opposingBattlefield.some((opponent) => cardTraits(opponent).flying) ? 1.4 : 0.45;
    if (traits.menace) value += opposingBattlefield.filter((blocker) => isCreature(blocker) && !blocker.tapped).length < 2 ? 1.8 : 0.8;
    if (traits.deathtouch) value += stats.power <= 2 ? 2.4 : 1.4;
    if (traits.firstStrike) value += 1.0;
    if (traits.doubleStrike) value += 2.6 + Math.max(0, stats.power) * 0.28;
    if (traits.trample) value += 1.1;
    if (traits.lifelink) value += context.lowLife ? 2.0 : 1.0;
    if (traits.indestructible) value += 2.4;
    if (traits.hexproof || traits.shroud) value += 1.8;
    if (traits.ward) value += 1.15;
    if (traits.protection) value += 1.35;
    if (traits.vigilance) value += 0.7;
    if (traits.haste) value += card?.summoningSick ? 1.2 : 0.45;
    if (traits.deathTrigger) value += 1.65;
    if (traits.attackTrigger) value += 1.7;
    if (traits.combatDamageTrigger) value += traits.flying || traits.unblockable ? 2.2 : 1.2;
    if (traits.activatedAbility) value += 1.15;
    if (card?.summoningSick && !traits.haste) value -= 0.25;
  }
  if (traits.equipment || traits.aura) value += 1.2;
  if (traits.staticEffect) value += 1.5;
  if (traits.anthem.power || traits.anthem.toughness) value += 1.5 + friendlyBattlefield.filter(isCreature).length * 0.45;
  if (traits.draw) value += 1.25;
  if (traits.tutor) value += 1.7;
  if (traits.tokenMaker) value += 1.25;
  if (traits.recursion) value += 1.15;
  if (traits.sacrificeValue) value += 0.8;
  if (traits.targetedRemoval) value += 1.3;
  if (traits.boardWipe) value += 2.1;
  if (traits.counterspell) value += 1.25;
  if (card?.commander) value += 1.7;
  if (card?.token) value -= 0.15;
  if (card?.tapped) value -= traits.vigilance ? 0.1 : 0.45;
  if (card?.faceDown) value *= 0.8;
  value += Object.values(card?.counters || {}).reduce((sum, amount) => sum + Math.abs(Number(amount || 0)) * 0.28, 0);
  if (card?.attachedTo) value += 0.6;
  return value;
}

function combatTradeScore(attacker, blockers, attackerBattlefield = [], blockerBattlefield = []) {
  const outcome = combatOutcome(attacker, blockers, attackerBattlefield, blockerBattlefield);
  const attackerValue = permanentValue(attacker, attackerBattlefield, blockerBattlefield);
  const killedBlockerValue = blockers
    .filter((blocker) => outcome.blockersDie.includes(blocker.instanceId))
    .reduce((sum, blocker) => sum + permanentValue(blocker, blockerBattlefield, attackerBattlefield), 0);
  return outcome.playerDamage * 1.15 + killedBlockerValue - (outcome.attackerDies ? attackerValue : 0) + outcome.lifelinkGain * 0.35;
}

function publicCardSnapshot(card) {
  if (!card) return null;
  return {
    instanceId: card.instanceId,
    scryfallId: card.scryfallId || null,
    oracleId: card.oracleId || null,
    name: card.name,
    manaCost: card.manaCost || '',
    manaValue: Number(card.manaValue || 0),
    typeLine: card.typeLine || '',
    oracleText: card.oracleText || '',
    power: card.power || '',
    toughness: card.toughness || '',
    keywords: [...(card.keywords || [])],
    colors: [...(card.colors || [])],
    colorIdentity: [...(card.colorIdentity || [])],
    commander: Boolean(card.commander),
    token: Boolean(card.token),
  };
}


return { cardTraits, effectiveStats, canBlock, combatOutcome, permanentValue, combatTradeScore, publicCardSnapshot };
})();

// ---- rules.js ----
__modules["./rules.js"] = (() => {
const { PHASES } = __modules["./constants.js"];
const { hasFlash, isCreature, isLand, isPermanent, manaBundleAmount, manaProductionChoices, manaRequirement, totalMana, untappedManaSources } = __modules["./utils.js"];

function validateDeck(entries, byName, commanderNames = []) {
  const errors = [];
  const warnings = [];
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total !== 100) errors.push(`Commander decks need exactly 100 cards including the commander. This list has ${total}.`);
  const unknown = entries.filter((entry) => !byName[entry.name.toLocaleLowerCase()]);
  if (unknown.length) errors.push(`Unknown card${unknown.length === 1 ? '' : 's'}: ${unknown.map((entry) => entry.name).join(', ')}.`);
  if (!commanderNames.length) errors.push('Choose at least one commander.');
  if (commanderNames.length > 2) errors.push('This build supports at most two commanders.');

  const commanders = commanderNames.map((name) => byName[name.toLocaleLowerCase()]).filter(Boolean);
  const identity = new Set(commanders.flatMap((card) => card.colorIdentity || []));
  for (const entry of entries) {
    const card = byName[entry.name.toLocaleLowerCase()];
    if (!card) continue;
    const isBasic = card.typeLine.includes('Basic Land');
    const anyNumber = /deck can have any number of cards named/i.test(card.oracleText || '');
    const upTo = (card.oracleText || '').match(/deck can have up to (\w+) cards named/i);
    if (entry.count > 1 && !isBasic && !anyNumber && !upTo) errors.push(`${card.name} appears ${entry.count} times, but Commander is singleton.`);
    const offColor = (card.colorIdentity || []).filter((color) => !identity.has(color));
    if (commanders.length && offColor.length) errors.push(`${card.name} has ${offColor.join('/')} in its color identity, outside the selected commander identity.`);
    if (card.legalities?.commander === 'banned') errors.push(`${card.name} is banned in Commander.`);
    if (card.legalities?.commander === 'not_legal') warnings.push(`${card.name} is marked not legal in Commander by Scryfall.`);
  }

  for (const commander of commanders) {
    const eligible = commander.typeLine.includes('Legendary Creature') || /can be your commander/i.test(commander.oracleText || '');
    if (!eligible) errors.push(`${commander.name} is not normally eligible to be a commander.`);
  }
  if (commanders.length === 2) warnings.push('Two-commander pairing rules such as Partner, Background, and Friends forever are not fully validated yet.');
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], total, identity: [...identity] };
}

function commanderCandidates(cards) {
  return cards.filter((card) => card.typeLine.includes('Legendary Creature') || /can be your commander/i.test(card.oracleText || ''));
}


const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function controlsSubtype(player, subtype) {
  const needle = String(subtype || '').toLocaleLowerCase();
  return (player?.zones?.battlefield || []).some((card) => String(card.typeLine || '').toLocaleLowerCase().includes(needle));
}

function handContainsSubtype(player, subtype) {
  const needle = String(subtype || '').toLocaleLowerCase();
  return (player?.zones?.hand || []).some((card) => String(card.typeLine || '').toLocaleLowerCase().includes(needle));
}

/**
 * Applies common land-entry rules using only visible state. It deliberately
 * returns the reasoning so the coach can explain why a land is or is not
 * immediately usable. Unusual replacement effects remain manual.
 */
function landEntryPlan(card, player, { opponentCount = 1, payLife = 'auto' } = {}) {
  if (!isLand(card)) return { tapped: false, lifePaid: 0, reason: 'Not a land.', choice: null };
  const text = String(card.oracleText || '').replace(/\n/g, ' ').toLocaleLowerCase();
  const battlefield = player?.zones?.battlefield || [];
  const otherLands = battlefield.filter(isLand).length;
  const creatures = battlefield.filter(isCreature);
  const result = { tapped: false, lifePaid: 0, reason: 'No visible effect makes this land enter tapped.', choice: null };

  // Shock-land style optional life payment.
  if (/may pay 2 life[\s\S]*if you don['’]t[\s\S]*enters?(?: the battlefield)? tapped/.test(text)) {
    const shouldPay = payLife === true || (payLife === 'auto' && Number(player?.life || 0) > 8);
    return shouldPay
      ? { tapped: false, lifePaid: 2, reason: 'Pay 2 life so the land enters untapped.', choice: 'pay-life' }
      : { tapped: true, lifePaid: 0, reason: 'The optional 2 life was not paid.', choice: 'enter-tapped' };
  }

  // Reveal-land style condition.
  const revealMatch = text.match(/unless you reveal (?:a|an) ([a-z ]+?) card from your hand/);
  if (revealMatch) {
    const types = revealMatch[1].split(/\s+or\s+|\//).map((value) => value.trim()).filter(Boolean);
    const canReveal = types.some((type) => handContainsSubtype(player, type));
    return { tapped: !canReveal, lifePaid: 0, reason: canReveal ? `A ${types.join(' or ')} card can be revealed.` : `No ${types.join(' or ')} card is visible in hand to reveal.`, choice: canReveal ? 'reveal' : null };
  }

  // Check lands and similar conditional lands.
  const basicTypes = ['plains', 'island', 'swamp', 'mountain', 'forest'];
  if (/enters?(?: the battlefield)? tapped unless you control/.test(text)) {
    if (/two or more other lands/.test(text)) {
      const untapped = otherLands >= 2;
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? 'You control two or more other lands.' : 'You do not control two or more other lands.', choice: null };
    }
    if (/a legendary creature/.test(text)) {
      const untapped = creatures.some((creature) => /Legendary/.test(creature.typeLine || ''));
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? 'You control a legendary creature.' : 'You do not control a legendary creature.', choice: null };
    }
    if (/two or more opponents/.test(text)) {
      const untapped = opponentCount >= 2;
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? 'You have at least two opponents.' : 'You have fewer than two opponents.', choice: null };
    }
    const mentioned = basicTypes.filter((type) => text.includes(type));
    if (mentioned.length) {
      const untapped = mentioned.some((type) => controlsSubtype(player, type));
      return { tapped: !untapped, lifePaid: 0, reason: untapped ? `You control a required ${mentioned.join(' or ')}.` : `You do not control a required ${mentioned.join(' or ')}.`, choice: null };
    }
  }

  // Fast-land style condition.
  if (/enters?(?: the battlefield)? tapped if you control two or more other lands/.test(text)) {
    const tapped = otherLands >= 2;
    return { tapped, lifePaid: 0, reason: tapped ? 'You control two or more other lands.' : 'You control fewer than two other lands.', choice: null };
  }

  // Optional “you may have this enter tapped” is not forced.
  if (/you may have .* enter(?: the battlefield)? tapped/.test(text)) {
    return { tapped: false, lifePaid: 0, reason: 'Entering tapped is optional; the coach assumes untapped unless another effect matters.', choice: 'untapped' };
  }

  if (/enters?(?: the battlefield)? tapped/.test(text)) {
    return { tapped: true, lifePaid: 0, reason: 'Oracle text says this land enters tapped.', choice: null };
  }
  return result;
}

function manaDevelopmentSnapshot(player) {
  const floating = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(player?.mana || {}) };
  const colors = new Set(Object.entries(floating).filter(([, amount]) => Number(amount) > 0).map(([color]) => color));
  let available = totalMana(floating);
  let nextTurn = totalMana(floating);
  let untappedSourceCount = 0;
  let tappedSourceCount = 0;
  const sources = [];
  for (const card of player?.zones?.battlefield || []) {
    const choices = manaProductionChoices(card);
    if (!choices.length) continue;
    const capacity = Math.max(0, ...choices.map((choice) => manaBundleAmount(choice.mana)));
    nextTurn += capacity;
    if (card.tapped) tappedSourceCount += 1;
    else {
      available += capacity;
      untappedSourceCount += 1;
      for (const choice of choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount) > 0) colors.add(color);
    }
    sources.push({ instanceId: card.instanceId, name: card.name, tapped: Boolean(card.tapped), capacity, choices });
  }
  return { floating, available, nextTurn, colors: [...colors], untappedSourceCount, tappedSourceCount, sources };
}

/** Colors worth preserving because another visible instant/flash card may use them. */
function strategicPaymentColors(player, excludedCardId = null) {
  const colors = new Set();
  const candidates = [
    ...(player?.zones?.hand || []),
    ...(player?.zones?.command || []).filter((card) => hasFlash(card)),
  ];
  for (const card of candidates) {
    if (card.instanceId === excludedCardId) continue;
    const instantSpeed = String(card.typeLine || '').includes('Instant') || hasFlash(card);
    if (!instantSpeed) continue;
    const req = manaRequirement(card.manaCost || '');
    for (const color of MANA_COLORS) if (Number(req[color] || 0) > 0) colors.add(color);
    for (const flexible of req.flexible || []) for (const color of flexible) if (MANA_COLORS.includes(color)) colors.add(color);
  }
  return [...colors];
}

function landPlayLegality(state, playerId, card) {
  const reasons = [];
  const player = state.players[playerId];
  const phase = PHASES[state.phaseIndex]?.id;
  if (!isLand(card)) reasons.push('Only a land card can be played as a land.');
  if (playerId !== state.activePlayerId) reasons.push('Only the active player may play a land.');
  if (!['main1', 'main2'].includes(phase)) reasons.push('A land can normally be played only during a main phase.');
  if ((state.stack || []).length) reasons.push('A land can be played only while the stack is empty.');
  if (Number(player?.landPlaysThisTurn || 0) >= 1) reasons.push('That player has already used the normal land play for this turn.');
  return { legal: reasons.length === 0, reasons };
}

function spellCastLegality(state, playerId, card, sourceZone = 'hand', options = {}) {
  const { useUntappedSources = true } = options;
  const reasons = [];
  const player = state.players[playerId];
  const phase = PHASES[state.phaseIndex]?.id;
  if (isLand(card)) reasons.push('Lands are played, not cast as spells.');
  const instantSpeed = String(card.typeLine || '').includes('Instant') || hasFlash(card);
  if (!instantSpeed) {
    if (playerId !== state.activePlayerId) reasons.push('A noninstant spell normally requires your own turn.');
    if (!['main1', 'main2'].includes(phase)) reasons.push('A noninstant spell normally requires a main phase.');
    if ((state.stack || []).length) reasons.push('A noninstant spell normally requires an empty stack.');
  }
  const costPlan = buildCostPlan(state, playerId, card, sourceZone, options);
  const payment = useUntappedSources
    ? planSpellPayment(state, playerId, card, sourceZone, { ...options, costPlan })
    : { ...canPayMana(player?.mana || {}, costPlan.finalManaCost, 0), sources: [], projectedPool: { ...(player?.mana || {}) }, costPlan };
  if (!payment.ok) reasons.push(payment.reason || `The available resources cannot pay ${costPlan.displayCost || card.manaCost || 'this cost'}.`);
  return { legal: reasons.length === 0, reasons, tax: costPlan.commanderTax, payment, costPlan };
}

function moveLegality(state, card, source, targetPlayerId, targetZone) {
  const mode = state.settings.rulesMode;
  if (mode === 'free') return { legal: true, reasons: [] };
  const reasons = [];
  const targetPlayer = state.players[targetPlayerId];

  if (targetZone === 'command' && !card.commander) reasons.push('Only a designated commander should be placed in the command zone.');

  if (targetZone === 'battlefield' && source.zone === 'hand') {
    if (isLand(card)) reasons.push(...landPlayLegality(state, targetPlayerId, card).reasons);
    else {
      if (!isPermanent(card)) reasons.push('Instants and sorceries are cast onto the stack, not placed directly onto the battlefield.');
      reasons.push(...spellCastLegality(state, targetPlayerId, card, source.zone, { useUntappedSources: state.settings.manaMode === 'auto' }).reasons);
    }
  }

  if (targetZone === 'battlefield' && source.zone === 'command') {
    reasons.push(...spellCastLegality(state, targetPlayerId, card, source.zone, { useUntappedSources: state.settings.manaMode === 'auto' }).reasons);
  }

  if (targetZone === 'stack' && ['hand', 'command'].includes(source.zone)) {
    reasons.push(...spellCastLegality(state, targetPlayerId, card, source.zone, { useUntappedSources: state.settings.manaMode === 'auto' }).reasons);
  }

  if (['graveyard', 'exile', 'library'].includes(source.zone) && !['graveyard', 'exile', 'library'].includes(targetZone)) {
    reasons.push(`Moving a card from ${source.zone} to ${targetZone} normally requires a card effect. Use an override when resolving that effect manually.`);
  }
  return { legal: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function canPayMana(pool, manaCost, tax = 0) {
  const req = manaRequirement(manaCost, tax);
  const working = { ...pool };
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
    if ((working[color] || 0) < req[color]) return { ok: false, reason: `Not enough ${color} mana for ${manaCost || 'this cost'}${tax ? ` plus ${tax} commander tax` : ''}.` };
    working[color] -= req[color];
  }
  for (const choices of req.flexible) {
    const available = choices.find((color) => (working[color] || 0) > 0);
    if (!available) return { ok: false, reason: `The mana pool cannot satisfy ${manaCost}.` };
    working[available] -= 1;
  }
  if (totalMana(working) < req.generic) return { ok: false, reason: `Not enough total mana for ${manaCost || 'this cost'}${tax ? ` plus ${tax} commander tax` : ''}.` };
  return { ok: true, reason: '' };
}

function spendMana(pool, manaCost, tax = 0) {
  const req = manaRequirement(manaCost, tax);
  const next = { ...pool };
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) next[color] = Math.max(0, next[color] - req[color]);
  for (const choices of req.flexible) {
    const available = choices
      .filter((color) => next[color] > 0)
      .sort((a, b) => Number(next[b] || 0) - Number(next[a] || 0))[0];
    if (available) next[available] -= 1;
  }
  let generic = req.generic;
  for (const color of ['C', 'W', 'U', 'B', 'R', 'G']) {
    const amount = Math.min(next[color], generic);
    next[color] -= amount;
    generic -= amount;
  }
  return next;
}


function planManaPayment(player, manaCost, tax = 0, options = {}) {
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(player?.mana || {}) };
  if (canPayMana(pool, manaCost, tax).ok) {
    return { ok: true, sources: [], projectedPool: pool, remainingPool: spendMana(pool, manaCost, tax), preservedColors: [] };
  }

  const preserveColors = [...new Set((options.preserveColors || []).filter((color) => MANA_COLORS.includes(color)))];
  const sources = untappedManaSources(player)
    .filter((source) => !(options.excludeSourceIds || []).includes(source.card.instanceId))
    .filter((source) => !options.spellCard || manaSourceCanPaySpell(source.card, options.spellCard))
    .map((source) => ({ ...source, flexibility: source.choices.length, maxAmount: Math.max(...source.choices.map((choice) => manaBundleAmount(choice.mana))) }))
    .sort((a, b) => (b.maxAmount - a.maxAmount) || (a.flexibility - b.flexibility));
  const requirement = manaRequirement(manaCost, tax);
  const costUnits = requirement.generic
    + MANA_COLORS.reduce((sum, color) => sum + Number(requirement[color] || 0), 0)
    + Number(requirement.flexible?.length || 0);
  const shortfall = Math.max(0, costUnits - totalMana(pool));
  const largestSource = Math.max(1, ...sources.map((source) => source.maxAmount));
  const minimumSources = Math.max(1, Math.ceil(shortfall / largestSource));
  const maxNodesPerDepth = Math.max(3000, Number(options.maxNodes || 12000));
  let best = null;

  const addBundle = (poolValue, mana) => {
    const next = { ...poolValue };
    for (const color of MANA_COLORS) next[color] = Number(next[color] || 0) + Number(mana?.[color] || 0);
    return next;
  };

  const availableColorsAfter = (working, selectedIds) => {
    const remaining = spendMana(working, manaCost, tax);
    const colors = new Set(Object.entries(remaining).filter(([, amount]) => Number(amount) > 0).map(([color]) => color));
    for (const source of sources) {
      if (selectedIds.has(source.card.instanceId)) continue;
      for (const choice of source.choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount) > 0) colors.add(color);
    }
    return { remaining, colors };
  };

  const consider = (working, selected) => {
    if (!canPayMana(working, manaCost, tax).ok) return;
    const selectedIds = new Set(selected.map((item) => item.instanceId));
    const { remaining, colors } = availableColorsAfter(working, selectedIds);
    const missingPreserved = preserveColors.filter((color) => !colors.has(color));
    const flexPenalty = selected.reduce((sum, item) => sum + Math.max(0, Number(item.flexibility || 1) - 1) * 0.45, 0);
    const utilityPenalty = selected.reduce((sum, item) => {
      const source = sources.find((candidate) => candidate.card.instanceId === item.instanceId);
      const text = String(source?.card?.oracleText || '');
      const nonManaAbility = /(?:^|\n)(?!\{T\}:\s*Add)[^\n.]{0,120}:/.test(text);
      return sum + (nonManaAbility ? 0.8 : 0);
    }, 0);
    const score = missingPreserved.length * 12
      + flexPenalty
      + utilityPenalty
      - totalMana(remaining) * 0.12;
    if (!best || selected.length < best.sources.length || (selected.length === best.sources.length && score < best.score)) {
      best = {
        score,
        ok: true,
        sources: selected.map(({ flexibility, ...item }) => ({ ...item, ...manaSourcePaymentCost(sources.find((candidate) => candidate.card.instanceId === item.instanceId)?.card) })),
        projectedPool: { ...working },
        remainingPool: remaining,
        preservedColors: preserveColors.filter((color) => colors.has(color)),
      };
    }
  };

  // Iterative deepening guarantees that the planner first finds the fewest
  // physical permanents that must be tapped, then optimizes color preservation.
  for (let sourceLimit = minimumSources; sourceLimit <= sources.length; sourceLimit += 1) {
    let nodes = 0;
    best = null;
    const dfs = (index, working, selected) => {
      if (nodes++ >= maxNodesPerDepth) return;
      if (canPayMana(working, manaCost, tax).ok) {
        consider(working, selected);
        return;
      }
      if (index >= sources.length || selected.length >= sourceLimit) return;
      if (selected.length + (sources.length - index) < minimumSources) return;

      const source = sources[index];
      for (let choiceIndex = 0; choiceIndex < source.choices.length; choiceIndex += 1) {
        const choice = source.choices[choiceIndex];
        dfs(index + 1, addBundle(working, choice.mana), [...selected, {
          instanceId: source.card.instanceId,
          name: source.card.name,
          choiceIndex,
          mana: { ...choice.mana },
          label: choice.label,
          flexibility: source.flexibility,
        }]);
      }
      dfs(index + 1, working, selected);
    };
    dfs(0, pool, []);
    if (best) return best;
  }

  return { ok: false, sources: [], projectedPool: pool, remainingPool: pool, preservedColors: [], reason: `The untapped mana sources cannot pay ${manaCost || 'this cost'}${tax ? ` plus ${tax} commander tax` : ''}.` };
}


function requirementClone(req) {
  return { W: Number(req.W || 0), U: Number(req.U || 0), B: Number(req.B || 0), R: Number(req.R || 0), G: Number(req.G || 0), C: Number(req.C || 0), generic: Number(req.generic || 0), flexible: (req.flexible || []).map((entry) => [...entry]) };
}

function combineRequirements(...requirements) {
  const out = requirementClone({});
  for (const req of requirements) {
    for (const color of MANA_COLORS) out[color] += Number(req?.[color] || 0);
    out.generic += Number(req?.generic || 0);
    out.flexible.push(...(req?.flexible || []).map((entry) => [...entry]));
  }
  return out;
}

function requirementToManaCost(requirement) {
  const symbols = [];
  if (Number(requirement?.generic || 0) > 0) symbols.push(`{${Number(requirement.generic)}}`);
  for (const color of MANA_COLORS) for (let i = 0; i < Number(requirement?.[color] || 0); i += 1) symbols.push(`{${color}}`);
  for (const choices of requirement?.flexible || []) if (choices.length) symbols.push(`{${choices.join('/')}}`);
  return symbols.join('');
}

function spellMatchesCostText(card, text) {
  const type = String(card?.typeLine || '').toLocaleLowerCase();
  if (/creature spells?/.test(text) && !type.includes('creature')) return false;
  if (/artifact spells?/.test(text) && !type.includes('artifact')) return false;
  if (/enchantment spells?/.test(text) && !type.includes('enchantment')) return false;
  if (/instant spells?/.test(text) && !type.includes('instant')) return false;
  if (/sorcery spells?/.test(text) && !type.includes('sorcery')) return false;
  if (/noncreature spells?/.test(text) && type.includes('creature')) return false;
  return true;
}

function genericCostModifierFromText(text, card, direction = 'less') {
  let total = 0;
  const normalized = String(text || '').replace(/\n/g, ' ');
  const re = direction === 'less'
    ? /(?:spells|creature spells|artifact spells|enchantment spells|instant spells|sorcery spells|noncreature spells) you cast cost \{(\d+)\} less/gi
    : /(?:spells|creature spells|artifact spells|enchantment spells|instant spells|sorcery spells|noncreature spells) (?:your opponents|opponents) cast cost \{(\d+)\} more/gi;
  for (const match of normalized.matchAll(re)) {
    const phrase = match[0].toLocaleLowerCase();
    if (spellMatchesCostText(card, phrase)) total += Number(match[1] || 0);
  }
  return total;
}

function additionalCostPlan(player, card) {
  const text = String(card?.oracleText || '').replace(/\n/g, ' ');
  const result = { life: 0, sacrifices: [], discards: [], errors: [] };
  const life = text.match(/as an additional cost to cast this spell,? pay (\d+) life/i);
  if (life) {
    result.life = Number(life[1]);
    if (Number(player?.life || 0) <= result.life) result.errors.push(`Paying ${result.life} life would leave no life available.`);
  }
  if (/as an additional cost to cast this spell,? discard a card/i.test(text)) {
    const candidate = [...(player?.zones?.hand || [])]
      .filter((item) => item.instanceId !== card.instanceId)
      .sort((a, b) => Number(a.manaValue || 0) - Number(b.manaValue || 0))[0];
    if (candidate) result.discards.push(candidate.instanceId);
    else result.errors.push('An additional card must be discarded.');
  }
  const sacrificeCreature = /as an additional cost to cast this spell,? sacrifice a creature/i.test(text);
  const sacrificePermanent = /as an additional cost to cast this spell,? sacrifice a permanent/i.test(text);
  if (sacrificeCreature || sacrificePermanent) {
    const candidates = (player?.zones?.battlefield || [])
      .filter((item) => sacrificePermanent || isCreature(item))
      .sort((a, b) => (a.commander === b.commander ? 0 : a.commander ? 1 : -1) || (a.token === b.token ? 0 : a.token ? -1 : 1) || Number(a.manaValue || 0) - Number(b.manaValue || 0));
    if (candidates[0]) result.sacrifices.push(candidates[0].instanceId);
    else result.errors.push(`An additional ${sacrificeCreature ? 'creature' : 'permanent'} must be sacrificed.`);
  }
  return result;
}

function kickerCost(card) {
  const match = String(card?.oracleText || '').match(/(?:multi)?kicker\s+(\{[^\n.]+?\})/i);
  return match?.[1]?.replace(/\}\s*\{/g, '}{') || '';
}

function buildCostPlan(state, playerId, card, sourceZone = 'hand', options = {}) {
  const player = state.players[playerId];
  const baseManaCost = options.alternativeManaCost || card.manaCost || '';
  const commanderTax = sourceZone === 'command' ? 2 * Number(player?.commanderCastCount?.[card.instanceId] || 0) : 0;
  const optionalMana = options.additionalManaCost || (options.kicked ? kickerCost(card) : '');
  const base = combineRequirements(manaRequirement(baseManaCost), manaRequirement(optionalMana));
  let reductions = 0;
  let increases = commanderTax;
  for (const permanent of player?.zones?.battlefield || []) reductions += genericCostModifierFromText(permanent.oracleText, card, 'less');
  for (const [opponentId, opponent] of Object.entries(state.players || {})) {
    if (opponentId === playerId) continue;
    for (const permanent of opponent?.zones?.battlefield || []) increases += genericCostModifierFromText(permanent.oracleText, card, 'more');
  }
  const finalRequirement = requirementClone(base);
  finalRequirement.generic = Math.max(0, finalRequirement.generic + increases - reductions);
  const additional = additionalCostPlan(player, card);
  return {
    baseManaCost,
    optionalMana,
    commanderTax,
    increases,
    reductions,
    finalRequirement,
    finalManaCost: requirementToManaCost(finalRequirement),
    displayCost: requirementToManaCost(finalRequirement) || 'no mana',
    additional,
    mechanics: {
      convoke: /\bconvoke\b/i.test(card.oracleText || '') || (card.keywords || []).includes('Convoke'),
      delve: /\bdelve\b/i.test(card.oracleText || '') || (card.keywords || []).includes('Delve'),
      improvise: /\bimprovise\b/i.test(card.oracleText || '') || (card.keywords || []).includes('Improvise'),
      kicker: kickerCost(card),
    },
  };
}

function manaSourceCanPaySpell(source, spell) {
  const text = String(source?.oracleText || '').toLocaleLowerCase();
  const type = String(spell?.typeLine || '').toLocaleLowerCase();
  if (/spend this mana only to activate abilities/.test(text)) return false;
  if (/spend this mana only to cast (?:a )?creature spell/.test(text) && !type.includes('creature')) return false;
  if (/spend this mana only to cast (?:an )?artifact spell/.test(text) && !type.includes('artifact')) return false;
  if (/spend this mana only to cast (?:an )?instant or sorcery spell/.test(text) && !(type.includes('instant') || type.includes('sorcery'))) return false;
  if (/spend this mana only to cast your commander/.test(text) && !spell?.commander) return false;
  return true;
}

function manaSourcePaymentCost(source) {
  const text = String(source?.oracleText || '');
  return {
    sacrificeSource: /sacrifice (?:this artifact|this permanent|~|treasure|clue|food)/i.test(text) && /add\s+\{/i.test(text),
    lifeCost: Number(text.match(/pay (\d+) life[^:]*:\s*add/i)?.[1] || 0),
  };
}

function specialPaymentCandidates(player, card, costPlan) {
  const generic = Number(costPlan.finalRequirement.generic || 0);
  const colored = MANA_COLORS.reduce((sum, color) => sum + Number(costPlan.finalRequirement[color] || 0), 0) + Number(costPlan.finalRequirement.flexible?.length || 0);
  const candidates = [];
  if (costPlan.mechanics.convoke) {
    const creatures = (player?.zones?.battlefield || [])
      .filter((item) => isCreature(item) && !item.tapped)
      .sort((a, b) => (a.commander === b.commander ? 0 : a.commander ? 1 : -1) || (a.token === b.token ? 0 : a.token ? -1 : 1) || Number(a.manaValue || 0) - Number(b.manaValue || 0));
    candidates.push(...creatures.slice(0, generic + colored).map((item) => ({ kind: 'convoke', instanceId: item.instanceId, colors: [...(item.colors || [])], opportunity: item.commander ? 4 : item.token ? 0.25 : 0.7 + Number(item.manaValue || 0) * 0.18 })));
  }
  if (costPlan.mechanics.improvise) {
    const artifacts = (player?.zones?.battlefield || [])
      .filter((item) => /Artifact/.test(item.typeLine || '') && !item.tapped)
      .sort((a, b) => Number(a.manaValue || 0) - Number(b.manaValue || 0));
    candidates.push(...artifacts.slice(0, generic).map((item) => ({ kind: 'improvise', instanceId: item.instanceId, opportunity: item.token ? 0.2 : 0.55 + Number(item.manaValue || 0) * 0.12 })));
  }
  if (costPlan.mechanics.delve) {
    const grave = [...(player?.zones?.graveyard || [])]
      .sort((a, b) => (/flashback|escape|unearth|from your graveyard/i.test(a.oracleText || '') ? 1 : 0) - (/flashback|escape|unearth|from your graveyard/i.test(b.oracleText || '') ? 1 : 0) || Number(a.manaValue || 0) - Number(b.manaValue || 0));
    candidates.push(...grave.slice(0, generic).map((item) => ({ kind: 'delve', instanceId: item.instanceId, opportunity: /flashback|escape|unearth|from your graveyard/i.test(item.oracleText || '') ? 2.2 : 0.28 })));
  }
  return candidates.sort((a, b) => a.opportunity - b.opportunity);
}

function applySpecialPaymentResources(requirement, resources) {
  const req = requirementClone(requirement);
  const used = [];
  for (const resource of resources) {
    let paid = false;
    if (resource.kind === 'convoke') {
      const color = (resource.colors || []).find((candidate) => Number(req[candidate] || 0) > 0);
      if (color) { req[color] -= 1; paid = true; }
      if (!paid) {
        const flexIndex = (req.flexible || []).findIndex((choices) => choices.some((candidate) => (resource.colors || []).includes(candidate)));
        if (flexIndex >= 0) { req.flexible.splice(flexIndex, 1); paid = true; }
      }
    }
    if (!paid && Number(req.generic || 0) > 0) { req.generic -= 1; paid = true; }
    if (paid) used.push(resource);
  }
  return { requirement: req, used };
}

function planSpellPayment(state, playerId, card, sourceZone = 'hand', options = {}) {
  const player = state.players[playerId];
  const costPlan = options.costPlan || buildCostPlan(state, playerId, card, sourceZone, options);
  if (costPlan.additional.errors.length) return { ok: false, reason: costPlan.additional.errors.join(' '), costPlan };
  const preserveColors = options.preserveColors || strategicPaymentColors(player, card.instanceId);
  const candidates = specialPaymentCandidates(player, card, costPlan);
  const maxSpecial = candidates.length;
  let best = null;
  for (let count = 0; count <= maxSpecial; count += 1) {
    const candidateResources = candidates.slice(0, count);
    const special = applySpecialPaymentResources(costPlan.finalRequirement, candidateResources);
    const resources = special.used;
    const adjustedCost = requirementToManaCost(special.requirement);
    const manaPlan = planManaPayment(player, adjustedCost, 0, { preserveColors, spellCard: card, excludeSourceIds: resources.map((item) => item.instanceId) });
    if (!manaPlan.ok) continue;
    const opportunity = resources.reduce((sum, item) => sum + item.opportunity, 0)
      + (manaPlan.sources || []).reduce((sum, item) => sum + Number(item.lifeCost || 0) * 0.45 + (item.sacrificeSource ? 1.15 : 0), 0);
    const score = opportunity + (manaPlan.sources?.length || 0) * 0.08;
    if (!best || score < best.score) {
      best = {
        ...manaPlan,
        score,
        costPlan,
        finalManaCost: adjustedCost,
        convoke: resources.filter((item) => item.kind === 'convoke').map((item) => item.instanceId),
        improvise: resources.filter((item) => item.kind === 'improvise').map((item) => item.instanceId),
        delve: resources.filter((item) => item.kind === 'delve').map((item) => item.instanceId),
        sacrifices: [...costPlan.additional.sacrifices],
        discards: [...costPlan.additional.discards],
        lifePaid: Number(costPlan.additional.life || 0) + (manaPlan.sources || []).reduce((sum, item) => sum + Number(item.lifeCost || 0), 0),
      };
    }
  }
  return best || { ok: false, reason: `The visible resources cannot pay ${costPlan.displayCost}.`, costPlan, sources: [] };
}

function findBattlefieldCard(draft, instanceId) {
  for (const player of Object.values(draft.players || {})) {
    const card = (player.zones?.battlefield || []).find((item) => item.instanceId === instanceId);
    if (card) return { player, card };
  }
  return null;
}

function applySpellPayment(draft, playerId, payment) {
  if (!payment?.ok) return false;
  const player = draft.players[playerId];
  for (const item of payment.sources || []) {
    const found = findBattlefieldCard(draft, item.instanceId);
    if (!found || found.card.tapped) continue;
    found.card.tapped = true;
    for (const color of MANA_COLORS) player.mana[color] = Number(player.mana[color] || 0) + Number(item.mana?.[color] || 0);
    if (item.sacrificeSource) {
      const index = found.player.zones.battlefield.findIndex((card) => card.instanceId === item.instanceId);
      const [sacrificed] = found.player.zones.battlefield.splice(index, 1);
      found.player.zones.graveyard.push(sacrificed);
    }
  }
  for (const id of [...(payment.convoke || []), ...(payment.improvise || [])]) {
    const found = findBattlefieldCard(draft, id);
    if (found) found.card.tapped = true;
  }
  for (const id of payment.delve || []) {
    const index = player.zones.graveyard.findIndex((card) => card.instanceId === id);
    if (index >= 0) player.zones.exile.push(player.zones.graveyard.splice(index, 1)[0]);
  }
  for (const id of payment.sacrifices || []) {
    const index = player.zones.battlefield.findIndex((card) => card.instanceId === id);
    if (index >= 0) player.zones.graveyard.push(player.zones.battlefield.splice(index, 1)[0]);
  }
  for (const id of payment.discards || []) {
    const index = player.zones.hand.findIndex((card) => card.instanceId === id);
    if (index >= 0) player.zones.graveyard.push(player.zones.hand.splice(index, 1)[0]);
  }
  player.life -= Number(payment.lifePaid || 0);
  player.mana = spendMana(player.mana, payment.finalManaCost || payment.costPlan?.finalManaCost || '', 0);
  return true;
}

function attackLegality(state, card) {
  const reasons = [];
  if (!isCreature(card)) reasons.push('Only creatures can attack.');
  if (card.tapped) reasons.push('Tapped creatures cannot attack.');
  if (card.summoningSick && !(card.keywords || []).includes('Haste')) reasons.push('This creature has summoning sickness and does not have haste.');
  if (card.controller !== state.activePlayerId) reasons.push('Only the active player declares attackers.');
  if (PHASES[state.phaseIndex].id !== 'combat') reasons.push('Attackers are normally declared during combat.');
  return { legal: reasons.length === 0, reasons };
}

function recognizedEffects(card) {
  const text = card?.oracleText || '';
  const effects = [];
  if (/draw (?:a|one|two|three|four|five|\d+) cards?/i.test(text)) effects.push('Draw cards');
  if (/destroy target/i.test(text)) effects.push('Targeted destruction');
  if (/exile target/i.test(text)) effects.push('Targeted exile');
  if (/create .* token/i.test(text)) effects.push('Creates token');
  if (/search your library/i.test(text)) effects.push('Searches library');
  if (/mill (?:a|one|two|three|four|five|\d+)/i.test(text)) effects.push('Mills cards');
  if (/counter target spell/i.test(text)) effects.push('Counters a spell');
  if (/return target .* to (?:its owner's|your) hand/i.test(text)) effects.push('Returns a permanent/card');
  if (/when(?:ever)? .* enters/i.test(text)) effects.push('Triggered ability');
  return effects;
}

function stackDestination(card) {
  return isPermanent(card) ? 'battlefield' : 'graveyard';
}


const HAND_SIZE_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

function handSizeNumber(value) {
  const clean = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (/^\d+$/.test(clean)) return Number(clean);
  return HAND_SIZE_WORDS[clean] ?? null;
}

function handSizeChangesFromText(text, relation = 'self') {
  const clean = String(text || '').replace(/[’]/g, "'");
  const result = { unlimited: false, exact: null, delta: 0, manual: false, reasons: [] };
  const selfPrefix = relation === 'self' ? '(?:you have|your)' : "(?:each opponent(?:'s)?|your opponents?(?:'|’)s?)";
  if (relation === 'self' && /you have no maximum hand size/i.test(clean)) {
    result.unlimited = true;
    result.reasons.push('No maximum hand size');
  }
  if (relation === 'opponent' && /(?:each opponent|your opponents?) (?:has|have) no maximum hand size/i.test(clean)) {
    result.unlimited = true;
    result.reasons.push('Opponent effect grants no maximum hand size');
  }
  const exact = clean.match(new RegExp(`${selfPrefix} maximum hand size is (?!increased|reduced|equal)([a-z0-9-]+)`, 'i'));
  if (exact) {
    const value = handSizeNumber(exact[1]);
    if (value == null) result.manual = true;
    else { result.exact = value; result.reasons.push(`Maximum hand size becomes ${value}`); }
  }
  const increase = clean.match(new RegExp(`${selfPrefix} maximum hand size is increased by ([a-z0-9-]+)`, 'i'));
  if (increase) {
    const value = handSizeNumber(increase[1]);
    if (value == null) result.manual = true;
    else { result.delta += value; result.reasons.push(`Maximum hand size +${value}`); }
  }
  const reduce = clean.match(new RegExp(`${selfPrefix} maximum hand size is reduced by ([a-z0-9-]+)`, 'i'));
  if (reduce) {
    const value = handSizeNumber(reduce[1]);
    if (value == null) result.manual = true;
    else { result.delta -= value; result.reasons.push(`Maximum hand size -${value}`); }
  }
  if (/maximum hand size is equal to/i.test(clean)) result.manual = true;
  return result;
}

function maximumHandSize(state, playerId) {
  let value = 7;
  let unlimited = false;
  let manual = false;
  const reasons = [];
  const player = state.players[playerId];
  if (!player) return { value: 7, label: '7', unlimited: false, manual: false, reasons: [] };

  for (const card of player.zones.battlefield || []) {
    const change = handSizeChangesFromText(card.oracleText, 'self');
    if (change.unlimited) unlimited = true;
    if (change.exact != null) value = change.exact;
    value += change.delta;
    manual ||= change.manual;
    reasons.push(...change.reasons.map((reason) => `${card.name}: ${reason}`));
  }
  for (const opponent of Object.values(state.players).filter((item) => item.id !== playerId)) {
    for (const card of opponent.zones.battlefield || []) {
      const change = handSizeChangesFromText(card.oracleText, 'opponent');
      if (change.unlimited) unlimited = true;
      if (change.exact != null) value = change.exact;
      value += change.delta;
      manual ||= change.manual;
      reasons.push(...change.reasons.map((reason) => `${card.name}: ${reason}`));
    }
  }
  value = Math.max(0, value);
  return {
    value: unlimited ? Infinity : value,
    label: unlimited ? '∞' : `${value}${manual ? '*' : ''}`,
    unlimited,
    manual,
    reasons,
  };
}


return { validateDeck, commanderCandidates, landEntryPlan, manaDevelopmentSnapshot, strategicPaymentColors, landPlayLegality, spellCastLegality, moveLegality, canPayMana, spendMana, planManaPayment, requirementToManaCost, buildCostPlan, planSpellPayment, applySpellPayment, attackLegality, recognizedEffects, stackDestination, maximumHandSize };
})();

// ---- knowledge.js ----
__modules["./knowledge.js"] = (() => {
const { PHASES } = __modules["./constants.js"];
const { cardTraits, publicCardSnapshot } = __modules["./card-evaluation.js"];
const { manaProductionChoices, uid } = __modules["./utils.js"];

function createKnowledgePlayer() {
  return {
    knownHand: {},
    knownLibraryTop: [],
    knownLibraryBottom: [],
    observedCards: {},
    usedInteraction: {
      removal: 0,
      counterspell: 0,
      combatTrick: 0,
      protection: 0,
      boardWipe: 0,
      graveyardInteraction: 0,
      flashThreat: 0,
    },
    behavior: {
      passesWithOpenMana: 0,
      consecutivePassesWithOpenMana: 0,
      openManaHistory: [],
      attacks: [],
      blocks: [],
      spellsCast: 0,
      landsPlayed: 0,
      cardsHeldAcrossTurns: 0,
      lastEndingHandSize: null,
      meaningfulDecisions: [],
    },
  };
}

function createKnowledgeState(playerIds = ['p1', 'p2']) {
  return {
    events: [],
    players: Object.fromEntries(playerIds.map((id) => [id, createKnowledgePlayer()])),
  };
}

function ensureKnowledge(draft) {
  draft.knowledge ||= createKnowledgeState(Object.keys(draft.players || {}));
  draft.knowledge.events ||= [];
  draft.knowledge.players ||= {};
  for (const playerId of Object.keys(draft.players || {})) {
    const existing = draft.knowledge.players[playerId] || {};
    const fresh = createKnowledgePlayer();
    draft.knowledge.players[playerId] = {
      ...fresh,
      ...existing,
      knownHand: { ...fresh.knownHand, ...(existing.knownHand || {}) },
      observedCards: { ...fresh.observedCards, ...(existing.observedCards || {}) },
      usedInteraction: { ...fresh.usedInteraction, ...(existing.usedInteraction || {}) },
      behavior: { ...fresh.behavior, ...(existing.behavior || {}) },
    };
  }
  return draft.knowledge;
}

function observedKey(card) {
  return card?.oracleId || card?.scryfallId || String(card?.name || '').toLocaleLowerCase();
}

function rememberObserved(playerMemory, card, zone, turn) {
  if (!card?.name) return;
  const key = observedKey(card);
  const prior = playerMemory.observedCards[key] || {
    card: publicCardSnapshot(card),
    seenCount: 0,
    zones: {},
    firstSeenTurn: turn,
    lastSeenTurn: turn,
  };
  prior.card = publicCardSnapshot(card);
  prior.seenCount += 1;
  prior.zones[zone || 'unknown'] = Number(prior.zones[zone || 'unknown'] || 0) + 1;
  prior.lastSeenTurn = turn;
  playerMemory.observedCards[key] = prior;
}

function removeKnownHand(playerMemory, instanceId, cardName = '') {
  if (instanceId && playerMemory.knownHand[instanceId]) delete playerMemory.knownHand[instanceId];
  if (!instanceId && cardName) {
    const entry = Object.entries(playerMemory.knownHand).find(([, known]) => known.card?.name === cardName);
    if (entry) delete playerMemory.knownHand[entry[0]];
  }
}

function addKnownHand(playerMemory, card, event) {
  if (!card?.instanceId) return;
  playerMemory.knownHand[card.instanceId] = {
    card: publicCardSnapshot(card),
    sinceTurn: event.turn,
    reason: event.type,
    confidence: 1,
  };
}

function recordPublicEvent(draft, event) {
  const knowledge = ensureKnowledge(draft);
  const normalized = {
    id: event.id || uid('public'),
    time: event.time || new Date().toISOString(),
    turn: Number(event.turn ?? draft.turnNumber ?? 1),
    phase: event.phase || PHASES[draft.phaseIndex || 0]?.id || 'unknown',
    public: event.public !== false,
    ...event,
    card: event.card ? publicCardSnapshot(event.card) : null,
  };
  if (!normalized.public) return normalized;
  knowledge.events.unshift(normalized);
  if (knowledge.events.length > 800) knowledge.events.length = 800;

  const subjectId = event.subjectPlayerId || event.playerId || event.actorId || event.card?.owner;
  const memory = subjectId ? knowledge.players[subjectId] : null;
  if (memory && normalized.card) rememberObserved(memory, normalized.card, event.toZone || event.zone || event.fromZone, normalized.turn);

  if (memory) {
    const card = normalized.card;
    if (['returned_to_hand', 'revealed_in_hand', 'draw_known'].includes(normalized.type)) addKnownHand(memory, card, normalized);
    if (['cast', 'played', 'discarded', 'exiled', 'countered', 'library_top', 'library_bottom', 'shuffled_away'].includes(normalized.type)) {
      removeKnownHand(memory, card?.instanceId, card?.name);
    }
    if (normalized.type === 'revealed' && normalized.zone === 'hand') addKnownHand(memory, card, normalized);
    if (normalized.type === 'library_top') {
      memory.knownLibraryTop = [{ card, turn: normalized.turn, reason: normalized.type }];
    }
    if (normalized.type === 'library_bottom') {
      memory.knownLibraryBottom.push({ card, turn: normalized.turn, reason: normalized.type });
      if (memory.knownLibraryBottom.length > 12) memory.knownLibraryBottom.shift();
    }
    if (normalized.type === 'shuffled') {
      memory.knownLibraryTop = [];
      memory.knownLibraryBottom = [];
    }
    if (normalized.type === 'cast' && card) {
      const traits = cardTraits(card);
      for (const category of traits.interactionCategories) {
        memory.usedInteraction[category] = Number(memory.usedInteraction[category] || 0) + 1;
      }
      if (normalized.type === 'cast') memory.behavior.spellsCast += 1;
    }
    if (normalized.type === 'played' && /Land/.test(card?.typeLine || '')) memory.behavior.landsPlayed += 1;
    if (normalized.type === 'attack') {
      memory.behavior.attacks.push({ turn: normalized.turn, cards: normalized.cards || (card ? [card] : []) });
      if (memory.behavior.attacks.length > 60) memory.behavior.attacks.shift();
    }
    if (normalized.type === 'block') {
      memory.behavior.blocks.push({ turn: normalized.turn, blocker: card, attacker: normalized.targetCard || null });
      if (memory.behavior.blocks.length > 60) memory.behavior.blocks.shift();
    }
    if (normalized.meaningful) {
      memory.behavior.meaningfulDecisions.push({ turn: normalized.turn, type: normalized.type, text: normalized.text || '' });
      if (memory.behavior.meaningfulDecisions.length > 100) memory.behavior.meaningfulDecisions.shift();
    }
  }
  return normalized;
}

function recordZoneTransition(draft, { card, actorId, subjectPlayerId, fromZone, toZone, libraryPosition = 'top', castAttempt = false }) {
  let type = 'zone_move';
  if (castAttempt) type = 'cast';
  else if (fromZone === 'hand' && toZone === 'battlefield' && /Land/.test(card?.typeLine || '')) type = 'played';
  else if (fromZone === 'library' && toZone === 'graveyard') type = 'milled';
  else if (fromZone === 'hand' && toZone === 'graveyard') type = 'discarded';
  else if (toZone === 'exile') type = 'exiled';
  else if (toZone === 'hand' && fromZone !== 'library') type = 'returned_to_hand';
  else if (fromZone === 'battlefield' && toZone === 'graveyard') type = 'destroyed_or_died';
  else if (toZone === 'library') type = libraryPosition === 'bottom' ? 'library_bottom' : 'library_top';
  return recordPublicEvent(draft, {
    type,
    actorId,
    subjectPlayerId,
    card,
    fromZone,
    toZone,
    position: toZone === 'library' ? libraryPosition : undefined,
    meaningful: ['cast', 'played', 'discarded', 'milled', 'exiled', 'returned_to_hand', 'destroyed_or_died'].includes(type),
  });
}

function visibleManaSnapshot(player) {
  const colors = new Set();
  let total = Object.values(player?.mana || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
  for (const [color, amount] of Object.entries(player?.mana || {})) if (Number(amount || 0) > 0) colors.add(color);
  for (const card of player?.zones?.battlefield || []) {
    if (card.tapped) continue;
    const choices = manaProductionChoices(card);
    const best = choices.map((choice) => Object.values(choice.mana).reduce((sum, amount) => sum + Number(amount || 0), 0)).sort((a, b) => b - a)[0] || 0;
    total += best;
    for (const choice of choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount || 0) > 0) colors.add(color);
  }
  return { total, colors: [...colors] };
}

function recordTurnPass(draft, playerId) {
  const knowledge = ensureKnowledge(draft);
  const player = draft.players[playerId];
  const memory = knowledge.players[playerId];
  const mana = visibleManaSnapshot(player);
  const handSize = player.zones.hand.length;
  const passedOpen = mana.total > 0 && handSize > 0;
  if (passedOpen) {
    memory.behavior.passesWithOpenMana += 1;
    memory.behavior.consecutivePassesWithOpenMana += 1;
  } else {
    memory.behavior.consecutivePassesWithOpenMana = 0;
  }
  if (memory.behavior.lastEndingHandSize === handSize && handSize > 0) memory.behavior.cardsHeldAcrossTurns += 1;
  memory.behavior.lastEndingHandSize = handSize;
  memory.behavior.openManaHistory.push({
    turn: draft.turnNumber,
    total: mana.total,
    colors: mana.colors,
    handSize,
  });
  if (memory.behavior.openManaHistory.length > 40) memory.behavior.openManaHistory.shift();
  recordPublicEvent(draft, {
    type: 'turn_pass',
    actorId: playerId,
    subjectPlayerId: playerId,
    openMana: mana,
    handSize,
    meaningful: passedOpen,
    text: passedOpen ? `${player.name} passed with ${mana.total} mana available and ${handSize} cards.` : `${player.name} passed the turn.`,
  });
}

function knownHandCards(state, playerId) {
  ensureKnowledge(state);
  return Object.values(state.knowledge.players[playerId]?.knownHand || {}).map((entry) => entry.card).filter(Boolean);
}

function publicMemorySummary(state, observerId, opponentId) {
  ensureKnowledge(state);
  const memory = state.knowledge.players[opponentId] || createKnowledgePlayer();
  const known = Object.values(memory.knownHand || {}).map((entry) => entry.card?.name).filter(Boolean);
  const used = Object.entries(memory.usedInteraction || {}).filter(([, count]) => Number(count) > 0);
  const recent = (state.knowledge.events || [])
    .filter((event) => event.subjectPlayerId === opponentId || event.actorId === opponentId)
    .slice(0, 12);
  return {
    observerId,
    opponentId,
    knownHand: known,
    usedInteraction: Object.fromEntries(used),
    behavior: memory.behavior,
    recent,
  };
}


return { createKnowledgePlayer, createKnowledgeState, ensureKnowledge, recordPublicEvent, recordZoneTransition, visibleManaSnapshot, recordTurnPass, knownHandCards, publicMemorySummary };
})();

// ---- strategy-profile.js ----
__modules["./strategy-profile.js"] = (() => {
const { cardTraits } = __modules["./card-evaluation.js"];
const { isCreature, isLand } = __modules["./utils.js"];

const ARCHETYPES = [
  'evasive', 'ninjutsu', 'graveyard', 'zombies', 'tokens', 'sacrifice',
  'artifacts', 'equipment', 'spellslinger', 'counters', 'lifegain',
  'ramp', 'control', 'goWide', 'voltron', 'reanimator',
];

function blankScores() {
  return Object.fromEntries(ARCHETYPES.map((name) => [name, 0]));
}

function textOf(card) {
  return `${card?.name || ''}\n${card?.typeLine || ''}\n${card?.oracleText || ''}`.toLocaleLowerCase();
}

function addCardSignals(scores, card, weight = 1) {
  const text = textOf(card);
  const traits = cardTraits(card);
  if (/ninjutsu|ninja/.test(text)) { scores.ninjutsu += 3.4 * weight; scores.evasive += 0.75 * weight; }
  if (/can't be blocked|unblockable|flying|menace|shadow|fear|skulk/.test(text)) scores.evasive += 1.35 * weight;
  if (/graveyard|mill|dies|died|discard/.test(text)) scores.graveyard += 1.05 * weight;
  if (/zombie/.test(text)) scores.zombies += 1.65 * weight;
  if (/return .*graveyard|reanimate|from your graveyard to the battlefield|put .* from .*graveyard onto the battlefield/.test(text)) scores.reanimator += 2.1 * weight;
  if (traits.tokenMaker || /create .* token/.test(text)) scores.tokens += 1.7 * weight;
  if (traits.sacrificeValue || /sacrifice/.test(text)) scores.sacrifice += 1.45 * weight;
  if (/artifact/.test(card?.typeLine || '') || /artifact/.test(text)) scores.artifacts += 0.8 * weight;
  if (traits.equipment || /equipped creature|equip /.test(text)) scores.equipment += 1.8 * weight;
  if (/instant|sorcery/.test(card?.typeLine || '') || /whenever you cast (?:an instant|an instant or sorcery|a noncreature spell)/.test(text)) scores.spellslinger += 0.72 * weight;
  if (/\+1\/\+1 counter|proliferate|counter on/.test(text)) scores.counters += 1.25 * weight;
  if (/gain life|lifelink|life total/.test(text)) scores.lifegain += 1.05 * weight;
  if (isLand(card) || /add \{|search your library for .* land|additional land/.test(text)) scores.ramp += 0.55 * weight;
  if (traits.counterspell || traits.targetedRemoval || traits.boardWipe || /players can't|opponents can't/.test(text)) scores.control += 1.15 * weight;
  if (traits.anthem.power || traits.anthem.toughness || /creatures you control get|for each creature you control/.test(text)) scores.goWide += 1.15 * weight;
  if (traits.equipment || traits.aura || /commander you control|target creature gets/.test(text)) scores.voltron += 0.72 * weight;
  if (isCreature(card) && Number(card?.manaValue || 0) >= 6 && (/graveyard|ninjutsu|put .* onto the battlefield/.test(text))) scores.reanimator += 0.9 * weight;
}

function buildStrategyProfile(player) {
  const scores = blankScores();
  const commanders = [
    ...(player?.zones?.command || []),
    ...(player?.zones?.battlefield || []).filter((card) => card.commander),
  ];
  for (const commander of commanders) addCardSignals(scores, commander, 3.2);
  for (const zone of ['battlefield', 'graveyard', 'exile']) {
    for (const card of player?.zones?.[zone] || []) addCardSignals(scores, card, zone === 'battlefield' ? 0.9 : 0.42);
  }
  for (const card of player?.zones?.hand || []) addCardSignals(scores, card, 0.33);

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[1] > 1 ? ranked[0][0] : 'midrange';
  const secondary = ranked[1]?.[1] > 1.25 ? ranked[1][0] : null;
  return { scores, primary, secondary, commanders: commanders.map((card) => card.name) };
}

function cardStrategySynergy(card, profile, context = {}) {
  if (!card || !profile) return 0;
  const traits = cardTraits(card);
  const text = textOf(card);
  const s = profile.scores || {};
  let value = 0;
  if (s.ninjutsu > 2) {
    if (/ninjutsu|ninja/.test(text)) value += 3.2;
    if (traits.unblockable || traits.flying || traits.menace || Number(card.manaValue || 0) <= 2 && isCreature(card)) value += 1.5;
    if (Number(card.manaValue || 0) >= 6 && isCreature(card)) value += 0.8;
  }
  if (s.evasive > 2 && (traits.flying || traits.unblockable || traits.menace)) value += 1.2;
  if (s.graveyard > 2) {
    if (traits.deathTrigger || traits.recursion || /mill|discard|graveyard/.test(text)) value += 1.45;
    if (context.zone === 'graveyard' && (traits.recursion || /cast .* from your graveyard/.test(text))) value += 1.1;
  }
  if (s.zombies > 2 && /zombie/.test(text)) value += 1.45;
  if (s.reanimator > 2 && (traits.recursion || Number(card.manaValue || 0) >= 6 && isCreature(card))) value += 1.35;
  if (s.tokens > 2 && traits.tokenMaker) value += 1.4;
  if (s.sacrifice > 2 && (traits.sacrificeValue || traits.deathTrigger || card.token)) value += 1.2;
  if (s.artifacts > 2 && /artifact/.test(card.typeLine || '')) value += 0.9;
  if (s.equipment > 2 && traits.equipment) value += 1.3;
  if (s.spellslinger > 2 && /Instant|Sorcery/.test(card.typeLine || '')) value += 1.0;
  if (s.counters > 2 && /counter|proliferate/.test(text)) value += 0.9;
  if (s.lifegain > 2 && (traits.lifelink || /gain life/.test(text))) value += 0.9;
  if (s.control > 2 && (traits.counterspell || traits.targetedRemoval || traits.boardWipe)) value += 1.1;
  if (s.goWide > 2 && (traits.tokenMaker || traits.anthem.power || traits.anthem.toughness)) value += 1.0;
  if (s.voltron > 2 && (traits.equipment || traits.aura || card.commander)) value += 0.9;
  return value;
}

function actionStrategyBonus(action, state, playerId, profile = buildStrategyProfile(state.players[playerId])) {
  const player = state.players[playerId];
  const cards = [];
  const find = (id) => {
    for (const zone of Object.values(player.zones || {})) {
      const card = zone.find((item) => item.instanceId === id);
      if (card) return card;
    }
    return null;
  };
  if (action.cardId) cards.push(find(action.cardId));
  for (const step of action.steps || []) if (step.cardId) cards.push(find(step.cardId));
  let bonus = cards.filter(Boolean).reduce((sum, card) => sum + cardStrategySynergy(card, profile), 0);
  if (action.type === 'attack') {
    const attackers = (action.cardIds || []).map(find).filter(Boolean);
    if (profile.scores.ninjutsu > 2 && attackers.some((card) => cardTraits(card).unblockable || cardTraits(card).flying)) bonus += 2.2;
    if (profile.scores.graveyard > 2 && attackers.some((card) => cardTraits(card).deathTrigger)) bonus += 0.8;
  }
  if (action.type === 'hold' && profile.scores.control > 3) bonus += 0.65;
  return bonus;
}

function strategyLabel(profile) {
  if (!profile) return 'balanced midrange';
  const labels = {
    evasive: 'evasive combat', ninjutsu: 'Ninja/ninjutsu', graveyard: 'graveyard value', zombies: 'Zombie synergy',
    tokens: 'token development', sacrifice: 'sacrifice value', artifacts: 'artifact synergy', equipment: 'Equipment/Voltron',
    spellslinger: 'spellslinger', counters: 'counter growth', lifegain: 'lifegain', ramp: 'mana development', control: 'interaction/control',
    goWide: 'go-wide combat', voltron: 'commander damage', reanimator: 'reanimation', midrange: 'balanced midrange',
  };
  return profile.secondary ? `${labels[profile.primary] || profile.primary} with ${labels[profile.secondary] || profile.secondary}` : (labels[profile.primary] || profile.primary);
}


return { buildStrategyProfile, cardStrategySynergy, actionStrategyBonus, strategyLabel };
})();

// ---- state.js ----
__modules["./state.js"] = (() => {
const { DEFAULT_SETTINGS, PHASES, STORAGE_KEY, ZONES } = __modules["./constants.js"];
const { createKnowledgeState, ensureKnowledge, recordPublicEvent } = __modules["./knowledge.js"];
const { deepClone, shuffle, uid } = __modules["./utils.js"];

function createPlayer(id, name) {
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

function createInitialState() {
  const players = { p1: createPlayer('p1', 'Player 1'), p2: createPlayer('p2', 'Player 2') };
  return {
    version: 7,
    players,
    activePlayerId: 'p1',
    turnNumber: 1,
    phaseIndex: 0,
    stack: [],
    priorityPlayerId: 'p1',
    consecutivePasses: 0,
    pendingTriggers: [],
    eventQueue: [],
    openingHands: { active: false, kept: { p1: false, p2: false }, bottomRequired: { p1: 0, p2: 0 } },
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

function getState() { return state; }
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
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
  card.damageMarked = Number(card.damageMarked || 0);
  card.deathtouchDamaged = Boolean(card.deathtouchDamaged);
  card.continuousEffects ||= [];
  card.tokenStyle ||= null;
  return card;
}

function ensureStateShape(next) {
  next.version = 7;
  const previousSettings = next.settings || {};
  next.settings = { ...DEFAULT_SETTINGS, ...previousSettings, manaAutomationV3: true, coachInformationSetV4: true, coachTacticalV5: true, phaseSafetyV6: true, tabletopUXV7: true };
  if (!previousSettings.coachInformationSetV4 && Number(previousSettings.coachRollouts || 0) === 450) next.settings.coachRollouts = 120;
  if (!previousSettings.coachTacticalV5 && Number(previousSettings.coachRollouts || 0) > 100) next.settings.coachRollouts = 80;
  next.stack ||= [];
  next.priorityPlayerId = next.players?.[next.priorityPlayerId] ? next.priorityPlayerId : (next.activePlayerId || 'p1');
  next.consecutivePasses = Number(next.consecutivePasses || 0);
  next.pendingTriggers ||= [];
  next.pendingTriggers = next.pendingTriggers.map((effect) => ({
    id: effect.id || uid('effect'),
    sourceCardId: effect.sourceCardId || null,
    sourceName: effect.sourceName || 'Manual effect',
    controllerId: effect.controllerId || next.activePlayerId,
    kind: effect.kind || 'manual',
    text: effect.text || 'Resolve this effect manually.',
    conditionText: effect.conditionText || '',
    conditionStatus: effect.conditionStatus || (effect.conditionText ? 'unconfirmed' : 'not-required'),
    optional: Boolean(effect.optional),
    createdTurn: Number(effect.createdTurn || next.turnNumber || 1),
    createdPhase: effect.createdPhase || PHASES[next.phaseIndex || 0]?.id || 'untap',
  }));
  next.eventQueue ||= [];
  next.openingHands ||= { active: false, kept: { p1: false, p2: false }, bottomRequired: { p1: 0, p2: 0 } };
  next.openingHands.kept = { p1: false, p2: false, ...(next.openingHands.kept || {}) };
  next.openingHands.bottomRequired = { p1: 0, p2: 0, ...(next.openingHands.bottomRequired || {}) };
  next.openingHands.active = Boolean(next.openingHands.active);
  next.log ||= [];
  next.turnNumber ||= 1;
  next.phaseIndex ||= 0;
  next.players ||= {};
  if (!next.players.p1) next.players.p1 = createPlayer('p1', 'Player 1');
  if (!next.players.p2) next.players.p2 = createPlayer('p2', 'Player 2');
  next.activePlayerId = next.players[next.activePlayerId] ? next.activePlayerId : 'p1';
  next.selected ||= null;
  next.winner ||= null;
  next.started = Boolean(next.started);
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

function setState(next, { save = true } = {}) {
  state = ensureStateShape(next);
  if (save) persist();
  notify();
}

function updateState(mutator, { snapshot = true, log = null } = {}) {
  if (snapshot) pushHistory();
  const next = deepClone(state);
  ensureStateShape(next);
  mutator(next);
  if (log) next.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: log });
  state = ensureStateShape(next);
  persist();
  notify();
}

function pushHistory() {
  history.push(deepClone(state));
  if (history.length > 60) history.shift();
}

function undo() {
  const prior = history.pop();
  if (!prior) return false;
  state = ensureStateShape(prior);
  persist();
  notify();
  return true;
}

function resetState() {
  history = [];
  state = createInitialState();
  persist();
  notify();
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* optional */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (![2, 3, 4, 5].includes(parsed.version)) return false;
    const previousSettings = parsed.settings || {};
    parsed.settings = { ...DEFAULT_SETTINGS, ...previousSettings };
    if (!previousSettings.manaAutomationV3) parsed.settings.manaMode = 'auto';
    state = ensureStateShape(parsed);
    notify();
    return true;
  } catch { return false; }
}

function importState(imported) {
  if (!imported || ![2, 3, 4, 5].includes(imported.version) || !imported.players) throw new Error('This is not a compatible Commander Forge save file.');
  history = [];
  state = ensureStateShape(imported);
  persist();
  notify();
}

function phase() { return PHASES[state.phaseIndex]; }

function findCard(instanceId, source = state) {
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

function buildPlayerDeck(player, deck, commanderNames = []) {
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

function drawCards(draft, playerId, amount = 1) {
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


return { createPlayer, createInitialState, getState, subscribe, setState, updateState, pushHistory, undo, resetState, persist, restore, importState, phase, findCard, buildPlayerDeck, drawCards };
})();

// ---- tactical-engine.js ----
__modules["./tactical-engine.js"] = (() => {
const { PHASES } = __modules["./constants.js"];
const { cardTraits, canBlock, combatOutcome, combatTradeScore, effectiveStats, permanentValue } = __modules["./card-evaluation.js"];
const { actionStrategyBonus, buildStrategyProfile, cardStrategySynergy } = __modules["./strategy-profile.js"];
const { applySpellPayment, attackLegality, landEntryPlan, landPlayLegality, manaDevelopmentSnapshot, spellCastLegality } = __modules["./rules.js"];
const { deepClone, isCreature, isLand, isPermanent, numericStat } = __modules["./utils.js"];

const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function otherPlayerId(state, playerId) {
  return Object.keys(state.players).find((id) => id !== playerId);
}

function findTacticalCard(state, instanceId) {
  for (const [playerId, player] of Object.entries(state.players || {})) {
    for (const [zone, cards] of Object.entries(player.zones || {})) {
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      if (index >= 0) return { card: cards[index], playerId, zone, index, cards };
    }
  }
  const index = (state.stack || []).findIndex((card) => card.instanceId === instanceId);
  return index >= 0 ? { card: state.stack[index], playerId: state.stack[index].controller, zone: 'stack', index, cards: state.stack } : null;
}

function phaseId(state) {
  return PHASES[state.phaseIndex]?.id || 'main1';
}

function parseAmount(text, fallback = 1) {
  const value = String(text || '').toLocaleLowerCase();
  const digit = value.match(/\d+/);
  if (digit) return Number(digit[0]);
  for (const [word, amount] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\b`).test(value)) return amount;
  return fallback;
}

function uniqueActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = JSON.stringify([action.type, action.cardId || '', action.cardIds || [], (action.steps || []).map((step) => [step.type, step.cardId])]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function attackValue(state, playerId, card) {
  const opponentId = otherPlayerId(state, playerId);
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  const blockers = opponent.zones.battlefield.filter((blocker) => canBlock(card, blocker, opponent.zones.battlefield));
  if (!blockers.length) {
    const stats = effectiveStats(card, player.zones.battlefield);
    const traits = cardTraits(card);
    return stats.power * 1.25 + (traits.combatDamageTrigger ? 2.2 : 0) + (card.commander ? 0.65 : 0);
  }
  return Math.max(...blockers.map((blocker) => combatTradeScore(card, [blocker], player.zones.battlefield, opponent.zones.battlefield)), -1.5);
}

function generatedAttackPlans(state, playerId) {
  if (state.activePlayerId !== playerId || phaseId(state) !== 'combat') return [];
  const player = state.players[playerId];
  const legal = player.zones.battlefield.filter((card) => attackLegality(state, card).legal);
  if (!legal.length) return [];
  const scored = legal.map((card) => ({ card, score: attackValue(state, playerId, card) }));
  const actions = [];
  for (const item of scored.slice(0, 8)) {
    actions.push({ type: 'attack', cardIds: [item.card.instanceId], label: `Attack with ${item.card.name}` });
  }
  const favorable = scored.filter((item) => item.score > 0.55).map((item) => item.card.instanceId);
  if (favorable.length > 1) actions.push({ type: 'attack', cardIds: favorable, label: `Attack with ${favorable.length} favorable attacker${favorable.length === 1 ? '' : 's'}` });
  const evasive = scored.filter(({ card }) => {
    const traits = cardTraits(card);
    return traits.flying || traits.unblockable || traits.menace;
  }).map(({ card }) => card.instanceId);
  if (evasive.length) actions.push({ type: 'attack', cardIds: evasive, label: `Attack with the evasive creatures` });
  const all = legal.map((card) => card.instanceId);
  if (all.length > 1) actions.push({ type: 'attack', cardIds: all, label: `Attack with all legal creatures` });
  return uniqueActions(actions);
}

function kickerCost(card) {
  return String(card?.oracleText || '').match(/(?:multi)?kicker\s+(\{[^\n.]+?\})/i)?.[1]?.replace(/\}\s*\{/g, '}{') || '';
}

function generateTacticalActions(state, playerId = state.activePlayerId, options = {}) {
  const player = state.players[playerId];
  if (!player) return [];
  const actions = [];
  const phase = phaseId(state);
  const opponentCount = Math.max(1, Object.keys(state.players).length - 1);

  if (['untap', 'upkeep', 'draw'].includes(phase) && playerId === state.activePlayerId) {
    const lands = player.zones.hand.filter(isLand).slice(0, 5);
    for (const card of lands) {
      const entryPlan = landEntryPlan(card, player, { opponentCount, payLife: 'auto' });
      actions.push({ type: 'advance-land', cardId: card.instanceId, entryPlan, label: `Advance to Main 1 → play ${card.name}${entryPlan.tapped ? ' tapped' : ''}` });
    }
    if (!lands.length) actions.push({ type: 'advance-phase', label: 'Advance toward Main 1' });
  }

  for (const card of player.zones.hand || []) {
    if (isLand(card)) {
      const legality = landPlayLegality(state, playerId, card);
      if (legality.legal) {
        const entryPlan = landEntryPlan(card, player, { opponentCount, payLife: 'auto' });
        actions.push({ type: 'play-land', cardId: card.instanceId, entryPlan, label: `Play ${card.name}${entryPlan.tapped ? ' (enters tapped)' : ''}` });
      }
      continue;
    }
    const legality = spellCastLegality(state, playerId, card, 'hand');
    if (legality.legal) actions.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, paymentPlan: legality.payment, costPlan: legality.costPlan, label: `Cast ${card.name}` });
    const kicker = kickerCost(card);
    if (kicker) {
      const kicked = spellCastLegality(state, playerId, card, 'hand', { kicked: true });
      if (kicked.legal) actions.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, paymentPlan: kicked.payment, costPlan: kicked.costPlan, kicked: true, label: `Cast ${card.name} kicked` });
    }
  }
  for (const card of player.zones.command || []) {
    const legality = spellCastLegality(state, playerId, card, 'command');
    if (legality.legal) actions.push({ type: 'cast-commander', cardId: card.instanceId, paymentPlan: legality.payment, costPlan: legality.costPlan, label: `Cast ${card.name}${legality.tax ? ` (+${legality.tax} commander tax)` : ''}` });
  }
  for (const card of player.zones.battlefield || []) {
    const traits = cardTraits(card);
    if (traits.activatedAbility && (!traits.tapAbility || !card.tapped)) actions.push({ type: 'activate-ability', cardId: card.instanceId, label: `Activate ${card.name}` });
  }
  actions.push(...generatedAttackPlans(state, playerId));
  actions.push({ type: 'hold', label: 'Hold resources and pass priority' });
  return uniqueActions(actions).slice(0, Number(options.limit || 36));
}

function removeFromZone(player, zone, cardId) {
  const cards = player.zones[zone] || [];
  const index = cards.findIndex((card) => card.instanceId === cardId);
  return index >= 0 ? cards.splice(index, 1)[0] : null;
}

function chooseBestTarget(state, playerId, kind = 'remove') {
  const opponentId = otherPlayerId(state, playerId);
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  return [...opponent.zones.battlefield]
    .filter((card) => {
      const traits = cardTraits(card);
      if (kind === 'destroy' && traits.indestructible) return false;
      return !traits.hexproof && !traits.shroud;
    })
    .sort((a, b) => permanentValue(b, opponent.zones.battlefield, player.zones.battlefield) - permanentValue(a, opponent.zones.battlefield, player.zones.battlefield))[0] || null;
}

function createSimpleToken(playerId, name, power, toughness, keywords = []) {
  return {
    instanceId: `sim-token-${playerId}-${Math.random().toString(36).slice(2)}`,
    name, manaCost: '', manaValue: 0, typeLine: 'Token Creature', oracleText: '',
    power: String(power), toughness: String(toughness), keywords, colors: [], colorIdentity: [],
    owner: playerId, controller: playerId, token: true, commander: false, tapped: false,
    summoningSick: true, attacking: false, blocking: null, blockedBy: [], counters: {}, attachments: [],
  };
}

function applyDraw(state, playerId, amount) {
  const player = state.players[playerId];
  for (let i = 0; i < amount; i += 1) {
    const card = player.zones.library.shift();
    if (!card) { player.lost = true; break; }
    player.zones.hand.push(card);
  }
}

function applyMill(state, playerId, amount) {
  const player = state.players[playerId];
  for (let i = 0; i < amount; i += 1) {
    const card = player.zones.library.shift();
    if (!card) break;
    player.zones.graveyard.push(card);
  }
}

function applyCommonEffects(state, playerId, card, context = {}) {
  const player = state.players[playerId];
  const opponentId = otherPlayerId(state, playerId);
  const opponent = state.players[opponentId];
  const text = String(card?.oracleText || '').replace(/\n/g, ' ');
  const notes = state._coach?.actionNotes || [];
  const draw = text.match(/draw (a|an|one|two|three|four|five|six|\d+) cards?/i);
  if (draw) { const amount = parseAmount(draw[1]); applyDraw(state, playerId, amount); notes.push(`${card.name} drew ${amount}`); }
  const millSelf = text.match(/(?:you |target player )?mill(?:s)? (a|an|one|two|three|four|five|six|\d+) cards?/i);
  if (millSelf) { const amount = parseAmount(millSelf[1]); applyMill(state, playerId, amount); notes.push(`${card.name} milled ${amount}`); }
  const gain = text.match(/you gain (a|an|one|two|three|four|five|six|\d+) life/i);
  if (gain) player.life += parseAmount(gain[1]);
  const eachLose = text.match(/each opponent loses (a|an|one|two|three|four|five|six|\d+) life/i);
  if (eachLose) opponent.life -= parseAmount(eachLose[1]);
  const token = text.match(/create (a|an|one|two|three|four|five|six|\d+) (\d+)\/(\d+) [^.]*?([A-Za-z]+) creature tokens?/i);
  if (token) {
    const amount = parseAmount(token[1]);
    for (let i = 0; i < Math.min(12, amount); i += 1) player.zones.battlefield.push(createSimpleToken(playerId, `${token[4]} Token`, Number(token[2]), Number(token[3])));
  }
  const traits = cardTraits(card);
  if (traits.boardWipe) {
    for (const owner of Object.values(state.players)) {
      const survivors = [];
      for (const permanent of owner.zones.battlefield) {
        if (!isCreature(permanent) || cardTraits(permanent).indestructible) survivors.push(permanent);
        else owner.zones.graveyard.push(permanent);
      }
      owner.zones.battlefield = survivors;
    }
    notes.push(`${card.name} cleared most creatures`);
  } else if (traits.targetedRemoval) {
    const target = chooseBestTarget(state, playerId, /destroy target/i.test(text) ? 'destroy' : 'remove');
    if (target) {
      const index = opponent.zones.battlefield.findIndex((item) => item.instanceId === target.instanceId);
      const [removed] = opponent.zones.battlefield.splice(index, 1);
      if (/exile target/i.test(text)) opponent.zones.exile.push(removed);
      else if (/return target .* hand/i.test(text)) opponent.zones.hand.push(removed);
      else opponent.zones.graveyard.push(removed);
      notes.push(`${card.name} answered ${target.name}`);
    }
  }
  if (traits.tutor) {
    state._coach.virtual[playerId] += 2.2;
    notes.push(`${card.name} found a useful card`);
  }
  if (traits.recursion) {
    const target = [...player.zones.graveyard].sort((a, b) => Number(b.manaValue || 0) - Number(a.manaValue || 0))[0];
    if (target) {
      player.zones.graveyard.splice(player.zones.graveyard.findIndex((item) => item.instanceId === target.instanceId), 1);
      player.zones.hand.push(target);
      notes.push(`${card.name} recovered ${target.name}`);
    }
  }
  if (context.kicked) state._coach.virtual[playerId] += 1.25;
}

function resolveCard(state, playerId, card, context = {}) {
  const player = state.players[playerId];
  if (isPermanent(card)) {
    card.controller = playerId;
    card.tapped = false;
    card.summoningSick = isCreature(card);
    player.zones.battlefield.push(card);
    applyCommonEffects(state, playerId, card, context);
  } else {
    applyCommonEffects(state, playerId, card, context);
    player.zones.graveyard.push(card);
  }
}

function chooseBlocks(state, attackerId, attackers) {
  const defender = state.players[otherPlayerId(state, attackerId)];
  const attackerPlayer = state.players[attackerId];
  const available = defender.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
  const result = new Map();
  const ordered = [...attackers].sort((a, b) => permanentValue(b, attackerPlayer.zones.battlefield, defender.zones.battlefield) - permanentValue(a, attackerPlayer.zones.battlefield, defender.zones.battlefield));
  for (const attacker of ordered) {
    const traits = cardTraits(attacker);
    const legal = available.filter((blocker) => canBlock(attacker, blocker, defender.zones.battlefield));
    if (traits.menace) {
      let best = null;
      for (let i = 0; i < legal.length; i += 1) for (let j = i + 1; j < legal.length; j += 1) {
        const pair = [legal[i], legal[j]];
        const score = combatTradeScore(attacker, pair, attackerPlayer.zones.battlefield, defender.zones.battlefield);
        if (!best || score < best.score) best = { pair, score };
      }
      if (best && best.score <= Math.max(2, effectiveStats(attacker, attackerPlayer.zones.battlefield).power * 1.15)) result.set(attacker.instanceId, best.pair);
    } else if (legal.length) {
      legal.sort((a, b) => combatTradeScore(attacker, [a], attackerPlayer.zones.battlefield, defender.zones.battlefield) - combatTradeScore(attacker, [b], attackerPlayer.zones.battlefield, defender.zones.battlefield));
      const blocker = legal[0];
      const trade = combatTradeScore(attacker, [blocker], attackerPlayer.zones.battlefield, defender.zones.battlefield);
      if (trade <= Math.max(2.2, effectiveStats(attacker, attackerPlayer.zones.battlefield).power * 1.2)) result.set(attacker.instanceId, [blocker]);
    }
    for (const blocker of result.get(attacker.instanceId) || []) available.splice(available.findIndex((item) => item.instanceId === blocker.instanceId), 1);
  }
  return result;
}

function resolveCombat(state, playerId, cardIds) {
  const player = state.players[playerId];
  const opponentId = otherPlayerId(state, playerId);
  const opponent = state.players[opponentId];
  const attackers = player.zones.battlefield.filter((card) => cardIds.includes(card.instanceId));
  const blocks = chooseBlocks(state, playerId, attackers);
  const deadAttackers = new Set();
  const deadBlockers = new Set();
  for (const attacker of attackers) {
    const traits = cardTraits(attacker);
    if (!traits.vigilance) attacker.tapped = true;
    const outcome = combatOutcome(attacker, blocks.get(attacker.instanceId) || [], player.zones.battlefield, opponent.zones.battlefield);
    opponent.life -= outcome.playerDamage;
    player.life += outcome.lifelinkGain;
    if (attacker.commander && outcome.playerDamage > 0) opponent.commanderDamage[attacker.instanceId] = Number(opponent.commanderDamage[attacker.instanceId] || 0) + outcome.playerDamage;
    if (outcome.attackerDies) deadAttackers.add(attacker.instanceId);
    for (const id of outcome.blockersDie) deadBlockers.add(id);
    if (traits.attackTrigger) state._coach.virtual[playerId] += 1.0;
    if (outcome.playerDamage && traits.combatDamageTrigger) state._coach.virtual[playerId] += 1.8;
  }
  for (const card of player.zones.battlefield.filter((item) => deadAttackers.has(item.instanceId))) player.zones.graveyard.push(card);
  for (const card of opponent.zones.battlefield.filter((item) => deadBlockers.has(item.instanceId))) opponent.zones.graveyard.push(card);
  player.zones.battlefield = player.zones.battlefield.filter((item) => !deadAttackers.has(item.instanceId));
  opponent.zones.battlefield = opponent.zones.battlefield.filter((item) => !deadBlockers.has(item.instanceId));
}

function applyStateBasedActions(state) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const player of Object.values(state.players || {})) {
      if (player.life <= 0 || player.poison >= 10 || Object.values(player.commanderDamage || {}).some((amount) => Number(amount) >= 21)) player.lost = true;
      const survivors = [];
      for (const card of player.zones.battlefield || []) {
        if (isCreature(card) && effectiveStats(card, player.zones.battlefield).toughness <= 0) {
          player.zones.graveyard.push(card);
          changed = true;
        } else survivors.push(card);
      }
      player.zones.battlefield = survivors;
    }
  }
  return state;
}

function applyTacticalAction(original, playerId, action, options = {}) {
  const state = options.mutate ? original : deepClone(original);
  state.stack ||= [];
  state._coach ||= { virtual: {}, actionNotes: [], newPermanents: [], castCards: [], combatDamage: 0, effectsBySource: {} };
  state._coach.virtual ||= Object.fromEntries(Object.keys(state.players).map((id) => [id, 0]));
  state._coach.actionNotes ||= [];
  const player = state.players[playerId];
  if (!player) return { ok: false, state, reason: 'Player not found.' };

  if (action.type === 'sequence') {
    let working = state;
    for (const step of action.steps || []) {
      const result = applyTacticalAction(working, playerId, step, { mutate: true, autoResolve: options.autoResolve !== false });
      if (!result.ok) return result;
      working = result.state;
    }
    return { ok: true, state: applyStateBasedActions(working) };
  }
  if (action.type === 'advance-phase') {
    state.phaseIndex = PHASES.findIndex((phase) => phase.id === 'main1');
    return { ok: true, state };
  }
  if (action.type === 'advance-land') state.phaseIndex = PHASES.findIndex((phase) => phase.id === 'main1');
  if (['play-land', 'advance-land'].includes(action.type)) {
    const found = findTacticalCard(state, action.cardId);
    if (!found || found.zone !== 'hand') return { ok: false, state, reason: 'Land is no longer in hand.' };
    const legality = landPlayLegality(state, playerId, found.card);
    if (!legality.legal) return { ok: false, state, reason: legality.reasons.join(' ') };
    const card = removeFromZone(player, 'hand', action.cardId);
    const entry = action.entryPlan || landEntryPlan(card, player, { opponentCount: Math.max(1, Object.keys(state.players).length - 1), payLife: 'auto' });
    card.tapped = Boolean(entry.tapped);
    player.life -= Number(entry.lifePaid || 0);
    player.landPlaysThisTurn = Number(player.landPlaysThisTurn || 0) + 1;
    player.zones.battlefield.push(card);
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (['cast-permanent', 'cast-spell', 'cast-commander'].includes(action.type)) {
    const found = findTacticalCard(state, action.cardId);
    if (!found) return { ok: false, state, reason: 'Spell is no longer available.' };
    const sourceZone = found.zone;
    const legality = spellCastLegality(state, playerId, found.card, sourceZone, { kicked: Boolean(action.kicked) });
    if (!legality.legal) return { ok: false, state, reason: legality.reasons.join(' ') };
    const card = removeFromZone(player, sourceZone, action.cardId);
    applySpellPayment(state, playerId, action.paymentPlan?.ok ? action.paymentPlan : legality.payment);
    if (sourceZone === 'command') player.commanderCastCount[card.instanceId] = Number(player.commanderCastCount[card.instanceId] || 0) + 1;
    state.stack.push(card);
    state.priorityPlayerId = playerId;
    state.consecutivePasses = 0;
    if (options.autoResolve !== false) {
      state.stack.pop();
      resolveCard(state, playerId, card, { kicked: Boolean(action.kicked) });
    }
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (action.type === 'attack') {
    const legalIds = (action.cardIds || []).filter((id) => {
      const found = findTacticalCard(state, id);
      return found && attackLegality(state, found.card).legal;
    });
    if (!legalIds.length) return { ok: false, state, reason: 'No listed attacker is currently legal.' };
    resolveCombat(state, playerId, legalIds);
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (action.type === 'activate-ability') {
    const found = findTacticalCard(state, action.cardId);
    if (!found || found.zone !== 'battlefield') return { ok: false, state, reason: 'Permanent is not on the battlefield.' };
    const traits = cardTraits(found.card);
    if (traits.tapAbility) found.card.tapped = true;
    applyCommonEffects(state, playerId, found.card, { activated: true });
    state._coach.virtual[playerId] += traits.activatedAbility ? 0.8 : 0;
    return { ok: true, state: applyStateBasedActions(state) };
  }
  if (action.type === 'hold') return { ok: true, state };
  return { ok: false, state, reason: `Unsupported tactical action: ${action.type}` };
}

function availableInteractionValue(player) {
  const mana = manaDevelopmentSnapshot(player);
  let value = 0;
  for (const card of player.zones.hand || []) {
    const traits = cardTraits(card);
    if (!(traits.counterspell || traits.targetedRemoval || traits.protectionSpell || traits.combatTrick)) continue;
    if (Number(card.manaValue || 0) <= mana.available + 0.1) value += 1.2 + Number(card.manaValue || 0) * 0.12;
  }
  return value;
}

function tacticalStateScore(state, playerId, profile = buildStrategyProfile(state.players[playerId])) {
  const opponentId = otherPlayerId(state, playerId);
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  const valueBoard = (owner, enemy) => owner.zones.battlefield.reduce((sum, card) => sum + permanentValue(card, owner.zones.battlefield, enemy.zones.battlefield, { lowLife: owner.life <= 12 }) + cardStrategySynergy(card, profile, { zone: 'battlefield' }) * 0.65, 0);
  const ownBoard = valueBoard(player, opponent);
  const enemyBoard = opponent.zones.battlefield.reduce((sum, card) => sum + permanentValue(card, opponent.zones.battlefield, player.zones.battlefield, { lowLife: opponent.life <= 12 }), 0);
  const ownMana = manaDevelopmentSnapshot(player);
  const enemyMana = manaDevelopmentSnapshot(opponent);
  const hand = (player.zones.hand.length - opponent.zones.hand.length) * 1.25;
  const life = (player.life - opponent.life) * 0.18;
  const mana = (ownMana.nextTurn - enemyMana.nextTurn) * 0.58 + (ownMana.available - enemyMana.available) * 0.34;
  const poison = (opponent.poison - player.poison) * 1.8;
  const commanderPressure = Object.values(opponent.commanderDamage || {}).reduce((max, amount) => Math.max(max, Number(amount || 0)), 0) * 0.32
    - Object.values(player.commanderDamage || {}).reduce((max, amount) => Math.max(max, Number(amount || 0)), 0) * 0.38;
  const virtual = Number(state._coach?.virtual?.[playerId] || 0) - Number(state._coach?.virtual?.[opponentId] || 0);
  const interaction = availableInteractionValue(player) - availableInteractionValue(opponent) * 0.55;
  const loss = player.lost ? -1000 : opponent.lost ? 1000 : 0;
  return ownBoard - enemyBoard + hand + life + mana + poison + commanderPressure + virtual + interaction + loss;
}

function generateShortSequences(state, playerId, options = {}) {
  const depth = Math.max(1, Math.min(4, Number(options.depth || 3)));
  const beamWidth = Math.max(4, Math.min(30, Number(options.beamWidth || 12)));
  const profile = buildStrategyProfile(state.players[playerId]);
  let beam = [{ state: deepClone(state), steps: [], score: tacticalStateScore(state, playerId, profile) }];
  const sequences = [];
  for (let ply = 0; ply < depth; ply += 1) {
    const next = [];
    for (const node of beam) {
      const actions = generateTacticalActions(node.state, playerId, { limit: ply === 0 ? 28 : 16 });
      for (const action of actions) {
        if (action.type === 'hold') continue;
        const result = applyTacticalAction(node.state, playerId, action, { autoResolve: true });
        if (!result.ok) continue;
        const score = tacticalStateScore(result.state, playerId, profile) + actionStrategyBonus(action, node.state, playerId, profile);
        const item = { state: result.state, steps: [...node.steps, action], score };
        next.push(item);
        if (item.steps.length > 1) sequences.push({ type: 'sequence', steps: item.steps, label: item.steps.map((step) => step.label).join(' → '), projectedScore: score });
      }
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, beamWidth);
    if (!beam.length) break;
  }
  return uniqueActions(sequences).sort((a, b) => b.projectedScore - a.projectedScore).slice(0, Number(options.limit || 16));
}


return { findTacticalCard, generateTacticalActions, applyCommonEffects, applyStateBasedActions, applyTacticalAction, tacticalStateScore, generateShortSequences };
})();

// ---- coach.js ----
__modules["./coach.js"] = (() => {
const { PHASES } = __modules["./constants.js"];
const { cardTraits, canBlock, combatOutcome, combatTradeScore, effectiveStats, permanentValue, publicCardSnapshot } = __modules["./card-evaluation.js"];
const { ensureKnowledge, knownHandCards, publicMemorySummary, visibleManaSnapshot } = __modules["./knowledge.js"];
const { attackLegality, landEntryPlan, landPlayLegality, manaDevelopmentSnapshot, planManaPayment, spendMana, spellCastLegality, strategicPaymentColors } = __modules["./rules.js"];
const { clamp, deepClone, isCreature, isLand, isPermanent, manaProductionChoices, numericStat, totalMana } = __modules["./utils.js"];
const { applyTacticalAction, generateShortSequences, generateTacticalActions, tacticalStateScore } = __modules["./tactical-engine.js"];
const { actionStrategyBonus, buildStrategyProfile, strategyLabel } = __modules["./strategy-profile.js"];

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const INTERACTION_MODELS = {
  counterspell: { label: 'counterspell', identities: ['U'], requiredOpenColors: ['U'], minMana: 2, base: 0.11, timing: 'now' },
  removal: { label: 'creature removal', identities: ['W', 'U', 'B', 'R', 'G'], requiredOpenColors: ['W', 'U', 'B', 'R', 'G'], minMana: 1, base: 0.14, timing: 'now' },
  combatTrick: { label: 'combat trick', identities: ['W', 'U', 'R', 'G'], requiredOpenColors: ['W', 'U', 'R', 'G'], minMana: 1, base: 0.09, timing: 'now' },
  protection: { label: 'protection spell', identities: ['W', 'U', 'G'], requiredOpenColors: ['W', 'U', 'G'], minMana: 1, base: 0.08, timing: 'now' },
  boardWipe: { label: 'board wipe next turn', identities: ['W', 'U', 'B', 'R'], requiredOpenColors: ['W', 'U', 'B', 'R'], minMana: 4, base: 0.08, timing: 'nextTurn' },
  graveyardInteraction: { label: 'graveyard interaction', identities: ['W', 'B', 'G'], requiredOpenColors: ['W', 'B', 'G'], minMana: 1, base: 0.07, timing: 'now' },
  flashThreat: { label: 'flash creature or instant-speed permanent', identities: ['W', 'U', 'G'], requiredOpenColors: ['W', 'U', 'G'], minMana: 2, base: 0.07, timing: 'now' },
  engine: { label: 'additional creature or engine piece', identities: ['W', 'U', 'B', 'R', 'G', 'C'], requiredOpenColors: [], minMana: 2, base: 0.18, timing: 'nextTurn' },
};

function otherPlayerId(state, playerId) {
  return Object.keys(state.players).find((id) => id !== playerId);
}

function phaseId(state) {
  return PHASES[state.phaseIndex]?.id || 'main1';
}

function cardById(state, instanceId) {
  for (const player of Object.values(state.players)) {
    for (const cards of Object.values(player.zones)) {
      const card = cards.find((item) => item.instanceId === instanceId);
      if (card) return card;
    }
  }
  return state.stack?.find((card) => card.instanceId === instanceId) || null;
}

function inferredColorIdentity(player) {
  const explicit = new Set(player.colorIdentity || []);
  for (const card of player.zones.command || []) for (const color of card.colorIdentity || []) explicit.add(color);
  if (!explicit.size) {
    for (const zone of ['battlefield', 'graveyard', 'exile']) {
      for (const card of player.zones[zone] || []) for (const color of card.colorIdentity || card.colors || []) explicit.add(color);
    }
  }
  if (!explicit.size) explicit.add('C');
  return [...explicit];
}

function publicPlayerView(player, perspectiveId, memory) {
  const self = player.id === perspectiveId;
  return {
    id: player.id,
    name: player.name,
    life: player.life,
    poison: player.poison,
    mana: { ...player.mana },
    colorIdentity: inferredColorIdentity(player),
    hand: self ? (player.zones.hand || []).map(publicCardSnapshot) : undefined,
    handSize: player.zones.hand.length,
    librarySize: player.zones.library.length,
    battlefield: (player.zones.battlefield || []).map(publicCardSnapshotWithState),
    graveyard: (player.zones.graveyard || []).map(publicCardSnapshotWithState),
    exile: (player.zones.exile || []).map(publicCardSnapshotWithState),
    command: (player.zones.command || []).map(publicCardSnapshotWithState),
    knownHand: self ? [] : Object.values(memory?.knownHand || {}).map((entry) => entry.card).filter(Boolean),
    commanderDamage: { ...(player.commanderDamage || {}) },
    commanderCastCount: { ...(player.commanderCastCount || {}) },
    behavior: deepClone(memory?.behavior || {}),
    usedInteraction: { ...(memory?.usedInteraction || {}) },
  };
}

function publicCardSnapshotWithState(card) {
  return {
    ...publicCardSnapshot(card),
    owner: card.owner,
    controller: card.controller,
    tapped: Boolean(card.tapped),
    summoningSick: Boolean(card.summoningSick),
    attacking: Boolean(card.attacking),
    blocking: card.blocking || null,
    blockedBy: [...(card.blockedBy || [])],
    faceDown: Boolean(card.faceDown),
    counters: { ...(card.counters || {}) },
    attachedTo: card.attachedTo || null,
    attachments: [...(card.attachments || [])],
  };
}

/**
 * Returns exactly the information available to a skilled human from one seat.
 * Opponent hand/library card identities are deliberately omitted, even when the
 * solo-table UI happens to display them to the user controlling both players.
 */
function buildInformationSet(state, perspectiveId = state.activePlayerId) {
  ensureKnowledge(state);
  const players = {};
  for (const [playerId, player] of Object.entries(state.players)) {
    players[playerId] = publicPlayerView(player, perspectiveId, state.knowledge.players[playerId]);
  }
  return {
    perspectiveId,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    phase: phaseId(state),
    players,
    stack: (state.stack || []).map(publicCardSnapshotWithState),
    publicEvents: (state.knowledge.events || []).map((event) => deepClone(event)),
    audit: {
      ownFullHand: true,
      ownBattlefield: true,
      opponentsVisibleBattlefields: true,
      publicZones: true,
      opponentExactHiddenHand: false,
      opponentDecklistOrLibraryIdentities: false,
      opponentHandSize: true,
      publicMemory: true,
    },
  };
}

function placeholderCards(count, prefix) {
  return Array.from({ length: Math.max(0, Number(count || 0)) }, (_, index) => ({
    instanceId: `${prefix}-${index}`,
    name: 'Unknown card',
    hidden: true,
    typeLine: '',
    oracleText: '',
    keywords: [],
    counters: {},
  }));
}

function simulationStateFromInformationSet(state, info) {
  const draft = {
    version: state.version,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    phaseIndex: state.phaseIndex,
    stack: info.stack.map((card) => deepClone(card)),
    players: {},
    _coach: { virtual: {}, newPermanents: [], castCards: [], actionNotes: [], combatDamage: 0, effectsBySource: {} },
  };
  for (const [playerId, view] of Object.entries(info.players)) {
    const original = state.players[playerId];
    const self = playerId === info.perspectiveId;
    draft.players[playerId] = {
      id: playerId,
      name: view.name,
      life: view.life,
      poison: view.poison,
      mana: { ...view.mana },
      colorIdentity: [...view.colorIdentity],
      commanderDamage: { ...view.commanderDamage },
      commanderCastCount: { ...view.commanderCastCount },
      landPlaysThisTurn: Number(original.landPlaysThisTurn || 0),
      lost: Boolean(original.lost),
      zones: {
        hand: self ? (original.zones.hand || []).map((card) => deepClone(card)) : placeholderCards(view.handSize, `${playerId}-hand`),
        library: placeholderCards(view.librarySize, `${playerId}-library`),
        battlefield: (original.zones.battlefield || []).map((card) => deepClone(card)),
        graveyard: (original.zones.graveyard || []).map((card) => deepClone(card)),
        exile: (original.zones.exile || []).map((card) => deepClone(card)),
        command: (original.zones.command || []).map((card) => deepClone(card)),
      },
    };
    draft._coach.virtual[playerId] = 0;
  }
  return draft;
}

function possibleMoves(state, playerId = state.activePlayerId) {
  const immediate = generateTacticalActions(state, playerId, { limit: 24 });
  const sequences = generateShortSequences(state, playerId, { depth: 3, beamWidth: 10, limit: 8 });
  return dedupeMoves([...immediate, ...sequences]).slice(0, 28);
}

function dedupeMoves(moves) {
  const seen = new Set();
  return moves.filter((move) => {
    const key = `${move.type}:${move.cardId || ''}:${(move.cardIds || []).join(',')}:${(move.steps || []).map((step) => `${step.type}-${step.cardId}`).join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addCastSequences(state, playerId, moves) {
  const player = state.players[playerId];
  const castMoves = moves.filter((move) => ['cast-permanent', 'cast-spell', 'cast-commander'].includes(move.type)).slice(0, 9);
  for (let i = 0; i < castMoves.length; i += 1) {
    for (let j = 0; j < castMoves.length; j += 1) {
      if (i === j) continue;
      const simulation = simulationStateFromInformationSet(state, buildInformationSet(state, playerId));
      if (!applyMoveToDraft(simulation, playerId, castMoves[i]).ok) continue;
      if (!canApplyMove(simulation, playerId, castMoves[j])) continue;
      moves.push({
        type: 'sequence',
        steps: [castMoves[i], castMoves[j]],
        label: `${castMoves[i].label} → ${castMoves[j].label.replace(/^Cast /, '')}`,
      });
      if (moves.filter((move) => move.type === 'sequence').length >= 8) return;
    }
  }
}

function addLandCastSequences(state, playerId, moves) {
  const phase = phaseId(state);
  const landMoves = moves.filter((move) => ['play-land', 'advance-land'].includes(move.type)).slice(0, 4);
  for (const landMove of landMoves) {
    const simulation = simulationStateFromInformationSet(state, buildInformationSet(state, playerId));
    if (!applyMoveToDraft(simulation, playerId, landMove).ok) continue;
    for (const card of simulation.players[playerId].zones.hand.filter((item) => !isLand(item)).slice(0, 12)) {
      const traits = cardTraits(card);
      if (!['main1', 'main2'].includes(phase) && landMove.type !== 'advance-land' && !(traits.instant || traits.flash)) continue;
      const paymentPlan = planManaPayment(simulation.players[playerId], card.manaCost || '', 0, { preserveColors: strategicPaymentColors(simulation.players[playerId], card.instanceId), maxNodes: 10000 });
      const castMove = { type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, paymentPlan, label: `Cast ${card.name}` };
      if (!canApplyMove(simulation, playerId, castMove)) continue;
      moves.push({ type: 'sequence', steps: [landMove, castMove], label: `${landMove.label} → Cast ${card.name}` });
      if (moves.filter((move) => move.type === 'sequence').length >= 12) return;
    }
  }
}

function addAttackMoves(state, playerId, opponentId, moves) {
  const attackers = state.players[playerId].zones.battlefield.filter((card) => attackLegality(state, card).legal);
  if (!attackers.length) return;
  attackers.slice(0, 8).forEach((card) => moves.push({ type: 'attack', cardIds: [card.instanceId], opponentId, label: `Attack with ${card.name}` }));
  if (attackers.length > 1) {
    moves.push({ type: 'attack', cardIds: attackers.map((card) => card.instanceId), opponentId, label: 'Attack with all legal creatures' });
    const evasive = attackers.filter((card) => {
      const traits = cardTraits(card);
      return traits.flying || traits.unblockable || traits.menace;
    });
    if (evasive.length && evasive.length !== attackers.length) moves.push({ type: 'attack', cardIds: evasive.map((card) => card.instanceId), opponentId, label: 'Attack with evasive creatures' });
    const favorable = attackers.filter((attacker) => visibleAttackValue(state, playerId, attacker) > 0.8);
    if (favorable.length && favorable.length !== attackers.length) moves.push({ type: 'attack', cardIds: favorable.map((card) => card.instanceId), opponentId, label: 'Attack with favorable creatures' });
  }
}

function visibleAttackValue(state, playerId, attacker) {
  const opponentId = otherPlayerId(state, playerId);
  const blockers = state.players[opponentId].zones.battlefield.filter((blocker) => canBlock(attacker, blocker, state.players[opponentId].zones.battlefield));
  if (!blockers.length) return effectiveStats(attacker, state.players[playerId].zones.battlefield).power;
  return Math.min(...blockers.map((blocker) => combatTradeScore(attacker, [blocker], state.players[playerId].zones.battlefield, state.players[opponentId].zones.battlefield)));
}

function identityAllows(identity, model) {
  return model.identities.some((color) => identity.includes(color));
}

function nextTurnManaPotential(player) {
  let total = totalMana(player.mana || {});
  const colors = new Set(Object.entries(player.mana || {}).filter(([, amount]) => Number(amount) > 0).map(([color]) => color));
  for (const card of player.zones.battlefield || []) {
    const choices = manaProductionChoices(card);
    total += choices.map((choice) => Object.values(choice.mana).reduce((sum, amount) => sum + Number(amount || 0), 0)).sort((a, b) => b - a)[0] || 0;
    for (const choice of choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount || 0) > 0) colors.add(color);
  }
  return { total, colors: [...colors] };
}

function knownCategoryCards(state, opponentId, category) {
  return knownHandCards(state, opponentId).filter((card) => {
    const traits = cardTraits(card);
    return category === 'engine'
      ? !traits.interactionCategories.length
      : traits.interactionCategories.includes(category);
  });
}

function observedCategoryEvidence(state, opponentId, category) {
  const player = state.players[opponentId];
  const seen = new Map();
  const publicCards = [
    ...(player.zones.battlefield || []),
    ...(player.zones.graveyard || []),
    ...(player.zones.exile || []),
    ...(player.zones.command || []),
    ...Object.values(state.knowledge?.players?.[opponentId]?.observedCards || {}).map((entry) => entry.card).filter(Boolean),
  ];
  for (const card of publicCards) {
    const key = card.oracleId || card.scryfallId || card.name;
    if (seen.has(key)) continue;
    seen.set(key, card);
  }
  return [...seen.values()].filter((card) => {
    const traits = cardTraits(card);
    if (category === 'engine') return traits.draw || traits.tutor || traits.tokenMaker || traits.staticEffect || traits.activatedAbility;
    return traits.interactionCategories.includes(category);
  });
}

function visibleStrategySignals(state, opponentId) {
  const player = state.players[opponentId];
  const cards = [...(player.zones.command || []), ...(player.zones.battlefield || []), ...(player.zones.graveyard || [])];
  const text = cards.map((card) => `${card.typeLine || ''} ${card.oracleText || ''}`).join(' ').toLocaleLowerCase();
  return {
    spellslinger: /instant|sorcery|cast .* spell|noncreature spell/.test(text),
    graveyard: /graveyard|dies|discard|mill/.test(text),
    combat: /attacks|combat damage|creature you control/.test(text),
    artifacts: /artifact/.test(text),
  };
}

/** Builds probability/risk estimates using public information only. */
function buildInteractionRisk(state, perspectiveId = state.activePlayerId) {
  ensureKnowledge(state);
  const opponentId = otherPlayerId(state, perspectiveId);
  const opponent = state.players[opponentId];
  const memory = state.knowledge.players[opponentId];
  const strategySignals = visibleStrategySignals(state, opponentId);
  const open = visibleManaSnapshot(opponent);
  const nextTurn = nextTurnManaPotential(opponent);
  const identity = inferredColorIdentity(opponent);
  const handSize = opponent.zones.hand.length;
  const handFactor = handSize <= 0 ? 0 : Math.min(1.25, 0.25 + handSize / 6.2);
  const behavior = memory.behavior || {};
  const passFactor = Math.min(0.18, Number(behavior.consecutivePassesWithOpenMana || 0) * 0.045 + Number(behavior.passesWithOpenMana || 0) * 0.012);
  const heldFactor = Math.min(0.12, Number(behavior.cardsHeldAcrossTurns || 0) * 0.018);
  const categories = {};

  for (const [category, model] of Object.entries(INTERACTION_MODELS)) {
    const possibleByIdentity = identityAllows(identity, model);
    const mana = model.timing === 'now' ? open : nextTurn;
    const hasRequiredColor = !model.requiredOpenColors.length || model.requiredOpenColors.some((color) => mana.colors.includes(color));
    const castable = possibleByIdentity && mana.total >= model.minMana && hasRequiredColor;
    const knownCards = knownCategoryCards(state, opponentId, category);
    const observedEvidence = observedCategoryEvidence(state, opponentId, category);
    const knownCastable = knownCards.some((card) => planManaPayment(opponent, card.manaCost || '', 0).ok);
    let probability = castable && handSize > 0 ? model.base * handFactor : 0;
    if (castable && observedEvidence.length) probability += Math.min(0.10, observedEvidence.length * 0.018);
    if (castable && category === 'counterspell' && strategySignals.spellslinger) probability += 0.035;
    if (castable && category === 'graveyardInteraction' && strategySignals.graveyard) probability += 0.03;
    if (castable && ['combatTrick', 'protection', 'flashThreat'].includes(category) && strategySignals.combat) probability += 0.025;
    if (castable && model.timing === 'now') probability += passFactor + heldFactor;
    if (castable && model.timing === 'nextTurn') probability += Math.min(0.12, handSize * 0.012);
    const usedCount = Number(memory.usedInteraction?.[category] || 0);
    if (usedCount > 0) {
      const depletion = category === 'boardWipe' ? 0.52 : 0.82;
      probability *= Math.pow(depletion, Math.min(3, usedCount));
    }
    if (knownCards.length) probability = Math.max(probability, knownCastable ? 0.94 : 0.58);
    probability = clamp(probability, 0, 0.96);

    const reasons = [];
    if (!possibleByIdentity) reasons.push(`not supported by the opponent's known ${identity.join('/')} color identity`);
    else if (!castable) reasons.push(model.timing === 'now' ? 'not supported by currently open mana' : 'not supported by projected next-turn mana');
    else {
      reasons.push(`${mana.total} visible mana available${mana.colors.length ? ` in ${mana.colors.join('/')}` : ''}`);
      reasons.push(`${handSize} card${handSize === 1 ? '' : 's'} in hand`);
    }
    if (knownCards.length) reasons.push(`publicly known in hand: ${knownCards.map((card) => card.name).join(', ')}`);
    if (observedEvidence.length) reasons.push(`visible strategy evidence: ${observedEvidence.slice(0, 3).map((card) => card.name).join(', ')}`);
    if (usedCount) reasons.push(`${usedCount} ${model.label}${usedCount === 1 ? '' : 's'} already used`);
    if (behavior.consecutivePassesWithOpenMana) reasons.push(`passed ${behavior.consecutivePassesWithOpenMana} consecutive turn${behavior.consecutivePassesWithOpenMana === 1 ? '' : 's'} with mana open`);

    categories[category] = {
      category,
      label: model.label,
      probability,
      possibleByIdentity,
      castable,
      timing: model.timing,
      knownCards: knownCards.map(publicCardSnapshot),
      observedEvidence: observedEvidence.map(publicCardSnapshot),
      reasons,
    };
  }

  return {
    perspectiveId,
    opponentId,
    opponentName: opponent.name,
    handSize,
    colorIdentity: identity,
    openMana: open,
    nextTurnMana: nextTurn,
    categories,
    publicMemory: publicMemorySummary(state, perspectiveId, opponentId),
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function analysisSeed(state, playerId) {
  const publicShape = {
    turn: state.turnNumber,
    phase: state.phaseIndex,
    playerId,
    events: state.knowledge?.events?.length || 0,
    boards: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, player.zones.battlefield.map((card) => [card.name, card.tapped, card.counters])])),
    hands: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, player.zones.hand.length])),
  };
  return hashString(JSON.stringify(publicShape));
}

function sampleHiddenScenario(risk, rng) {
  const unknownSlots = Math.max(0, risk.handSize - Object.values(risk.publicMemory?.knownHand || {}).length);
  let slots = unknownSlots;
  const scenario = { categories: new Set(), exactKnown: [] };
  for (const [category, entry] of Object.entries(risk.categories)) {
    if (entry.knownCards.length) {
      scenario.categories.add(category);
      scenario.exactKnown.push(...entry.knownCards);
      continue;
    }
    if (slots <= 0 || entry.probability <= 0) continue;
    if (rng() < entry.probability) {
      scenario.categories.add(category);
      slots -= 1;
    }
  }
  return scenario;
}

function findSimCard(player, instanceId) {
  for (const [zone, cards] of Object.entries(player.zones)) {
    const index = cards.findIndex((card) => card.instanceId === instanceId);
    if (index >= 0) return { zone, cards, index, card: cards[index] };
  }
  return null;
}

function paymentPlanUsable(player, card, tax, paymentPlan) {
  if (!paymentPlan?.ok) return false;
  const working = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(player.mana || {}) };
  for (const source of paymentPlan.sources || []) {
    const found = findSimCard(player, source.instanceId);
    if (!found || found.zone !== 'battlefield' || found.card.tapped) return false;
    for (const color of COLORS) working[color] = Number(working[color] || 0) + Number(source.mana?.[color] || 0);
  }
  return planManaPayment({ ...player, mana: working, zones: { ...player.zones, battlefield: [] } }, card.manaCost || '', tax, { maxNodes: 100 }).ok;
}

function canApplyMove(draft, playerId, move) {
  const player = draft.players[playerId];
  if (move.type === 'sequence') {
    const preview = deepClone(draft);
    return (move.steps || []).every((step) => applyMoveToDraft(preview, playerId, step).ok);
  }
  if (['play-land', 'advance-land'].includes(move.type)) {
    const found = findSimCard(player, move.cardId);
    return Boolean(found?.zone === 'hand' && isLand(found.card) && player.landPlaysThisTurn < 1);
  }
  if (['cast-permanent', 'cast-spell'].includes(move.type)) {
    const found = findSimCard(player, move.cardId);
    if (!found || found.zone !== 'hand') return false;
    if (paymentPlanUsable(player, found.card, 0, move.paymentPlan)) return true;
    return planManaPayment(player, found.card.manaCost, 0, { preserveColors: strategicPaymentColors(player, found.card.instanceId), maxNodes: 5000 }).ok;
  }
  if (move.type === 'cast-commander') {
    const found = findSimCard(player, move.cardId);
    const tax = found ? 2 * Number(player.commanderCastCount[found.card.instanceId] || 0) : 0;
    if (!found || found.zone !== 'command') return false;
    if (paymentPlanUsable(player, found.card, tax, move.paymentPlan)) return true;
    return planManaPayment(player, found.card.manaCost, tax, { preserveColors: strategicPaymentColors(player, found.card.instanceId), maxNodes: 5000 }).ok;
  }
  return true;
}

function payApproximateMana(player, card, tax = 0, preferredPlan = null) {
  const plan = paymentPlanUsable(player, card, tax, preferredPlan)
    ? preferredPlan
    : planManaPayment(player, card.manaCost || '', tax, { preserveColors: strategicPaymentColors(player, card.instanceId), maxNodes: 5000 });
  if (!plan.ok) return false;
  for (const source of plan.sources || []) {
    const found = findSimCard(player, source.instanceId);
    if (!found || found.card.tapped) return false;
    found.card.tapped = true;
    for (const color of COLORS) player.mana[color] = Number(player.mana[color] || 0) + Number(source.mana?.[color] || 0);
  }
  player.mana = spendMana(player.mana, card.manaCost || '', tax);
  return true;
}

function applyMoveToDraft(draft, playerId, move) {
  const player = draft.players[playerId];
  const opponentId = otherPlayerId(draft, playerId);
  const opponent = draft.players[opponentId];
  if (!draft._coach) draft._coach = { virtual: { [playerId]: 0, [opponentId]: 0 }, newPermanents: [], castCards: [], actionNotes: [], combatDamage: 0, effectsBySource: {} };

  if (move.type === 'sequence') {
    for (const step of move.steps || []) {
      const result = applyMoveToDraft(draft, playerId, step);
      if (!result.ok) return result;
    }
    return { ok: true };
  }
  if (move.type === 'advance-phase') {
    draft.phaseIndex = 3;
    return { ok: true };
  }
  if (['advance-land', 'play-land'].includes(move.type)) {
    if (move.type === 'advance-land') draft.phaseIndex = 3;
    const found = findSimCard(player, move.cardId);
    if (!found || found.zone !== 'hand' || !isLand(found.card) || player.landPlaysThisTurn >= 1) return { ok: false };
    const card = found.cards.splice(found.index, 1)[0];
    const entry = move.entryPlan || landEntryPlan(card, player, { opponentCount: Math.max(1, Object.keys(draft.players).length - 1), payLife: 'auto' });
    card.tapped = Boolean(entry.tapped);
    player.life -= Number(entry.lifePaid || 0);
    player.zones.battlefield.push(card);
    player.landPlaysThisTurn += 1;
    draft._coach.newPermanents.push(card.instanceId);
    draft._coach.actionNotes.push(`${card.name} entered ${card.tapped ? 'tapped' : 'untapped'}${entry.lifePaid ? ` after paying ${entry.lifePaid} life` : ''}`);
    return { ok: true };
  }
  if (['cast-permanent', 'cast-spell', 'cast-commander'].includes(move.type)) {
    const sourceZone = move.type === 'cast-commander' ? 'command' : 'hand';
    const found = findSimCard(player, move.cardId);
    if (!found || found.zone !== sourceZone) return { ok: false };
    const tax = sourceZone === 'command' ? 2 * Number(player.commanderCastCount[found.card.instanceId] || 0) : 0;
    if (!payApproximateMana(player, found.card, tax, move.paymentPlan)) return { ok: false };
    const card = found.cards.splice(found.index, 1)[0];
    draft._coach.castCards.push(card.instanceId);
    draft._coach.lastCastCardId = card.instanceId;
    if (sourceZone === 'command') player.commanderCastCount[card.instanceId] = Number(player.commanderCastCount[card.instanceId] || 0) + 1;
    if (move.type === 'cast-spell') {
      player.zones.graveyard.push(card);
      applyApproximateOracleEffect(draft, playerId, card);
    } else {
      card.summoningSick = isCreature(card);
      card.tapped = false;
      player.zones.battlefield.push(card);
      draft._coach.newPermanents.push(card.instanceId);
      if (cardTraits(card).enterTrigger) applyApproximateOracleEffect(draft, playerId, card, { enterOnly: true });
    }
    return { ok: true };
  }
  if (move.type === 'activate-ability') {
    const found = findSimCard(player, move.cardId);
    if (!found || found.zone !== 'battlefield') return { ok: false };
    const traits = cardTraits(found.card);
    if (traits.tapAbility) found.card.tapped = true;
    applyApproximateOracleEffect(draft, playerId, found.card, { activatedOnly: true });
    return { ok: true };
  }
  if (move.type === 'attack') {
    applyVisibleCombat(draft, playerId, move.cardIds || []);
    return { ok: true };
  }
  if (move.type === 'hold') return { ok: true };
  return { ok: true };
}

function applyApproximateOracleEffect(draft, playerId, card, options = {}) {
  const opponentId = otherPlayerId(draft, playerId);
  const traits = cardTraits(card);
  let virtual = 0;
  const record = { virtual: 0, moves: [] };
  if (traits.draw) virtual += 3.4;
  if (traits.tutor) virtual += 4.0;
  if (traits.tokenMaker) virtual += 2.2;
  if (traits.recursion) virtual += 2.3;
  if (traits.graveyardInteraction) virtual += 1.4;
  if (traits.protectionSpell) virtual += 2.0;
  if (traits.combatTrick) virtual += 1.4;
  if (traits.counterspell && !options.enterOnly) virtual += 1.2;
  if (traits.targetedRemoval && !options.enterOnly) {
    const targets = draft.players[opponentId].zones.battlefield;
    const target = [...targets].sort((a, b) => permanentValue(b, targets, draft.players[playerId].zones.battlefield) - permanentValue(a, targets, draft.players[playerId].zones.battlefield))[0];
    if (target) {
      targets.splice(targets.findIndex((item) => item.instanceId === target.instanceId), 1);
      draft.players[opponentId].zones.graveyard.push(target);
      record.moves.push({ cardId: target.instanceId, playerId: opponentId, from: 'battlefield', to: 'graveyard' });
      virtual += 1.0;
      draft._coach.actionNotes.push(`${card.name} can answer ${target.name}`);
    }
  }
  if (traits.boardWipe && !options.enterOnly) {
    record.moves.push(...applyBoardWipe(draft, playerId, { knownSpell: true }));
  }
  draft._coach.virtual[playerId] = Number(draft._coach.virtual[playerId] || 0) + virtual;
  record.virtual = virtual;
  draft._coach.effectsBySource[card.instanceId] = record;
}

function undoSourceEffects(draft, playerId, sourceCardId) {
  const record = draft._coach?.effectsBySource?.[sourceCardId];
  if (!record) return;
  draft._coach.virtual[playerId] = Number(draft._coach.virtual[playerId] || 0) - Number(record.virtual || 0);
  for (const move of [...(record.moves || [])].reverse()) {
    const player = draft.players[move.playerId];
    const index = player.zones[move.to].findIndex((card) => card.instanceId === move.cardId);
    if (index < 0) continue;
    const [card] = player.zones[move.to].splice(index, 1);
    player.zones[move.from].push(card);
  }
  delete draft._coach.effectsBySource[sourceCardId];
}

function chooseBlockersForAttack(draft, playerId, attackers) {
  const opponentId = otherPlayerId(draft, playerId);
  const attackBoard = draft.players[playerId].zones.battlefield;
  const blockBoard = draft.players[opponentId].zones.battlefield;
  const available = blockBoard.filter((card) => isCreature(card) && !card.tapped);
  const assignments = new Map();
  const orderedAttackers = [...attackers].sort((a, b) => permanentValue(b, attackBoard, blockBoard) - permanentValue(a, attackBoard, blockBoard));
  for (const attacker of orderedAttackers) {
    const legal = available.filter((blocker) => canBlock(attacker, blocker, blockBoard));
    if (!legal.length) continue;
    const traits = cardTraits(attacker);
    if (traits.menace) {
      if (legal.length < 2) continue;
      const pairs = [];
      for (let i = 0; i < legal.length; i += 1) for (let j = i + 1; j < legal.length; j += 1) pairs.push([legal[i], legal[j]]);
      pairs.sort((a, b) => combatTradeScore(attacker, a, attackBoard, blockBoard) - combatTradeScore(attacker, b, attackBoard, blockBoard));
      const pair = pairs[0];
      if (pair && combatTradeScore(attacker, pair, attackBoard, blockBoard) <= effectiveStats(attacker, attackBoard).power * 1.2) {
        assignments.set(attacker.instanceId, pair);
        for (const blocker of pair) available.splice(available.findIndex((item) => item.instanceId === blocker.instanceId), 1);
      }
      continue;
    }
    legal.sort((a, b) => combatTradeScore(attacker, [a], attackBoard, blockBoard) - combatTradeScore(attacker, [b], attackBoard, blockBoard));
    const blocker = legal[0];
    const noBlockDamage = effectiveStats(attacker, attackBoard).power;
    if (combatTradeScore(attacker, [blocker], attackBoard, blockBoard) <= noBlockDamage * 1.25) {
      assignments.set(attacker.instanceId, [blocker]);
      available.splice(available.findIndex((item) => item.instanceId === blocker.instanceId), 1);
    }
  }
  return assignments;
}

function applyVisibleCombat(draft, playerId, cardIds) {
  const opponentId = otherPlayerId(draft, playerId);
  const attackBoard = draft.players[playerId].zones.battlefield;
  const blockBoard = draft.players[opponentId].zones.battlefield;
  const attackers = attackBoard.filter((card) => cardIds.includes(card.instanceId));
  const assignments = chooseBlockersForAttack(draft, playerId, attackers);
  const deadAttackers = new Set();
  const deadBlockers = new Set();
  let totalDamage = 0;
  for (const attacker of attackers) {
    const traits = cardTraits(attacker);
    attacker.tapped = !traits.vigilance;
    const blockers = assignments.get(attacker.instanceId) || [];
    const outcome = combatOutcome(attacker, blockers, attackBoard, blockBoard);
    totalDamage += outcome.playerDamage;
    if (outcome.attackerDies) deadAttackers.add(attacker.instanceId);
    outcome.blockersDie.forEach((id) => deadBlockers.add(id));
    draft.players[playerId].life += outcome.lifelinkGain;
    if (traits.attackTrigger) draft._coach.virtual[playerId] += 1.25;
    if (outcome.playerDamage > 0 && traits.combatDamageTrigger) draft._coach.virtual[playerId] += 2.0;
    if (attacker.commander && outcome.playerDamage > 0) {
      draft.players[opponentId].commanderDamage[attacker.instanceId] = Number(draft.players[opponentId].commanderDamage[attacker.instanceId] || 0) + outcome.playerDamage;
    }
  }
  draft.players[opponentId].life -= totalDamage;
  draft._coach.combatDamage += totalDamage;
  for (const card of attackBoard.filter((item) => deadAttackers.has(item.instanceId))) draft.players[playerId].zones.graveyard.push(card);
  for (const card of blockBoard.filter((item) => deadBlockers.has(item.instanceId))) draft.players[opponentId].zones.graveyard.push(card);
  draft.players[playerId].zones.battlefield = attackBoard.filter((item) => !deadAttackers.has(item.instanceId));
  draft.players[opponentId].zones.battlefield = blockBoard.filter((item) => !deadBlockers.has(item.instanceId));
}

function bestTarget(player, opponent) {
  return [...player.zones.battlefield]
    .filter((card) => {
      const traits = cardTraits(card);
      return !traits.hexproof && !traits.shroud;
    })
    .sort((a, b) => permanentValue(b, player.zones.battlefield, opponent.zones.battlefield) - permanentValue(a, player.zones.battlefield, opponent.zones.battlefield))[0] || null;
}

function removePermanent(player, target) {
  const index = player.zones.battlefield.findIndex((card) => card.instanceId === target.instanceId);
  if (index < 0) return false;
  const [removed] = player.zones.battlefield.splice(index, 1);
  player.zones.graveyard.push(removed);
  return true;
}

function applyBoardWipe(draft, perspectiveId, { knownSpell = false } = {}) {
  const opponentId = otherPlayerId(draft, perspectiveId);
  const moves = [];
  for (const playerId of [perspectiveId, opponentId]) {
    const player = draft.players[playerId];
    const survivors = [];
    const dead = [];
    for (const card of player.zones.battlefield) {
      if (!isCreature(card) || cardTraits(card).indestructible) survivors.push(card);
      else dead.push(card);
    }
    player.zones.battlefield = survivors;
    player.zones.graveyard.push(...dead);
    moves.push(...dead.map((card) => ({ cardId: card.instanceId, playerId, from: 'battlefield', to: 'graveyard' })));
  }
  draft._coach.actionNotes.push(knownSpell ? 'resolved a visible board wipe' : 'sampled a plausible board wipe next turn');
  return moves;
}

function respondToMove(draft, playerId, move, scenario, rng) {
  const opponentId = otherPlayerId(draft, playerId);
  const player = draft.players[playerId];
  const opponent = draft.players[opponentId];
  const castMove = move.type === 'sequence'
    ? [...(move.steps || [])].reverse().find((step) => ['cast-permanent', 'cast-spell', 'cast-commander'].includes(step.type))
    : (['cast-permanent', 'cast-spell', 'cast-commander'].includes(move.type) ? move : null);

  if (castMove && scenario.categories.has('counterspell')) {
    const card = cardById(draft, castMove.cardId);
    if (card && rng() < 0.78) {
      undoSourceEffects(draft, playerId, card.instanceId);
      const found = findSimCard(player, card.instanceId);
      if (found?.zone === 'battlefield') {
        const countered = found.cards.splice(found.index, 1)[0];
        player.zones.graveyard.push(countered);
      }
      draft._coach.virtual[playerId] -= Math.max(1.5, permanentValue(card, player.zones.battlefield, opponent.zones.battlefield) * 0.65);
      draft._coach.actionNotes.push(`sampled ${opponent.name} countering ${card.name}`);
    }
  }

  if (scenario.categories.has('removal') && rng() < 0.72) {
    const target = bestTarget(player, opponent);
    if (target) {
      const traits = cardTraits(target);
      const wardResistance = traits.ward ? 0.22 : 0;
      const protectionResistance = traits.protection ? 0.24 : 0;
      if (rng() > wardResistance + protectionResistance && removePermanent(player, target)) {
        draft._coach.actionNotes.push(`sampled removal on ${target.name}`);
      }
    }
  }

  if (move.type === 'attack' || (move.type === 'sequence' && move.steps.some((step) => step.type === 'attack'))) {
    if (scenario.categories.has('combatTrick')) {
      draft._coach.virtual[playerId] -= 3.0 + rng() * 2.5;
      draft._coach.actionNotes.push('sampled an opposing combat trick');
    }
    if (scenario.categories.has('protection')) {
      draft._coach.virtual[playerId] -= 1.8 + rng() * 1.8;
      draft._coach.actionNotes.push('sampled protection changing combat');
    }
    if (scenario.categories.has('flashThreat')) {
      draft._coach.virtual[playerId] -= 1.6 + rng() * 2.2;
      draft._coach.actionNotes.push('sampled a flash blocker');
    }
  }

  if (scenario.categories.has('boardWipe')) {
    const ourCreatures = player.zones.battlefield.filter((card) => isCreature(card) && !cardTraits(card).indestructible);
    const theirCreatures = opponent.zones.battlefield.filter((card) => isCreature(card) && !cardTraits(card).indestructible);
    const ourValue = ourCreatures.reduce((sum, card) => sum + permanentValue(card, player.zones.battlefield, opponent.zones.battlefield), 0);
    const theirValue = theirCreatures.reduce((sum, card) => sum + permanentValue(card, opponent.zones.battlefield, player.zones.battlefield), 0);
    if (ourValue > theirValue * 0.78 && rng() < 0.62) applyBoardWipe(draft, playerId);
  }

  if (scenario.categories.has('graveyardInteraction')) {
    const graveyardValue = player.zones.graveyard.reduce((sum, card) => sum + (cardTraits(card).recursion || cardTraits(card).deathTrigger ? 0.8 : 0.12), 0);
    draft._coach.virtual[playerId] -= Math.min(4, graveyardValue);
  }
  if (scenario.categories.has('engine')) draft._coach.virtual[opponentId] += 2.2 + rng() * 2.0;
}

function strategicAdjustment(state, playerId, move, risk) {
  const player = state.players[playerId];
  const earlyTurn = Number(state.turnNumber || 1) <= 5;
  const availableLand = hasAvailableLandDrop(state, playerId);
  const includesLand = ['play-land', 'advance-land'].includes(move.type)
    || (move.type === 'sequence' && (move.steps || []).some((step) => ['play-land', 'advance-land'].includes(step.type)));
  let adjustment = 0;
  if (includesLand) adjustment += earlyTurn ? 12 : 7.5;
  const beginningWithLand = ['untap', 'upkeep', 'draw'].includes(phaseId(state)) && player.zones.hand.some((card) => isLand(card));
  if (move.type === 'hold' && (availableLand || beginningWithLand)) adjustment -= earlyTurn ? 15 : 9;
  if (move.type === 'advance-phase') adjustment += 2;
  if (move.type === 'hold' && state.turnNumber <= 3 && !playerHasUsefulInstant(player)) adjustment -= 3;

  const cards = moveCards(state, move);
  for (const card of cards) adjustment += commanderSynergy(player, card);
  if (move.type === 'sequence') adjustment += 0.8;
  if (move.type === 'attack') adjustment += (move.cardIds || []).reduce((sum, id) => sum + Math.max(-2, visibleAttackValue(state, playerId, cardById(state, id)) * 0.45), 0);

  const paymentPlans = move.type === 'sequence'
    ? (move.steps || []).map((step) => step.paymentPlan).filter(Boolean)
    : [move.paymentPlan].filter(Boolean);
  for (const plan of paymentPlans) {
    if (plan.preservedColors?.length) adjustment += Math.min(1.2, plan.preservedColors.length * 0.35);
    if (playerHasUsefulInstant(player) && plan.sources?.length && !plan.preservedColors?.length) adjustment -= 0.65;
  }
  const landEntries = move.type === 'sequence'
    ? (move.steps || []).filter((step) => ['play-land', 'advance-land'].includes(step.type)).map((step) => step.entryPlan)
    : (['play-land', 'advance-land'].includes(move.type) ? [move.entryPlan] : []);
  if (landEntries.some((entry) => entry?.tapped)) adjustment -= earlyTurn ? 0.8 : 0.35;
  if (landEntries.some((entry) => entry && !entry.tapped)) adjustment += 0.45;

  const boardWipeRisk = risk.categories.boardWipe.probability;
  if (['cast-permanent', 'cast-commander', 'sequence'].includes(move.type) && boardWipeRisk > 0.28) {
    const newCreatureCount = cards.filter(isCreature).length;
    adjustment -= newCreatureCount * boardWipeRisk * 3.2;
  }
  return adjustment;
}

function moveCards(state, move) {
  if (move.type === 'sequence') return (move.steps || []).map((step) => cardById(state, step.cardId)).filter(Boolean);
  const card = cardById(state, move.cardId);
  return card ? [card] : [];
}

function commanderSynergy(player, card) {
  const commanders = player.zones.command.length ? player.zones.command : player.zones.battlefield.filter((permanent) => permanent.commander);
  let score = 0;
  for (const commander of commanders) {
    const commanderText = String(commander.oracleText || '').toLocaleLowerCase();
    const cardText = String(card.oracleText || '').toLocaleLowerCase();
    const subtypes = String(card.typeLine || '').split('—')[1]?.trim().split(/\s+/) || [];
    if (subtypes.some((subtype) => subtype.length > 3 && commanderText.includes(subtype.toLocaleLowerCase()))) score += 1.5;
    if (/ninjutsu|combat damage/.test(commanderText) && (cardTraits(card).unblockable || cardTraits(card).flying || cardTraits(card).menace)) score += 1.4;
    if (/graveyard|dies|zombie/.test(commanderText) && (/graveyard|dies|zombie/.test(cardText) || /Zombie/.test(card.typeLine || ''))) score += 1.2;
    if (/artifact/.test(commanderText) && /Artifact/.test(card.typeLine || '')) score += 1.0;
    if (/enchantment/.test(commanderText) && /Enchantment/.test(card.typeLine || '')) score += 1.0;
  }
  return Math.min(3.5, score);
}

function playerHasUsefulInstant(player) {
  return player.zones.hand.some((card) => {
    const traits = cardTraits(card);
    return traits.instant && (traits.counterspell || traits.targetedRemoval || traits.protectionSpell || traits.combatTrick);
  });
}

function hasAvailableLandDrop(state, playerId) {
  const player = state.players[playerId];
  return ['main1', 'main2'].includes(phaseId(state))
    && Number(player.landPlaysThisTurn || 0) < 1
    && player.zones.hand.some((card) => isLand(card));
}

function playerScore(player, opponent, virtual = 0) {
  let score = Number(player.life || 0) * 0.34 - Number(player.poison || 0) * 3.8 + player.zones.hand.length * 2.25 + player.zones.library.length * 0.012 + virtual;
  const lowLife = player.life <= 12;
  for (const card of player.zones.battlefield) score += permanentValue(card, player.zones.battlefield, opponent.zones.battlefield, { lowLife });
  for (const card of player.zones.graveyard) {
    const traits = cardTraits(card);
    score += traits.recursion || traits.deathTrigger ? 0.38 : 0.05;
  }
  for (const card of player.zones.command) score += card.commander ? 1.0 : 0.2;
  for (const card of player.zones.exile) {
    if (/cast .* from exile|play .* from exile|suspend|foretell|adventure/i.test(card.oracleText || '')) score += 0.35;
  }
  const mana = manaDevelopmentSnapshot(player);
  score += mana.nextTurn * 0.48 + mana.available * 0.24 + mana.colors.length * 0.10;
  if (playerHasUsefulInstant(player) && mana.available > 0) score += 0.55;
  const highestCommanderDamage = Math.max(0, ...Object.values(player.commanderDamage || {}).map(Number));
  score -= highestCommanderDamage * 0.68;
  if (player.life <= 0 || player.poison >= 10 || highestCommanderDamage >= 21 || player.lost) score -= 1000;
  return score;
}

function boardScore(state, playerId) {
  const opponentId = otherPlayerId(state, playerId);
  return playerScore(state.players[playerId], state.players[opponentId], state._coach?.virtual?.[playerId] || 0)
    - playerScore(state.players[opponentId], state.players[playerId], state._coach?.virtual?.[opponentId] || 0);
}

function estimatedManaCapacity(player) {
  return manaDevelopmentSnapshot(player).available;
}

function rulesAwareResourceAdjustment(state, playerId) {
  const opponentId = otherPlayerId(state, playerId);
  const ours = manaDevelopmentSnapshot(state.players[playerId]);
  const theirs = manaDevelopmentSnapshot(state.players[opponentId]);
  return (ours.available - theirs.available) * 0.10
    + (ours.nextTurn - theirs.nextTurn) * 0.08
    + (ours.untappedSourceCount - theirs.untappedSourceCount) * 0.08;
}

function moveExposure(move, risk) {
  const categories = risk.categories;
  let probability = 0;
  if (['cast-permanent', 'cast-commander', 'cast-spell'].includes(move.type)) {
    probability = 1 - (1 - categories.counterspell.probability) * (1 - categories.removal.probability * (move.type === 'cast-spell' ? 0.15 : 1));
  }
  if (move.type === 'sequence') {
    const casts = move.steps.filter((step) => step.type.startsWith('cast')).length;
    probability = 1 - Math.pow((1 - categories.counterspell.probability) * (1 - categories.removal.probability * 0.65), Math.max(1, casts));
    probability = Math.max(probability, categories.boardWipe.probability * 0.7);
  }
  if (move.type === 'attack') {
    probability = 1 - (1 - categories.combatTrick.probability) * (1 - categories.protection.probability) * (1 - categories.flashThreat.probability);
  }
  if (move.type === 'hold') probability = 0.06;
  return clamp(probability, 0, 0.98);
}

function riskLabel(probability) {
  if (probability >= 0.6) return 'High';
  if (probability >= 0.32) return 'Moderate';
  if (probability >= 0.14) return 'Low–moderate';
  return 'Low';
}

function relevantRisks(move, risk) {
  const keys = move.type === 'attack'
    ? ['combatTrick', 'protection', 'flashThreat', 'removal']
    : ['counterspell', 'removal', 'boardWipe'];
  return keys.map((key) => risk.categories[key]).filter((entry) => entry.probability > 0.08).sort((a, b) => b.probability - a.probability);
}

function visibleReasonsForMove(state, playerId, move) {
  const player = state.players[playerId];
  const opponent = state.players[otherPlayerId(state, playerId)];
  const reasons = [];
  if (['play-land', 'advance-land'].includes(move.type)) {
    reasons.push('Makes the normal land drop and permanently increases future mana without spending mana.');
    if (move.entryPlan?.tapped) reasons.push(`${cardById(state, move.cardId)?.name || 'The land'} enters tapped, so it will not produce mana this turn.`);
    else reasons.push(`${cardById(state, move.cardId)?.name || 'The land'} is available as an untapped mana source this turn.`);
  }
  if (move.type === 'sequence') reasons.push('Uses sequencing and the exact remaining untapped mana sources rather than evaluating each spell in isolation.');
  const plans = move.type === 'sequence' ? (move.steps || []).map((step) => step.paymentPlan).filter(Boolean) : [move.paymentPlan].filter(Boolean);
  for (const plan of plans.slice(0, 2)) {
    if (plan.sources?.length) reasons.push(`Payment taps ${plan.sources.map((source) => `${source.name} for ${source.label}`).join(', ')}.`);
    if (plan.preservedColors?.length) reasons.push(`The payment leaves ${plan.preservedColors.join('/')} available for visible instant-speed options.`);
  }
  for (const card of moveCards(state, move)) {
    const traits = cardTraits(card);
    const abilities = [];
    if (traits.flying) abilities.push('flying');
    if (traits.deathtouch) abilities.push('deathtouch');
    if (traits.doubleStrike) abilities.push('double strike');
    if (traits.indestructible) abilities.push('indestructible');
    if (traits.hexproof || traits.ward) abilities.push(traits.hexproof ? 'hexproof' : 'ward');
    if (traits.deathTrigger) abilities.push('a death trigger');
    if (traits.attackTrigger) abilities.push('an attack trigger');
    if (traits.combatDamageTrigger) abilities.push('a combat-damage trigger');
    if (traits.activatedAbility) abilities.push('an activated ability');
    if (traits.staticEffect) abilities.push('a static effect');
    if (traits.targetedRemoval) abilities.push('targeted removal');
    if (traits.draw) abilities.push('card draw');
    if (abilities.length) reasons.push(`${card.name} contributes ${abilities.slice(0, 4).join(', ')}.`);
    const synergy = commanderSynergy(player, card);
    if (synergy >= 1) reasons.push(`${card.name} directly supports the visible commander/deck plan.`);
  }
  if (move.type === 'attack') {
    const attackers = (move.cardIds || []).map((id) => cardById(state, id)).filter(Boolean);
    const blockers = opponent.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
    const evasive = attackers.filter((card) => {
      const traits = cardTraits(card);
      return traits.flying || traits.unblockable || traits.menace;
    });
    if (evasive.length) reasons.push(`${evasive.map((card) => card.name).join(', ')} has relevant evasion against the visible blockers.`);
    if (!blockers.length) reasons.push('The opponent has no untapped visible creature blockers.');
  }
  if (move.type === 'hold' && playerHasUsefulInstant(player)) reasons.push('Holding preserves a visible instant-speed answer in your hand.');
  return reasons.slice(0, 5);
}

function memoryReasons(risk) {
  const reasons = [];
  if (risk.publicMemory.knownHand.length) reasons.push(`Known in the opponent's hand: ${risk.publicMemory.knownHand.join(', ')}.`);
  const used = Object.entries(risk.publicMemory.usedInteraction || {});
  if (used.length) reasons.push(`Already observed: ${used.map(([type, count]) => `${count} ${INTERACTION_MODELS[type]?.label || type}`).join(', ')}.`);
  if (risk.publicMemory.behavior?.consecutivePassesWithOpenMana) reasons.push(`The opponent has repeatedly passed with mana open (${risk.publicMemory.behavior.consecutivePassesWithOpenMana} consecutive turn(s)).`);
  return reasons.slice(0, 3);
}

function explainMove(state, playerId, move, average, risk, responseStats) {
  const exposure = moveExposure(move, risk);
  const relevant = relevantRisks(move, risk);
  const visibleReasons = visibleReasonsForMove(state, playerId, move);
  const publicReasons = memoryReasons(risk);
  const riskText = relevant.length
    ? `${relevant.map((entry) => `${Math.round(entry.probability * 100)}% ${entry.label}`).join('; ')} based on open mana, hand size, colors, and public history.`
    : 'No major instant-speed interaction is strongly suggested by the current public information.';
  const headline = visibleReasons[0] || (average >= 0 ? 'This line improves the visible position.' : 'This line limits immediate downside but may lose tempo.');
  return {
    headline,
    visibleReasons,
    publicMemoryReasons: publicReasons,
    hiddenRisk: riskText,
    riskLevel: riskLabel(exposure),
    riskProbability: exposure,
    sampledResponses: responseStats,
  };
}

function evaluateMove(state, info, risk, playerId, move, rollouts, seed) {
  let total = 0;
  let high = -Infinity;
  let low = Infinity;
  const scores = [];
  const responseCounts = {};
  const baseSimulation = simulationStateFromInformationSet(state, info);
  const profile = buildStrategyProfile(state.players[playerId]);
  const actionResult = applyTacticalAction(baseSimulation, playerId, move, { autoResolve: true });
  if (!actionResult.ok) {
    return {
      ...move, score: -999, range: [-999, -999], stdev: 0, riskProbability: 1,
      explanationDetails: explainMove(state, playerId, move, -999, risk, {}),
    };
  }
  const deterministicState = actionResult.state;
  for (let i = 0; i < rollouts; i += 1) {
    const rng = mulberry32(seed + i * 2654435761 + hashString(move.label));
    const simulated = deepClone(deterministicState);
    const scenario = sampleHiddenScenario(risk, rng);
    for (const category of scenario.categories) responseCounts[category] = Number(responseCounts[category] || 0) + 1;
    respondToMove(simulated, playerId, move, scenario, rng);
    const score = tacticalStateScore(simulated, playerId, profile)
      + strategicAdjustment(state, playerId, move, risk)
      + actionStrategyBonus(move, state, playerId, profile);
    scores.push(score);
    total += score;
    high = Math.max(high, score);
    low = Math.min(low, score);
  }
  const average = total / Math.max(1, rollouts);
  const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / Math.max(1, scores.length);
  const stdev = Math.sqrt(variance);
  const responseStats = Object.fromEntries(Object.entries(responseCounts).map(([key, count]) => [key, Number((count / Math.max(1, rollouts)).toFixed(3))]));
  const explanationDetails = explainMove(state, playerId, move, average, risk, responseStats);
  explanationDetails.strategy = `Visible plan: ${strategyLabel(profile)}.`;
  if (!explanationDetails.visibleReasons.includes(explanationDetails.strategy)) explanationDetails.visibleReasons.push(explanationDetails.strategy);
  return {
    ...move,
    score: Number(average.toFixed(2)),
    range: [Number(low.toFixed(1)), Number(high.toFixed(1))],
    stdev: Number(stdev.toFixed(2)),
    riskProbability: moveExposure(move, risk),
    explanationDetails,
  };
}

function analyzePosition(state, playerId = state.activePlayerId, rollouts = state.settings.coachRollouts || 450) {
  ensureKnowledge(state);
  const informationSet = buildInformationSet(state, playerId);
  const risk = buildInteractionRisk(state, playerId);
  const moves = possibleMoves(state, playerId);
  const seed = analysisSeed(state, playerId);
  const perMoveRollouts = Math.max(40, Math.min(240, Number(rollouts || 80)));
  const results = moves.map((move) => evaluateMove(state, informationSet, risk, playerId, move, perMoveRollouts, seed));
  results.sort((a, b) => b.score - a.score);

  const best = results[0];
  const second = results[1];
  if (best) {
    const margin = second ? best.score - second.score : Math.max(1, Math.abs(best.score) * 0.15);
    const uncertainty = best.stdev + best.riskProbability * 6;
    best.confidence = Math.round(clamp(56 + margin * 4.5 + Math.sqrt(perMoveRollouts) * 0.7 - uncertainty * 2.2, 20, 96));
    const safer = results
      .slice(1)
      .filter((result) => result.riskProbability + 0.08 < best.riskProbability && result.score >= best.score - 5.5)
      .sort((a, b) => (a.riskProbability - b.riskProbability) || (b.score - a.score))[0];
    best.saferAlternative = safer ? { label: safer.label, score: safer.score, riskLevel: riskLabel(safer.riskProbability) } : null;
    best.explanation = best.explanationDetails.headline;
  }
  for (const result of results.slice(1)) {
    result.confidence = Math.round(clamp(48 + Math.sqrt(perMoveRollouts) * 0.5 - result.stdev * 1.8 - result.riskProbability * 18, 18, 88));
    result.saferAlternative = null;
    result.explanation = result.explanationDetails.headline;
  }

  return {
    moves,
    results,
    baseline: tacticalStateScore(simulationStateFromInformationSet(state, informationSet), playerId, buildStrategyProfile(state.players[playerId])),
    rollouts: perMoveRollouts,
    searchType: 'Rules-aware tactical information-set Monte Carlo search (3-ply beam look-ahead)',
    informationSetAudit: informationSet.audit,
    risk,
  };
}

function defenseAdvice(state) {
  const attackerPlayer = Object.values(state.players).find((player) => player.zones.battlefield.some((card) => card.attacking));
  if (!attackerPlayer) return null;
  const defenderId = otherPlayerId(state, attackerPlayer.id);
  const defender = state.players[defenderId];
  const attackers = attackerPlayer.zones.battlefield.filter((card) => card.attacking);
  const blockers = defender.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
  const assignments = [];
  const unused = [...blockers];
  const ordered = [...attackers].sort((a, b) => permanentValue(b, attackerPlayer.zones.battlefield, defender.zones.battlefield) - permanentValue(a, attackerPlayer.zones.battlefield, defender.zones.battlefield));
  let expectedDamage = 0;

  for (const attacker of ordered) {
    const legal = unused.filter((blocker) => canBlock(attacker, blocker, defender.zones.battlefield));
    const traits = cardTraits(attacker);
    let chosen = [];
    if (traits.menace && legal.length >= 2) {
      const pairs = [];
      for (let i = 0; i < legal.length; i += 1) for (let j = i + 1; j < legal.length; j += 1) pairs.push([legal[i], legal[j]]);
      pairs.sort((a, b) => combatTradeScore(attacker, a, attackerPlayer.zones.battlefield, defender.zones.battlefield) - combatTradeScore(attacker, b, attackerPlayer.zones.battlefield, defender.zones.battlefield));
      chosen = pairs[0] || [];
    } else if (legal.length) {
      legal.sort((a, b) => combatTradeScore(attacker, [a], attackerPlayer.zones.battlefield, defender.zones.battlefield) - combatTradeScore(attacker, [b], attackerPlayer.zones.battlefield, defender.zones.battlefield));
      chosen = [legal[0]];
    }
    const outcome = combatOutcome(attacker, chosen, attackerPlayer.zones.battlefield, defender.zones.battlefield);
    expectedDamage += outcome.playerDamage;
    if (chosen.length) {
      const attackerValue = permanentValue(attacker, attackerPlayer.zones.battlefield, defender.zones.battlefield);
      const blockerValue = chosen.reduce((sum, blocker) => sum + permanentValue(blocker, defender.zones.battlefield, attackerPlayer.zones.battlefield), 0);
      const deathtouchWarning = chosen.some((blocker) => cardTraits(blocker).deathtouch);
      assignments.push({
        attacker: attacker.name,
        attackerId: attacker.instanceId,
        blocker: chosen.map((card) => card.name).join(' + '),
        blockerIds: chosen.map((card) => card.instanceId),
        reason: deathtouchWarning
          ? `deathtouch makes this block trade up despite the blocker's size`
          : outcome.attackerDies && blockerValue < attackerValue
            ? 'trades lower-value material for the more valuable attacker'
            : outcome.playerDamage === 0
              ? 'prevents the most useful visible attack'
              : `limits trample damage to ${outcome.playerDamage}`,
      });
      for (const blocker of chosen) unused.splice(unused.findIndex((card) => card.instanceId === blocker.instanceId), 1);
    }
  }
  return { attackerName: attackerPlayer.name, defenderId, defenderName: defender.name, assignments, expectedDamage };
}


return { buildInformationSet, possibleMoves, buildInteractionRisk, analyzePosition, defenseAdvice };
})();

// ---- game.js ----
__modules["./game.js"] = (() => {
const { PHASES, ZONE_LABELS } = __modules["./constants.js"];
const { drawCards, findCard, updateState } = __modules["./state.js"];
const { recordPublicEvent, recordTurnPass, recordZoneTransition } = __modules["./knowledge.js"];
const { applySpellPayment, attackLegality, landEntryPlan, maximumHandSize, moveLegality, spellCastLegality, stackDestination } = __modules["./rules.js"];
const { deepClone, formatManaBundle, isCreature, isLand, manaProductionChoices, shuffle, uid } = __modules["./utils.js"];

function otherPlayerId(state, playerId) {
  return Object.keys(state.players).find((id) => id !== playerId);
}

function clearCardRelations(draft, card) {
  for (const player of Object.values(draft.players)) {
    for (const permanent of player.zones.battlefield) {
      if (permanent.attachedTo === card.instanceId) permanent.attachedTo = null;
      permanent.attachments = (permanent.attachments || []).filter((id) => id !== card.instanceId);
      if (permanent.blocking === card.instanceId) permanent.blocking = null;
      permanent.blockedBy = (permanent.blockedBy || []).filter((id) => id !== card.instanceId);
    }
  }
}

function oracleAbilityLines(card) {
  return String(card?.oracleText || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z{])/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function effectConditionText(text = '') {
  const match = String(text).match(/\b(if|only if|as long as|unless)\b(.+?)(?:[.;]|$)/i);
  return match ? `${match[1]}${match[2]}`.trim() : '';
}

function makePendingEffect(draft, {
  sourceCard = null,
  controllerId = null,
  kind = 'manual',
  text = 'Resolve this effect manually.',
  conditionText = '',
  optional = false,
} = {}) {
  const normalizedCondition = conditionText || effectConditionText(text);
  return {
    id: uid('effect'),
    sourceCardId: sourceCard?.instanceId || null,
    sourceName: sourceCard?.name || 'Manual effect',
    controllerId: controllerId || sourceCard?.controller || draft.activePlayerId,
    kind,
    text,
    conditionText: normalizedCondition,
    conditionStatus: normalizedCondition ? 'unconfirmed' : 'not-required',
    optional: Boolean(optional || /\byou may\b/i.test(text)),
    createdTurn: draft.turnNumber,
    createdPhase: PHASES[draft.phaseIndex]?.id || 'untap',
  };
}

function pendingEffectExists(draft, sourceCardId, kind, text) {
  return draft.pendingTriggers.some((effect) =>
    effect.sourceCardId === sourceCardId
    && effect.kind === kind
    && effect.text === text
  );
}

function queuePendingEffect(draft, effectData) {
  const effect = makePendingEffect(draft, effectData);
  if (!pendingEffectExists(draft, effect.sourceCardId, effect.kind, effect.text)) {
    draft.pendingTriggers.push(effect);
  }
  return effect;
}

function cardMatchesEventSubject(card, phrase = '') {
  const type = String(card?.typeLine || '').toLowerCase();
  const normalized = phrase.toLowerCase();
  if (normalized.includes('creature') && !type.includes('creature')) return false;
  if (normalized.includes('artifact') && !type.includes('artifact')) return false;
  if (normalized.includes('enchantment') && !type.includes('enchantment')) return false;
  if (normalized.includes('land') && !type.includes('land')) return false;
  if (normalized.includes('token') && !card?.token) return false;
  return true;
}

function enqueueBattlefieldEntryEffects(draft, enteringCard, originalZone) {
  if (originalZone === 'battlefield') return;
  const allPermanents = Object.values(draft.players).flatMap((player) => player.zones.battlefield);
  for (const sourceCard of allPermanents) {
    for (const line of oracleAbilityLines(sourceCard)) {
      if (!/\b(when|whenever)\b.+\benters(?: the battlefield)?\b/i.test(line)) continue;
      const ownEntry = sourceCard.instanceId === enteringCard.instanceId
        && (/when (?:this permanent|this creature|this artifact|this enchantment|[^\n,]+) enters/i.test(line)
          || line.toLowerCase().includes(sourceCard.name.toLowerCase()));
      const anotherEntry = sourceCard.instanceId !== enteringCard.instanceId
        && /\b(another|a|one or more)\b.+\benters/i.test(line)
        && cardMatchesEventSubject(enteringCard, line);
      const underControl = !/under an opponent'?s control/i.test(line)
        || enteringCard.controller !== sourceCard.controller;
      if ((ownEntry || anotherEntry) && underControl) {
        queuePendingEffect(draft, {
          sourceCard,
          controllerId: sourceCard.controller,
          kind: 'battlefield-trigger',
          text: line,
        });
      }
    }
  }
}

function phaseLineMatches(line, phaseId, sourceControllerId, activePlayerId) {
  const text = line.toLowerCase();
  if (!text.includes('at the beginning of')) return false;
  const phasePatterns = {
    upkeep: /\bupkeep\b/,
    draw: /\bdraw step\b/,
    combat: /\b(beginning of combat|combat on)\b/,
    end: /\b(end step|end of turn)\b/,
  };
  if (!phasePatterns[phaseId]?.test(text)) return false;
  if (/\byour\b/.test(text) && !/\beach player'?s|each upkeep|each end step/i.test(text)) {
    return sourceControllerId === activePlayerId;
  }
  if (/each opponent'?s/.test(text)) return sourceControllerId !== activePlayerId;
  return true;
}

function enqueuePhaseEffects(draft, phaseId) {
  const activePlayerId = draft.activePlayerId;
  for (const player of Object.values(draft.players)) {
    for (const sourceCard of player.zones.battlefield) {
      for (const line of oracleAbilityLines(sourceCard)) {
        if (!phaseLineMatches(line, phaseId, sourceCard.controller, activePlayerId)) continue;
        queuePendingEffect(draft, {
          sourceCard,
          controllerId: sourceCard.controller,
          kind: `${phaseId}-trigger`,
          text: line,
        });
      }
    }
  }
}

function activatedAbilityLines(card) {
  return oracleAbilityLines(card).filter((line) => {
    if (!line.includes(':')) return false;
    if (/add \{[WUBRGC]\}/i.test(line) && /^\s*\{T\}/i.test(line)) return false;
    return true;
  });
}

function phaseAdvanceBlocker(state) {
  if (state.openingHands?.active) return 'Keep or mulligan both opening hands before starting the first turn.';
  if (state.stack.length) return 'Resolve or counter every object on the stack before advancing.';
  if (state.pendingTriggers.length) return `Resolve or dismiss ${state.pendingTriggers.length} pending battlefield effect${state.pendingTriggers.length === 1 ? '' : 's'} before advancing.`;
  if (PHASES[state.phaseIndex]?.id === 'end') {
    const player = state.players[state.activePlayerId];
    const maximum = maximumHandSize(state, state.activePlayerId);
    if (!maximum.unlimited && player.zones.hand.length > maximum.value) {
      return `${player.name} must discard down to ${maximum.label} card${maximum.value === 1 ? '' : 's'} before ending the turn.`;
    }
  }
  if (PHASES[state.phaseIndex]?.id === 'combat') {
    const attackers = Object.values(state.players).flatMap((player) => player.zones.battlefield).filter((card) => card.attacking);
    if (attackers.length) return 'Combat is still marked as active. Resolve combat manually or stop the attackers before advancing.';
  }
  return '';
}

function moveCard(instanceId, targetPlayerId, targetZone, { force = false, libraryPosition = 'top' } = {}) {
  const currentState = window.CommanderForge.getState();
  const source = findCard(instanceId, currentState);
  if (!source) return { ok: false, message: 'Card not found.' };

  const targetPlayer = currentState.players[targetPlayerId];
  const castAttempt = ['hand', 'command'].includes(source.zone)
    && (targetZone === 'stack' || (targetZone === 'battlefield' && !isLand(source.card)));
  const tax = source.zone === 'command' ? 2 * (targetPlayer.commanderCastCount[source.card.instanceId] || 0) : 0;
  let autoPlan = null;
  const legalityState = currentState;
  const landPlan = source.zone === 'hand' && targetZone === 'battlefield' && isLand(source.card)
    ? landEntryPlan(source.card, targetPlayer, { opponentCount: Math.max(1, Object.keys(currentState.players).length - 1), payLife: 'auto' })
    : null;

  if (castAttempt) {
    const castLegality = spellCastLegality(currentState, targetPlayerId, source.card, source.zone, {
      useUntappedSources: currentState.settings.manaMode === 'auto',
    });
    autoPlan = castLegality.payment;
  }

  const legality = moveLegality(legalityState, source.card, source, targetPlayerId, targetZone);
  if (!legality.legal && !force) {
    if (currentState.settings.rulesMode === 'strict') return { ok: false, message: legality.reasons.join(' ') };
    const override = confirm(`${legality.reasons.join('\n')}\n\nUse a manual rules override for this move?`);
    if (!override) return { ok: false, message: 'Move cancelled.' };
  }

  if (source.card.commander && source.zone !== 'command' && ['graveyard', 'exile', 'hand', 'library'].includes(targetZone) && currentState.settings.confirmCommanderMoves) {
    const toCommand = confirm(`${source.card.name} is a commander.\n\nPress OK to move it to the command zone.\nPress Cancel to leave it in ${ZONE_LABELS[targetZone]}.`);
    if (toCommand) targetZone = 'command';
  }

  const autoManaText = autoPlan?.sources?.length
    ? ` Auto-paid by tapping ${autoPlan.sources.map((item) => `${item.name} for ${item.label || formatManaBundle(item.mana)}`).join(', ')}.`
    : '';
  const landEntryText = landPlan
    ? ` ${landPlan.tapped ? 'Entered tapped' : 'Entered untapped'}${landPlan.lifePaid ? ` after paying ${landPlan.lifePaid} life` : ''}.`
    : '';

  updateState((draft) => {
    const located = findCard(instanceId, draft);
    if (!located) return;
    const card = located.container.splice(located.index, 1)[0];
    const destinationPlayer = draft.players[targetPlayerId];
    const originalZone = located.zone;

    if (castAttempt && autoPlan?.ok) applySpellPayment(draft, targetPlayerId, autoPlan);

    if (targetZone === 'stack') {
      card.controller = targetPlayerId;
      card.attacking = false;
      if (['hand', 'command'].includes(originalZone)) {
        if (originalZone === 'command') destinationPlayer.commanderCastCount[card.instanceId] = (destinationPlayer.commanderCastCount[card.instanceId] || 0) + 1;
      }
      draft.stack.push(card);
      draft.priorityPlayerId = targetPlayerId;
      draft.consecutivePasses = 0;
    } else {
      card.controller = targetPlayerId;
      card.attacking = false;
      if (targetZone === 'battlefield') {
        if (isLand(card) && originalZone === 'hand') destinationPlayer.landPlaysThisTurn += 1;
        if (!isLand(card) && ['hand', 'command'].includes(originalZone)) {
              if (originalZone === 'command') destinationPlayer.commanderCastCount[card.instanceId] = (destinationPlayer.commanderCastCount[card.instanceId] || 0) + 1;
        }
        card.summoningSick = isCreature(card);
        if (isLand(card) && originalZone === 'hand' && landPlan) {
          card.tapped = Boolean(landPlan.tapped);
          destinationPlayer.life -= Number(landPlan.lifePaid || 0);
        } else card.tapped = false;
      } else {
        card.summoningSick = false;
        card.tapped = false;
      }
      if (targetZone === 'library') {
        if (libraryPosition === 'bottom') destinationPlayer.zones.library.push(card);
        else destinationPlayer.zones.library.unshift(card);
      } else destinationPlayer.zones[targetZone].push(card);
    }
    if (originalZone === 'battlefield' && targetZone !== 'battlefield') clearCardRelations(draft, card);
    recordZoneTransition(draft, {
      card,
      actorId: targetPlayerId,
      subjectPlayerId: card.owner,
      fromZone: originalZone,
      toZone: targetZone,
      libraryPosition,
      castAttempt,
    });
    if (targetZone === 'battlefield') enqueueBattlefieldEntryEffects(draft, card, originalZone);
    draft.selected = { instanceId: card.instanceId };
  }, { log: `${source.card.name}: ${ZONE_LABELS[source.zone]} → ${ZONE_LABELS[targetZone]}.${autoManaText}${landEntryText}` });
  return { ok: true, message: autoManaText ? autoManaText.trim() : 'Card moved.' };
}

function tapForMana(instanceId, choiceIndex = 0) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'Only battlefield permanents can produce mana here.' };
  if (found.card.tapped) return { ok: false, message: `${found.card.name} is already tapped.` };
  const choices = manaProductionChoices(found.card);
  const choice = choices[Number(choiceIndex)];
  if (!choice) return { ok: false, message: `${found.card.name} does not have that listed mana choice.` };
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    located.card.tapped = true;
    const player = draft.players[located.card.controller];
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
      player.mana[color] = Number(player.mana[color] || 0) + Number(choice.mana?.[color] || 0);
    }
  }, { log: `${found.card.name} tapped for ${choice.label || formatManaBundle(choice.mana)}.` });
  return { ok: true, message: `Added ${choice.label || formatManaBundle(choice.mana)} mana.` };
}

function toggleTap(instanceId, { mana = true } = {}) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'Only battlefield permanents can be tapped here.' };
  if (!found.card.tapped && mana && ['assisted', 'auto'].includes(current.settings.manaMode)) {
    const choices = manaProductionChoices(found.card);
    if (choices.length === 1) return tapForMana(instanceId, 0);
    if (choices.length > 1) return { ok: false, message: `Choose ${choices.map((choice) => choice.label).join(' or ')} from the card menu.` };
  }
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    located.card.tapped = !located.card.tapped;
  }, { log: `${found.card.name} ${found.card.tapped ? 'untapped' : 'tapped'}.` });
  return { ok: true };
}

function toggleAttack(instanceId) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return { ok: false, message: 'Card not found.' };
  if (!found.card.attacking) {
    const legality = attackLegality(current, found.card);
    if (!legality.legal) {
      if (current.settings.rulesMode === 'strict') return { ok: false, message: legality.reasons.join(' ') };
      if (!confirm(`${legality.reasons.join('\n')}\n\nMark as attacking anyway?`)) return { ok: false, message: 'Cancelled.' };
    }
  }
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    located.card.attacking = !located.card.attacking;
    located.card.blocking = null;
    if (located.card.attacking) {
      located.card.tapped = true;
      recordPublicEvent(draft, {
        type: 'attack',
        actorId: located.card.controller,
        subjectPlayerId: located.card.controller,
        card: located.card,
        cards: [located.card],
        meaningful: true,
      });
    } else {
      recordPublicEvent(draft, {
        type: 'attack_cancelled',
        actorId: located.card.controller,
        subjectPlayerId: located.card.controller,
        card: located.card,
      });
    }
  }, { log: `${found.card.name} ${found.card.attacking ? 'stopped attacking' : 'was declared as an attacker'}.` });
  return { ok: true };
}

function addCounter(instanceId, counter, delta) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return;
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    const next = Math.max(0, Number(located.card.counters[counter] || 0) + delta);
    if (next === 0) delete located.card.counters[counter];
    else located.card.counters[counter] = next;
  }, { log: `${found.card.name}: ${delta > 0 ? 'added' : 'removed'} ${counter} counter.` });
}


function tokenXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

function tokenImageData(token) {
  const frame = token.frameColor || '#1f3329';
  const accent = token.accentColor || '#d4a654';
  const text = token.textColor || '#f4f1e8';
  const name = tokenXml(token.name || 'Token');
  const type = tokenXml(token.typeLine || 'Token Creature');
  const stats = `${tokenXml(token.power ?? 1)}/${tokenXml(token.toughness ?? 1)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${frame}"/><stop offset="1" stop-color="#0b0f0c"/></linearGradient></defs><rect width="500" height="700" rx="38" fill="url(#g)"/><rect x="22" y="22" width="456" height="656" rx="28" fill="none" stroke="${accent}" stroke-width="8"/><rect x="42" y="42" width="416" height="82" rx="18" fill="#000000" fill-opacity=".35"/><text x="64" y="94" fill="${text}" font-family="Arial,sans-serif" font-size="36" font-weight="700">${name}</text><circle cx="250" cy="330" r="142" fill="none" stroke="${accent}" stroke-width="12" opacity=".75"/><path d="M250 176l35 105 111 2-89 66 32 106-89-63-89 63 32-106-89-66 111-2z" fill="${accent}" opacity=".28"/><rect x="42" y="520" width="416" height="88" rx="18" fill="#000000" fill-opacity=".42"/><text x="64" y="572" fill="${text}" font-family="Arial,sans-serif" font-size="25">${type}</text><rect x="354" y="605" width="104" height="56" rx="14" fill="${accent}"/><text x="406" y="644" text-anchor="middle" fill="#11160f" font-family="Arial,sans-serif" font-size="31" font-weight="800">${stats}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createToken(playerId, token) {
  const card = {
    instanceId: uid('token'),
    scryfallId: null,
    name: token.name || 'Token',
    manaCost: '',
    manaValue: 0,
    typeLine: token.typeLine || 'Token Creature',
    oracleText: token.oracleText || '',
    power: String(token.power ?? 1),
    toughness: String(token.toughness ?? 1),
    keywords: token.keywords || [],
    colors: [],
    colorIdentity: [],
    legalities: {},
    image: tokenImageData(token),
    imageSmall: tokenImageData(token),
    owner: playerId,
    controller: playerId,
    tapped: Boolean(token.tapped),
    summoningSick: true,
    attacking: false,
    blocking: null,
    blockedBy: [],
    faceDown: false,
    token: true,
    commander: false,
    counters: {},
    notes: '',
    attachedTo: null,
    attachments: [],
    tokenStyle: { frameColor: token.frameColor || '#1f3329', accentColor: token.accentColor || '#d4a654', textColor: token.textColor || '#f4f1e8' },
  };
  updateState((draft) => { draft.players[playerId].zones.battlefield.push(card); }, { log: `${draftName(playerId)} created a ${card.name} token.` });
  return card;
}

function draftName(playerId) {
  return window.CommanderForge.getState().players[playerId]?.name || 'Player';
}

function copyAsToken(instanceId) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return;
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    const copy = deepClone(located.card);
    copy.instanceId = uid('copy');
    copy.token = true;
    copy.commander = false;
    copy.tapped = false;
    copy.attacking = false;
    copy.blocking = null;
    copy.blockedBy = [];
    copy.attachedTo = null;
    copy.attachments = [];
    copy.summoningSick = isCreature(copy);
    copy.counters = {};
    draft.players[located.card.controller].zones.battlefield.push(copy);
  }, { log: `Created a token copy of ${found.card.name}.` });
}

function adjustPlayer(playerId, field, delta) {
  updateState((draft) => {
    const player = draft.players[playerId];
    player[field] = Number(player[field] || 0) + delta;
    if (field === 'poison') player[field] = Math.max(0, player[field]);
    checkLosses(draft);
  }, { log: `${draftName(playerId)}: ${field} ${delta >= 0 ? '+' : ''}${delta}.` });
}

function adjustCommanderDamage(targetPlayerId, sourceCardId, delta) {
  updateState((draft) => {
    const target = draft.players[targetPlayerId];
    target.commanderDamage[sourceCardId] = Math.max(0, Number(target.commanderDamage[sourceCardId] || 0) + delta);
    checkLosses(draft);
  }, { log: `${draftName(targetPlayerId)}: commander damage ${delta >= 0 ? '+' : ''}${delta}.` });
}

function adjustMana(playerId, color, delta) {
  updateState((draft) => {
    const player = draft.players[playerId];
    player.mana[color] = Math.max(0, Number(player.mana[color] || 0) + delta);
  }, { snapshot: false });
}

function clearMana(playerId) {
  updateState((draft) => { draft.players[playerId].mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }; }, { log: `${draftName(playerId)} cleared their mana pool.` });
}

function draw(playerId, amount = 1) {
  updateState((draft) => { drawCards(draft, playerId, amount); }, { log: `${draftName(playerId)} drew ${amount} card${amount === 1 ? '' : 's'}.` });
}

function mill(playerId, amount = 1) {
  updateState((draft) => {
    const player = draft.players[playerId];
    for (let i = 0; i < amount; i += 1) {
      const card = player.zones.library.shift();
      if (!card) break;
      player.zones.graveyard.push(card);
      recordPublicEvent(draft, {
        type: 'milled',
        actorId: playerId,
        subjectPlayerId: playerId,
        card,
        fromZone: 'library',
        toZone: 'graveyard',
        meaningful: true,
      });
    }
  }, { log: `${draftName(playerId)} milled ${amount} card${amount === 1 ? '' : 's'}.` });
}

function shuffleLibrary(playerId) {
  updateState((draft) => {
    draft.players[playerId].zones.library = shuffle(draft.players[playerId].zones.library);
    recordPublicEvent(draft, {
      type: 'shuffled',
      actorId: playerId,
      subjectPlayerId: playerId,
      meaningful: true,
    });
  }, { log: `${draftName(playerId)} shuffled their library.` });
}

function nextPhase() {
  const current = window.CommanderForge.getState();
  const blocked = phaseAdvanceBlocker(current);
  if (blocked) return { ok: false, message: blocked };

  const nextIndex = (current.phaseIndex + 1) % PHASES.length;
  updateState((draft) => {
    if (nextIndex === 0) {
      recordTurnPass(draft, draft.activePlayerId);
      draft.turnNumber += 1;
      draft.activePlayerId = otherPlayerId(draft, draft.activePlayerId);
      const active = draft.players[draft.activePlayerId];
      active.landPlaysThisTurn = 0;
      active.zones.battlefield.forEach((card) => {
        card.tapped = false;
        card.attacking = false;
        card.blocking = null;
        card.blockedBy = [];
        card.summoningSick = false;
        card.damageMarked = 0;
        card.deathtouchDamaged = false;
      });
      active.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    }
    draft.phaseIndex = nextIndex;
    draft.priorityPlayerId = draft.activePlayerId;
    draft.consecutivePasses = 0;
    const active = draft.players[draft.activePlayerId];
    if (PHASES[nextIndex].id === 'draw' && draft.settings.autoDraw) drawCards(draft, active.id, 1);
    if (PHASES[nextIndex].id !== 'combat') {
      active.zones.battlefield.forEach((card) => {
        card.attacking = false;
        card.blocking = null;
        card.blockedBy = [];
      });
    }
    enqueuePhaseEffects(draft, PHASES[nextIndex].id);
  }, { log: nextIndex === 0 ? `Turn passed to ${current.players[otherPlayerId(current, current.activePlayerId)].name}.` : `Phase: ${PHASES[nextIndex].label}.` });
  return { ok: true };
}

function setPhase(index, { force = false } = {}) {
  const current = window.CommanderForge.getState();
  const blocked = phaseAdvanceBlocker(current);
  if (blocked && !force) return { ok: false, message: blocked };
  const safeIndex = Math.max(0, Math.min(PHASES.length - 1, index));
  updateState((draft) => {
    draft.phaseIndex = safeIndex;
    draft.priorityPlayerId = draft.activePlayerId;
    draft.consecutivePasses = 0;
    enqueuePhaseEffects(draft, PHASES[safeIndex].id);
  }, { log: `Phase set to ${PHASES[safeIndex].label}.` });
  return { ok: true };
}

function switchActivePlayer() {
  const current = window.CommanderForge.getState();
  const next = otherPlayerId(current, current.activePlayerId);
  updateState((draft) => { draft.activePlayerId = next; }, { log: `${current.players[next].name} is now active.` });
}

function resolveStackTop() {
  const current = window.CommanderForge.getState();
  const card = current.stack.at(-1);
  if (!card) return { ok: false, message: 'The stack is empty.' };
  const destination = stackDestination(card);
  updateState((draft) => {
    const resolved = draft.stack.pop();
    if (destination === 'battlefield') {
      resolved.summoningSick = isCreature(resolved);
      draft.players[resolved.controller].zones.battlefield.push(resolved);
      enqueueBattlefieldEntryEffects(draft, resolved, 'stack');
    } else draft.players[resolved.owner].zones.graveyard.push(resolved);
    draft.priorityPlayerId = draft.activePlayerId;
    draft.consecutivePasses = 0;
    recordPublicEvent(draft, {
      type: 'resolved',
      actorId: resolved.controller,
      subjectPlayerId: resolved.owner,
      card: resolved,
      fromZone: 'stack',
      toZone: destination,
      meaningful: true,
    });
  }, { log: `${card.name} resolved to ${ZONE_LABELS[destination]}.` });
  return { ok: true };
}

function counterStackTop() {
  const current = window.CommanderForge.getState();
  const card = current.stack.at(-1);
  if (!card) return;
  const toCommand = card.commander && current.settings.confirmCommanderMoves
    ? confirm(`${card.name} was countered. Press OK for the command zone, or Cancel for the graveyard.`)
    : false;
  updateState((draft) => {
    const countered = draft.stack.pop();
    const destination = toCommand ? 'command' : 'graveyard';
    draft.players[countered.owner].zones[destination].push(countered);
    draft.priorityPlayerId = draft.activePlayerId;
    draft.consecutivePasses = 0;
    recordPublicEvent(draft, {
      type: 'countered',
      actorId: countered.controller,
      subjectPlayerId: countered.owner,
      card: countered,
      fromZone: 'stack',
      toZone: destination,
      meaningful: true,
    });
  }, { log: `${card.name} was countered${toCommand ? ' and returned to the command zone' : ''}.` });
}

function mulligan(playerId) {
  const current = window.CommanderForge.getState();
  const playerName = current.players[playerId].name;
  updateState((draft) => {
    const player = draft.players[playerId];
    player.zones.library = shuffle([...player.zones.library, ...player.zones.hand]);
    player.zones.hand = [];
    player.mulligans = Number(player.mulligans || 0) + 1;
    drawCards(draft, playerId, 7);
    draft.openingHands ||= { active: true, kept: { p1: false, p2: false }, bottomRequired: { p1: 0, p2: 0 } };
    draft.openingHands.active = true;
    draft.openingHands.kept[playerId] = false;
    draft.openingHands.bottomRequired[playerId] = Math.max(0, player.mulligans - 1);
  }, { log: `${playerName} took mulligan ${Number(current.players[playerId].mulligans || 0) + 1}.` });
  return Math.max(0, Number(current.players[playerId].mulligans || 0));
}

function keepOpeningHand(playerId, bottomCardIds = []) {
  const current = window.CommanderForge.getState();
  if (!current.openingHands?.active) return { ok: false, message: 'Opening-hand decisions are already complete.' };
  const required = Number(current.openingHands.bottomRequired?.[playerId] || 0);
  if (bottomCardIds.length !== required) return { ok: false, message: `Select exactly ${required} card${required === 1 ? '' : 's'} to put on the bottom.` };
  const unique = [...new Set(bottomCardIds)];
  if (unique.length !== bottomCardIds.length) return { ok: false, message: 'The same card cannot be selected twice.' };
  const player = current.players[playerId];
  if (unique.some((id) => !player.zones.hand.some((card) => card.instanceId === id))) return { ok: false, message: 'A selected card is no longer in that hand.' };
  updateState((draft) => {
    const hand = draft.players[playerId].zones.hand;
    for (const id of unique) {
      const index = hand.findIndex((card) => card.instanceId === id);
      const [card] = hand.splice(index, 1);
      draft.players[playerId].zones.library.push(card);
    }
    draft.openingHands.kept[playerId] = true;
    draft.openingHands.bottomRequired[playerId] = 0;
    if (Object.values(draft.openingHands.kept).every(Boolean)) draft.openingHands.active = false;
  }, { log: `${player.name} kept their opening hand${required ? ` and put ${required} card${required === 1 ? '' : 's'} on the bottom` : ''}.` });
  return { ok: true };
}

function concede(playerId) {
  const current = window.CommanderForge.getState();
  const opponentId = Object.keys(current.players).find((id) => id !== playerId);
  updateState((draft) => {
    draft.players[playerId].lost = true;
    draft.winner = opponentId;
  }, { log: `${current.players[playerId].name} conceded.` });
}

function queueManualEffect(instanceId, text, conditionText = '') {
  const current = window.CommanderForge.getState();
  const found = instanceId ? findCard(instanceId, current) : null;
  if (instanceId && !found) return { ok: false, message: 'Card not found.' };
  const cleanText = String(text || '').trim();
  if (!cleanText) return { ok: false, message: 'Describe the manual effect first.' };
  updateState((draft) => {
    const located = instanceId ? findCard(instanceId, draft) : null;
    queuePendingEffect(draft, {
      sourceCard: located?.card || null,
      controllerId: located?.card?.controller || draft.activePlayerId,
      kind: 'manual',
      text: cleanText,
      conditionText: String(conditionText || '').trim(),
    });
  }, { log: `${found?.card?.name || 'Manual effect'} queued for manual resolution.` });
  return { ok: true };
}

function activateBattlefieldAbility(instanceId, abilityIndex = 0) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'That ability must come from a permanent on the battlefield.' };
  const abilities = activatedAbilityLines(found.card);
  const ability = abilities[Number(abilityIndex)];
  if (!ability) return { ok: false, message: 'No supported activated ability was found.' };
  if (/^\s*\{T\}/i.test(ability) && found.card.tapped) return { ok: false, message: `${found.card.name} is already tapped.` };

  updateState((draft) => {
    const located = findCard(instanceId, draft);
    if (/^\s*\{T\}/i.test(ability)) located.card.tapped = true;
    queuePendingEffect(draft, {
      sourceCard: located.card,
      controllerId: located.card.controller,
      kind: 'activated-ability',
      text: ability,
    });
  }, { log: `${found.card.name}: activated ability queued for manual resolution.` });
  return { ok: true };
}

function setPendingEffectCondition(effectId, status) {
  const allowed = new Set(['met', 'not-met', 'unconfirmed']);
  if (!allowed.has(status)) return { ok: false, message: 'Unknown condition status.' };
  const current = window.CommanderForge.getState();
  const effect = current.pendingTriggers.find((item) => item.id === effectId);
  if (!effect) return { ok: false, message: 'Pending effect not found.' };

  updateState((draft) => {
    const pending = draft.pendingTriggers.find((item) => item.id === effectId);
    if (!pending) return;
    if (status === 'not-met') draft.pendingTriggers = draft.pendingTriggers.filter((item) => item.id !== effectId);
    else pending.conditionStatus = status;
  }, {
    log: status === 'not-met'
      ? `${effect.sourceName}: condition was not met; effect did not trigger.`
      : `${effect.sourceName}: manual condition confirmed.`,
  });
  return { ok: true };
}

function resolvePendingEffect(effectId, { decline = false } = {}) {
  const current = window.CommanderForge.getState();
  const effect = current.pendingTriggers.find((item) => item.id === effectId);
  if (!effect) return { ok: false, message: 'Pending effect not found.' };
  if (decline && !effect.optional) return { ok: false, message: 'This effect is not marked optional.' };
  if (effect.conditionText && effect.conditionStatus !== 'met' && !decline) {
    return { ok: false, message: 'Confirm that the condition is met, or mark it not met, before resolving this effect.' };
  }
  updateState((draft) => {
    draft.pendingTriggers = draft.pendingTriggers.filter((item) => item.id !== effectId);
  }, {
    log: decline ? `${effect.sourceName}: optional effect declined.` : `${effect.sourceName}: manual effect resolved.`,
  });
  return { ok: true };
}

function clearCombatMarkers() {
  const current = window.CommanderForge.getState();
  const activeMarkers = Object.values(current.players).flatMap((player) => player.zones.battlefield).filter((card) => card.attacking || card.blocking);
  if (!activeMarkers.length) return { ok: false, message: 'No active combat markers to clear.' };
  updateState((draft) => {
    for (const player of Object.values(draft.players)) {
      for (const card of player.zones.battlefield) {
        card.attacking = false;
        card.blocking = null;
        card.blockedBy = [];
      }
    }
  }, { log: 'Combat was resolved manually; attack and block markers were cleared.' });
  return { ok: true };
}

function battlefieldActivatedAbilities(instanceId) {
  const found = findCard(instanceId, window.CommanderForge.getState());
  if (!found || found.zone !== 'battlefield') return [];
  return activatedAbilityLines(found.card);
}

function updateCardNote(instanceId, notes) {
  updateState((draft) => { const found = findCard(instanceId, draft); if (found) found.card.notes = notes; }, { snapshot: false });
}

function flipCard(instanceId) {
  updateState((draft) => { const found = findCard(instanceId, draft); if (found) found.card.faceDown = !found.card.faceDown; }, { log: 'Card face changed.' });
}

function revealTop(playerId) {
  const state = window.CommanderForge.getState();
  return state.players[playerId].zones.library[0] || null;
}


function revealTopPublicly(playerId) {
  const current = window.CommanderForge.getState();
  const card = current.players[playerId]?.zones.library?.[0];
  if (!card) return { ok: false, message: 'The library is empty.' };
  updateState((draft) => {
    const top = draft.players[playerId].zones.library[0];
    recordPublicEvent(draft, {
      type: 'revealed',
      actorId: playerId,
      subjectPlayerId: playerId,
      card: top,
      zone: 'library',
      position: 'top',
      meaningful: true,
    });
    draft.knowledge.players[playerId].knownLibraryTop = [{ card: { ...top }, turn: draft.turnNumber, reason: 'revealed' }];
  }, { log: `${draftName(playerId)} publicly revealed ${card.name} from the top of their library.` });
  return { ok: true, card };
}

function revealCardPublicly(instanceId) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return { ok: false, message: 'Card not found.' };
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    recordPublicEvent(draft, {
      type: located.zone === 'hand' ? 'revealed_in_hand' : 'revealed',
      actorId: located.card.controller,
      subjectPlayerId: located.card.owner,
      card: located.card,
      zone: located.zone,
      meaningful: true,
    });
  }, { log: `${found.card.name} was publicly revealed from ${found.zone}.` });
  return { ok: true };
}

function assignBlocker(blockerId, attackerId) {
  const current = window.CommanderForge.getState();
  const blocker = findCard(blockerId, current);
  const attacker = findCard(attackerId, current);
  if (!blocker || !attacker || blocker.zone !== 'battlefield' || attacker.zone !== 'battlefield') return { ok: false, message: 'Both cards must be on the battlefield.' };
  if (!attacker.card.attacking) return { ok: false, message: `${attacker.card.name} is not marked as attacking.` };
  updateState((draft) => {
    const draftBlocker = findCard(blockerId, draft).card;
    const draftAttacker = findCard(attackerId, draft).card;
    if (draftBlocker.blocking === attackerId) {
      draftBlocker.blocking = null;
      draftAttacker.blockedBy = (draftAttacker.blockedBy || []).filter((id) => id !== blockerId);
      recordPublicEvent(draft, { type: 'block_cancelled', actorId: draftBlocker.controller, subjectPlayerId: draftBlocker.controller, card: draftBlocker, targetCard: draftAttacker });
    } else {
      if (draftBlocker.blocking) {
        const prior = findCard(draftBlocker.blocking, draft);
        if (prior) prior.card.blockedBy = (prior.card.blockedBy || []).filter((id) => id !== blockerId);
      }
      draftBlocker.blocking = attackerId;
      draftAttacker.blockedBy ||= [];
      if (!draftAttacker.blockedBy.includes(blockerId)) draftAttacker.blockedBy.push(blockerId);
      recordPublicEvent(draft, {
        type: 'block',
        actorId: draftBlocker.controller,
        subjectPlayerId: draftBlocker.controller,
        card: draftBlocker,
        targetCard: draftAttacker,
        meaningful: true,
      });
    }
  }, { log: `${blocker.card.name} ${blocker.card.blocking === attackerId ? 'stopped blocking' : `blocks ${attacker.card.name}`}.` });
  return { ok: true };
}

function attachCard(instanceId, targetId) {
  const current = window.CommanderForge.getState();
  const source = findCard(instanceId, current);
  const target = findCard(targetId, current);
  if (!source || !target || source.zone !== 'battlefield' || target.zone !== 'battlefield') return { ok: false, message: 'Both cards must be on the battlefield.' };
  const attachmentType = String(source.card.typeLine || '');
  if (!/Aura|Equipment/i.test(attachmentType)) return { ok: false, message: 'Only Aura or Equipment permanents can be attached this way.' };
  if (/Equipment/i.test(attachmentType) && !isCreature(target.card)) return { ok: false, message: 'Equipment can only be attached to a creature.' };
  updateState((draft) => {
    const attachment = findCard(instanceId, draft).card;
    const permanent = findCard(targetId, draft).card;
    if (attachment.attachedTo) {
      const prior = findCard(attachment.attachedTo, draft);
      if (prior) prior.card.attachments = (prior.card.attachments || []).filter((id) => id !== instanceId);
    }
    attachment.attachedTo = targetId;
    permanent.attachments ||= [];
    if (!permanent.attachments.includes(instanceId)) permanent.attachments.push(instanceId);
    recordPublicEvent(draft, {
      type: 'attached',
      actorId: attachment.controller,
      subjectPlayerId: attachment.controller,
      card: attachment,
      targetCard: permanent,
      meaningful: true,
    });
  }, { log: `${source.card.name} attached to ${target.card.name}.` });
  return { ok: true };
}

function checkLosses(draft) {
  for (const player of Object.values(draft.players)) {
    const commanderLoss = Math.max(0, ...Object.values(player.commanderDamage).map(Number)) >= 21;
    player.lost = player.life <= 0 || player.poison >= 10 || commanderLoss;
    if (player.lost) draft.winner = otherPlayerId(draft, player.id);
  }
}


return { moveCard, tapForMana, toggleTap, toggleAttack, addCounter, createToken, copyAsToken, adjustPlayer, adjustCommanderDamage, adjustMana, clearMana, draw, mill, shuffleLibrary, nextPhase, setPhase, switchActivePlayer, resolveStackTop, counterStackTop, mulligan, keepOpeningHand, concede, queueManualEffect, activateBattlefieldAbility, setPendingEffectCondition, resolvePendingEffect, clearCombatMarkers, battlefieldActivatedAbilities, updateCardNote, flipCard, revealTop, revealTopPublicly, revealCardPublicly, assignBlocker, attachCard };
})();

// ---- main.js ----
(() => {
const { COLORS, PHASES, ZONE_LABELS } = __modules["./constants.js"];
const { fetchCardsByNames, fetchPreconDeck, fetchPreconIndex } = __modules["./api.js"];
const { buildPlayerDeck, createInitialState, drawCards, findCard, getState, importState, resetState, restore, setState, subscribe, undo, updateState } = __modules["./state.js"];
const { commanderCandidates, maximumHandSize, recognizedEffects, validateDeck } = __modules["./rules.js"];
const { analyzePosition, defenseAdvice, possibleMoves } = __modules["./coach.js"];
const { addCounter, assignBlocker, attachCard, activateBattlefieldAbility, battlefieldActivatedAbilities, adjustCommanderDamage, adjustMana, adjustPlayer, clearMana, copyAsToken, counterStackTop, createToken, draw, flipCard, mill, moveCard, mulligan, keepOpeningHand, concede, nextPhase, queueManualEffect, resolvePendingEffect, resolveStackTop, setPendingEffectCondition, clearCombatMarkers, revealCardPublicly, revealTopPublicly, setPhase, shuffleLibrary, switchActivePlayer, toggleAttack, toggleTap, tapForMana, updateCardNote } = __modules["./game.js"];
const { cardImage, cardSmallImage, debounce, deepClone, downloadJson, escapeHtml, isCreature, isLand, manaProductionChoices, manaSourceLabel, parseDecklist, shuffle, uid } = __modules["./utils.js"];

const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');

window.CommanderForge = { getState };

const ui = {
  setupOpen: false,
  settingsOpen: false,
  tokenOpen: false,
  damageOpen: null,
  logOpen: false,
  importOpen: false,
  inspectorMode: 'card',
  inspectorOpen: false,
  drawer: null,
  drawerSearch: '',
  libraryReveal: null,
  loading: null,
  coach: null,
  preconIndex: null,
  hiddenTokens: { p1: false, p2: false },
  mulliganBottomSelections: { p1: new Set(), p2: new Set() },
  inspectorScrollTop: 0,
  inspectorFocus: null,
  drafts: {
    p1: createDraft('Player 1'),
    p2: createDraft('Player 2'),
  },
};

function createDraft(name) {
  return {
    name,
    source: 'custom',
    text: '',
    entries: [],
    byName: {},
    cards: [],
    commanders: [],
    candidates: [],
    validation: null,
    preconQuery: '',
    preconResults: [],
    selectedPrecon: null,
    ready: false,
  };
}

restore();
if (!getState().started) ui.setupOpen = true;
subscribe(render);
render();

function captureInspectorView() {
  const inspector = app.querySelector?.('.inspector');
  if (inspector) ui.inspectorScrollTop = inspector.scrollTop;
  const active = document.activeElement;
  if (active?.matches?.('.card-note')) {
    ui.inspectorFocus = {
      cardId: active.dataset.cardId,
      start: active.selectionStart ?? active.value.length,
      end: active.selectionEnd ?? active.value.length,
    };
  } else ui.inspectorFocus = null;
}

function restoreInspectorView() {
  const inspector = app.querySelector?.('.inspector');
  if (inspector) inspector.scrollTop = ui.inspectorScrollTop || 0;
  if (ui.inspectorFocus) {
    const note = app.querySelector?.(`.card-note[data-card-id="${ui.inspectorFocus.cardId}"]`);
    if (note) {
      note.focus({ preventScroll: true });
      note.setSelectionRange(ui.inspectorFocus.start, ui.inspectorFocus.end);
    }
  }
}

function render() {
  captureInspectorView();
  const state = getState();
  app.innerHTML = `
    ${renderHeader(state)}
    <main class="game-shell">
      <section class="play-area">${renderTable(state)}</section>
      <aside class="inspector ${ui.inspectorOpen ? 'open' : ''}">${renderInspector(state)}</aside>
    </main>
    ${renderBottomBar(state)}
    ${renderDrawer(state)}
    ${renderModals(state)}
    ${ui.loading ? renderLoading() : ''}
  `;
  requestAnimationFrame(() => {
    restoreInspectorView();
    const carousel = document.querySelector('.drawer-carousel');
    if (carousel) carousel.addEventListener('wheel', horizontalWheel, { passive: false });
  });
}

function renderHeader(state) {
  const phase = PHASES[state.phaseIndex];
  const active = state.players[state.activePlayerId];
  return `
    <header class="app-header">
      <div class="brand">
        <img src="./forge-mark.svg" alt="" />
        <div class="brand-text"><h1>The Commander Forge</h1><p>Digital Commander playmat</p></div>
      </div>
      <div class="phase-bar" aria-label="Turn phases">
        <span class="turn-pill">Turn ${state.turnNumber} · ${escapeHtml(active.name)}</span>
        ${PHASES.map((item, index) => `<span class="phase-chip ${index === state.phaseIndex ? 'active' : ''}" aria-current="${index === state.phaseIndex ? 'step' : 'false'}">${item.label}</span>`).join('')}
        <button class="btn primary small-btn" data-action="next-phase">Next ›</button>
      </div>
      <div class="header-actions">
        <button class="btn small-btn" data-action="undo" title="Undo">↶ <span class="desktop-label">Undo</span></button>
        <button class="btn small-btn" data-action="coach">✦ <span class="desktop-label">Coach</span></button>
        <button class="btn small-btn" data-action="open-log">☷ <span class="desktop-label">Log</span></button>
        <button class="btn small-btn" data-action="open-settings">⚙</button>
        <button class="btn small-btn" data-action="open-setup">Decks</button>
      </div>
    </header>`;
}

function renderTable(state) {
  return `
    ${state.winner ? `<div class="winner-banner">🏆 ${escapeHtml(state.players[state.winner]?.name || 'A player')} wins the game</div>` : ''}
    ${renderPendingEffects(state)}
    <div class="table">
      ${renderPlayerMat(state, 'p2', true)}
      ${renderStack(state)}
      ${renderPlayerMat(state, 'p1', false)}
    </div>`;
}

function renderPlayerMat(state, playerId, opponent) {
  const player = state.players[playerId];
  const battlefield = player.zones.battlefield;
  const hideHand = opponent && state.settings.hideOpponentHand;
  const maximum = maximumHandSize(state, playerId);
  const handLabel = `${player.zones.hand.length} / max ${maximum.label}`;
  const hiddenTokens = Boolean(ui.hiddenTokens[playerId]);
  const attachedIds = new Set(battlefield.filter((card) => card.attachedTo).map((card) => card.instanceId));
  const visibleBattlefield = battlefield.filter((card) => !attachedIds.has(card.instanceId) && (!hiddenTokens || !card.token));
  const tokenCount = battlefield.filter((card) => card.token && !card.attachedTo).length;
  const tokenToggle = tokenCount ? `<button class="token-visibility-btn" data-action="toggle-tokens" data-player-id="${playerId}">${hiddenTokens ? `Show ${tokenCount} token${tokenCount === 1 ? '' : 's'}` : `Hide ${tokenCount} token${tokenCount === 1 ? '' : 's'}`}</button>` : '';
  return `
    <section class="player-mat ${opponent ? 'opponent' : 'you'}" data-player-mat="${playerId}">
      <aside class="player-sidebar">
        ${renderPlayerStatus(state, playerId)}
        <div class="command-slot zone ${player.zones.command.length ? '' : 'empty'}" data-drop-zone="command" data-player-id="${playerId}">
          <span class="zone-label">Command Zone</span>
          <div class="card-row">${player.zones.command.map((card) => renderCard(card, state, { compact: true })).join('') || `<span class="muted small">Drop commander here</span>`}</div>
        </div>
        <div class="zone-shortcuts">
          ${renderZonePile(playerId, 'library', player.zones.library.length)}
          ${renderZonePile(playerId, 'graveyard', player.zones.graveyard.length)}
          ${renderZonePile(playerId, 'exile', player.zones.exile.length)}
          <button class="zone-pile" data-action="open-damage" data-player-id="${playerId}"><strong>Commander damage</strong><span>${Math.max(0, ...Object.values(player.commanderDamage).map(Number))}/21 max</span></button>
        </div>
      </aside>
      <div class="board-main ${opponent ? 'opponent-board' : 'you-board'}">
        ${opponent ? `
        <div class="zone hand-zone ${!maximum.unlimited && player.zones.hand.length > maximum.value ? 'hand-over-limit' : ''}" data-drop-zone="hand" data-player-id="${playerId}">
          <span class="zone-label">${escapeHtml(player.name)}'s hand · ${handLabel}</span>
          <div class="card-row">${hideHand ? renderHiddenHand(player.zones.hand.length) : player.zones.hand.map((card) => renderCard(card, state)).join('')}</div>
        </div>` : ''}
        <div class="zone battlefield-zone" data-drop-zone="battlefield" data-player-id="${playerId}">
          <span class="zone-label">${opponent ? `${escapeHtml(player.name)}'s battlefield` : 'Your battlefield'}</span>
          <div class="battlefield-tools">${tokenToggle}</div>
          <div class="card-row ${visibleBattlefield.length < 4 ? 'centered' : ''}">${visibleBattlefield.map((card) => renderCard(card, state)).join('')}${hiddenTokens && tokenCount ? `<span class="hidden-token-placeholder">${tokenCount} token${tokenCount === 1 ? '' : 's'} hidden</span>` : ''}</div>
        </div>
        ${!opponent ? `
        <div class="zone hand-zone ${!maximum.unlimited && player.zones.hand.length > maximum.value ? 'hand-over-limit' : ''}" data-drop-zone="hand" data-player-id="${playerId}">
          <span class="zone-label">Your hand · ${handLabel}</span>
          <div class="card-row">${player.zones.hand.map((card) => renderCard(card, state)).join('')}</div>
        </div>` : ''}
      </div>
    </section>`;
}

function renderPlayerStatus(state, playerId) {
  const player = state.players[playerId];
  const active = state.activePlayerId === playerId;
  const floating = COLORS.filter((color) => Number(player.mana[color] || 0) > 0)
    .map((color) => `<span class="mana-chip">${color}<b>${player.mana[color]}</b></span>`)
    .join('');
  const sourceGroups = new Map();
  for (const card of player.zones.battlefield.filter((item) => !item.tapped)) {
    const label = manaSourceLabel(card);
    if (!label) continue;
    sourceGroups.set(label, (sourceGroups.get(label) || 0) + 1);
  }
  const available = [...sourceGroups.entries()]
    .map(([label, count]) => `<span class="source-chip">${escapeHtml(label)}${count > 1 ? ` ×${count}` : ''}</span>`)
    .join('');
  const manaPanel = state.settings.manaMode === 'manual'
    ? `<div class="mana-row" style="margin-top:8px">${COLORS.map((color) => `<button class="btn small-btn" data-action="mana" data-player-id="${playerId}" data-color="${color}" data-delta="1" title="Add ${color} mana">${color}<b>${player.mana[color]}</b></button>`).join('')}<button class="btn small-btn ghost" data-action="clear-mana" data-player-id="${playerId}" title="Clear mana">×</button></div>`
    : `<div class="automatic-mana"><div><span class="mana-caption">Untapped sources</span><div class="mana-chip-row">${available || '<span class="muted small">None</span>'}</div></div><div><span class="mana-caption">Floating pool</span><div class="mana-chip-row">${floating || '<span class="muted small">Empty</span>'}${floating ? `<button class="icon-btn tiny" data-action="clear-mana" data-player-id="${playerId}" title="Clear floating mana">×</button>` : ''}</div></div></div>`;
  return `
    <div class="player-status ${active ? 'active' : ''}">
      <div class="player-name-row"><span class="player-name">${escapeHtml(player.name)}</span>${active ? '<span class="active-dot" title="Active player"></span>' : ''}</div>
      <div class="trackers">
        ${renderTracker(playerId, 'life', 'Life', player.life, [-5, -1, 1, 5])}
        ${renderTracker(playerId, 'poison', 'Poison', player.poison, [-1, 1])}
      </div>
      ${manaPanel}
    </div>`;
}

function renderTracker(playerId, field, label, value, deltas) {
  return `<div class="tracker"><div class="tracker-label">${label}</div><div class="tracker-value">${value}</div><div class="tracker-controls">${deltas.map((delta) => `<button data-action="adjust-player" data-player-id="${playerId}" data-field="${field}" data-delta="${delta}">${delta > 0 ? '+' : ''}${delta}</button>`).join('')}</div></div>`;
}

function renderZonePile(playerId, zone, count) {
  return `<button class="zone-pile" data-action="open-zone" data-player-id="${playerId}" data-zone="${zone}" data-drop-zone="${zone}"><strong>${ZONE_LABELS[zone]}</strong><span>${count} card${count === 1 ? '' : 's'}</span></button>`;
}

function renderHiddenHand(count) {
  return Array.from({ length: Math.min(count, 12) }, (_, index) => `<div class="game-card hidden-hand-card" aria-label="Hidden card ${index + 1}"><img src="./card-back.svg" alt="Card back" /></div>`).join('');
}

function renderCard(card, state, { compact = false } = {}) {
  const selected = state.selected?.instanceId === card.instanceId;
  const badges = [];
  if (card.commander) badges.push('<span class="card-badge">CMD</span>');
  if (card.summoningSick) badges.push('<span class="card-badge blue">NEW</span>');
  if (card.attacking) badges.push('<span class="card-badge red">ATK</span>');
  if (card.blocking) badges.push('<span class="card-badge blue">BLK</span>');
  if (card.attachedTo) badges.push('<span class="card-badge purple">ATT</span>');
  const manaLabel = manaSourceLabel(card);
  if (manaLabel) badges.push(`<span class="card-badge mana" title="Mana choices">${escapeHtml(manaLabel)}</span>`);
  const counterTotal = Object.values(card.counters || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (counterTotal) badges.push(`<span class="card-badge purple">${counterTotal}</span>`);
  const image = card.faceDown ? './card-back.svg' : cardSmallImage(card);
  const attachedCards = (card.attachments || []).map((id) => findCard(id, state)?.card).filter(Boolean);
  const attachmentFan = attachedCards.length ? `<div class="attachment-fan">${attachedCards.map((attachment, index) => `<button class="attached-mini" data-card-id="${attachment.instanceId}" style="--attachment-index:${index}" title="${escapeHtml(attachment.name)} attached to ${escapeHtml(card.name)}"><img src="${escapeHtml(cardSmallImage(attachment))}" alt="${escapeHtml(attachment.name)}" /></button>`).join('')}</div>` : '';
  return `<article class="game-card ${selected ? 'selected' : ''} ${card.tapped ? 'tapped' : ''} ${card.attacking ? 'attacking' : ''} ${compact ? 'compact' : ''}" data-card-id="${card.instanceId}" title="${escapeHtml(card.name)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(card.name)}" draggable="false" onerror="this.src='./card-back.svg'" /><div class="badge-row">${badges.join('')}</div>${attachmentFan}${state.settings.showCardNames ? `<div class="card-name-strip">${escapeHtml(card.name)}</div>` : ''}</article>`;
}

function renderPendingEffects(state) {
  const effects = state.pendingTriggers || [];
  const combatActive = PHASES[state.phaseIndex]?.id === 'combat'
    && Object.values(state.players).flatMap((player) => player.zones.battlefield).some((card) => card.attacking || card.blocking);
  if (!effects.length && !state.stack.length && !combatActive) return '';

  return `<section class="resolution-gate" aria-live="polite">
    <div class="resolution-gate-header">
      <div><strong>Resolve before advancing</strong><span>${state.stack.length ? `${state.stack.length} stack object${state.stack.length === 1 ? '' : 's'}` : ''}${state.stack.length && effects.length ? ' · ' : ''}${effects.length ? `${effects.length} pending effect${effects.length === 1 ? '' : 's'}` : ''}</span></div>
      ${combatActive ? '<button class="btn small-btn" data-action="clear-combat">Combat resolved manually</button>' : ''}
    </div>
    ${effects.map((effect) => `<article class="pending-effect">
      <div class="pending-effect-copy">
        <strong>${escapeHtml(effect.sourceName)}</strong>
        <span class="small muted">${escapeHtml(effect.kind.replaceAll('-', ' '))}</span>
        <p>${escapeHtml(effect.text)}</p>
        ${effect.conditionText ? `<div class="effect-condition ${effect.conditionStatus === 'met' ? 'met' : ''}"><strong>Condition:</strong> ${escapeHtml(effect.conditionText)}${effect.conditionStatus === 'met' ? ' ✓' : ''}</div>` : ''}
      </div>
      <div class="pending-effect-actions">
        ${effect.conditionText && effect.conditionStatus !== 'met' ? `
          <button class="btn small-btn" data-action="effect-condition" data-effect-id="${effect.id}" data-status="met">Condition met</button>
          <button class="btn small-btn ghost" data-action="effect-condition" data-effect-id="${effect.id}" data-status="not-met">Condition not met</button>` : ''}
        ${!effect.conditionText || effect.conditionStatus === 'met' ? `<button class="btn primary small-btn" data-action="resolve-effect" data-effect-id="${effect.id}">Resolved manually</button>` : ''}
        ${effect.optional ? `<button class="btn small-btn ghost" data-action="decline-effect" data-effect-id="${effect.id}">Decline “may” effect</button>` : ''}
      </div>
    </article>`).join('')}
  </section>`;
}

function renderStack(state) {
  return `<section class="stack-area" data-drop-zone="stack" data-player-id="${state.activePlayerId}"><span class="stack-label">Stack</span><div class="stack-cards">${state.stack.map((card) => `<img class="stack-mini" src="${escapeHtml(cardSmallImage(card))}" alt="${escapeHtml(card.name)}" data-card-id="${card.instanceId}" />`).join('') || '<span class="muted small">Drag spells here when responses matter</span>'}</div>${state.stack.length ? `<button class="btn small-btn" data-action="resolve-stack">Resolve top</button><button class="btn small-btn danger" data-action="counter-stack">Counter top</button>` : ''}</section>`;
}

function renderInspector(state) {
  if (ui.inspectorMode === 'coach') return renderCoachInspector(state);
  const selected = state.selected?.instanceId ? findCard(state.selected.instanceId, state) : null;
  if (!selected) return `<div class="inspector-empty"><div><div style="font-size:2rem">🃏</div><h3>Select a card</h3><p>Tap a card for actions. Drag it directly between visible zones.</p><button class="btn primary" data-action="coach">Open strategy coach</button></div></div>`;
  const card = selected.card;
  const effects = recognizedEffects(card);
  const activatedAbilities = selected.zone === 'battlefield' ? battlefieldActivatedAbilities(card.instanceId) : [];
  const counterButtons = ['+1/+1', '-1/-1', 'charge', 'loyalty', 'stun'];
  return `
    <div class="inspector-section" style="display:flex;justify-content:space-between;align-items:center"><h3>Card actions</h3><button class="icon-btn" data-action="close-inspector">×</button></div>
    <div class="inspector-section">
      <img class="inspector-card-image" src="${escapeHtml(cardImage(card))}" alt="${escapeHtml(card.name)}" onerror="this.src='./card-back.svg'" />
      <h2>${escapeHtml(card.name)}</h2>
      <div class="muted small">${escapeHtml(card.manaCost)} · ${escapeHtml(card.typeLine)}</div>
      ${card.power ? `<div class="small">${escapeHtml(card.power)}/${escapeHtml(card.toughness)}</div>` : ''}${card.commander ? `<div class="small" style="margin-top:5px;color:var(--gold-2)">Cast ${getState().players[card.owner].commanderCastCount[card.instanceId] || 0} time(s) · current tax +${2 * (getState().players[card.owner].commanderCastCount[card.instanceId] || 0)}</div>` : ''}
    </div>
    <div class="inspector-section"><h3>Quick actions</h3><div class="action-grid">
      ${selected.zone === 'battlefield' ? `${renderManaTapActions(card, state)}<button class="btn" data-action="toggle-attack" data-card-id="${card.instanceId}">${card.attacking ? 'Stop attack' : '⚔ Attack'}</button>${renderBlockActions(card, state)}${renderAttachActions(card, state)}` : ''}
      ${zoneMoveButton(card, 'battlefield', 'Battlefield')}
      ${zoneMoveButton(card, 'hand', 'Hand')}
      ${zoneMoveButton(card, 'graveyard', 'Graveyard')}
      ${zoneMoveButton(card, 'exile', 'Exile')}
      ${card.commander ? zoneMoveButton(card, 'command', 'Command zone') : ''}
      ${zoneMoveButton(card, 'stack', 'Stack')}
      <button class="btn" data-action="move-library" data-card-id="${card.instanceId}" data-position="top">Library top</button>
      <button class="btn" data-action="move-library" data-card-id="${card.instanceId}" data-position="bottom">Library bottom</button>
      <button class="btn" data-action="flip-card" data-card-id="${card.instanceId}">${card.faceDown ? 'Turn face up' : 'Turn face down'}</button>
      <button class="btn" data-action="reveal-public" data-card-id="${card.instanceId}">Reveal publicly</button>
      <button class="btn" data-action="copy-token" data-card-id="${card.instanceId}">Create copy</button>
      ${selected.zone === 'battlefield' ? `<button class="btn" data-action="queue-manual-effect" data-card-id="${card.instanceId}">Queue manual effect</button>` : ''}
    </div></div>
    ${activatedAbilities.length ? `<div class="inspector-section"><h3>Battlefield abilities</h3><div class="ability-list">${activatedAbilities.map((ability, index) => `<button class="ability-button" data-action="activate-ability" data-card-id="${card.instanceId}" data-ability-index="${index}"><strong>Activate</strong><span>${escapeHtml(ability)}</span></button>`).join('')}</div><p class="small muted">Non-mana abilities are queued for manual resolution. Tap costs are applied automatically.</p></div>` : ''}
    <div class="inspector-section"><h3>Counters</h3><div class="counter-row">${counterButtons.map((counter) => `<button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${counter}" data-delta="1">+ ${counter}</button>`).join('')}</div>${Object.entries(card.counters || {}).map(([counter, count]) => `<div class="counter-row" style="margin-top:6px"><span>${escapeHtml(counter)}: ${count}</span><button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="-1">−</button><button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="1">+</button></div>`).join('')}</div>
    <div class="inspector-section"><h3>Oracle text</h3><div class="oracle">${escapeHtml(card.oracleText || 'No Oracle text.')}</div>${effects.length ? `<p class="small muted">Recognized: ${effects.map(escapeHtml).join(' · ')}</p>` : ''}</div>
    <div class="inspector-section"><h3>Notes</h3><textarea class="card-note" data-card-id="${card.instanceId}" style="min-height:70px">${escapeHtml(card.notes || '')}</textarea></div>`;
}



function renderBlockActions(card, state) {
  if (!isCreature(card)) return '';
  const opposingAttackers = Object.values(state.players)
    .filter((player) => player.id !== card.controller)
    .flatMap((player) => player.zones.battlefield)
    .filter((attacker) => attacker.attacking);
  if (!opposingAttackers.length) return '';
  return `<div class="mana-choice-group"><div class="small muted wide">Declare blocker</div>${opposingAttackers.map((attacker) => `<button class="btn" data-action="assign-block" data-card-id="${card.instanceId}" data-attacker-id="${attacker.instanceId}">${card.blocking === attacker.instanceId ? 'Stop blocking' : `Block ${escapeHtml(attacker.name)}`}</button>`).join('')}</div>`;
}

function renderAttachActions(card, state) {
  const type = String(card.typeLine || '');
  if (!/Aura|Equipment/.test(type)) return '';
  const targets = state.players[card.controller]?.zones.battlefield.filter((target) => target.instanceId !== card.instanceId && isCreature(target)) || [];
  if (!targets.length) return '';
  return `<div class="mana-choice-group"><div class="small muted wide">Attach to</div>${targets.slice(0, 12).map((target) => `<button class="btn" data-action="attach-card" data-card-id="${card.instanceId}" data-target-id="${target.instanceId}">${escapeHtml(target.name)}</button>`).join('')}</div>`;
}

function renderManaTapActions(card, state) {
  if (card.tapped) return `<button class="btn" data-action="toggle-tap" data-card-id="${card.instanceId}">↺ Untap</button>`;
  const choices = manaProductionChoices(card);
  if (state.settings.manaMode === 'manual' || !choices.length) {
    return `<button class="btn" data-action="toggle-tap" data-card-id="${card.instanceId}">↻ Tap</button>`;
  }
  const manaButtons = choices.map((choice, index) => `<button class="btn mana-choice" data-action="tap-mana" data-card-id="${card.instanceId}" data-choice-index="${index}">↻ Tap → ${escapeHtml(choice.label)}</button>`).join('');
  return `<div class="mana-choice-group"><div class="small muted wide">Choose what this source produces</div>${manaButtons}<button class="btn ghost" data-action="toggle-tap-only" data-card-id="${card.instanceId}">Tap without adding mana</button></div>`;
}

function zoneMoveButton(card, zone, label) {
  return `<button class="btn" data-action="move-card" data-card-id="${card.instanceId}" data-zone="${zone}">${label}</button>`;
}

function renderCoachInspector(state) {
  const active = state.players[state.activePlayerId];
  const basicMoves = possibleMoves(state);
  const defense = defenseAdvice(state);
  const defenseHtml = defense ? `<div class="inspector-section"><h3>Defense suggestion for ${escapeHtml(defense.defenderName)}</h3>${defense.assignments.map((item) => `<div class="coach-result"><strong>${escapeHtml(item.blocker)} blocks ${escapeHtml(item.attacker)}</strong><p class="small muted">${escapeHtml(item.reason)}</p></div>`).join('') || '<div class="validation">No useful legal-looking blocks found.</div>'}<p class="small">Estimated unblocked/trample damage: ${defense.expectedDamage}</p></div>` : '';
  const resultsHtml = ui.coach
    ? ui.coach.results.slice(0, 6).map((result, index) => {
      const details = result.explanationDetails || {};
      const visible = (details.visibleReasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
      const memory = (details.publicMemoryReasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
      const safer = index === 0 && result.saferAlternative
        ? `<div class="coach-safe"><strong>Safer alternative:</strong> ${escapeHtml(result.saferAlternative.label)} <span class="muted">(${escapeHtml(result.saferAlternative.riskLevel)} risk)</span></div>`
        : '';
      return `<article class="coach-result ${index === 0 ? 'best' : ''}"><div class="coach-title-row"><span class="score-pill">${result.score >= 0 ? '+' : ''}${result.score}</span><strong>${index + 1}. ${escapeHtml(result.label)}</strong></div><p class="small">${escapeHtml(details.headline || result.explanation || '')}</p>${visible ? `<div class="coach-detail"><strong>Visible board:</strong><ul>${visible}</ul></div>` : ''}${memory ? `<div class="coach-detail"><strong>Public memory:</strong><ul>${memory}</ul></div>` : ''}<div class="coach-risk"><strong>${escapeHtml(details.riskLevel || 'Low')} risk</strong> · ${escapeHtml(details.hiddenRisk || '')}</div>${safer}<div class="small muted">Confidence: ${result.confidence || 0}% · sampled range ${result.range[0]} to ${result.range[1]}</div></article>`;
    }).join('')
    : '<div class="validation">Run analysis to rank plays, sequences, attacks, activated abilities, and passing.</div>';
  const audit = ui.coach?.informationSetAudit;
  const auditHtml = audit ? `<details class="coach-audit"><summary>Information used by the coach</summary><div class="small"><div>✓ Your full hand and public zones</div><div>✓ Both visible battlefields and individual card text/state</div><div>✓ Public game memory and opponent hand size/behavior</div><div>✗ No opponent hidden card names or hidden library identities</div></div></details>` : '';
  return `<div class="inspector-section" style="display:flex;justify-content:space-between;align-items:center"><h3>Tactical information-set coach</h3><button class="icon-btn" data-action="close-inspector">×</button></div><div class="coach-panel"><p class="small muted">Searches legal plays and short sequences using exact tapped mana sources, card-level combat, visible deck strategy, public memory, and sampled hidden interaction. It never reads the opponent's hidden hand or decklist.</p><button class="btn primary wide" data-action="run-coach">Analyze ${escapeHtml(active.name)}'s position</button><p class="small">${basicMoves.length} rules-checked tactical move and sequence candidates · ${state.settings.coachRollouts} samples per candidate.</p>${resultsHtml}${auditHtml}</div>${defenseHtml}`;
}

function renderDrawer(state) {
  if (!ui.drawer) return '<section class="zone-drawer" aria-hidden="true"></section>';
  const { playerId, zone } = ui.drawer;
  const player = state.players[playerId];
  let cards = player.zones[zone] || [];
  if (ui.drawerSearch.trim()) cards = cards.filter((card) => card.name.toLocaleLowerCase().includes(ui.drawerSearch.trim().toLocaleLowerCase()));
  else if (zone === 'library' && ui.libraryReveal?.playerId === playerId) cards = cards.slice(0, 1);
  const hideLibrary = zone === 'library' && !ui.drawerSearch.trim() && ui.libraryReveal?.playerId !== playerId;
  return `<section class="zone-drawer open" aria-label="${ZONE_LABELS[zone]}"><div class="drawer-header"><div><div class="drawer-title">${escapeHtml(player.name)} · ${ZONE_LABELS[zone]}</div><div class="small muted">${player.zones[zone].length} card${player.zones[zone].length === 1 ? '' : 's'}</div></div><div class="drawer-tools">${zone === 'library' ? `<input type="search" id="drawer-search" value="${escapeHtml(ui.drawerSearch)}" placeholder="Search library by name" /><button class="btn small-btn" data-action="shuffle-library" data-player-id="${playerId}">Shuffle</button><button class="btn small-btn" data-action="reveal-top" data-player-id="${playerId}">Reveal top</button><button class="btn small-btn" data-action="draw" data-player-id="${playerId}" data-amount="1">Draw</button><button class="btn small-btn" data-action="mill" data-player-id="${playerId}" data-amount="1">Mill</button>` : `<input type="search" id="drawer-search" value="${escapeHtml(ui.drawerSearch)}" placeholder="Filter cards" />`}<button class="icon-btn" data-action="close-drawer">×</button></div></div><div class="drawer-carousel" data-drop-zone="${zone}" data-player-id="${playerId}">${hideLibrary ? renderLibraryBacks(player.zones.library.length) : cards.map((card) => renderCard(card, state)).join('') || '<span class="muted">No matching cards.</span>'}</div></section>`;
}

function renderLibraryBacks(count) {
  const visible = Math.min(7, count);
  return `${Array.from({ length: visible }, () => `<div class="game-card card-back-stack"><img src="./card-back.svg" alt="Hidden library card" /></div>`).join('')}<div class="validation"><strong>Library is hidden.</strong><br />Use search when a tutor effect lets you find a card, or reveal the top card.</div>`;
}

function renderBottomBar() {
  return `<nav class="bottom-bar"><button data-action="next-phase"><strong>›</strong>Phase</button><button data-action="coach"><strong>✦</strong>Coach</button><button data-action="open-token"><strong>＋</strong>Token</button><button data-action="undo"><strong>↶</strong>Undo</button><button data-action="open-settings"><strong>⚙</strong>Tools</button></nav>`;
}

function renderModals(state) {
  return `${ui.setupOpen ? renderSetupModal(state) : ''}${ui.settingsOpen ? renderSettingsModal(state) : ''}${ui.tokenOpen ? renderTokenModal(state) : ''}${state.openingHands?.active ? renderMulliganModal(state) : ''}${ui.damageOpen ? renderDamageModal(state) : ''}${ui.logOpen ? renderLogModal(state) : ''}`;
}

function renderSetupModal(state) {
  return `<div class="modal-backdrop"><section class="modal"><header class="modal-header"><div><h2>Set up the Commander table</h2><div class="small muted">Paste a 100-card list or search an official precon.</div></div>${state.started ? '<button class="icon-btn" data-action="close-setup">×</button>' : ''}</header><div class="modal-body"><div class="setup-grid">${renderDeckPanel('p1')}${renderDeckPanel('p2')}</div><div class="setup-footer"><div><button class="btn" data-action="demo-game">Load interactive demo</button> <button class="btn" data-action="import-save">Import saved game</button></div><button class="btn primary" data-action="start-game" ${bothDraftsReady() ? '' : 'disabled'}>Shuffle, draw 7, and start</button></div><input id="save-file-input" class="hidden" type="file" accept="application/json" /></div></section></div>`;
}

function renderDeckPanel(playerId) {
  const draft = ui.drafts[playerId];
  return `<section class="deck-panel" data-deck-panel="${playerId}"><h3>${playerId === 'p1' ? 'Player 1 / You' : 'Player 2'}</h3><div class="field"><label>Player name</label><input data-draft-field="name" data-player-id="${playerId}" value="${escapeHtml(draft.name)}" /></div><div class="segmented"><button class="${draft.source === 'custom' ? 'active' : ''}" data-action="deck-source" data-player-id="${playerId}" data-source="custom">Paste decklist</button><button class="${draft.source === 'precon' ? 'active' : ''}" data-action="deck-source" data-player-id="${playerId}" data-source="precon">Official precon</button></div>${draft.source === 'custom' ? renderCustomDraft(playerId, draft) : renderPreconDraft(playerId, draft)}${draft.cards.length ? renderCommanderSelection(playerId, draft) : ''}${draft.validation ? renderValidation(draft.validation) : ''}</section>`;
}

function renderCustomDraft(playerId, draft) {
  return `<div class="field"><label>Decklist format: <code>1 Satoru Umezawa</code></label><textarea data-draft-field="text" data-player-id="${playerId}" placeholder="1 Commander Name\n1 Sol Ring\n1 Arcane Signet\n...">${escapeHtml(draft.text)}</textarea></div><button class="btn primary" data-action="prepare-custom" data-player-id="${playerId}">Load cards and validate</button>`;
}

function renderPreconDraft(playerId, draft) {
  return `<div class="field"><label>Search official deck name</label><div style="display:flex;gap:6px"><input data-draft-field="preconQuery" data-player-id="${playerId}" value="${escapeHtml(draft.preconQuery)}" placeholder="Grave Danger" /><button class="btn" data-action="search-precon" data-player-id="${playerId}">Search</button></div></div><div class="precon-results">${draft.preconResults.map((deck) => `<button class="precon-item" data-action="load-precon" data-player-id="${playerId}" data-file-name="${escapeHtml(deck.fileName)}"><span><strong>${escapeHtml(deck.name)}</strong><br /><span class="small muted">${escapeHtml(deck.type || deck.code)} · ${escapeHtml(deck.releaseDate || '')}</span></span><span>Load ›</span></button>`).join('') || '<div class="validation">Search MTGJSON for a preconstructed deck.</div>'}</div>`;
}

function renderCommanderSelection(playerId, draft) {
  const options = draft.candidates.map((card) => `<option value="${escapeHtml(card.name)}" ${draft.commanders[0] === card.name ? 'selected' : ''}>${escapeHtml(card.name)}</option>`).join('');
  const secondaryOptions = `<option value="">No second commander</option>${draft.candidates.map((card) => `<option value="${escapeHtml(card.name)}" ${draft.commanders[1] === card.name ? 'selected' : ''}>${escapeHtml(card.name)}</option>`).join('')}`;
  return `<div class="field" style="margin-top:10px"><label>Commander</label><select data-commander-select="primary" data-player-id="${playerId}"><option value="">Choose commander</option>${options}</select></div><div class="field"><label>Second commander, only when rules allow</label><select data-commander-select="secondary" data-player-id="${playerId}">${secondaryOptions}</select></div>`;
}

function renderValidation(validation) {
  return `<div class="validation ${validation.errors.length ? 'error' : 'ok'}" style="margin-top:10px"><strong>${validation.errors.length ? 'Deck needs changes' : `Ready · ${validation.total}/100 cards`}</strong>${validation.errors.length ? `<ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>` : ''}${validation.warnings.length ? `<ul>${validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}</div>`;
}

function renderSettingsModal(state) {
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>Table tools</h2><button class="icon-btn" data-action="close-settings">×</button></header><div class="modal-body"><div class="field"><label>Rules enforcement</label><select id="rules-mode"><option value="free" ${state.settings.rulesMode === 'free' ? 'selected' : ''}>Free table: never block moves</option><option value="learning" ${state.settings.rulesMode === 'learning' ? 'selected' : ''}>Learning: explain and allow override</option><option value="strict" ${state.settings.rulesMode === 'strict' ? 'selected' : ''}>Strict basics: block known illegal moves</option></select></div><div class="field"><label>Mana handling</label><select id="mana-mode"><option value="manual" ${state.settings.manaMode === 'manual' ? 'selected' : ''}>Manual: tap and edit counters yourself</option><option value="assisted" ${state.settings.manaMode === 'assisted' ? 'selected' : ''}>Assisted: tapping a source adds its mana</option><option value="auto" ${state.settings.manaMode === 'auto' || !state.settings.manaMode ? 'selected' : ''}>Auto-pay: casting taps suggested sources</option></select><div class="small muted" style="margin-top:5px">Dual and hybrid-looking sources appear as choices such as U / B. The floating pool still stores the actual color chosen.</div></div><label><input type="checkbox" id="hide-opponent" ${state.settings.hideOpponentHand ? 'checked' : ''}/> Hide Player 2 hand</label><br /><label><input type="checkbox" id="auto-draw" ${state.settings.autoDraw ? 'checked' : ''}/> Auto draw during draw step</label><br /><label><input type="checkbox" id="show-names" ${state.settings.showCardNames ? 'checked' : ''}/> Show card-name strips</label><div class="field" style="margin-top:10px"><label>Information-set samples per move</label><input id="coach-rollouts" type="number" min="40" max="240" step="20" value="${state.settings.coachRollouts}" /></div><div class="action-grid"><button class="btn" data-action="switch-player">Switch active player</button><button class="btn" data-action="open-token">Create token</button><button class="btn" data-action="random-tool" data-kind="d6">Roll D6</button><button class="btn" data-action="random-tool" data-kind="d20">Roll D20</button><button class="btn" data-action="random-tool" data-kind="coin">Flip coin</button><button class="btn" data-action="export-save">Export save</button><button class="btn" data-action="import-save">Import save</button><button class="btn danger" data-action="concede" data-player-id="p1">P1 concede</button><button class="btn danger" data-action="concede" data-player-id="p2">P2 concede</button><button class="btn danger wide" data-action="reset-game">Reset entire table</button></div><input id="settings-file-input" class="hidden" type="file" accept="application/json" /></div></section></div>`;
}

function renderTokenModal() {
  return `<div class="modal-backdrop"><section class="modal small-modal token-modal"><header class="modal-header"><h2>Create a token</h2><button class="icon-btn" data-action="close-token">×</button></header><div class="modal-body"><div class="field"><label>Controller</label><select id="token-player"><option value="p1">Player 1</option><option value="p2">Player 2</option></select></div><div class="field"><label>Name</label><input id="token-name" value="Zombie" /></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="field"><label>Power</label><input id="token-power" type="number" value="2" /></div><div class="field"><label>Toughness</label><input id="token-toughness" type="number" value="2" /></div></div><div class="field"><label>Type line</label><input id="token-type" value="Token Creature — Zombie" /></div><div class="field"><label>Keywords, comma separated</label><input id="token-keywords" placeholder="Flying, Haste" /></div><div class="token-colors"><div class="field"><label>Card color</label><input id="token-frame-color" type="color" value="#1f3329" /></div><div class="field"><label>Accent</label><input id="token-accent-color" type="color" value="#d4a654" /></div><div class="field"><label>Text</label><input id="token-text-color" type="color" value="#f4f1e8" /></div></div><p class="small muted">Tokens can be hidden or shown from the battlefield header without removing them from the game.</p><button class="btn primary" data-action="create-token">Create on battlefield</button></div></section></div>`;
}

function renderMulliganModal(state) {
  const playerPanels = ['p1', 'p2'].map((playerId) => {
    const player = state.players[playerId];
    const kept = Boolean(state.openingHands.kept[playerId]);
    const required = Number(state.openingHands.bottomRequired[playerId] || 0);
    const selected = ui.mulliganBottomSelections[playerId];
    return `<article class="mulligan-player ${kept ? 'kept' : ''}"><header><div><h3>${escapeHtml(player.name)}</h3><span class="small muted">Mulligans: ${player.mulligans} · Bottom ${required}</span></div>${kept ? '<span class="kept-badge">Kept</span>' : ''}</header><div class="mulligan-hand">${player.zones.hand.map((card) => `<button class="mulligan-card ${selected.has(card.instanceId) ? 'selected' : ''}" data-action="toggle-mulligan-card" data-player-id="${playerId}" data-card-id="${card.instanceId}" ${kept || !required ? 'disabled' : ''}><img src="${escapeHtml(cardSmallImage(card))}" alt="${escapeHtml(card.name)}" /><span>${escapeHtml(card.name)}</span></button>`).join('')}</div>${kept ? '' : `<div class="mulligan-actions"><button class="btn" data-action="mulligan" data-player-id="${playerId}">Mulligan</button><button class="btn primary" data-action="keep-hand" data-player-id="${playerId}" ${selected.size !== required ? 'disabled' : ''}>${required ? `Bottom ${required} & keep` : 'Keep hand'}</button></div>`}</article>`;
  }).join('');
  return `<div class="modal-backdrop mulligan-backdrop"><section class="modal mulligan-modal"><header class="modal-header"><div><h2>Opening hands</h2><p class="small muted">Commander uses a free first mulligan. After later mulligans, select the required cards to put on the bottom before keeping.</p></div></header><div class="modal-body mulligan-grid">${playerPanels}</div></section></div>`;
}


function renderDamageModal(state) {
  const targetId = ui.damageOpen;
  const target = state.players[targetId];
  const sources = Object.values(state.players).flatMap((player) => Object.values(player.zones).flat()).filter((card) => card.commander && card.owner !== targetId);
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>${escapeHtml(target.name)} · Commander damage</h2><button class="icon-btn" data-action="close-damage">×</button></header><div class="modal-body">${sources.length ? sources.map((card) => `<div class="player-status" style="margin-bottom:8px"><div class="player-name-row"><span>${escapeHtml(card.name)}</span><strong>${target.commanderDamage[card.instanceId] || 0}/21</strong></div><div class="tracker-controls"><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="-5">-5</button><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="-1">-1</button><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="1">+1</button><button data-action="commander-damage" data-player-id="${targetId}" data-source-id="${card.instanceId}" data-delta="5">+5</button></div></div>`).join('') : '<div class="validation">Load an opposing commander first.</div>'}</div></section></div>`;
}

function renderLogModal(state) {
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>Game log</h2><button class="icon-btn" data-action="close-log">×</button></header><div class="modal-body">${state.log.map((item) => `<div class="validation" style="margin-bottom:6px"><span class="small muted">${new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><br />${escapeHtml(item.text)}</div>`).join('') || '<div class="validation">Actions will appear here.</div>'}</div></section></div>`;
}

function renderLoading() {
  return `<div class="loading-overlay"><div class="loading-card"><div class="spinner"></div><strong>${escapeHtml(ui.loading.title || 'Working…')}</strong><p class="muted">${escapeHtml(ui.loading.message || '')}</p></div></div>`;
}

function bothDraftsReady() {
  return ['p1', 'p2'].every((id) => ui.drafts[id].ready && !ui.drafts[id].validation?.errors.length);
}

function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast ${error ? 'error' : ''}`;
  node.textContent = message;
  toastRoot.append(node);
  setTimeout(() => node.remove(), 3100);
}

function showLoading(title, message = '') { ui.loading = { title, message }; render(); }
function updateLoading(message) { if (ui.loading) { ui.loading.message = message; render(); } }
function hideLoading() { ui.loading = null; render(); }

function horizontalWheel(event) {
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  }
}

app.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'next-phase') handleResult(nextPhase());
    if (action === 'undo') { if (!undo()) toast('Nothing to undo.'); }
    if (action === 'coach') { ui.inspectorMode = 'coach'; ui.inspectorOpen = true; render(); }
    if (action === 'run-coach') { showLoading('Analyzing possible lines', 'Sampling public-information-consistent hidden states…'); await new Promise((r) => setTimeout(r, 40)); ui.coach = analyzePosition(getState()); hideLoading(); }
    if (action === 'close-inspector') { ui.inspectorOpen = false; getState().selected = null; ui.inspectorMode = 'card'; render(); }
    if (action === 'open-log') { ui.logOpen = true; render(); }
    if (action === 'close-log') { ui.logOpen = false; render(); }
    if (action === 'open-settings') { ui.settingsOpen = true; render(); }
    if (action === 'close-settings') { saveSettingsFromModal(); ui.settingsOpen = false; render(); }
    if (action === 'open-setup') { ui.setupOpen = true; render(); }
    if (action === 'close-setup') { ui.setupOpen = false; render(); }
    if (action === 'open-token') { ui.settingsOpen = false; ui.tokenOpen = true; render(); }
    if (action === 'toggle-tokens') { const playerId = button.dataset.playerId; ui.hiddenTokens[playerId] = !ui.hiddenTokens[playerId]; render(); }
    if (action === 'close-token') { ui.tokenOpen = false; render(); }
    if (action === 'create-token') createTokenFromModal();
    if (action === 'open-damage') { ui.damageOpen = button.dataset.playerId; render(); }
    if (action === 'close-damage') { ui.damageOpen = null; render(); }
    if (action === 'adjust-player') adjustPlayer(button.dataset.playerId, button.dataset.field, Number(button.dataset.delta));
    if (action === 'commander-damage') adjustCommanderDamage(button.dataset.playerId, button.dataset.sourceId, Number(button.dataset.delta));
    if (action === 'mana') adjustMana(button.dataset.playerId, button.dataset.color, Number(button.dataset.delta));
    if (action === 'clear-mana') clearMana(button.dataset.playerId);
    if (action === 'open-zone') { ui.drawer = { playerId: button.dataset.playerId, zone: button.dataset.zone }; ui.drawerSearch = ''; ui.libraryReveal = null; render(); }
    if (action === 'close-drawer') { ui.drawer = null; ui.drawerSearch = ''; render(); }
    if (action === 'shuffle-library') shuffleLibrary(button.dataset.playerId);
    if (action === 'reveal-top') { handleResult(revealTopPublicly(button.dataset.playerId)); ui.libraryReveal = { playerId: button.dataset.playerId }; render(); }
    if (action === 'draw') draw(button.dataset.playerId, Number(button.dataset.amount || 1));
    if (action === 'mill') mill(button.dataset.playerId, Number(button.dataset.amount || 1));
    if (action === 'toggle-tap') handleResult(toggleTap(button.dataset.cardId));
    if (action === 'toggle-tap-only') handleResult(toggleTap(button.dataset.cardId, { mana: false }));
    if (action === 'tap-mana') handleResult(tapForMana(button.dataset.cardId, Number(button.dataset.choiceIndex || 0)));
    if (action === 'toggle-attack') handleResult(toggleAttack(button.dataset.cardId));
    if (action === 'assign-block') handleResult(assignBlocker(button.dataset.cardId, button.dataset.attackerId));
    if (action === 'attach-card') handleResult(attachCard(button.dataset.cardId, button.dataset.targetId));
    if (action === 'reveal-public') handleResult(revealCardPublicly(button.dataset.cardId));
    if (action === 'move-card') moveSelectedTo(button.dataset.cardId, button.dataset.zone);
    if (action === 'move-library') moveSelectedTo(button.dataset.cardId, 'library', button.dataset.position);
    if (action === 'flip-card') flipCard(button.dataset.cardId);
    if (action === 'copy-token') copyAsToken(button.dataset.cardId);
    if (action === 'counter') addCounter(button.dataset.cardId, button.dataset.counter, Number(button.dataset.delta));
    if (action === 'effect-condition') handleResult(setPendingEffectCondition(button.dataset.effectId, button.dataset.status));
    if (action === 'resolve-effect') handleResult(resolvePendingEffect(button.dataset.effectId));
    if (action === 'decline-effect') handleResult(resolvePendingEffect(button.dataset.effectId, { decline: true }));
    if (action === 'clear-combat') handleResult(clearCombatMarkers());
    if (action === 'activate-ability') handleResult(activateBattlefieldAbility(button.dataset.cardId, Number(button.dataset.abilityIndex || 0)));
    if (action === 'queue-manual-effect') {
      const description = prompt('Describe the effect that must be resolved before continuing:');
      if (description) {
        const condition = prompt('Optional condition that must be true before this effect happens. Leave blank when unconditional:') || '';
        handleResult(queueManualEffect(button.dataset.cardId, description, condition));
      }
    }
    if (action === 'resolve-stack') handleResult(resolveStackTop());
    if (action === 'counter-stack') counterStackTop();
    if (action === 'switch-player') switchActivePlayer();
    if (action === 'toggle-mulligan-card') { const set = ui.mulliganBottomSelections[button.dataset.playerId]; const id = button.dataset.cardId; if (set.has(id)) set.delete(id); else set.add(id); render(); }
    if (action === 'mulligan') { const playerId = button.dataset.playerId; const bottoms = mulligan(playerId); ui.mulliganBottomSelections[playerId].clear(); toast(bottoms ? `Draw 7, then choose ${bottoms} card(s) for the bottom.` : 'Free Commander mulligan: draw 7.'); }
    if (action === 'keep-hand') { const playerId = button.dataset.playerId; const result = keepOpeningHand(playerId, [...ui.mulliganBottomSelections[playerId]]); handleResult(result); if (result?.ok) ui.mulliganBottomSelections[playerId].clear(); }
    if (action === 'concede') { if (confirm(`${getState().players[button.dataset.playerId].name} concedes?`)) concede(button.dataset.playerId); }
    if (action === 'random-tool') runRandomTool(button.dataset.kind);
    if (action === 'export-save') downloadJson(`commander-forge-turn-${getState().turnNumber}.json`, getState());
    if (action === 'import-save') triggerFilePicker();
    if (action === 'reset-game') resetGamePrompt();
    if (action === 'deck-source') { const draft = ui.drafts[button.dataset.playerId]; draft.source = button.dataset.source; if (draft.source === 'precon') await ensurePreconIndex(); render(); }
    if (action === 'prepare-custom') await prepareCustomDeck(button.dataset.playerId);
    if (action === 'search-precon') await searchPrecons(button.dataset.playerId);
    if (action === 'load-precon') await loadPrecon(button.dataset.playerId, button.dataset.fileName);
    if (action === 'start-game') startGame();
    if (action === 'demo-game') loadDemoGame();
  } catch (error) {
    console.error(error);
    hideLoading();
    toast(error.message || 'Something went wrong.', true);
  }
});

app.addEventListener('input', debounce((event) => {
  const target = event.target;
  if (target.matches('[data-draft-field]')) ui.drafts[target.dataset.playerId][target.dataset.draftField] = target.value;
  if (target.id === 'drawer-search') {
    const position = target.selectionStart ?? target.value.length;
    ui.drawerSearch = target.value;
    render();
    requestAnimationFrame(() => {
      const replacement = document.querySelector('#drawer-search');
      replacement?.focus();
      replacement?.setSelectionRange(position, position);
    });
  }
  if (target.matches('.card-note')) updateCardNote(target.dataset.cardId, target.value);
}, 120));

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-commander-select]')) {
    const draft = ui.drafts[target.dataset.playerId];
    const index = target.dataset.commanderSelect === 'primary' ? 0 : 1;
    draft.commanders[index] = target.value;
    draft.commanders = draft.commanders.filter(Boolean);
    refreshDraftValidation(target.dataset.playerId);
    render();
  }
});

function saveSettingsFromModal() {
  const mode = document.querySelector('#rules-mode');
  if (!mode) return;
  updateState((draft) => {
    draft.settings.rulesMode = mode.value;
    draft.settings.manaMode = document.querySelector('#mana-mode')?.value || 'auto';
    draft.settings.hideOpponentHand = document.querySelector('#hide-opponent')?.checked ?? true;
    draft.settings.autoDraw = document.querySelector('#auto-draw')?.checked ?? true;
    draft.settings.showCardNames = document.querySelector('#show-names')?.checked ?? true;
    draft.settings.coachRollouts = Math.max(40, Math.min(240, Number(document.querySelector('#coach-rollouts')?.value || 240)));
  }, { snapshot: false });
}

function createTokenFromModal() {
  const playerId = document.querySelector('#token-player').value;
  const name = document.querySelector('#token-name').value.trim() || 'Token';
  const power = Number(document.querySelector('#token-power').value || 1);
  const toughness = Number(document.querySelector('#token-toughness').value || 1);
  const typeLine = document.querySelector('#token-type').value.trim() || 'Token Creature';
  const keywords = document.querySelector('#token-keywords').value.split(',').map((v) => v.trim()).filter(Boolean);
  const frameColor = document.querySelector('#token-frame-color').value;
  const accentColor = document.querySelector('#token-accent-color').value;
  const textColor = document.querySelector('#token-text-color').value;
  createToken(playerId, { name, power, toughness, typeLine, keywords, frameColor, accentColor, textColor });
  ui.tokenOpen = false;
  toast(`${name} token created.`);
}

function handleResult(result) {
  if (result && result.ok === false) toast(result.message || 'Action not allowed.', true);
}

function moveSelectedTo(cardId, zone, position = 'top') {
  const found = findCard(cardId, getState());
  if (!found) return;
  const targetPlayerId = zone === 'hand' || zone === 'library' || zone === 'graveyard' || zone === 'exile' || zone === 'command' ? found.card.owner : found.card.controller;
  handleResult(moveCard(cardId, targetPlayerId, zone, { libraryPosition: position }));
}

async function ensurePreconIndex() {
  if (ui.preconIndex) return;
  showLoading('Loading official precons', 'Downloading the MTGJSON deck index…');
  try { ui.preconIndex = await fetchPreconIndex(); }
  finally { hideLoading(); }
}

async function searchPrecons(playerId) {
  await ensurePreconIndex();
  const draft = ui.drafts[playerId];
  const query = draft.preconQuery.trim().toLocaleLowerCase();
  draft.preconResults = (ui.preconIndex || [])
    .filter((deck) => !query || `${deck.name} ${deck.code} ${deck.type}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
    .slice(0, 100);
  render();
}

async function prepareCustomDeck(playerId) {
  const draft = ui.drafts[playerId];
  const liveText = document.querySelector(`[data-draft-field="text"][data-player-id="${playerId}"]`)?.value;
  if (typeof liveText === 'string') draft.text = liveText;
  const liveName = document.querySelector(`[data-draft-field="name"][data-player-id="${playerId}"]`)?.value;
  if (typeof liveName === 'string') draft.name = liveName;
  const parsed = parseDecklist(draft.text);
  if (parsed.errors.length) {
    draft.validation = { errors: parsed.errors, warnings: [], total: parsed.entries.reduce((s, e) => s + e.count, 0) };
    draft.ready = false;
    render();
    return;
  }
  showLoading(`Loading ${draft.name}'s deck`, 'Looking up card names and images with Scryfall…');
  const result = await fetchCardsByNames(parsed.entries, ({ message }) => updateLoading(message));
  draft.entries = parsed.entries;
  draft.byName = result.byName;
  draft.cards = result.cards;
  draft.candidates = commanderCandidates(result.cards);
  if (!draft.commanders.length && draft.candidates.length === 1) draft.commanders = [draft.candidates[0].name];
  if (result.notFound.length) {
    draft.validation = { errors: [`Scryfall could not find: ${result.notFound.join(', ')}.`], warnings: [], total: parsed.entries.reduce((s, e) => s + e.count, 0) };
    draft.ready = false;
  } else refreshDraftValidation(playerId);
  hideLoading();
}

async function loadPrecon(playerId, fileName) {
  const draft = ui.drafts[playerId];
  const entry = (ui.preconIndex || []).find((deck) => deck.fileName === fileName);
  if (!entry) throw new Error('Precon entry not found.');
  showLoading(`Loading ${entry.name}`, 'Downloading the official deck list…');
  const precon = await fetchPreconDeck(entry);
  updateLoading('Loading card images and Oracle text…');
  const result = await fetchCardsByNames(precon.entries, ({ message }) => updateLoading(message));
  draft.entries = precon.entries;
  draft.byName = result.byName;
  draft.cards = result.cards;
  draft.candidates = commanderCandidates(result.cards);
  draft.commanders = precon.commanderNames.filter((name) => result.byName[name.toLocaleLowerCase()]).slice(0, 2);
  draft.text = precon.entries.map((item) => `${item.count} ${item.name}`).join('\n');
  draft.selectedPrecon = entry;
  if (result.notFound.length) draft.validation = { errors: [`Missing card data: ${result.notFound.join(', ')}.`], warnings: [], total: precon.entries.reduce((s, e) => s + e.count, 0) };
  else refreshDraftValidation(playerId);
  hideLoading();
}

function refreshDraftValidation(playerId) {
  const draft = ui.drafts[playerId];
  draft.validation = validateDeck(draft.entries, draft.byName, draft.commanders);
  draft.ready = draft.validation.errors.length === 0;
}

function startGame() {
  if (!bothDraftsReady()) return toast('Both decks must pass validation first.', true);
  const next = createInitialState();
  for (const playerId of ['p1', 'p2']) {
    const draft = ui.drafts[playerId];
    next.players[playerId].name = draft.name.trim() || next.players[playerId].name;
    buildPlayerDeck(next.players[playerId], draft, draft.commanders);
    drawCards(next, playerId, 7);
  }
  next.started = true;
  next.openingHands = { active: true, kept: { p1: false, p2: false }, bottomRequired: { p1: 0, p2: 0 } };
  next.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: 'Both decks shuffled. Each player drew seven cards.' });
  setState(next);
  ui.setupOpen = false;
  ui.inspectorOpen = false;
  ui.drawer = null;
  ui.mulliganBottomSelections = { p1: new Set(), p2: new Set() };
  toast('Game started. Drag cards or tap one for its side menu.');
}

function loadDemoGame() {
  const next = createInitialState();
  next.started = true;
  next.players.p1.name = 'You';
  next.players.p2.name = 'Practice Opponent';
  seedDemoPlayer(next.players.p1, ['Satoru Umezawa', 'Changeling Outcast', 'Sol Ring', 'Island', 'Swamp', 'Baleful Strix', 'Blightsteel Colossus', 'Lightning Greaves', 'Fallen Shinobi']);
  seedDemoPlayer(next.players.p2, ['Gisa and Geralf', 'Mire Triton', 'Gray Merchant of Asphodel', 'Island', 'Swamp', 'Diregraf Captain', 'Murder', 'Sol Ring', 'Zombie Token']);
  next.log.unshift({ id: uid('log'), time: new Date().toISOString(), text: 'Interactive demo loaded.' });
  setState(next);
  ui.setupOpen = false;
  toast('Demo loaded. Try dragging cards between zones.');
}

function seedDemoPlayer(player, names) {
  const cards = names.map((name, index) => demoCard(name, player.id, index));
  cards[0].commander = true;
  player.zones.command = [cards.shift()];
  player.commanderCastCount[player.zones.command[0].instanceId] = 0;
  player.zones.hand = cards.slice(0, 5);
  player.zones.battlefield = cards.slice(5, 7).map((card) => ({ ...card, summoningSick: false }));
  player.zones.library = shuffle([...cards.slice(7), ...Array.from({ length: 20 }, (_, i) => demoCard(`Practice Card ${i + 1}`, player.id, i + 20))]);
}

function demoCard(name, owner, index) {
  const land = /Island|Swamp|Practice Card/.test(name) && index % 3 === 0;
  const creature = !land && !/Sol Ring|Lightning Greaves|Murder/.test(name);
  return {
    instanceId: uid('demo'), scryfallId: null, name,
    manaCost: land ? '' : creature ? '{2}{U}{B}' : '{1}', manaValue: land ? 0 : creature ? 4 : 1,
    typeLine: land ? 'Basic Land' : creature ? 'Creature — Practice' : /Murder/.test(name) ? 'Instant' : 'Artifact',
    oracleText: demoOracleText(name, land),
    producedMana: demoProducedMana(name, land),
    power: creature ? String((index % 5) + 1) : '', toughness: creature ? String((index % 4) + 2) : '',
    keywords: name.includes('Changeling') ? ['Unblockable'] : [], colors: [], colorIdentity: [], legalities: { commander: 'legal' },
    image: './demo-card.svg', imageSmall: './demo-card.svg', owner, controller: owner,
    tapped: false, summoningSick: false, attacking: false, faceDown: false, token: false, commander: false, counters: {}, notes: '',
  };
}


function demoProducedMana(name, land) {
  if (name === 'Island') return ['U'];
  if (name === 'Swamp') return ['B'];
  if (name === 'Sol Ring') return ['C'];
  if (land) return ['C'];
  return [];
}

function demoOracleText(name, land) {
  if (name === 'Island') return '{T}: Add {U}.';
  if (name === 'Swamp') return '{T}: Add {B}.';
  if (name === 'Sol Ring') return '{T}: Add {C}{C}.';
  if (land) return '{T}: Add {C}.';
  return `Demo Oracle text for ${name}. Resolve card-specific effects manually.`;
}

function triggerFilePicker() {
  const input = document.querySelector('#settings-file-input') || document.querySelector('#save-file-input');
  input?.click();
}

document.addEventListener('change', async (event) => {
  if (!['settings-file-input', 'save-file-input'].includes(event.target.id)) return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    importState(parsed);
    ui.settingsOpen = false;
    ui.setupOpen = false;
    toast('Saved game imported.');
  } catch (error) { toast(error.message || 'Could not import save.', true); }
});


function runRandomTool(kind) {
  let result;
  if (kind === 'coin') result = Math.random() < .5 ? 'Heads' : 'Tails';
  else result = String(Math.floor(Math.random() * Number(kind.replace('d', ''))) + 1);
  updateState(() => {}, { snapshot: false, log: `${kind === 'coin' ? 'Coin flip' : kind.toUpperCase()} result: ${result}.` });
  toast(`${kind === 'coin' ? 'Coin' : kind.toUpperCase()}: ${result}`);
}

function resetGamePrompt() {
  if (!confirm('Reset the entire table and remove the current saved game?')) return;
  resetState();
  ui.settingsOpen = false;
  ui.setupOpen = true;
  ui.drafts = { p1: createDraft('Player 1'), p2: createDraft('Player 2') };
}

const dragState = { candidate: null, active: false, ghost: null, over: null, overCard: null };

document.addEventListener('pointerdown', (event) => {
  const card = event.target.closest('.game-card[data-card-id], .stack-mini[data-card-id], .attached-mini[data-card-id]');
  if (!card || event.button > 0) return;
  dragState.candidate = {
    cardId: card.dataset.cardId,
    startX: event.clientX,
    startY: event.clientY,
    pointerId: event.pointerId,
    image: card.querySelector('img')?.src || card.src,
  };
});

document.addEventListener('pointermove', (event) => {
  const candidate = dragState.candidate;
  if (!candidate || candidate.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
  if (!dragState.active && distance > 9) {
    dragState.active = true;
    dragState.ghost = document.createElement('div');
    dragState.ghost.className = 'drag-ghost';
    dragState.ghost.innerHTML = `<img src="${escapeHtml(candidate.image)}" alt="Dragging card" />`;
    document.body.append(dragState.ghost);
    document.body.classList.add('dragging');
  }
  if (!dragState.active) return;
  event.preventDefault();
  dragState.ghost.style.left = `${event.clientX}px`;
  dragState.ghost.style.top = `${event.clientY}px`;
  dragState.over?.classList.remove('drag-over');
  dragState.overCard?.classList.remove('attachment-drop-target');
  dragState.ghost.style.display = 'none';
  const under = document.elementFromPoint(event.clientX, event.clientY);
  dragState.ghost.style.display = '';
  const source = findCard(candidate.cardId, getState());
  const targetCardElement = under?.closest('.game-card[data-card-id]') || null;
  const target = targetCardElement ? findCard(targetCardElement.dataset.cardId, getState()) : null;
  const canAttach = source && target && source.card.instanceId !== target.card.instanceId
    && source.zone === 'battlefield' && target.zone === 'battlefield'
    && /Aura|Equipment/i.test(String(source.card.typeLine || ''))
    && (!/Equipment/i.test(String(source.card.typeLine || '')) || isCreature(target.card));
  dragState.overCard = canAttach ? targetCardElement : null;
  dragState.overCard?.classList.add('attachment-drop-target');
  dragState.over = canAttach ? null : (under?.closest('[data-drop-zone]') || null);
  dragState.over?.classList.add('drag-over');
}, { passive: false });

document.addEventListener('pointerup', (event) => {
  const candidate = dragState.candidate;
  if (!candidate || candidate.pointerId !== event.pointerId) return;
  if (dragState.active) {
    if (dragState.overCard) {
      handleResult(attachCard(candidate.cardId, dragState.overCard.dataset.cardId));
    } else {
      const target = dragState.over;
      if (target) {
      const zone = target.dataset.dropZone;
      const playerId = target.dataset.playerId || getState().activePlayerId;
      const result = moveCard(candidate.cardId, playerId, zone);
        handleResult(result);
      }
    }
  } else {
    selectCard(candidate.cardId);
  }
  cleanupDrag();
});

document.addEventListener('pointercancel', cleanupDrag);

function cleanupDrag() {
  dragState.over?.classList.remove('drag-over');
  dragState.overCard?.classList.remove('attachment-drop-target');
  dragState.ghost?.remove();
  dragState.candidate = null;
  dragState.active = false;
  dragState.ghost = null;
  dragState.over = null;
  dragState.overCard = null;
  document.body.classList.remove('dragging');
}

function selectCard(cardId) {
  if (!findCard(cardId, getState())) return;
  updateState((draft) => { draft.selected = { instanceId: cardId }; }, { snapshot: false });
  ui.inspectorMode = 'card';
  ui.inspectorOpen = true;
  render();
}

// Service worker temporarily disabled by the synchronized recovery build.

})();
