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
  hideOpponentHand: false,
  autoDraw: true,
  coachRollouts: 80,
  coachInformationSetV4: true,
  coachTacticalV5: true,
  confirmCommanderMoves: true,
  showCardNames: true,
  manaMode: 'auto',
  manaAutomationV3: true,
  enforceLandPlays: true,
  phaseSafetyV6: true,
  tabletopUXV7: true,
  tokenPeekV8: true,
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
  return [
    ...MANA_COLORS.map((color) => Number(choice.mana?.[color] || 0)),
    choice.activationManaCost || '',
    choice.requiresTap ? 'T' : '',
    choice.sacrificeSource ? 'S' : '',
    (choice.restrictions || []).join(','),
  ].join(':');
}

function dedupeChoices(choices) {
  const seen = new Set();
  return choices.filter((choice) => {
    if (!manaBundleAmount(choice.mana)) return false;
    const key = choiceKey(choice);
    if (seen.has(key)) return false;
    seen.add(key);
    choice.label = choice.label || formatManaBundle(choice.mana);
    choice.restrictions ||= [];
    return true;
  });
}

function manaRestrictions(text = '') {
  const clean = String(text).toLocaleLowerCase();
  return [
    /only to cast (?:a )?creature spell/.test(clean) && 'creature-spells-only',
    /only to cast (?:an )?artifact spell/.test(clean) && 'artifact-spells-only',
    /only to cast (?:an )?enchantment spell/.test(clean) && 'enchantment-spells-only',
    /only to cast (?:an )?instant or sorcery spell/.test(clean) && 'instant-sorcery-only',
    /only to cast (?:a spell that is )?colorless/.test(clean) && 'colorless-spells-only',
    /only to cast your commander|only to cast commander spells?/.test(clean) && 'commander-only',
    /only to activate abilities/.test(clean) && 'abilities-only',
    /only to cast spells from your graveyard/.test(clean) && 'graveyard-spells-only',
  ].filter(Boolean);
}

function activationMetadata(prefix = '', fullText = '') {
  const manaCost = [...String(prefix).matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((symbol) => /^\d+$|^[WUBRGC](?:\/[WUBRGC])?$/.test(symbol))
    .map((symbol) => `{${symbol}}`)
    .join('');
  return {
    requiresTap: /\{T\}/i.test(prefix),
    activationManaCost: manaCost,
    lifeCost: Number(String(prefix).match(/pay (\d+) life/i)?.[1] || 0),
    sacrificeSource: /sacrifice (?:this artifact|this permanent|~|treasure|clue|food|this land)/i.test(prefix),
    discardCost: /discard a card/i.test(prefix),
    restrictions: manaRestrictions(fullText),
  };
}

function dynamicManaAmount(text, player) {
  const battlefield = player?.zones?.battlefield || [];
  if (/equal to the number of creatures you control/i.test(text)) return battlefield.filter(isCreature).length;
  if (/equal to the number of lands you control/i.test(text)) return battlefield.filter(isLand).length;
  if (/equal to the number of artifacts you control/i.test(text)) return battlefield.filter((card) => /\bArtifact\b/.test(card.typeLine || card.type_line || '')).length;
  if (/equal to the number of enchantments you control/i.test(text)) return battlefield.filter((card) => /\bEnchantment\b/.test(card.typeLine || card.type_line || '')).length;
  return 1;
}

function anyColorChoices(amount, metadata, colors = ['W', 'U', 'B', 'R', 'G']) {
  return colors.map((color) => {
    const mana = emptyManaBundle();
    mana[color] = Math.max(1, Number(amount || 1));
    return { mana, label: amount > 1 ? `${amount}${color}` : color, ...metadata };
  });
}

/**
 * Returns each distinct mana ability as an executable choice. Besides the
 * produced bundle, a choice records tap/life/sacrifice/activation costs and
 * spending restrictions so the coach cannot treat every land as generic mana.
 */
function manaProductionChoices(card, context = {}) {
  if (!card) return [];
  const text = String(card.oracleText || card.oracle_text || '').replace(/[−–—]/g, '-');
  const type = String(card.typeLine || card.type_line || '');
  const player = context.player || null;
  const choices = [];

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/\badd\b/i.test(line)) continue;
    const colon = line.indexOf(':');
    const prefix = colon >= 0 ? line.slice(0, colon) : '';
    const instruction = colon >= 0 ? line.slice(colon + 1) : line;
    const metadata = activationMetadata(prefix, line);

    const identity = instruction.match(/add (?:one )?mana of any color in your commander's color identity/i);
    if (identity) {
      const identityColors = (player?.colorIdentity || []).filter((color) => ['W', 'U', 'B', 'R', 'G'].includes(color));
      choices.push(...anyColorChoices(1, metadata, identityColors.length ? identityColors : ['C']));
      continue;
    }

    const anyColor = instruction.match(/add\s+(?:(one|two|three|four|five|six|\d+)\s+)?mana\s+of\s+any(?:\s+one)?\s+color/i);
    if (anyColor) {
      const amount = /^\d+$/.test(anyColor[1] || '') ? Number(anyColor[1]) : (WORD_NUMBERS[(anyColor[1] || 'one').toLowerCase()] || dynamicManaAmount(instruction, player));
      choices.push(...anyColorChoices(amount, metadata));
      continue;
    }

    const symbols = manaSymbols(instruction).filter((symbol) => MANA_COLORS.includes(symbol));
    if (!symbols.length) continue;
    if (/\bor\b/i.test(instruction)) {
      const groups = instruction
        .replace(/,/g, ' ')
        .split(/\s+or\s+/i)
        .map((group) => manaSymbols(group).filter((symbol) => MANA_COLORS.includes(symbol)))
        .filter((group) => group.length);
      if (groups.length > 1) {
        groups.forEach((group) => choices.push({ mana: bundleFromSymbols(group), ...metadata }));
        continue;
      }
    }
    if (symbols.length > 1 && /,/.test(instruction) && !/\}\s*\{/i.test(instruction.replace(/\s/g, ''))) {
      symbols.forEach((symbol) => choices.push({ mana: bundleFromSymbols([symbol]), ...metadata }));
      continue;
    }
    choices.push({ mana: bundleFromSymbols(symbols), ...metadata });
  }

  if (!choices.length) {
    const basics = [
      ['Plains', 'W'], ['Island', 'U'], ['Swamp', 'B'],
      ['Mountain', 'R'], ['Forest', 'G'], ['Wastes', 'C'],
    ];
    for (const [landType, color] of basics) {
      if (!type.includes(landType)) continue;
      const mana = emptyManaBundle();
      mana[color] = 1;
      choices.push({ mana, label: color, requiresTap: true, activationManaCost: '', lifeCost: 0, sacrificeSource: false, restrictions: [] });
    }
  }

  if (!choices.length) {
    const colors = [...new Set((card.producedMana || card.produced_mana || []).filter((color) => MANA_COLORS.includes(color)))];
    for (const color of colors) {
      const mana = emptyManaBundle();
      mana[color] = 1;
      choices.push({ mana, label: color, requiresTap: true, activationManaCost: '', lifeCost: 0, sacrificeSource: false, restrictions: [] });
    }
  }

  return dedupeChoices(choices);
}

function manaProductionOptions(card, context = {}) {
  return manaProductionChoices(card, context).flatMap((choice, choiceIndex) =>
    MANA_COLORS
      .filter((color) => Number(choice.mana[color] || 0) > 0)
      .map((color) => ({ color, amount: Number(choice.mana[color] || 0), choiceIndex, mana: choice.mana, label: choice.label, choice })),
  );
}

function manaSourceLabel(card, context = {}) {
  const choices = manaProductionChoices(card, context);
  return choices.map((choice) => choice.label).join(' / ');
}

function canActivateManaChoice(card, choice, player = null) {
  if (!card || card.tapped) return false;
  const creature = isCreature(card);
  const haste = [...(card.keywords || []), ...(card.manualKeywords || [])].some((value) => /^haste$/i.test(String(value).trim())) || /\bhaste\b/i.test(card.oracleText || '');
  if (choice?.requiresTap && creature && card.summoningSick && !haste) return false;
  if (choice?.lifeCost && Number(player?.life || 0) <= Number(choice.lifeCost)) return false;
  if (choice?.discardCost && !(player?.zones?.hand || []).length) return false;
  return true;
}

function untappedManaSources(player) {
  return (player?.zones?.battlefield || [])
    .filter((card) => !card.tapped)
    .map((card) => ({ card, choices: manaProductionChoices(card, { player }).filter((choice) => canActivateManaChoice(card, choice, player)) }))
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
  return [...(card?.keywords || []), ...(card?.manualKeywords || [])].some((value) => /^flash$/i.test(String(value).trim())) || /flash/i.test(card?.oracleText || card?.oracle_text || '');
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


return { uid, deepClone, shuffle, clamp, escapeHtml, normalizeName, parseDecklist, manaSymbols, manaRequirement, manaBundleAmount, formatManaBundle, manaProductionChoices, manaProductionOptions, manaSourceLabel, canActivateManaChoice, untappedManaSources, totalMana, cardImage, cardSmallImage, isCreature, isLand, isPermanent, hasFlash, numericStat, downloadJson, formatZone, debounce };
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


const PREDEFINED_TOKEN_CACHE_KEY = 'commander-forge-predefined-tokens-v1';
const PREDEFINED_TOKEN_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function compactTokenFace(face = {}) {
  return {
    name: face.name || 'Token',
    manaCost: face.mana_cost || '',
    typeLine: face.type_line || '',
    oracleText: face.oracle_text || '',
    power: face.power ?? '',
    toughness: face.toughness ?? '',
    loyalty: face.loyalty ?? '',
    colors: [...(face.colors || [])],
    image: face.image_uris?.normal || null,
    imageSmall: face.image_uris?.small || face.image_uris?.normal || null,
  };
}

function compactPredefinedToken(raw) {
  const compact = compactScryfallCard(raw);
  const faces = (raw.card_faces || []).map(compactTokenFace).filter((face) => face.name);
  return {
    ...compact,
    tokenFaces: faces,
    setCode: raw.set || '',
    collectorNumber: raw.collector_number || '',
    releasedAt: raw.released_at || '',
  };
}

function predefinedTokenSignature(card) {
  return [
    card.name, card.typeLine, card.oracleText, card.power, card.toughness,
    (card.colors || []).join(''), card.layout,
    (card.tokenFaces || []).map((face) => `${face.name}|${face.typeLine}|${face.oracleText}|${face.power}|${face.toughness}`).join('||'),
  ].join('::').toLocaleLowerCase();
}

async function fetchPredefinedTokens(force = false, onProgress = () => {}) {
  const cached = readCache(PREDEFINED_TOKEN_CACHE_KEY);
  if (!force && cached.cards?.length && Date.now() - Number(cached.updatedAt || 0) < PREDEFINED_TOKEN_CACHE_MAX_AGE) {
    onProgress({ loaded: cached.cards.length, total: cached.cards.length, message: `${cached.cards.length} predefined tokens ready.` });
    return cached.cards;
  }

  const query = '(layout:token OR layout:double_faced_token) lang:en';
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name&include_extras=true`;
  const cards = [];
  let page = 0;
  let estimatedTotal = 0;
  while (url) {
    page += 1;
    onProgress({ loaded: cards.length, total: estimatedTotal, message: `Loading official token definitions · page ${page}…` });
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' } }, 20_000);
    if (!response.ok) throw new Error(`Scryfall token search returned ${response.status}.`);
    const payload = await response.json();
    estimatedTotal = Number(payload.total_cards || estimatedTotal || 0);
    for (const raw of payload.data || []) cards.push(compactPredefinedToken(raw));
    url = payload.has_more ? payload.next_page : null;
    if (url) await delay(110);
  }

  const unique = [];
  const seen = new Set();
  for (const card of cards) {
    const signature = predefinedTokenSignature(card);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(card);
  }
  unique.sort((a, b) => a.name.localeCompare(b.name) || a.typeLine.localeCompare(b.typeLine));
  writeCache(PREDEFINED_TOKEN_CACHE_KEY, { cards: unique, updatedAt: Date.now() });
  onProgress({ loaded: unique.length, total: unique.length, message: `${unique.length} predefined tokens ready.` });
  return unique;
}


return { fetchCardsByNames, fetchPreconIndex, fetchPreconDeck, fetchPredefinedTokens };
})();

// ---- card-rules-model.js ----
__modules["./card-rules-model.js"] = (() => {
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

const KEYWORD_NAMES = [
  'Absorb', 'Afflict', 'Afterlife', 'Annihilator', 'Battle cry', 'Bushido',
  'Cascade', 'Changeling', 'Convoke', 'Deathtouch', 'Defender', 'Delve',
  'Double strike', 'Exalted', 'Exploit', 'Extort', 'Fear', 'First strike',
  'Flash', 'Flying', 'Goad', 'Haste', 'Hexproof', 'Horsemanship',
  'Improvise', 'Indestructible', 'Infect', 'Intimidate', 'Landwalk',
  'Lifelink', 'Menace', 'Myriad', 'Persist', 'Protection', 'Prowess',
  'Reach', 'Riot', 'Shadow', 'Shroud', 'Skulk', 'Toxic', 'Trample',
  'Undying', 'Vigilance', 'Ward', 'Wither',
];

const COLOR_WORDS = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: 'C',
};

function textOf(card) {
  const printed = String(card?.oracleText || card?.oracle_text || '');
  const manual = (card?.manualKeywords || []).map((value) => String(value || '').trim()).filter(Boolean).join('\n');
  return [printed, manual].filter(Boolean).join('\n').replace(/[−–—]/g, '-');
}

function typeOf(card) {
  return String(card?.typeLine || card?.type_line || '');
}

function lower(value) { return String(value || '').toLocaleLowerCase(); }

function numericWord(value, fallback = 0) {
  const clean = lower(value).trim();
  if (/^\d+$/.test(clean)) return Number(clean);
  return NUMBER_WORDS[clean] ?? fallback;
}

function keywordSet(card) {
  const set = new Set([...(card?.keywords || []), ...(card?.manualKeywords || [])].map((keyword) => lower(keyword)));
  const text = textOf(card);
  for (const keyword of KEYWORD_NAMES) {
    const normalized = lower(keyword);
    const pattern = normalized === 'landwalk'
      ? /\b(?:plainswalk|islandwalk|swampwalk|mountainwalk|forestwalk|landwalk)\b/i
      : new RegExp(`\\b${normalized.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (pattern.test(text)) set.add(normalized);
  }
  if (/can't be blocked/i.test(text)) set.add('unblockable');
  if (/attacks each combat if able/i.test(text)) set.add('must attack');
  if (/can't attack alone/i.test(text)) set.add("can't attack alone");
  if (/can't block/i.test(text)) set.add("can't block");
  return set;
}

function parseProtection(text) {
  const qualities = [];
  for (const match of text.matchAll(/protection from ([^.;\n]+)/gi)) {
    const raw = match[1].trim();
    for (const piece of raw.split(/,| and /i).map((value) => value.trim()).filter(Boolean)) qualities.push(lower(piece));
  }
  return [...new Set(qualities)];
}

function parseWard(text) {
  const match = text.match(/ward\s*(?:-|—)?\s*(\{[^\n.]+?\}|pay\s+\d+\s+life|discard\s+a\s+card|sacrifice\s+a\s+permanent)/i);
  return match?.[1]?.trim() || '';
}

function parseNamedNumber(text, keyword) {
  const match = text.match(new RegExp(`\\b${keyword}\\s+(\\d+|[a-z]+)`, 'i'));
  return match ? numericWord(match[1], 0) : 0;
}

function parseLandwalk(text) {
  const values = [];
  for (const match of text.matchAll(/\b(plains|island|swamp|mountain|forest|land)walk\b/gi)) values.push(`${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`);
  return [...new Set(values)];
}

function parseGrantedKeywords(text) {
  const results = [];
  const patterns = [
    /(?:creatures|creature tokens) you control have ([^.]+)/gi,
    /other ([A-Za-z -]+) creatures you control have ([^.]+)/gi,
    /(?:equipped|enchanted) creature has ([^.]+)/gi,
    /(?:equipped|enchanted) creature gains ([^.]+)/gi,
    /(?:equipped|enchanted) creature gets [^.]+? and (?:has|gains) ([^.]+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const phrase = match[match.length - 1];
      const found = KEYWORD_NAMES.filter((keyword) => new RegExp(`\\b${lower(keyword).replace(/\s+/g, '\\s+')}\\b`, 'i').test(phrase));
      if (/can't be blocked/i.test(phrase)) found.push('Unblockable');
      results.push(...found.map(lower));
    }
  }
  return [...new Set(results)];
}

function parsePumps(text) {
  const effects = [];
  const patterns = [
    { scope: 'all', re: /(?:other )?creatures you control get ([+-]\d+)\/([+-]\d+)/gi },
    { scope: 'tribal', re: /(?:other )?([A-Za-z -]+) creatures you control get ([+-]\d+)\/([+-]\d+)/gi },
    { scope: 'attached', re: /(?:equipped|enchanted) creature gets ([+-]\d+)\/([+-]\d+)/gi },
    { scope: 'all-creatures', re: /all creatures get ([+-]\d+)\/([+-]\d+)/gi },
  ];
  for (const { scope, re } of patterns) {
    for (const match of text.matchAll(re)) {
      if (scope === 'tribal') effects.push({ scope, subtype: match[1].trim(), power: Number(match[2]), toughness: Number(match[3]) });
      else effects.push({ scope, power: Number(match[1]), toughness: Number(match[2]) });
    }
  }
  return effects;
}

function parseCombatRestrictions(text) {
  const powerLimit = text.match(/can't be blocked by creatures with power (\d+) or (?:greater|more)/i);
  const powerFloor = text.match(/can't be blocked by creatures with power (\d+) or less/i);
  return {
    cannotAttack: /(?:this creature|~) can't attack/i.test(text),
    cannotBlock: /(?:this creature|~) can't block/i.test(text),
    attacksEachCombat: /attacks each combat if able/i.test(text),
    attacksAloneRestriction: /can't attack alone/i.test(text),
    mustBeBlocked: /must be blocked if able/i.test(text),
    maxOneBlocker: /can't be blocked by more than one creature/i.test(text),
    needsTwoOrMoreBlockers: /can't be blocked except by two or more creatures/i.test(text),
    blockPowerAtLeast: powerLimit ? Number(powerLimit[1]) + 1 : null,
    blockPowerAtMost: powerFloor ? Number(powerFloor[1]) : null,
  };
}

function parseSpellRestrictions(text) {
  return {
    onlyDuringCombat: /cast this spell only during combat/i.test(text),
    onlyDuringOwnTurn: /cast this spell only during your turn/i.test(text),
    onlyDuringOpponentTurn: /cast this spell only during an opponent's turn/i.test(text),
    onlyAfterAttacker: /cast this spell only after attackers have been declared/i.test(text),
    cannotBeCountered: /this spell can't be countered/i.test(text),
    splitSecond: /\bsplit second\b/i.test(text),
  };
}

function parseActivatedAbilities(text) {
  const abilities = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const cost = line.slice(0, colon).trim();
    const effect = line.slice(colon + 1).trim();
    const manaCost = [...cost.matchAll(/\{([^}]+)\}/g)]
      .map((match) => match[1])
      .filter((symbol) => /^\d+$|^[WUBRGC](?:\/[WUBRGC])?$/.test(symbol))
      .map((symbol) => `{${symbol}}`)
      .join('');
    abilities.push({
      cost,
      effect,
      manaCost,
      tap: /\{T\}/i.test(cost),
      untap: /\{Q\}/i.test(cost),
      sacrifice: /sacrifice/i.test(cost),
      discard: /discard/i.test(cost),
      loyalty: /^[-+−]\d+/.test(cost),
      manaAbility: /^.*(?:\{T\}|sacrifice|pay).*:\s*add\b/i.test(line) || /^\{T\}:\s*add\b/i.test(line),
      sorcerySpeedOnly: /activate only as a sorcery/i.test(line),
      onceEachTurn: /activate only once each turn/i.test(line),
    });
  }
  return abilities;
}

function parseEffectTags(text, typeLine = '') {
  const instant = /\bInstant\b/.test(typeLine);
  return {
    draw: /draw (?:a|an|one|two|three|four|five|six|seven|\d+) cards?/i.test(text),
    discard: /(?:target player|each opponent|opponent) discards?|discard (?:a|your hand|\d+)/i.test(text),
    mill: /\bmill(?:s)? (?:a|one|two|three|four|five|six|\d+)/i.test(text),
    tutor: /search (?:your|target player's) library/i.test(text),
    ramp: /search your library for (?:a|up to .*?) (?:basic )?land|put .* land card .* onto the battlefield/i.test(text),
    tokenMaker: /create .* token/i.test(text),
    recursion: /return target .* from .*graveyard|cast .* from your graveyard|play .* from your graveyard|graveyard to (?:your hand|the battlefield)/i.test(text),
    graveyardInteraction: /exile target card from a graveyard|cards? in graveyards? can't|graveyard to exile/i.test(text),
    counterspell: /counter target (?:spell|activated ability|triggered ability)/i.test(text),
    boardWipe: /destroy all|exile all|all creatures get -\d+\/-\d+|deals? \d+ damage to each creature|return all .* to their owners?' hands/i.test(text),
    targetedRemoval: /destroy target|exile target|return target .* to (?:its owner's|their owner's|your) hand|target creature gets -\d+\/-\d+|deals? \d+ damage to target creature/i.test(text),
    protectionSpell: instant && /gains? (?:hexproof|indestructible|protection)|phase[s]? out|regenerate target/i.test(text),
    combatTrick: instant && /gets? [+-][0-9X]+\/[+-][0-9X]+|gains? (?:first strike|double strike|trample|deathtouch|lifelink|flying|hexproof|indestructible)/i.test(text),
    extraTurn: /take an extra turn/i.test(text),
    extraCombat: /additional combat phase/i.test(text),
    blink: /exile .* then return .* to the battlefield/i.test(text),
    copy: /copy target|create a token that's a copy|becomes a copy/i.test(text),
    sacrificeOutlet: /sacrifice [^:]+:/i.test(text),
    lifeDrain: /each opponent loses|you gain .* life.*each opponent/i.test(text),
  };
}

function analyzeCardRulesUncached(card) {
  const text = textOf(card);
  const typeLine = typeOf(card);
  const keys = keywordSet(card);
  const activatedAbilities = parseActivatedAbilities(text);
  const protectionFrom = parseProtection(text);
  return {
    text,
    typeLine,
    supertypes: typeLine.split('—')[0].trim().split(/\s+/).filter(Boolean),
    subtypes: (typeLine.split('—')[1] || '').trim().split(/\s+/).filter(Boolean),
    colors: [...(card?.colors || [])],
    keywords: keys,
    flying: keys.has('flying'),
    reach: keys.has('reach'),
    menace: keys.has('menace'),
    deathtouch: keys.has('deathtouch'),
    firstStrike: keys.has('first strike'),
    doubleStrike: keys.has('double strike'),
    trample: keys.has('trample'),
    lifelink: keys.has('lifelink'),
    vigilance: keys.has('vigilance'),
    haste: keys.has('haste'),
    flash: keys.has('flash'),
    indestructible: keys.has('indestructible'),
    hexproof: keys.has('hexproof'),
    shroud: keys.has('shroud'),
    defender: keys.has('defender'),
    fear: keys.has('fear'),
    intimidate: keys.has('intimidate'),
    shadow: keys.has('shadow'),
    horsemanship: keys.has('horsemanship'),
    skulk: keys.has('skulk'),
    infect: keys.has('infect'),
    wither: keys.has('wither'),
    prowess: keys.has('prowess'),
    exalted: keys.has('exalted'),
    battleCry: keys.has('battle cry'),
    persist: keys.has('persist'),
    undying: keys.has('undying'),
    myriad: keys.has('myriad'),
    toxic: parseNamedNumber(text, 'toxic'),
    afflict: parseNamedNumber(text, 'afflict'),
    annihilator: parseNamedNumber(text, 'annihilator'),
    absorb: parseNamedNumber(text, 'absorb'),
    ward: keys.has('ward'),
    wardCost: parseWard(text),
    protection: protectionFrom.length > 0,
    protectionFrom,
    landwalk: parseLandwalk(text),
    unblockable: keys.has('unblockable'),
    grantedKeywords: parseGrantedKeywords(text),
    pumpEffects: parsePumps(text),
    combatRestrictions: parseCombatRestrictions(text),
    spellRestrictions: parseSpellRestrictions(text),
    activatedAbilities,
    manaAbilities: activatedAbilities.filter((ability) => ability.manaAbility),
    effectTags: parseEffectTags(text, typeLine),
    deathTrigger: /whenever .* dies|when .* dies|put into a graveyard from the battlefield/i.test(text),
    attackTrigger: /whenever .* attacks|when .* attacks|at the beginning of combat/i.test(text),
    combatDamageTrigger: /whenever .* deals combat damage|combat damage to (?:a player|an opponent)/i.test(text),
    enterTrigger: /when(?:ever)? .* enters(?: the battlefield)?/i.test(text),
    upkeepTrigger: /at the beginning of .* upkeep/i.test(text),
    endStepTrigger: /at the beginning of .* end step/i.test(text),
    staticEffect: /creatures you control get|other .* get|players can't|spells .* cost|you may|each opponent|cards? in .* have|maximum hand size/i.test(text),
    extraLandPlays: (() => {
      const match = text.match(/you may play (?:up to )?(an?|one|two|three|\d+) additional lands? on each of your turns/i);
      return match ? Math.max(1, numericWord(match[1], 1)) : (/you may play an additional land on each of your turns/i.test(text) ? 1 : 0);
    })(),
    flashGrant: /you may cast (?:creature|artifact|enchantment|nonland permanent)?\s*spells as though they had flash/i.test(text),
    noCreatureSpells: /players can't cast creature spells/i.test(text),
    oneSpellPerTurn: /players can't cast more than one spell each turn|each player can't cast more than one spell each turn/i.test(text),
  };
}

const CARD_RULES_CACHE = new WeakMap();

function analyzeCardRules(card) {
  if (!card || typeof card !== 'object') return analyzeCardRulesUncached(card);
  const signature = `${card.oracleText || card.oracle_text || ''}${card.typeLine || card.type_line || ''}${(card.keywords || []).join('|')}${(card.manualKeywords || []).join('|')}${(card.colors || []).join('|')}`;
  const cached = CARD_RULES_CACHE.get(card);
  if (cached?.signature === signature) return cached.value;
  const value = analyzeCardRulesUncached(card);
  CARD_RULES_CACHE.set(card, { signature, value });
  return value;
}

function qualityMatches(source, quality) {
  const q = lower(quality);
  const sourceRules = analyzeCardRules(source);
  const sourceType = lower(sourceRules.typeLine);
  const sourceColors = new Set((source?.colors || []).map(String));
  if (q === 'everything') return true;
  for (const [word, symbol] of Object.entries(COLOR_WORDS)) if (q.includes(word) && sourceColors.has(symbol)) return true;
  if (q.includes('artifacts') && sourceType.includes('artifact')) return true;
  if (q.includes('creatures') && sourceType.includes('creature')) return true;
  if (q.includes('instants') && sourceType.includes('instant')) return true;
  if (q.includes('sorceries') && sourceType.includes('sorcery')) return true;
  if (q.includes('monocolored') && sourceColors.size === 1) return true;
  if (q.includes('multicolored') && sourceColors.size > 1) return true;
  return false;
}

function hasProtectionFrom(target, source) {
  const rules = analyzeCardRules(target);
  return rules.protectionFrom.some((quality) => qualityMatches(source, quality));
}

function canTargetPermanent(source, target, sourceControllerId = null) {
  const targetRules = analyzeCardRules(target);
  if (targetRules.shroud) return { legal: false, reason: `${target.name} has shroud.` };
  if (targetRules.hexproof && sourceControllerId && sourceControllerId !== target.controller) return { legal: false, reason: `${target.name} has hexproof.` };
  if (hasProtectionFrom(target, source)) return { legal: false, reason: `${target.name} has relevant protection.` };
  const text = lower(targetRules.text);
  const sourceColors = new Set(source?.colors || []);
  for (const [word, symbol] of Object.entries(COLOR_WORDS)) {
    if (text.includes(`can't be the target of ${word} spells`) && sourceColors.has(symbol)) return { legal: false, reason: `${target.name} can't be targeted by ${word} spells.` };
  }
  return { legal: true, reason: '', wardCost: targetRules.wardCost || '' };
}

function sharesColor(a, b) {
  const colors = new Set(a?.colors || []);
  return (b?.colors || []).some((color) => colors.has(color));
}

function defenderControlsLandSubtype(defenderBattlefield, subtype) {
  return (defenderBattlefield || []).some((card) => lower(typeOf(card)).includes(lower(subtype)));
}

function blockRestriction(attacker, blocker, context = {}) {
  const attack = analyzeCardRules(attacker);
  const block = analyzeCardRules(blocker);
  const blockerStats = context.blockerStats || { power: Number(blocker?.power || 0), toughness: Number(blocker?.toughness || 0) };
  if (block.combatRestrictions.cannotBlock) return { legal: false, reason: `${blocker.name} can't block.` };
  if (attack.unblockable) return { legal: false, reason: `${attacker.name} can't be blocked.` };
  if (attack.flying && !(block.flying || block.reach)) return { legal: false, reason: 'Flying requires flying or reach.' };
  if (attack.shadow !== block.shadow) return { legal: false, reason: 'Shadow creatures only block or are blocked by shadow creatures.' };
  if (attack.horsemanship && !block.horsemanship) return { legal: false, reason: 'Horsemanship requires horsemanship to block.' };
  if (attack.fear && !(lower(typeOf(blocker)).includes('artifact') || (blocker.colors || []).includes('B'))) return { legal: false, reason: 'Fear can be blocked only by artifact or black creatures.' };
  if (attack.intimidate && !(lower(typeOf(blocker)).includes('artifact') || sharesColor(attacker, blocker))) return { legal: false, reason: 'Intimidate requires an artifact creature or a shared color.' };
  if (attack.skulk && Number(blockerStats.power || 0) > Number(context.attackerStats?.power || attacker.power || 0)) return { legal: false, reason: 'Skulk prevents a higher-power creature from blocking.' };
  for (const subtype of attack.landwalk) if (defenderControlsLandSubtype(context.defenderBattlefield, subtype)) return { legal: false, reason: `${subtype}walk makes the attacker unblockable.` };
  if (hasProtectionFrom(attacker, blocker)) return { legal: false, reason: 'Protection prevents this creature from blocking it.' };
  if (attack.combatRestrictions.blockPowerAtLeast != null && Number(blockerStats.power || 0) < attack.combatRestrictions.blockPowerAtLeast) return { legal: false, reason: 'The blocker does not have enough power.' };
  if (attack.combatRestrictions.blockPowerAtMost != null && Number(blockerStats.power || 0) > attack.combatRestrictions.blockPowerAtMost) return { legal: false, reason: 'The blocker has too much power.' };
  return { legal: true, reason: '' };
}

function keywordSummary(card) {
  const rules = analyzeCardRules(card);
  const values = [];
  for (const keyword of rules.keywords) values.push(keyword);
  if (rules.toxic) values.push(`toxic ${rules.toxic}`);
  if (rules.afflict) values.push(`afflict ${rules.afflict}`);
  if (rules.annihilator) values.push(`annihilator ${rules.annihilator}`);
  if (rules.wardCost) values.push(`ward ${rules.wardCost}`);
  return [...new Set(values)].sort();
}


return { analyzeCardRules, hasProtectionFrom, canTargetPermanent, blockRestriction, keywordSummary };
})();

// ---- card-evaluation.js ----
__modules["./card-evaluation.js"] = (() => {
const { analyzeCardRules, blockRestriction, canTargetPermanent, hasProtectionFrom } = __modules["./card-rules-model.js"];
const { isCreature, numericStat } = __modules["./utils.js"];

function oracle(card) { return String(card?.oracleText || card?.oracle_text || '').replace(/[−–—]/g, '-'); }
function typeLine(card) { return String(card?.typeLine || card?.type_line || ''); }
function lower(value) { return String(value || '').toLocaleLowerCase(); }

function subtypeMatches(card, subtype = '') {
  const words = lower(typeLine(card).split('—')[1] || '').split(/\s+/);
  return lower(subtype).split(/\s+/).some((piece) => words.includes(piece));
}

function controllerMatches(source, target) {
  return !source?.controller || !target?.controller || source.controller === target.controller;
}

function sourceAppliesPump(source, target, effect) {
  if (effect.scope === 'attached') return source.attachedTo === target.instanceId;
  if (effect.scope === 'all-creatures') return isCreature(target);
  if (!controllerMatches(source, target) || !isCreature(target)) return false;
  if (effect.scope === 'all') return true;
  if (effect.scope === 'tribal') return subtypeMatches(target, effect.subtype);
  return false;
}

function sourceGrantedKeywords(source, target) {
  const rules = analyzeCardRules(source);
  const text = oracle(source);
  const grants = new Set();
  if (source.attachedTo === target.instanceId && rules.grantedKeywords.length) {
    rules.grantedKeywords.forEach((keyword) => grants.add(keyword));
  }
  if (controllerMatches(source, target) && isCreature(target)) {
    if (/(?:creatures|creature tokens) you control have/i.test(text)) rules.grantedKeywords.forEach((keyword) => grants.add(keyword));
    const tribal = text.match(/other ([A-Za-z -]+) creatures you control have/i);
    if (tribal && subtypeMatches(target, tribal[1])) rules.grantedKeywords.forEach((keyword) => grants.add(keyword));
  }
  return grants;
}

function dynamicBaseStats(card, battlefield = [], playerContext = {}) {
  const text = oracle(card);
  let power = numericStat(card?.power, Number.NaN);
  let toughness = numericStat(card?.toughness, Number.NaN);
  const own = battlefield.filter((item) => !card?.controller || item.controller === card.controller);
  const handSize = Number(playerContext.handSize || 0);
  const graveSize = Number(playerContext.graveyardSize || 0);
  const countFromText = () => {
    if (/number of creatures you control/i.test(text)) return own.filter(isCreature).length;
    if (/number of lands you control/i.test(text)) return own.filter((item) => /\bLand\b/.test(typeLine(item))).length;
    if (/number of artifacts you control/i.test(text)) return own.filter((item) => /\bArtifact\b/.test(typeLine(item))).length;
    if (/number of cards in your hand/i.test(text)) return handSize;
    if (/number of creature cards in your graveyard/i.test(text)) return graveSize;
    return 0;
  };
  const count = countFromText();
  if (!Number.isFinite(power)) power = count;
  if (!Number.isFinite(toughness)) toughness = count;
  const baseSet = text.match(/base power and toughness (?:are|is) (\d+)\/(\d+)/i);
  if (baseSet) { power = Number(baseSet[1]); toughness = Number(baseSet[2]); }
  return { power: Number.isFinite(power) ? power : 0, toughness: Number.isFinite(toughness) ? toughness : 0 };
}

function derivedCardState(card, battlefield = [], context = {}) {
  const base = analyzeCardRules(card);
  const stats = dynamicBaseStats(card, battlefield, context);
  let power = stats.power;
  let toughness = stats.toughness;
  const keywords = new Set(base.keywords);
  const sources = [];

  for (const source of battlefield) {
    const rules = analyzeCardRules(source);
    for (const effect of rules.pumpEffects) {
      if (!sourceAppliesPump(source, card, effect)) continue;
      power += Number(effect.power || 0);
      toughness += Number(effect.toughness || 0);
      sources.push(`${source.name}: ${effect.power >= 0 ? '+' : ''}${effect.power}/${effect.toughness >= 0 ? '+' : ''}${effect.toughness}`);
    }
    for (const keyword of sourceGrantedKeywords(source, card)) {
      keywords.add(keyword);
      sources.push(`${source.name}: ${keyword}`);
    }
  }

  const counters = card?.counters || {};
  for (const [counterName, rawCount] of Object.entries(counters)) {
    const match = String(counterName).trim().match(/^([+-]?\d+)\/([+-]?\d+)$/);
    if (!match) continue;
    const count = Number(rawCount || 0);
    const powerDelta = Number(match[1] || 0) * count;
    const toughnessDelta = Number(match[2] || 0) * count;
    power += powerDelta;
    toughness += toughnessDelta;
    if (count) sources.push(`${count} ${counterName} counter${count === 1 ? '' : 's'}`);
  }
  power += Number(card?.temporaryPowerBonus || 0);
  toughness += Number(card?.temporaryToughnessBonus || 0);
  if (Number(counters.stun || 0) > 0) sources.push(`${counters.stun} stun counter${Number(counters.stun) === 1 ? '' : 's'}`);

  const merged = { ...base, keywords };
  for (const flag of [
    'flying', 'reach', 'menace', 'deathtouch', 'firstStrike', 'doubleStrike',
    'trample', 'lifelink', 'vigilance', 'haste', 'flash', 'indestructible',
    'hexproof', 'shroud', 'defender', 'fear', 'intimidate', 'shadow',
    'horsemanship', 'skulk', 'infect', 'wither', 'prowess', 'exalted',
    'battleCry', 'persist', 'undying', 'myriad', 'unblockable',
  ]) {
    const keyword = flag.replace(/[A-Z]/g, (letter) => ` ${letter.toLocaleLowerCase()}`);
    merged[flag] = Boolean(base[flag] || keywords.has(keyword));
  }

  return { ...merged, power, toughness, modifierSources: sources };
}

function cardTraits(card, battlefield = [], context = {}) {
  const state = battlefield.length ? derivedCardState(card, battlefield, context) : analyzeCardRules(card);
  const effects = state.effectTags || {};
  return {
    ...state,
    creature: isCreature(card),
    instant: /\bInstant\b/.test(typeLine(card)),
    aura: /\bAura\b/.test(typeLine(card)),
    equipment: /\bEquipment\b/.test(typeLine(card)),
    activatedAbility: Boolean(state.activatedAbilities?.length),
    tapAbility: Boolean(state.activatedAbilities?.some((ability) => ability.tap)),
    staticEffect: Boolean(state.staticEffect),
    draw: Boolean(effects.draw),
    tutor: Boolean(effects.tutor),
    tokenMaker: Boolean(effects.tokenMaker),
    recursion: Boolean(effects.recursion),
    sacrificeValue: Boolean(effects.sacrificeOutlet),
    graveyardInteraction: Boolean(effects.graveyardInteraction),
    counterspell: Boolean(effects.counterspell),
    boardWipe: Boolean(effects.boardWipe),
    targetedRemoval: Boolean(effects.targetedRemoval),
    protectionSpell: Boolean(effects.protectionSpell),
    combatTrick: Boolean(effects.combatTrick),
    flashThreat: isCreature(card) && Boolean(state.flash),
    anthem: (() => {
      const global = (state.pumpEffects || []).filter((effect) => ['all', 'tribal'].includes(effect.scope));
      return global.reduce((sum, effect) => ({ power: sum.power + Number(effect.power || 0), toughness: sum.toughness + Number(effect.toughness || 0) }), { power: 0, toughness: 0 });
    })(),
    interactionCategories: [
      effects.counterspell && 'counterspell',
      effects.targetedRemoval && 'removal',
      effects.boardWipe && 'boardWipe',
      effects.combatTrick && 'combatTrick',
      effects.protectionSpell && 'protection',
      effects.graveyardInteraction && 'graveyardInteraction',
      (isCreature(card) && state.flash) && 'flashThreat',
    ].filter(Boolean),
  };
}

function effectiveStats(card, battlefield = [], context = {}) {
  const derived = derivedCardState(card, battlefield, context);
  return { power: derived.power, toughness: derived.toughness };
}

function targetability(source, target, sourceControllerId = null) {
  return canTargetPermanent(source, target, sourceControllerId);
}

function canBlock(attacker, blocker, blockerBattlefield = [], attackerBattlefield = [], context = {}) {
  if (!isCreature(blocker) || blocker.tapped) return false;
  const blockerStats = effectiveStats(blocker, blockerBattlefield, context.defenderContext || {});
  if (blockerStats.toughness <= 0) return false;
  const attackerStats = effectiveStats(attacker, attackerBattlefield, context.attackerContext || {});
  return blockRestriction(attacker, blocker, {
    defenderBattlefield: blockerBattlefield,
    blockerStats,
    attackerStats,
  }).legal;
}

function sourceCanDamage(source, target) {
  return !hasProtectionFrom(target, source);
}

function lethalDamage(source, target, sourceState, targetState) {
  if (!sourceCanDamage(source, target)) return Infinity;
  if (sourceState.deathtouch && sourceState.power > 0) return 1;
  return Math.max(0, targetState.toughness);
}

function damageCreature(source, target, amount, sourceState, targetState) {
  if (amount <= 0 || !sourceCanDamage(source, target)) return { dies: false, minusCounters: 0, damage: 0 };
  const minusCounters = sourceState.infect || sourceState.wither ? amount : 0;
  const regularDamage = minusCounters ? 0 : amount;
  const lethal = sourceState.deathtouch || regularDamage >= targetState.toughness || minusCounters >= targetState.toughness;
  return { dies: lethal && !targetState.indestructible, minusCounters, damage: regularDamage };
}

function combatOutcome(attacker, blockers = [], attackerBattlefield = [], blockerBattlefield = [], context = {}) {
  const attack = derivedCardState(attacker, attackerBattlefield, context.attackerContext || {});
  const attackerStats = { power: attack.power, toughness: attack.toughness };
  const legalBlockers = blockers.filter((blocker) => canBlock(attacker, blocker, blockerBattlefield, attackerBattlefield, context));
  const doubleFactor = attack.doubleStrike ? 2 : 1;

  if (!legalBlockers.length || (attack.menace && legalBlockers.length < 2) || (attack.combatRestrictions?.needsTwoOrMoreBlockers && legalBlockers.length < 2)) {
    const rawDamage = Math.max(0, attackerStats.power) * doubleFactor;
    const poisonDamage = attack.infect ? rawDamage : (rawDamage > 0 ? Number(attack.toxic || 0) : 0);
    const lifeDamage = attack.infect ? 0 : rawDamage;
    return {
      playerDamage: lifeDamage,
      lifeDamage,
      rawDamage,
      poisonDamage,
      afflictLifeLoss: 0,
      attackerDies: false,
      blockersDie: [],
      blockerMinusCounters: {},
      attackerMinusCounters: 0,
      lifelinkGain: attack.lifelink ? rawDamage : 0,
      unblocked: true,
    };
  }

  const blockerStates = legalBlockers.map((blocker) => ({ card: blocker, state: derivedCardState(blocker, blockerBattlefield, context.defenderContext || {}), alive: true, minusCounters: 0, damage: 0 }));
  let attackerDamage = 0;
  let attackerMinusCounters = 0;
  let attackerDies = false;
  let trampleDamage = 0;
  const phases = [
    { attackerDeals: attack.firstStrike || attack.doubleStrike, blockersDeal: blockerStates.some(({ state }) => state.firstStrike || state.doubleStrike) },
    { attackerDeals: !attack.firstStrike || attack.doubleStrike, blockersDeal: blockerStates.some(({ state }) => !state.firstStrike || state.doubleStrike) },
  ];

  for (const phase of phases) {
    if (attackerDies) break;
    const blockersAtPhaseStart = blockerStates.filter((item) => item.alive);
    if (phase.attackerDeals) {
      let remaining = Math.max(0, attackerStats.power);
      for (const blocker of blockersAtPhaseStart) {
        const needed = lethalDamage(attacker, blocker.card, attack, { ...blocker.state, toughness: blocker.state.toughness - blocker.minusCounters });
        const assigned = Math.min(remaining, Number.isFinite(needed) ? Math.max(1, needed) : remaining);
        const result = damageCreature(attacker, blocker.card, assigned, attack, { ...blocker.state, toughness: blocker.state.toughness - blocker.minusCounters });
        blocker.minusCounters += result.minusCounters;
        blocker.damage += result.damage;
        blocker.alive = !result.dies;
        remaining = Math.max(0, remaining - assigned);
      }
      if (attack.trample) trampleDamage += remaining;
    }
    if (phase.blockersDeal) {
      // Combat damage in a step is simultaneous. A blocker that was alive at
      // the start of this damage step still deals its damage even if the
      // attacker assigns lethal damage to it in the same step.
      for (const blocker of blockersAtPhaseStart) {
        const blockerDealsThisPhase = phase === phases[0]
          ? (blocker.state.firstStrike || blocker.state.doubleStrike)
          : (!blocker.state.firstStrike || blocker.state.doubleStrike);
        if (!blockerDealsThisPhase) continue;
        const result = damageCreature(blocker.card, attacker, Math.max(0, blocker.state.power), blocker.state, { ...attack, toughness: attack.toughness - attackerMinusCounters });
        attackerMinusCounters += result.minusCounters;
        attackerDamage += result.damage;
        if (result.dies) attackerDies = true;
      }
    }
  }

  const rawDamage = Math.max(0, trampleDamage);
  const poisonDamage = attack.infect ? rawDamage : (rawDamage > 0 ? Number(attack.toxic || 0) : 0);
  const lifeDamage = attack.infect ? 0 : rawDamage;
  return {
    playerDamage: lifeDamage,
    lifeDamage,
    rawDamage,
    poisonDamage,
    afflictLifeLoss: Number(attack.afflict || 0),
    attackerDies,
    blockersDie: blockerStates.filter((item) => !item.alive).map((item) => item.card.instanceId),
    blockerMinusCounters: Object.fromEntries(blockerStates.filter((item) => item.minusCounters > 0).map((item) => [item.card.instanceId, item.minusCounters])),
    attackerMinusCounters,
    lifelinkGain: attack.lifelink ? Math.max(0, blockerStates.reduce((sum, item) => sum + item.damage + item.minusCounters, 0) + rawDamage) : 0,
    unblocked: false,
  };
}

function permanentValue(card, friendlyBattlefield = [], opposingBattlefield = [], context = {}) {
  const traits = cardTraits(card, friendlyBattlefield, context);
  const stats = effectiveStats(card, friendlyBattlefield, context);
  let value = Number(card?.manaValue || 0) * 0.82;
  if (traits.creature) {
    value += stats.power * 0.84 + stats.toughness * 0.6;
    const blockers = opposingBattlefield.filter((blocker) => canBlock(card, blocker, opposingBattlefield, friendlyBattlefield));
    if (traits.flying) value += blockers.length ? 0.9 : 2.25;
    if (traits.reach) value += opposingBattlefield.some((opponent) => cardTraits(opponent, opposingBattlefield).flying) ? 1.45 : 0.4;
    if (traits.menace) value += opposingBattlefield.filter((blocker) => isCreature(blocker) && !blocker.tapped).length < 2 ? 1.85 : 0.85;
    if (traits.fear || traits.intimidate || traits.shadow || traits.horsemanship || traits.landwalk?.length || traits.skulk) value += blockers.length ? 1.0 : 2.0;
    if (traits.deathtouch) value += stats.power <= 2 ? 2.5 : 1.45;
    if (traits.firstStrike) value += 1.0;
    if (traits.doubleStrike) value += 2.8 + Math.max(0, stats.power) * 0.32;
    if (traits.trample) value += 1.1;
    if (traits.lifelink) value += context.lowLife ? 2.1 : 1.0;
    if (traits.infect) value += 2.1;
    if (traits.toxic) value += Math.min(3, traits.toxic * 0.7);
    if (traits.indestructible) value += 2.45;
    if (traits.hexproof || traits.shroud) value += 1.85;
    if (traits.ward) value += 1.2;
    if (traits.protectionFrom?.length) value += 1.4;
    if (traits.vigilance) value += 0.72;
    if (traits.haste) value += card?.summoningSick ? 1.25 : 0.42;
    if (traits.deathTrigger) value += 1.7;
    if (traits.attackTrigger || traits.annihilator || traits.myriad) value += 1.9 + Number(traits.annihilator || 0) * 0.8;
    if (traits.combatDamageTrigger) value += blockers.length ? 1.2 : 2.3;
    if (traits.activatedAbility) value += 1.15;
    if (traits.persist || traits.undying) value += 1.4;
    if (traits.defender && !/can attack as though it didn't have defender/i.test(oracle(card))) value -= 0.55;
    if (card?.summoningSick && !traits.haste) value -= 0.25;
  }
  if (traits.equipment || traits.aura) value += 1.25;
  if (traits.staticEffect) value += 1.55;
  if (traits.anthem.power || traits.anthem.toughness) value += 1.6 + friendlyBattlefield.filter(isCreature).length * 0.48;
  if (traits.draw) value += 1.3;
  if (traits.tutor) value += 1.75;
  if (traits.tokenMaker) value += 1.3;
  if (traits.recursion) value += 1.2;
  if (traits.sacrificeValue) value += 0.85;
  if (traits.targetedRemoval) value += 1.35;
  if (traits.boardWipe) value += 2.2;
  if (traits.counterspell) value += 1.3;
  if (card?.commander) value += 1.75;
  if (card?.token) value -= 0.15;
  if (card?.tapped) value -= traits.vigilance ? 0.1 : 0.48;
  if (card?.faceDown) value *= 0.8;
  value += Object.values(card?.counters || {}).reduce((sum, amount) => sum + Math.abs(Number(amount || 0)) * 0.3, 0);
  if (card?.attachedTo) value += 0.65;
  return value;
}

function combatTradeScore(attacker, blockers, attackerBattlefield = [], blockerBattlefield = [], context = {}) {
  const outcome = combatOutcome(attacker, blockers, attackerBattlefield, blockerBattlefield, context);
  const attackerValue = permanentValue(attacker, attackerBattlefield, blockerBattlefield);
  const killedBlockerValue = blockers
    .filter((blocker) => outcome.blockersDie.includes(blocker.instanceId))
    .reduce((sum, blocker) => sum + permanentValue(blocker, blockerBattlefield, attackerBattlefield), 0);
  return outcome.lifeDamage * 1.15 + outcome.poisonDamage * 2.1 + outcome.afflictLifeLoss * 0.9 + killedBlockerValue - (outcome.attackerDies ? attackerValue : 0) + outcome.lifelinkGain * 0.35;
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
    manualKeywords: [...(card.manualKeywords || [])],
    colors: [...(card.colors || [])],
    colorIdentity: [...(card.colorIdentity || [])],
    commander: Boolean(card.commander),
    token: Boolean(card.token),
    producedMana: [...(card.producedMana || [])],
  };
}


return { derivedCardState, cardTraits, effectiveStats, targetability, canBlock, combatOutcome, permanentValue, combatTradeScore, publicCardSnapshot };
})();

// ---- rules.js ----
__modules["./rules.js"] = (() => {
const { PHASES } = __modules["./constants.js"];
const { analyzeCardRules } = __modules["./card-rules-model.js"];
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
  const currentlyUsable = new Map(untappedManaSources(player).map((source) => [source.card.instanceId, source]));
  for (const card of player?.zones?.battlefield || []) {
    const choices = manaProductionChoices(card, { player });
    if (!choices.length) continue;
    const capacity = Math.max(0, ...choices.map((choice) => manaBundleAmount(choice.mana)));
    const noUntap = /doesn't untap during your untap step/i.test(card.oracleText || '');
    if (!noUntap) nextTurn += capacity;
    const usable = currentlyUsable.get(card.instanceId);
    if (usable) {
      const currentCapacity = Math.max(0, ...usable.choices.map((choice) => manaBundleAmount(choice.mana)));
      available += currentCapacity;
      untappedSourceCount += 1;
      for (const choice of usable.choices) for (const [color, amount] of Object.entries(choice.mana || {})) if (Number(amount) > 0) colors.add(color);
    } else tappedSourceCount += 1;
    sources.push({ instanceId: card.instanceId, name: card.name, tapped: Boolean(card.tapped), usableNow: Boolean(usable), capacity, choices });
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

function extraLandAllowance(state, playerId) {
  const player = state.players[playerId];
  return (player?.zones?.battlefield || []).reduce((sum, card) => sum + Number(analyzeCardRules(card).extraLandPlays || 0), 0);
}

function landPlayAllowance(state, playerId) {
  return 1 + extraLandAllowance(state, playerId);
}

function grantsFlashFor(card, permanent) {
  const text = String(permanent?.oracleText || '').toLocaleLowerCase();
  const type = String(card?.typeLine || '').toLocaleLowerCase();
  if (/you may cast spells as though they had flash/.test(text)) return true;
  if (/you may cast creature spells as though they had flash/.test(text) && type.includes('creature')) return true;
  if (/you may cast artifact spells as though they had flash/.test(text) && type.includes('artifact')) return true;
  if (/you may cast enchantment spells as though they had flash/.test(text) && type.includes('enchantment')) return true;
  if (/you may cast nonland permanent spells as though they had flash/.test(text) && isPermanent(card) && !isLand(card)) return true;
  return false;
}

function battlefieldCastingRestrictions(state, playerId, card) {
  const reasons = [];
  const allPermanents = Object.values(state.players || {}).flatMap((player) => player.zones?.battlefield || []);
  const cardType = String(card?.typeLine || '').toLocaleLowerCase();
  for (const permanent of allPermanents) {
    const rules = analyzeCardRules(permanent);
    if (rules.noCreatureSpells && cardType.includes('creature')) reasons.push(`${permanent.name} prevents creature spells from being cast.`);
    if (rules.oneSpellPerTurn && Number(state.players[playerId]?.spellsCastThisTurn || 0) >= 1) reasons.push(`${permanent.name} limits that player to one spell this turn.`);
    const text = String(permanent.oracleText || '').toLocaleLowerCase();
    if (/your opponents can't cast spells during your turn/.test(text) && permanent.controller !== playerId && state.activePlayerId === permanent.controller) reasons.push(`${permanent.name} prevents opponents from casting spells during its controller's turn.`);
    if (/players can't cast spells from graveyards/.test(text) && card?._sourceZone === 'graveyard') reasons.push(`${permanent.name} prevents casting from graveyards.`);
  }
  return reasons;
}

function landPlayLegality(state, playerId, card) {
  const reasons = [];
  const player = state.players[playerId];
  const phase = PHASES[state.phaseIndex]?.id;
  if (!isLand(card)) reasons.push('Only a land card can be played as a land.');
  if (playerId !== state.activePlayerId) reasons.push('Only the active player may play a land.');
  if (!['main1', 'main2'].includes(phase)) reasons.push('A land can normally be played only during a main phase.');
  if ((state.stack || []).length) reasons.push('A land can be played only while the stack is empty.');
  const allowance = landPlayAllowance(state, playerId);
  if (Number(player?.landPlaysThisTurn || 0) >= allowance) reasons.push(`That player has already used ${allowance === 1 ? 'the normal land play' : `all ${allowance} available land plays`} for this turn.`);
  return { legal: reasons.length === 0, reasons, allowance };
}

function spellCastLegality(state, playerId, card, sourceZone = 'hand', options = {}) {
  const { useUntappedSources = true } = options;
  const reasons = [];
  const player = state.players[playerId];
  const phase = PHASES[state.phaseIndex]?.id;
  const rules = analyzeCardRules(card);
  card._sourceZone = sourceZone;
  if (isLand(card)) reasons.push('Lands are played, not cast as spells.');
  const flashGranted = (player?.zones?.battlefield || []).some((permanent) => grantsFlashFor(card, permanent));
  const instantSpeed = String(card.typeLine || '').includes('Instant') || hasFlash(card) || flashGranted;
  if (!instantSpeed) {
    if (playerId !== state.activePlayerId) reasons.push('A noninstant spell normally requires your own turn.');
    if (!['main1', 'main2'].includes(phase)) reasons.push('A noninstant spell normally requires a main phase.');
    if ((state.stack || []).length) reasons.push('A noninstant spell normally requires an empty stack.');
  }
  if (rules.spellRestrictions.onlyDuringCombat && phase !== 'combat') reasons.push('This spell can be cast only during combat.');
  if (rules.spellRestrictions.onlyDuringOwnTurn && playerId !== state.activePlayerId) reasons.push('This spell can be cast only during its controller\'s turn.');
  if (rules.spellRestrictions.onlyDuringOpponentTurn && playerId === state.activePlayerId) reasons.push('This spell can be cast only during an opponent\'s turn.');
  if (rules.spellRestrictions.onlyAfterAttacker && phase !== 'combat') reasons.push('This spell requires attackers to have been declared.');
  reasons.push(...battlefieldCastingRestrictions(state, playerId, card));
  delete card._sourceZone;
  const costPlan = buildCostPlan(state, playerId, card, sourceZone, options);
  const payment = useUntappedSources
    ? planSpellPayment(state, playerId, card, sourceZone, { ...options, costPlan })
    : { ...canPayMana(player?.mana || {}, costPlan.finalManaCost, 0), sources: [], projectedPool: { ...(player?.mana || {}) }, costPlan };
  if (!payment.ok) reasons.push(payment.reason || `The available resources cannot pay ${costPlan.displayCost || card.manaCost || 'this cost'}.`);
  return { legal: reasons.length === 0, reasons: [...new Set(reasons)], tax: costPlan.commanderTax, payment, costPlan, instantSpeed, cannotBeCountered: rules.spellRestrictions.cannotBeCountered, splitSecond: rules.spellRestrictions.splitSecond };
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
    .map((source) => ({ ...source, choices: source.choices.filter((choice) => !options.spellCard || manaChoiceCanPaySpell(source.card, choice, options.spellCard, options.sourceZone || 'hand')) }))
    .filter((source) => source.choices.length)
    .map((source) => ({ ...source, flexibility: source.choices.length, maxAmount: Math.max(...source.choices.map((choice) => manaBundleAmount(choice.mana))) }))
    .sort((a, b) => (b.maxAmount - a.maxAmount) || (a.flexibility - b.flexibility));
  const requirement = manaRequirement(manaCost, tax);
  const costUnits = requirement.generic
    + MANA_COLORS.reduce((sum, color) => sum + Number(requirement[color] || 0), 0)
    + Number(requirement.flexible?.length || 0);
  const shortfall = Math.max(0, costUnits - totalMana(pool));
  const largestSource = Math.max(1, ...sources.map((source) => source.maxAmount));
  const minimumSources = Math.max(1, Math.ceil(shortfall / largestSource));
  const maxNodesPerDepth = Math.max(200, Number(options.maxNodes || 12000));
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
        sources: selected.map(({ flexibility, ...item }) => ({ ...item })),
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
        let paidPool = working;
        if (choice.activationManaCost) {
          if (!canPayMana(paidPool, choice.activationManaCost, 0).ok) continue;
          paidPool = spendMana(paidPool, choice.activationManaCost, 0);
        }
        const metadata = manaSourcePaymentCost(source.card, choice);
        dfs(index + 1, addBundle(paidPool, choice.mana), [...selected, {
          instanceId: source.card.instanceId,
          name: source.card.name,
          choiceIndex,
          mana: { ...choice.mana },
          label: choice.label,
          flexibility: source.flexibility,
          ...metadata,
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
      convoke: /\bconvoke\b/i.test(card.oracleText || '') || [...(card.keywords || []), ...(card.manualKeywords || [])].some((value) => /^convoke$/i.test(value)),
      delve: /\bdelve\b/i.test(card.oracleText || '') || [...(card.keywords || []), ...(card.manualKeywords || [])].some((value) => /^delve$/i.test(value)),
      improvise: /\bimprovise\b/i.test(card.oracleText || '') || [...(card.keywords || []), ...(card.manualKeywords || [])].some((value) => /^improvise$/i.test(value)),
      kicker: kickerCost(card),
    },
  };
}

function manaChoiceCanPaySpell(source, choice, spell, sourceZone = 'hand') {
  const type = String(spell?.typeLine || '').toLocaleLowerCase();
  const restrictions = new Set(choice?.restrictions || []);
  if (restrictions.has('abilities-only')) return false;
  if (restrictions.has('creature-spells-only') && !type.includes('creature')) return false;
  if (restrictions.has('artifact-spells-only') && !type.includes('artifact')) return false;
  if (restrictions.has('enchantment-spells-only') && !type.includes('enchantment')) return false;
  if (restrictions.has('instant-sorcery-only') && !(type.includes('instant') || type.includes('sorcery'))) return false;
  if (restrictions.has('colorless-spells-only') && (spell?.colors || []).length) return false;
  if (restrictions.has('commander-only') && !spell?.commander) return false;
  if (restrictions.has('graveyard-spells-only') && sourceZone !== 'graveyard') return false;
  return true;
}

function manaSourcePaymentCost(source, choice = {}) {
  const text = String(source?.oracleText || '');
  return {
    sacrificeSource: Boolean(choice.sacrificeSource) || (/sacrifice (?:this artifact|this permanent|~|treasure|clue|food|this land)/i.test(text) && /add\s+\{/i.test(text)),
    lifeCost: Number(choice.lifeCost || text.match(/pay (\d+) life[^:]*:\s*add/i)?.[1] || 0),
    activationManaCost: choice.activationManaCost || '',
    discardCost: Boolean(choice.discardCost),
    restrictions: [...(choice.restrictions || [])],
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
    const manaPlan = planManaPayment(player, adjustedCost, 0, { preserveColors, spellCard: card, sourceZone, excludeSourceIds: resources.map((item) => item.instanceId), maxNodes: options.maxNodes });
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
    if (item.activationManaCost) player.mana = spendMana(player.mana, item.activationManaCost, 0);
    found.card.tapped = true;
    for (const color of MANA_COLORS) player.mana[color] = Number(player.mana[color] || 0) + Number(item.mana?.[color] || 0);
    if (item.discardCost && player.zones.hand.length) player.zones.graveyard.push(player.zones.hand.shift());
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

function battlefieldGrantsKeyword(state, card, keyword) {
  const player = state.players[card.controller];
  if (!player) return false;
  const needle = keyword.toLocaleLowerCase();
  return (player.zones.battlefield || []).some((source) => {
    if (source.instanceId === card.instanceId) return false;
    const text = String(source.oracleText || '').toLocaleLowerCase();
    if (new RegExp(`creatures you control have ${needle}`).test(text)) return true;
    const subtype = String(card.typeLine || '').split('—')[1] || '';
    const tribal = text.match(new RegExp(`other ([a-z -]+) creatures you control have ${needle}`));
    return Boolean(tribal && subtype.toLocaleLowerCase().includes(tribal[1].trim()));
  });
}

function attackLegality(state, card) {
  const reasons = [];
  const rules = analyzeCardRules(card);
  if (!isCreature(card)) reasons.push('Only creatures can attack.');
  if (card.tapped) reasons.push('Tapped creatures cannot attack.');
  const hasHaste = rules.haste || battlefieldGrantsKeyword(state, card, 'haste');
  if (card.summoningSick && !hasHaste) reasons.push('This creature has summoning sickness and does not have haste.');
  if (rules.defender && !/can attack as though it didn't have defender/i.test(rules.text)) reasons.push('A creature with defender cannot attack.');
  if (rules.combatRestrictions.cannotAttack) reasons.push('This creature has an effect saying it cannot attack.');
  if (Number(card.counters?.stun || 0) > 0 && card.tapped) reasons.push('A tapped creature with a stun counter cannot attack.');
  if (card.controller !== state.activePlayerId) reasons.push('Only the active player declares attackers.');
  if (PHASES[state.phaseIndex].id !== 'combat') reasons.push('Attackers are normally declared during combat.');
  return { legal: reasons.length === 0, reasons };
}

function attackGroupLegality(state, cardIds = []) {
  const reasons = [];
  const cards = cardIds.map((id) => Object.values(state.players).flatMap((player) => player.zones.battlefield || []).find((card) => card.instanceId === id)).filter(Boolean);
  for (const card of cards) reasons.push(...attackLegality(state, card).reasons.map((reason) => `${card.name}: ${reason}`));
  if (cards.length === 1 && analyzeCardRules(cards[0]).combatRestrictions.attacksAloneRestriction) reasons.push(`${cards[0].name} can't attack alone.`);
  return { legal: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function recognizedEffects(card) {
  const rules = analyzeCardRules(card);
  const effects = [];
  if (rules.effectTags.draw) effects.push('Draw cards');
  if (rules.effectTags.discard) effects.push('Discard');
  if (rules.effectTags.targetedRemoval) effects.push('Targeted interaction');
  if (rules.effectTags.boardWipe) effects.push('Board wipe');
  if (rules.effectTags.tokenMaker) effects.push('Creates tokens');
  if (rules.effectTags.tutor || rules.effectTags.ramp) effects.push('Searches library');
  if (rules.effectTags.mill) effects.push('Mills cards');
  if (rules.effectTags.counterspell) effects.push('Counters a spell or ability');
  if (rules.effectTags.recursion) effects.push('Graveyard recursion');
  if (rules.effectTags.blink) effects.push('Blink effect');
  if (rules.effectTags.copy) effects.push('Copy effect');
  if (rules.enterTrigger || rules.attackTrigger || rules.combatDamageTrigger || rules.upkeepTrigger || rules.endStepTrigger) effects.push('Triggered ability');
  if (rules.activatedAbilities.length) effects.push('Activated ability');
  return [...new Set(effects)];
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


return { validateDeck, commanderCandidates, landEntryPlan, manaDevelopmentSnapshot, strategicPaymentColors, landPlayAllowance, landPlayLegality, spellCastLegality, moveLegality, canPayMana, spendMana, planManaPayment, requirementToManaCost, buildCostPlan, planSpellPayment, applySpellPayment, attackLegality, attackGroupLegality, recognizedEffects, stackDestination, maximumHandSize };
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
    const choices = manaProductionChoices(card, { player });
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
    spellsCastThisTurn: 0,
    noncreatureSpellsCastThisTurn: 0,
    mulligans: 0,
    lost: false,
  };
}

function createInitialState() {
  const players = { p1: createPlayer('p1', 'Player 1'), p2: createPlayer('p2', 'Player 2') };
  return {
    version: 10,
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
  card.abilityActivationsThisTurn ||= {};
  card.tokenStyle ||= null;
  card.stackFresh = Boolean(card.stackFresh);
  card.enteredBattlefieldTurn = Number(card.enteredBattlefieldTurn || 0);
  card.predefinedToken = Boolean(card.predefinedToken);
  card.manualKeywords = [...new Set((card.manualKeywords || []).map((value) => String(value || '').trim()).filter(Boolean))];
  return card;
}

function ensureStateShape(next) {
  next.version = 10;
  const previousSettings = next.settings || {};
  next.settings = { ...DEFAULT_SETTINGS, ...previousSettings, hideOpponentHand: false, manaAutomationV3: true, coachInformationSetV4: true, coachTacticalV5: true, phaseSafetyV6: true, tabletopUXV7: true, tokenPeekV8: true, commanderZoneUXV9: true, rulesKnowledgeV10: true };
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
    if (![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(parsed.version)) return false;
    const previousSettings = parsed.settings || {};
    parsed.settings = { ...DEFAULT_SETTINGS, ...previousSettings };
    if (!previousSettings.manaAutomationV3) parsed.settings.manaMode = 'auto';
    state = ensureStateShape(parsed);
    notify();
    return true;
  } catch { return false; }
}

function importState(imported) {
  if (!imported || ![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(imported.version) || !imported.players) throw new Error('This is not a compatible Commander Forge save file.');
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
  player.spellsCastThisTurn = 0;
  player.noncreatureSpellsCastThisTurn = 0;
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
const { analyzeCardRules } = __modules["./card-rules-model.js"];
const { cardTraits, canBlock, combatOutcome, combatTradeScore, derivedCardState, effectiveStats, permanentValue, targetability } = __modules["./card-evaluation.js"];
const { actionStrategyBonus, buildStrategyProfile, cardStrategySynergy } = __modules["./strategy-profile.js"];
const { applySpellPayment, attackGroupLegality, attackLegality, landEntryPlan, landPlayLegality, manaDevelopmentSnapshot, planManaPayment, spellCastLegality } = __modules["./rules.js"];
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
  const blockers = opponent.zones.battlefield.filter((blocker) => canBlock(card, blocker, opponent.zones.battlefield, player.zones.battlefield));
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
    const traits = cardTraits(card, player.zones.battlefield);
    return traits.flying || traits.unblockable || traits.menace;
  }).map(({ card }) => card.instanceId);
  if (evasive.length) actions.push({ type: 'attack', cardIds: evasive, label: `Attack with the evasive creatures` });
  const all = legal.map((card) => card.instanceId);
  if (all.length > 1) actions.push({ type: 'attack', cardIds: all, label: `Attack with all legal creatures` });
  return uniqueActions(actions).filter((action) => attackGroupLegality(state, action.cardIds || []).legal);
}

function kickerCost(card) {
  return String(card?.oracleText || '').match(/(?:multi)?kicker\s+(\{[^\n.]+?\})/i)?.[1]?.replace(/\}\s*\{/g, '}{') || '';
}

function activatedAbilityActions(state, playerId, card, options = {}) {
  const player = state.players[playerId];
  const rules = analyzeCardRules(card);
  const actions = [];
  rules.activatedAbilities.forEach((ability, abilityIndex) => {
    if (ability.manaAbility) return;
    if (ability.tap && card.tapped) return;
    if (ability.tap && isCreature(card) && card.summoningSick && !rules.haste) return;
    if (ability.onceEachTurn && Number(card.abilityActivationsThisTurn?.[abilityIndex] || 0) > 0) return;
    if (ability.sorcerySpeedOnly && (state.activePlayerId !== playerId || !['main1', 'main2'].includes(phaseId(state)) || state.stack.length)) return;
    const paymentPlan = ability.manaCost
      ? planManaPayment(player, ability.manaCost, 0, { excludeSourceIds: ability.tap ? [card.instanceId] : [], maxNodes: options.maxManaNodes })
      : { ok: true, sources: [], finalManaCost: '' };
    if (!paymentPlan.ok) return;
    if (/pay (\d+) life/i.test(ability.cost) && player.life <= Number(ability.cost.match(/pay (\d+) life/i)[1])) return;
    if (ability.discard && !(player.zones.hand || []).length) return;
    actions.push({
      type: 'activate-ability',
      cardId: card.instanceId,
      abilityIndex,
      paymentPlan: { ...paymentPlan, finalManaCost: ability.manaCost || '' },
      label: `Activate ${card.name}: ${ability.effect.slice(0, 72)}${ability.effect.length > 72 ? '…' : ''}`,
    });
  });
  return actions;
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
    const legality = spellCastLegality(state, playerId, card, 'hand', { maxNodes: options.maxManaNodes });
    if (legality.legal) actions.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, paymentPlan: legality.payment, costPlan: legality.costPlan, label: `Cast ${card.name}` });
    const kicker = kickerCost(card);
    if (kicker) {
      const kicked = spellCastLegality(state, playerId, card, 'hand', { kicked: true, maxNodes: options.maxManaNodes });
      if (kicked.legal) actions.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, paymentPlan: kicked.payment, costPlan: kicked.costPlan, kicked: true, label: `Cast ${card.name} kicked` });
    }
  }
  for (const card of player.zones.command || []) {
    const legality = spellCastLegality(state, playerId, card, 'command', { maxNodes: options.maxManaNodes });
    if (legality.legal) actions.push({ type: 'cast-commander', cardId: card.instanceId, paymentPlan: legality.payment, costPlan: legality.costPlan, label: `Cast ${card.name}${legality.tax ? ` (+${legality.tax} commander tax)` : ''}` });
  }
  for (const card of (player.zones.battlefield || []).slice(0, Number(options.battlefieldScanLimit || 40))) actions.push(...activatedAbilityActions(state, playerId, card, options));
  actions.push(...generatedAttackPlans(state, playerId));
  actions.push({ type: 'hold', label: 'Hold resources and pass priority' });
  return uniqueActions(actions).slice(0, Number(options.limit || 36));
}

function removeFromZone(player, zone, cardId) {
  const cards = player.zones[zone] || [];
  const index = cards.findIndex((card) => card.instanceId === cardId);
  return index >= 0 ? cards.splice(index, 1)[0] : null;
}

function chooseBestTarget(state, playerId, sourceCard, kind = 'remove') {
  const opponentId = otherPlayerId(state, playerId);
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  return [...opponent.zones.battlefield]
    .filter((card) => {
      const traits = cardTraits(card, opponent.zones.battlefield);
      if (kind === 'destroy' && traits.indestructible) return false;
      const target = targetability(sourceCard, card, playerId);
      if (!target.legal) return false;
      if (target.wardCost && !String(sourceCard?.oracleText || '').toLocaleLowerCase().includes('doesn\'t target')) {
        const wardNumber = Number(String(target.wardCost).match(/\d+/)?.[0] || 0);
        if (wardNumber > 0) {
          const available = state.players[playerId].zones.battlefield.filter((item) => !item.tapped).length + Object.values(state.players[playerId].mana || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
          if (available < wardNumber) return false;
        }
      }
      return true;
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
    const target = chooseBestTarget(state, playerId, card, /destroy target/i.test(text) ? 'destroy' : 'remove');
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
    const legal = available.filter((blocker) => canBlock(attacker, blocker, defender.zones.battlefield, attackerPlayer.zones.battlefield));
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
  const exaltedCount = attackers.length === 1 ? player.zones.battlefield.filter((card) => cardTraits(card, player.zones.battlefield).exalted).length : 0;
  const battleCrySources = attackers.filter((card) => cardTraits(card, player.zones.battlefield).battleCry).length;

  for (const attacker of attackers) {
    const baseTraits = cardTraits(attacker, player.zones.battlefield);
    if (!baseTraits.vigilance) attacker.tapped = true;
    const prowess = baseTraits.prowess ? Number(player.noncreatureSpellsCastThisTurn || 0) : 0;
    const battleCry = Math.max(0, battleCrySources - (baseTraits.battleCry ? 1 : 0));
    const simulatedAttacker = {
      ...attacker,
      temporaryPowerBonus: Number(attacker.temporaryPowerBonus || 0) + exaltedCount + battleCry + prowess,
      temporaryToughnessBonus: Number(attacker.temporaryToughnessBonus || 0) + exaltedCount + prowess,
    };
    const outcome = combatOutcome(simulatedAttacker, blocks.get(attacker.instanceId) || [], player.zones.battlefield, opponent.zones.battlefield);
    opponent.life -= Number(outcome.lifeDamage || 0) + Number(outcome.afflictLifeLoss || 0);
    opponent.poison += Number(outcome.poisonDamage || 0);
    player.life += Number(outcome.lifelinkGain || 0);
    if (attacker.commander && Number(outcome.rawDamage || 0) > 0) opponent.commanderDamage[attacker.instanceId] = Number(opponent.commanderDamage[attacker.instanceId] || 0) + Number(outcome.rawDamage || 0);
    if (outcome.attackerMinusCounters > 0) attacker.counters['-1/-1'] = Number(attacker.counters['-1/-1'] || 0) + Number(outcome.attackerMinusCounters);
    for (const [blockerId, amount] of Object.entries(outcome.blockerMinusCounters || {})) {
      const blocker = opponent.zones.battlefield.find((card) => card.instanceId === blockerId);
      if (blocker) blocker.counters['-1/-1'] = Number(blocker.counters['-1/-1'] || 0) + Number(amount);
    }
    if (outcome.attackerDies) deadAttackers.add(attacker.instanceId);
    for (const id of outcome.blockersDie) deadBlockers.add(id);
    if (baseTraits.attackTrigger) state._coach.virtual[playerId] += 1.0 + Number(baseTraits.annihilator || 0) * 0.7;
    if (Number(outcome.rawDamage || 0) > 0 && baseTraits.combatDamageTrigger) state._coach.virtual[playerId] += 1.8;
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
    player.spellsCastThisTurn = Number(player.spellsCastThisTurn || 0) + 1;
    if (!isCreature(card)) player.noncreatureSpellsCastThisTurn = Number(player.noncreatureSpellsCastThisTurn || 0) + 1;
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
    const group = attackGroupLegality(state, action.cardIds || []);
    if (!group.legal) return { ok: false, state, reason: group.reasons.join(' ') };
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
    const rules = analyzeCardRules(found.card);
    const ability = rules.activatedAbilities[Number(action.abilityIndex || 0)];
    if (!ability || ability.manaAbility) return { ok: false, state, reason: 'That activated ability is not available to the tactical coach.' };
    if (ability.tap && found.card.tapped) return { ok: false, state, reason: 'The permanent is already tapped.' };
    if (ability.tap && isCreature(found.card) && found.card.summoningSick && !rules.haste) return { ok: false, state, reason: 'Summoning sickness prevents using this tap ability.' };
    if (action.paymentPlan?.ok) applySpellPayment(state, playerId, action.paymentPlan);
    if (ability.tap) found.card.tapped = true;
    const life = Number(ability.cost.match(/pay (\d+) life/i)?.[1] || 0);
    state.players[playerId].life -= life;
    if (ability.discard && state.players[playerId].zones.hand.length) state.players[playerId].zones.graveyard.push(state.players[playerId].zones.hand.shift());
    const effectCard = { ...found.card, oracleText: ability.effect, keywords: [] };
    if (ability.sacrifice) {
      const index = state.players[playerId].zones.battlefield.findIndex((item) => item.instanceId === found.card.instanceId);
      if (index >= 0) state.players[playerId].zones.graveyard.push(state.players[playerId].zones.battlefield.splice(index, 1)[0]);
    }
    applyCommonEffects(state, playerId, effectCard, { activated: true });
    found.card.abilityActivationsThisTurn ||= {};
    found.card.abilityActivationsThisTurn[action.abilityIndex || 0] = Number(found.card.abilityActivationsThisTurn[action.abilityIndex || 0] || 0) + 1;
    state._coach.virtual[playerId] += 0.8;
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

function tacticalNow() {
  return globalThis.performance?.now ? performance.now() : Date.now();
}

async function tacticalYield() {
  if (globalThis.scheduler?.yield) {
    await globalThis.scheduler.yield();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function generateShortSequencesAsync(state, playerId, options = {}) {
  const depth = Math.max(1, Math.min(3, Number(options.depth || 2)));
  const beamWidth = Math.max(4, Math.min(16, Number(options.beamWidth || 7)));
  const profile = buildStrategyProfile(state.players[playerId]);
  let beam = [{ state: deepClone(state), steps: [], score: tacticalStateScore(state, playerId, profile) }];
  const sequences = [];
  const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : () => false;
  const deadline = Number(options.deadline || Infinity);
  const yieldBudgetMs = Math.max(6, Math.min(18, Number(options.yieldBudgetMs || 10)));
  let lastYield = tacticalNow();

  for (let ply = 0; ply < depth; ply += 1) {
    const next = [];
    for (let nodeIndex = 0; nodeIndex < beam.length; nodeIndex += 1) {
      if (shouldCancel()) return [];
      const node = beam[nodeIndex];
      const actions = generateTacticalActions(node.state, playerId, { limit: ply === 0 ? 18 : 10, maxManaNodes: 450, battlefieldScanLimit: 28 });
      for (const action of actions) {
        if (action.type === 'hold') continue;
        const result = applyTacticalAction(node.state, playerId, action, { autoResolve: true });
        if (result.ok) {
          const score = tacticalStateScore(result.state, playerId, profile) + actionStrategyBonus(action, node.state, playerId, profile);
          const item = { state: result.state, steps: [...node.steps, action], score };
          next.push(item);
          if (item.steps.length > 1) sequences.push({ type: 'sequence', steps: item.steps, label: item.steps.map((step) => step.label).join(' → '), projectedScore: score });
        }
        const now = tacticalNow();
        if (now - lastYield >= yieldBudgetMs) {
          options.onProgress?.(`Building legal sequences · depth ${ply + 1}/${depth}`);
          await tacticalYield();
          lastYield = tacticalNow();
          if (shouldCancel()) return [];
        }
        if (tacticalNow() >= deadline && sequences.length >= 3) break;
      }
      if (tacticalNow() >= deadline && sequences.length >= 3) break;
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, beamWidth);
    if (!beam.length || (tacticalNow() >= deadline && sequences.length >= 3)) break;
    await tacticalYield();
    lastYield = tacticalNow();
  }
  return uniqueActions(sequences).sort((a, b) => b.projectedScore - a.projectedScore).slice(0, Number(options.limit || 6));
}


return { findTacticalCard, generateTacticalActions, applyCommonEffects, applyStateBasedActions, applyTacticalAction, tacticalStateScore, generateShortSequences, generateShortSequencesAsync };
})();

// ---- coach.js ----
__modules["./coach.js"] = (() => {
const { PHASES } = __modules["./constants.js"];
const { keywordSummary } = __modules["./card-rules-model.js"];
const { cardTraits, canBlock, combatOutcome, combatTradeScore, effectiveStats, permanentValue, publicCardSnapshot } = __modules["./card-evaluation.js"];
const { ensureKnowledge, knownHandCards, publicMemorySummary, visibleManaSnapshot } = __modules["./knowledge.js"];
const { attackLegality, landEntryPlan, landPlayAllowance, landPlayLegality, manaDevelopmentSnapshot, planManaPayment, spendMana, spellCastLegality, strategicPaymentColors } = __modules["./rules.js"];
const { clamp, deepClone, isCreature, isLand, isPermanent, manaProductionChoices, numericStat, totalMana } = __modules["./utils.js"];
const { applyTacticalAction, generateShortSequences, generateShortSequencesAsync, generateTacticalActions, tacticalStateScore } = __modules["./tactical-engine.js"];
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
  const amount = Math.max(0, Number(count || 0));
  if (!amount) return [];
  const placeholder = {
    instanceId: `${prefix}-unknown`,
    name: 'Unknown card',
    hidden: true,
    typeLine: '',
    oracleText: '',
    keywords: [],
    counters: {},
  };
  return Array(amount).fill(placeholder);
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
      spellsCastThisTurn: Number(original.spellsCastThisTurn || 0),
      noncreatureSpellsCastThisTurn: Number(original.noncreatureSpellsCastThisTurn || 0),
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

function coachNow() {
  return globalThis.performance?.now ? performance.now() : Date.now();
}

async function coachYield() {
  if (globalThis.scheduler?.yield) {
    await globalThis.scheduler.yield();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function visibleCoachComplexity(state, playerId) {
  const opponentId = otherPlayerId(state, playerId);
  return (state.players[playerId]?.zones?.battlefield?.length || 0)
    + (state.players[opponentId]?.zones?.battlefield?.length || 0)
    + Math.min(12, state.players[playerId]?.zones?.hand?.length || 0)
    + Math.min(8, state.stack?.length || 0);
}

async function possibleMovesAsync(state, playerId = state.activePlayerId, options = {}) {
  const complexity = visibleCoachComplexity(state, playerId);
  const immediateLimit = complexity >= 34 ? 15 : complexity >= 22 ? 18 : 22;
  const finalLimit = complexity >= 34 ? 14 : complexity >= 22 ? 18 : 22;
  const immediate = generateTacticalActions(state, playerId, { limit: immediateLimit, maxManaNodes: complexity >= 22 ? 500 : 900, battlefieldScanLimit: complexity >= 34 ? 24 : 36 });
  options.onProgress?.('Checking immediate legal plays…');
  await coachYield();
  if (options.shouldCancel?.()) return [];
  const sequences = complexity >= 30 ? [] : await generateShortSequencesAsync(state, playerId, {
    depth: complexity >= 30 ? 2 : 3,
    beamWidth: complexity >= 30 ? 5 : 7,
    limit: complexity >= 30 ? 4 : 6,
    deadline: options.deadline,
    shouldCancel: options.shouldCancel,
    onProgress: options.onProgress,
    yieldBudgetMs: 10,
  });
  return dedupeMoves([...immediate, ...sequences]).slice(0, finalLimit);
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
      const traits = cardTraits(card, state.players[playerId].zones.battlefield);
      return traits.flying || traits.unblockable || traits.menace;
    });
    if (evasive.length && evasive.length !== attackers.length) moves.push({ type: 'attack', cardIds: evasive.map((card) => card.instanceId), opponentId, label: 'Attack with evasive creatures' });
    const favorable = attackers.filter((attacker) => visibleAttackValue(state, playerId, attacker) > 0.8);
    if (favorable.length && favorable.length !== attackers.length) moves.push({ type: 'attack', cardIds: favorable.map((card) => card.instanceId), opponentId, label: 'Attack with favorable creatures' });
  }
}

function visibleAttackValue(state, playerId, attacker) {
  const opponentId = otherPlayerId(state, playerId);
  const blockers = state.players[opponentId].zones.battlefield.filter((blocker) => canBlock(attacker, blocker, state.players[opponentId].zones.battlefield, state.players[playerId].zones.battlefield));
  if (!blockers.length) return effectiveStats(attacker, state.players[playerId].zones.battlefield).power;
  return Math.min(...blockers.map((blocker) => combatTradeScore(attacker, [blocker], state.players[playerId].zones.battlefield, state.players[opponentId].zones.battlefield)));
}

function identityAllows(identity, model) {
  return model.identities.some((color) => identity.includes(color));
}

function nextTurnManaPotential(player) {
  const snapshot = manaDevelopmentSnapshot(player);
  return { total: snapshot.nextTurn, colors: [...snapshot.colors] };
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
    return Boolean(found?.zone === 'hand' && isLand(found.card) && landPlayLegality(draft, playerId, found.card).legal);
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
    if (!found || found.zone !== 'hand' || !isLand(found.card) || !landPlayLegality(draft, playerId, found.card).legal) return { ok: false };
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
    const legal = available.filter((blocker) => canBlock(attacker, blocker, blockBoard, attackBoard));
    if (!legal.length) continue;
    const traits = cardTraits(attacker, attackBoard);
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
    && player.zones.hand.some((card) => isLand(card) && landPlayLegality(state, playerId, card).legal);
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
    if (plan.sources?.length) reasons.push(`Payment uses ${plan.sources.map((source) => `${source.name} for ${source.label}${source.activationManaCost ? ` after ${source.activationManaCost}` : ''}${source.sacrificeSource ? ' and sacrifices it' : ''}`).join(', ')}.`);
    if (plan.preservedColors?.length) reasons.push(`The payment leaves ${plan.preservedColors.join('/')} available for visible instant-speed options.`);
  }
  for (const card of moveCards(state, move)) {
    const traits = cardTraits(card);
    const abilities = [];
    if (traits.flying) abilities.push('flying');
    if (traits.reach) abilities.push('reach');
    if (traits.menace) abilities.push('menace');
    if (traits.fear || traits.intimidate || traits.shadow || traits.horsemanship || traits.skulk || traits.landwalk?.length) abilities.push('conditional evasion');
    if (traits.deathtouch) abilities.push('deathtouch');
    if (traits.firstStrike) abilities.push('first strike');
    if (traits.doubleStrike) abilities.push('double strike');
    if (traits.trample) abilities.push('trample');
    if (traits.lifelink) abilities.push('lifelink');
    if (traits.infect || traits.toxic) abilities.push(traits.infect ? 'infect' : `toxic ${traits.toxic}`);
    if (traits.indestructible) abilities.push('indestructible');
    if (traits.hexproof || traits.ward || traits.protectionFrom?.length) abilities.push(traits.hexproof ? 'hexproof' : traits.ward ? `ward ${traits.wardCost || ''}`.trim() : 'protection');
    if (traits.deathTrigger) abilities.push('a death trigger');
    if (traits.attackTrigger) abilities.push('an attack trigger');
    if (traits.combatDamageTrigger) abilities.push('a combat-damage trigger');
    if (traits.activatedAbility) abilities.push('an activated ability');
    if (traits.staticEffect) abilities.push('a static effect');
    if (traits.targetedRemoval) abilities.push('targeted removal');
    if (traits.draw) abilities.push('card draw');
    const keywordFacts = keywordSummary(card);
    if (abilities.length) reasons.push(`${card.name} contributes ${abilities.slice(0, 5).join(', ')}.`);
    else if (keywordFacts.length) reasons.push(`${card.name} has ${keywordFacts.slice(0, 5).join(', ')}.`);
    const synergy = commanderSynergy(player, card);
    if (synergy >= 1) reasons.push(`${card.name} directly supports the visible commander/deck plan.`);
  }
  if (move.type === 'attack') {
    const attackers = (move.cardIds || []).map((id) => cardById(state, id)).filter(Boolean);
    const blockers = opponent.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
    const evasive = attackers.filter((card) => {
      const traits = cardTraits(card, state.players[playerId].zones.battlefield);
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

async function evaluateMoveAsync(state, info, risk, playerId, move, rollouts, seed, options = {}) {
  let total = 0;
  let high = -Infinity;
  let low = Infinity;
  let completed = 0;
  const scores = [];
  const responseCounts = {};
  const baseSimulation = simulationStateFromInformationSet(state, info);
  const profile = buildStrategyProfile(state.players[playerId]);
  const actionResult = applyTacticalAction(baseSimulation, playerId, move, { autoResolve: true });
  if (!actionResult.ok) {
    return {
      ...move, score: -999, range: [-999, -999], stdev: 0, riskProbability: 1, samplesUsed: 0,
      explanationDetails: explainMove(state, playerId, move, -999, risk, {}),
    };
  }
  const deterministicState = actionResult.state;
  const minSamples = Math.min(16, Math.max(8, Math.floor(rollouts / 4)));
  let lastYield = coachNow();
  for (let i = 0; i < rollouts; i += 1) {
    if (options.shouldCancel?.()) return null;
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
    completed += 1;

    const now = coachNow();
    if (now - lastYield >= 10) {
      await coachYield();
      lastYield = coachNow();
      if (options.shouldCancel?.()) return null;
    }
    if (coachNow() >= Number(options.deadline || Infinity) && completed >= minSamples) break;
  }
  const average = total / Math.max(1, completed);
  const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / Math.max(1, scores.length);
  const stdev = Math.sqrt(variance);
  const responseStats = Object.fromEntries(Object.entries(responseCounts).map(([key, count]) => [key, Number((count / Math.max(1, completed)).toFixed(3))]));
  const explanationDetails = explainMove(state, playerId, move, average, risk, responseStats);
  explanationDetails.strategy = `Visible plan: ${strategyLabel(profile)}.`;
  if (!explanationDetails.visibleReasons.includes(explanationDetails.strategy)) explanationDetails.visibleReasons.push(explanationDetails.strategy);
  return {
    ...move,
    score: Number(average.toFixed(2)),
    range: [Number(low.toFixed(1)), Number(high.toFixed(1))],
    stdev: Number(stdev.toFixed(2)),
    riskProbability: moveExposure(move, risk),
    samplesUsed: completed,
    explanationDetails,
  };
}

function finalizeCoachResults(results, perMoveRollouts) {
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  const second = results[1];
  if (best) {
    const margin = second ? best.score - second.score : Math.max(1, Math.abs(best.score) * 0.15);
    const uncertainty = best.stdev + best.riskProbability * 6;
    best.confidence = Math.round(clamp(56 + margin * 4.5 + Math.sqrt(Math.max(1, best.samplesUsed || perMoveRollouts)) * 0.7 - uncertainty * 2.2, 20, 96));
    const safer = results
      .slice(1)
      .filter((result) => result.riskProbability + 0.08 < best.riskProbability && result.score >= best.score - 5.5)
      .sort((a, b) => (a.riskProbability - b.riskProbability) || (b.score - a.score))[0];
    best.saferAlternative = safer ? { label: safer.label, score: safer.score, riskLevel: riskLabel(safer.riskProbability) } : null;
    best.explanation = best.explanationDetails.headline;
  }
  for (const result of results.slice(1)) {
    result.confidence = Math.round(clamp(48 + Math.sqrt(Math.max(1, result.samplesUsed || perMoveRollouts)) * 0.5 - result.stdev * 1.8 - result.riskProbability * 18, 18, 88));
    result.saferAlternative = null;
    result.explanation = result.explanationDetails.headline;
  }
}

async function analyzePositionAsync(state, playerId = state.activePlayerId, rollouts = state.settings.coachRollouts || 80, options = {}) {
  const startedAt = coachNow();
  const maxDurationMs = Math.max(3000, Math.min(12000, Number(options.maxDurationMs || 7500)));
  const deadline = startedAt + maxDurationMs;
  const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : () => false;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  ensureKnowledge(state);
  const informationSet = buildInformationSet(state, playerId);
  const risk = buildInteractionRisk(state, playerId);
  const complexity = visibleCoachComplexity(state, playerId);
  const requestedRollouts = Math.max(40, Math.min(240, Number(rollouts || 80)));
  const perMoveRollouts = complexity >= 30 ? Math.min(requestedRollouts, 40) : complexity >= 20 ? Math.min(requestedRollouts, 60) : requestedRollouts;
  const seed = analysisSeed(state, playerId);

  onProgress('Finding legal plays without blocking the table…');
  const moves = await possibleMovesAsync(state, playerId, { deadline, shouldCancel, onProgress });
  if (shouldCancel()) return null;
  const results = [];
  const minimumResults = Math.min(complexity >= 30 ? 4 : 6, moves.length);

  for (let index = 0; index < moves.length; index += 1) {
    if (shouldCancel()) return null;
    if (coachNow() >= deadline && results.length >= minimumResults) break;
    onProgress(`Analyzing line ${index + 1} of ${moves.length}…`);
    const result = await evaluateMoveAsync(state, informationSet, risk, playerId, moves[index], perMoveRollouts, seed, {
      deadline,
      shouldCancel,
    });
    if (result) results.push(result);
    await coachYield();
  }

  finalizeCoachResults(results, perMoveRollouts);
  const elapsedMs = Math.round(coachNow() - startedAt);
  return {
    moves,
    results,
    baseline: tacticalStateScore(simulationStateFromInformationSet(state, informationSet), playerId, buildStrategyProfile(state.players[playerId])),
    rollouts: perMoveRollouts,
    requestedRollouts,
    elapsedMs,
    truncated: results.length < moves.length,
    searchType: 'Responsive rules-aware tactical information-set search with cooperative yielding',
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
    const legal = unused.filter((blocker) => canBlock(attacker, blocker, defender.zones.battlefield, attackerPlayer.zones.battlefield));
    const traits = cardTraits(attacker, attackerPlayer.zones.battlefield);
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
    expectedDamage += Number(outcome.lifeDamage || outcome.playerDamage || 0) + Number(outcome.poisonDamage || 0) * 2;
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


return { buildInformationSet, possibleMoves, possibleMovesAsync, buildInteractionRisk, analyzePosition, analyzePositionAsync, defenseAdvice };
})();

// ---- game.js ----
__modules["./game.js"] = (() => {
const { PHASES, ZONE_LABELS } = __modules["./constants.js"];
const { drawCards, findCard, updateState } = __modules["./state.js"];
const { recordPublicEvent, recordTurnPass, recordZoneTransition } = __modules["./knowledge.js"];
const { applySpellPayment, attackLegality, canPayMana, landEntryPlan, landPlayLegality, maximumHandSize, moveLegality, spellCastLegality, spendMana, stackDestination } = __modules["./rules.js"];
const { canActivateManaChoice, deepClone, formatManaBundle, isCreature, isLand, manaProductionChoices, shuffle, uid } = __modules["./utils.js"];

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

function enqueueBattlefieldLeaveEffects(draft, leavingCard, destinationZone = 'removed') {
  const allSources = [
    ...Object.values(draft.players).flatMap((player) => player.zones.battlefield),
    leavingCard,
  ].filter((card, index, cards) => cards.findIndex((candidate) => candidate.instanceId === card.instanceId) === index);
  for (const sourceCard of allSources) {
    for (const line of oracleAbilityLines(sourceCard)) {
      const lower = line.toLowerCase();
      const ownCard = sourceCard.instanceId === leavingCard.instanceId;
      const subjectMatches = cardMatchesEventSubject(leavingCard, line);
      const diesTrigger = destinationZone === 'graveyard'
        && /\b(when|whenever)\b.+\bdies\b/i.test(line)
        && ((ownCard && (/\b(this|it)\b.+\bdies\b/i.test(line) || lower.includes(sourceCard.name.toLowerCase())))
          || (!ownCard && /\b(another|a|one or more|nontoken|token)\b.+\bdies\b/i.test(line) && subjectMatches));
      const graveyardTrigger = destinationZone === 'graveyard'
        && /put into a graveyard from the battlefield/i.test(line)
        && (ownCard || subjectMatches);
      const leavesTrigger = /\b(when|whenever)\b.+\bleaves the battlefield\b/i.test(line)
        && (ownCard || subjectMatches);
      const exileTrigger = destinationZone === 'exile'
        && /\b(when|whenever)\b.+\bis exiled\b/i.test(line)
        && (ownCard || subjectMatches);
      if (diesTrigger || graveyardTrigger || leavesTrigger || exileTrigger) {
        queuePendingEffect(draft, {
          sourceCard,
          controllerId: sourceCard.controller,
          kind: destinationZone === 'graveyard' ? 'death-trigger' : 'leave-battlefield-trigger',
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

function removeToken(instanceId, { died = false, destination = 'removed' } = {}) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found) return { ok: false, message: 'Token not found.' };
  if (!found.card.token) return { ok: false, message: 'Only tokens can use this action.' };
  const fromZone = found.zone;
  const transientDestination = died ? 'graveyard' : destination;
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    if (!located) return;
    const token = located.container.splice(located.index, 1)[0];
    if (fromZone === 'battlefield') {
      recordZoneTransition(draft, {
        card: token,
        actorId: token.controller,
        subjectPlayerId: token.owner,
        fromZone,
        toZone: transientDestination,
      });
      enqueueBattlefieldLeaveEffects(draft, token, transientDestination);
      clearCardRelations(draft, token);
    } else {
      recordPublicEvent(draft, {
        type: 'token_ceased',
        actorId: token.controller,
        subjectPlayerId: token.owner,
        card: token,
        fromZone,
        toZone: 'removed',
        meaningful: false,
      });
    }
    if (draft.selected?.instanceId === instanceId) draft.selected = null;
  }, { log: died
    ? `${found.card.name} died, then ceased to exist as a state-based action.`
    : `${found.card.name} left ${ZONE_LABELS[fromZone] || fromZone} and ceased to exist.` });
  return { ok: true, message: died ? 'Token died and ceased to exist.' : 'Token removed.' };
}

function moveCard(instanceId, targetPlayerId, targetZone, { force = false, libraryPosition = 'top', enterTapped = false, countsAsLandPlay = true } = {}) {
  const currentState = window.CommanderForge.getState();
  const source = findCard(instanceId, currentState);
  if (!source) return { ok: false, message: 'Card not found.' };

  // Tokens may enter nonbattlefield zones briefly, but state-based actions make
  // them cease to exist before anyone receives priority. Keep those zones clean.
  if (source.card.token && targetZone !== 'battlefield') {
    return removeToken(instanceId, {
      died: source.zone === 'battlefield' && targetZone === 'graveyard',
      destination: targetZone,
    });
  }

  const targetPlayer = currentState.players[targetPlayerId];
  const castAttempt = ['hand', 'command'].includes(source.zone)
    && (targetZone === 'stack' || (targetZone === 'battlefield' && !isLand(source.card)));
  const tax = source.zone === 'command' ? 2 * (targetPlayer.commanderCastCount[source.card.instanceId] || 0) : 0;
  let autoPlan = null;
  let castLegality = null;
  const legalityState = currentState;
  const landPlayAttempt = source.zone === 'hand' && targetZone === 'battlefield' && isLand(source.card) && countsAsLandPlay;
  const landPlan = source.zone === 'hand' && targetZone === 'battlefield' && isLand(source.card)
    ? landEntryPlan(source.card, targetPlayer, {
        opponentCount: Math.max(1, Object.keys(currentState.players).length - 1),
        payLife: enterTapped ? false : 'auto',
      })
    : null;

  if (landPlayAttempt && currentState.settings.enforceLandPlays !== false && !force) {
    const landLegality = landPlayLegality(currentState, targetPlayerId, source.card);
    if (!landLegality.legal) {
      return {
        ok: false,
        message: `${landLegality.reasons.join(' ')} Use “Put by card effect” only when an effect puts a land onto the battlefield without playing it.`,
      };
    }
  }

  if (castAttempt) {
    castLegality = spellCastLegality(currentState, targetPlayerId, source.card, source.zone, {
      useUntappedSources: currentState.settings.manaMode === 'auto',
    });
    autoPlan = castLegality.payment;
  }

  // Moving a commander out of the command zone is treated as casting it.
  // Commander tax and mana payment are enforced even in Free Table mode so
  // dragging the card cannot accidentally bypass its current cost.
  if (source.zone === 'command' && castAttempt && !castLegality?.legal && !force) {
    return { ok: false, message: castLegality?.reasons?.join(' ') || "The commander's current cost cannot be paid." };
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
  const battlefieldEntryText = targetZone === 'battlefield'
    ? ` ${enterTapped || landPlan?.tapped ? 'Entered tapped' : 'Entered untapped'}${landPlan?.lifePaid ? ` after paying ${landPlan.lifePaid} life` : ''}.`
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
        destinationPlayer.spellsCastThisTurn = Number(destinationPlayer.spellsCastThisTurn || 0) + 1;
        if (!isCreature(card)) destinationPlayer.noncreatureSpellsCastThisTurn = Number(destinationPlayer.noncreatureSpellsCastThisTurn || 0) + 1;
      }
      draft.stack.push(card);
      draft.priorityPlayerId = targetPlayerId;
      draft.consecutivePasses = 0;
    } else {
      card.controller = targetPlayerId;
      card.attacking = false;
      if (targetZone === 'battlefield') {
        if (isLand(card) && originalZone === 'hand' && countsAsLandPlay) destinationPlayer.landPlaysThisTurn += 1;
        if (!isLand(card) && ['hand', 'command'].includes(originalZone)) {
          if (originalZone === 'command') destinationPlayer.commanderCastCount[card.instanceId] = (destinationPlayer.commanderCastCount[card.instanceId] || 0) + 1;
          destinationPlayer.spellsCastThisTurn = Number(destinationPlayer.spellsCastThisTurn || 0) + 1;
          if (!isCreature(card)) destinationPlayer.noncreatureSpellsCastThisTurn = Number(destinationPlayer.noncreatureSpellsCastThisTurn || 0) + 1;
        }
        card.summoningSick = isCreature(card);
        card.enteredBattlefieldTurn = Number(draft.turnNumber || 1);
        card.stackFresh = Boolean(isLand(card) || card.token);
        if (isLand(card) && originalZone === 'hand' && landPlan) {
          card.tapped = Boolean(enterTapped || landPlan.tapped);
          destinationPlayer.life -= Number(landPlan.lifePaid || 0);
        } else card.tapped = Boolean(enterTapped);
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
  }, { log: `${source.card.name}: ${ZONE_LABELS[source.zone]} → ${ZONE_LABELS[targetZone]}.${autoManaText}${battlefieldEntryText}` });
  return { ok: true, message: autoManaText ? autoManaText.trim() : 'Card moved.' };
}

function tapForMana(instanceId, choiceIndex = 0) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'Only battlefield permanents can produce mana here.' };
  if (found.card.tapped) return { ok: false, message: `${found.card.name} is already tapped.` };
  const controller = current.players[found.card.controller];
  const choices = manaProductionChoices(found.card, { player: controller });
  const choice = choices[Number(choiceIndex)];
  if (!choice) return { ok: false, message: `${found.card.name} does not have that listed mana choice.` };
  if (!canActivateManaChoice(found.card, choice, controller)) return { ok: false, message: `${found.card.name} cannot activate that mana ability right now.` };
  if (choice.activationManaCost && !canPayMana(controller.mana, choice.activationManaCost, 0).ok) return { ok: false, message: `You need ${choice.activationManaCost} already floating to activate this mana ability.` };

  updateState((draft) => {
    const located = findCard(instanceId, draft);
    if (!located) return;
    const player = draft.players[located.card.controller];
    if (choice.activationManaCost) player.mana = spendMana(player.mana, choice.activationManaCost, 0);
    player.life -= Number(choice.lifeCost || 0);
    if (choice.discardCost && player.zones.hand.length) player.zones.graveyard.push(player.zones.hand.shift());
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.mana[color] = Number(player.mana[color] || 0) + Number(choice.mana?.[color] || 0);
    if (choice.sacrificeSource) {
      const [sacrificed] = located.container.splice(located.index, 1);
      player.zones.graveyard.push(sacrificed);
      clearCardRelations(draft, sacrificed);
    } else if (choice.requiresTap !== false) located.card.tapped = true;
  }, { log: `${found.card.name} produced ${choice.label || formatManaBundle(choice.mana)}${choice.activationManaCost ? ` after paying ${choice.activationManaCost}` : ''}${choice.lifeCost ? ` and ${choice.lifeCost} life` : ''}.` });
  return { ok: true, message: `Added ${choice.label || formatManaBundle(choice.mana)} mana.` };
}

function toggleTap(instanceId, { mana = true } = {}) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  if (!found || found.zone !== 'battlefield') return { ok: false, message: 'Only battlefield permanents can be tapped here.' };
  if (!found.card.tapped && mana && ['assisted', 'auto'].includes(current.settings.manaMode)) {
    const choices = manaProductionChoices(found.card, { player: current.players[found.card.controller] });
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

function updateManualKeyword(instanceId, keyword, enabled = true) {
  const current = window.CommanderForge.getState();
  const found = findCard(instanceId, current);
  const clean = String(keyword || '').trim().replace(/\s+/g, ' ');
  if (!found || !clean) return { ok: false, message: 'Choose a keyword ability first.' };
  updateState((draft) => {
    const located = findCard(instanceId, draft);
    const values = [...(located.card.manualKeywords || [])];
    const existingIndex = values.findIndex((value) => value.toLocaleLowerCase() === clean.toLocaleLowerCase());
    if (enabled && existingIndex < 0) values.push(clean);
    if (!enabled && existingIndex >= 0) values.splice(existingIndex, 1);
    located.card.manualKeywords = values;
  }, { log: `${found.card.name}: ${enabled ? 'gained' : 'lost'} ${clean}.` });
  return { ok: true };
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
  const isCreatureToken = /(?:^|\s)Creature(?:\s|$)/i.test(String(token.typeLine || ''));
  const stats = isCreatureToken ? `${tokenXml(token.power ?? 1)}/${tokenXml(token.toughness ?? 1)}` : '';
  const statsBox = isCreatureToken ? `<rect x="354" y="605" width="104" height="56" rx="14" fill="${accent}"/><text x="406" y="644" text-anchor="middle" fill="#11160f" font-family="Arial,sans-serif" font-size="31" font-weight="800">${stats}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${frame}"/><stop offset="1" stop-color="#0b0f0c"/></linearGradient></defs><rect width="500" height="700" rx="38" fill="url(#g)"/><rect x="22" y="22" width="456" height="656" rx="28" fill="none" stroke="${accent}" stroke-width="8"/><rect x="42" y="42" width="416" height="82" rx="18" fill="#000000" fill-opacity=".35"/><text x="64" y="94" fill="${text}" font-family="Arial,sans-serif" font-size="36" font-weight="700">${name}</text><circle cx="250" cy="330" r="142" fill="none" stroke="${accent}" stroke-width="12" opacity=".75"/><path d="M250 176l35 105 111 2-89 66 32 106-89-63-89 63 32-106-89-66 111-2z" fill="${accent}" opacity=".28"/><rect x="42" y="520" width="416" height="88" rx="18" fill="#000000" fill-opacity=".42"/><text x="64" y="572" fill="${text}" font-family="Arial,sans-serif" font-size="25">${type}</text>${statsBox}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createToken(playerId, token, options = {}) {
  const quantity = Math.max(1, Math.min(100, Math.floor(Number(options.quantity || 1))));
  const tokenFaces = deepClone(token.tokenFaces || []);
  const firstFace = tokenFaces[0] || null;
  const makeCard = () => {
    const fallbackImage = tokenImageData(token);
    return {
      instanceId: uid('token'),
      scryfallId: token.scryfallId || null,
      oracleId: token.oracleId || null,
      name: firstFace?.name || token.name || 'Token',
      manaCost: firstFace?.manaCost || token.manaCost || '',
      manaValue: Number(token.manaValue || 0),
      typeLine: firstFace?.typeLine || token.typeLine || 'Token Creature',
      oracleText: firstFace?.oracleText || token.oracleText || '',
      power: String(firstFace?.power ?? token.power ?? ''),
      toughness: String(firstFace?.toughness ?? token.toughness ?? ''),
      loyalty: String(firstFace?.loyalty ?? token.loyalty ?? ''),
      keywords: [...(token.keywords || [])],
      colors: [...(firstFace?.colors || token.colors || [])],
      colorIdentity: [...(token.colorIdentity || token.colors || [])],
      producedMana: [...(token.producedMana || [])],
      legalities: {},
      layout: token.layout || 'token',
      image: firstFace?.image || token.image || fallbackImage,
      imageSmall: firstFace?.imageSmall || token.imageSmall || firstFace?.image || token.image || fallbackImage,
      backImage: token.backImage || tokenFaces[1]?.image || null,
      tokenFaces,
      activeTokenFace: 0,
      owner: playerId,
      controller: playerId,
      tapped: Boolean(options.tapped ?? token.tapped),
      summoningSick: /(?:^|\s)Creature(?:\s|$)/i.test(firstFace?.typeLine || token.typeLine || ''),
      attacking: false,
      blocking: null,
      blockedBy: [],
      faceDown: false,
      token: true,
      predefinedToken: Boolean(token.scryfallId || token.oracleId || token.tokenFaces?.length),
      stackFresh: true,
      enteredBattlefieldTurn: Number(window.CommanderForge.getState().turnNumber || 1),
      commander: false,
      counters: {},
      notes: '',
      attachedTo: null,
      attachments: [],
      tokenStyle: token.image ? null : { frameColor: token.frameColor || '#1f3329', accentColor: token.accentColor || '#d4a654', textColor: token.textColor || '#f4f1e8' },
    };
  };
  const cards = Array.from({ length: quantity }, makeCard);
  updateState((draft) => { draft.players[playerId].zones.battlefield.push(...cards); }, {
    log: `${draftName(playerId)} created ${quantity > 1 ? `${quantity} ${cards[0].name} tokens` : `a ${cards[0].name} token`}.`,
  });
  return quantity === 1 ? cards[0] : cards;
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
    copy.predefinedToken = false;
    copy.stackFresh = true;
    copy.enteredBattlefieldTurn = Number(draft.turnNumber || 1);
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
      for (const player of Object.values(draft.players)) {
        player.zones.battlefield.forEach((card) => { card.stackFresh = false; });
      }
      draft.turnNumber += 1;
      draft.activePlayerId = otherPlayerId(draft, draft.activePlayerId);
      const active = draft.players[draft.activePlayerId];
      active.landPlaysThisTurn = 0;
      active.spellsCastThisTurn = 0;
      active.noncreatureSpellsCastThisTurn = 0;
      active.zones.battlefield.forEach((card) => {
        card.tapped = false;
        card.attacking = false;
        card.blocking = null;
        card.blockedBy = [];
        card.summoningSick = false;
        card.damageMarked = 0;
        card.deathtouchDamaged = false;
        card.abilityActivationsThisTurn = {};
      });
      active.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    }
    draft.phaseIndex = nextIndex;
    draft.priorityPlayerId = draft.activePlayerId;
    draft.consecutivePasses = 0;
    const active = draft.players[draft.activePlayerId];
    if (PHASES[nextIndex].id === 'draw' && draft.settings.autoDraw) {
      const skipOpeningDraw = Number(draft.turnNumber || 1) === 1 && draft.activePlayerId === 'p1';
      if (skipOpeningDraw) {
        draft.log.unshift({
          id: uid('log'),
          time: new Date().toISOString(),
          text: `${active.name} skipped the first-turn draw in this 1v1 game.`,
        });
      } else drawCards(draft, active.id, 1);
    }
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
  const current = window.CommanderForge.getState();
  const currentFound = findCard(instanceId, current);
  if (!currentFound) return;
  const transforms = currentFound.card.token && currentFound.card.tokenFaces?.length > 1;
  updateState((draft) => {
    const found = findCard(instanceId, draft);
    if (!found) return;
    const card = found.card;
    if (card.token && card.tokenFaces?.length > 1) {
      const nextIndex = (Number(card.activeTokenFace || 0) + 1) % card.tokenFaces.length;
      const face = card.tokenFaces[nextIndex];
      card.activeTokenFace = nextIndex;
      card.name = face.name || card.name;
      card.manaCost = face.manaCost || '';
      card.typeLine = face.typeLine || card.typeLine;
      card.oracleText = face.oracleText || '';
      card.power = String(face.power ?? '');
      card.toughness = String(face.toughness ?? '');
      card.loyalty = String(face.loyalty ?? '');
      card.colors = [...(face.colors || [])];
      card.image = face.image || card.image;
      card.imageSmall = face.imageSmall || face.image || card.imageSmall;
      card.faceDown = false;
    } else card.faceDown = !card.faceDown;
  }, { log: transforms ? `${currentFound.card.name} transformed.` : 'Card face changed.' });
}

function resolvePrivateLibraryDecision(playerId, cardIds = [], items = [], options = {}) {
  const current = window.CommanderForge.getState();
  const player = current.players[playerId];
  if (!player) return { ok: false, message: 'Player not found.' };
  const ids = [...new Set(cardIds || [])];
  if (!ids.length) return { ok: false, message: 'There are no cards to resolve.' };
  const actualTopIds = player.zones.library.slice(0, ids.length).map((card) => card.instanceId);
  if (actualTopIds.length !== ids.length || actualTopIds.some((id) => !ids.includes(id))) {
    return { ok: false, message: 'The top of the library changed. Open the private library tool again.' };
  }
  const plannedIds = items.map((item) => item.cardId);
  if (plannedIds.length !== ids.length || new Set(plannedIds).size !== ids.length || plannedIds.some((id) => !ids.includes(id))) {
    return { ok: false, message: 'The private card plan is incomplete.' };
  }
  const allowed = new Set(['top', 'bottom', 'hand', 'graveyard', 'exile']);
  if (items.some((item) => !allowed.has(item.destination))) return { ok: false, message: 'Unknown card destination.' };
  const drawAfter = Math.max(0, Number(options.drawAfter || 0));
  const label = String(options.label || 'Scry').trim() || 'Scry';
  const mode = String(options.mode || 'scry');
  const publicMoves = [];
  const resolvedCards = [];
  updateState((draft) => {
    const target = draft.players[playerId];
    const viewed = target.zones.library.splice(0, ids.length);
    const byId = new Map(viewed.map((card) => [card.instanceId, card]));
    const groups = { top: [], bottom: [], hand: [], graveyard: [], exile: [] };
    for (const item of items) {
      const card = byId.get(item.cardId);
      groups[item.destination].push(card);
      if (card) resolvedCards.push({ card: deepClone(card), destination: item.destination });
    }
    target.zones.library = [...groups.top.filter(Boolean), ...target.zones.library, ...groups.bottom.filter(Boolean)];
    target.zones.hand.push(...groups.hand.filter(Boolean));
    target.zones.graveyard.push(...groups.graveyard.filter(Boolean));
    target.zones.exile.push(...groups.exile.filter(Boolean));
    for (const card of groups.graveyard.filter(Boolean)) publicMoves.push({ card, zone: 'graveyard' });
    for (const card of groups.exile.filter(Boolean)) publicMoves.push({ card, zone: 'exile' });
    for (const move of publicMoves) {
      recordPublicEvent(draft, {
        type: move.zone === 'graveyard' ? 'milled' : 'exiled',
        actorId: playerId,
        subjectPlayerId: playerId,
        card: move.card,
        fromZone: 'library',
        toZone: move.zone,
        meaningful: true,
      });
    }
    recordPublicEvent(draft, {
      type: mode === 'scry' ? 'scry' : 'private_library_look',
      actorId: playerId,
      subjectPlayerId: playerId,
      count: ids.length,
      text: `${label} ${ids.length}`,
      meaningful: true,
    });
    if (drawAfter) drawCards(draft, playerId, drawAfter);
  }, {
    log: `${draftName(playerId)} ${mode === 'scry' ? `scried ${ids.length}` : `looked at the top ${ids.length} card${ids.length === 1 ? '' : 's'}`}${items.some((item) => item.destination === 'hand') ? ' and put a card into hand' : ''}${drawAfter ? `, then drew ${drawAfter}` : ''}.`,
  });
  return { ok: true, resolvedCards };
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


return { moveCard, removeToken, tapForMana, toggleTap, toggleAttack, addCounter, updateManualKeyword, createToken, copyAsToken, adjustPlayer, adjustCommanderDamage, adjustMana, clearMana, draw, mill, shuffleLibrary, nextPhase, setPhase, switchActivePlayer, resolveStackTop, counterStackTop, mulligan, keepOpeningHand, concede, queueManualEffect, activateBattlefieldAbility, setPendingEffectCondition, resolvePendingEffect, clearCombatMarkers, battlefieldActivatedAbilities, updateCardNote, flipCard, revealTop, revealTopPublicly, revealCardPublicly, resolvePrivateLibraryDecision, assignBlocker, attachCard };
})();

// ---- main.js ----
(() => {
const { COLORS, PHASES, ZONE_LABELS } = __modules["./constants.js"];
const { fetchCardsByNames, fetchPreconDeck, fetchPreconIndex, fetchPredefinedTokens } = __modules["./api.js"];
const { buildPlayerDeck, createInitialState, drawCards, findCard, getState, importState, resetState, restore, setState, subscribe, undo, updateState } = __modules["./state.js"];
const { commanderCandidates, landPlayAllowance, maximumHandSize, recognizedEffects, validateDeck } = __modules["./rules.js"];
const { analyzePositionAsync, defenseAdvice } = __modules["./coach.js"];
const { addCounter, updateManualKeyword, assignBlocker, attachCard, activateBattlefieldAbility, battlefieldActivatedAbilities, adjustCommanderDamage, adjustMana, adjustPlayer, clearMana, copyAsToken, counterStackTop, createToken, draw, flipCard, mill, moveCard, removeToken, mulligan, keepOpeningHand, concede, nextPhase, queueManualEffect, resolvePendingEffect, resolveStackTop, setPendingEffectCondition, clearCombatMarkers, revealCardPublicly, revealTopPublicly, resolvePrivateLibraryDecision, setPhase, shuffleLibrary, switchActivePlayer, toggleAttack, toggleTap, tapForMana, updateCardNote } = __modules["./game.js"];
const { cardImage, cardSmallImage, debounce, deepClone, downloadJson, escapeHtml, isCreature, isLand, isPermanent, manaProductionChoices, manaSourceLabel, parseDecklist, shuffle, uid } = __modules["./utils.js"];

const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');

window.CommanderForge = { getState };

const ui = {
  setupOpen: false,
  settingsOpen: false,
  tokenOpen: false,
  tokenPeek: false,
  tokenDraft: createTokenDraft(),
  predefinedTokensOpen: false,
  predefinedTokens: [],
  predefinedTokensLoading: false,
  predefinedTokensError: '',
  predefinedTokenProgress: '',
  predefinedTokenSearch: '',
  predefinedTokenFilter: 'all',
  predefinedTokenPlayerId: 'p1',
  predefinedTokenQuantity: 1,
  predefinedTokenTapped: false,
  predefinedTokenLimit: 80,
  pointerActionActive: false,
  deferredRender: false,
  damageOpen: null,
  logOpen: false,
  importOpen: false,
  inspectorMode: 'card',
  inspectorOpen: false,
  drawer: null,
  drawerSearch: '',
  libraryReveal: null,
  publicRevealNotice: null,
  knownRevealSelected: null,
  scry: null,
  loading: null,
  coach: null,
  coachRunning: false,
  coachRunId: 0,
  preconIndex: null,
  hiddenTokens: { p1: false, p2: false },
  mulliganBottomSelections: { p1: new Set(), p2: new Set() },
  inspectorScrollTop: 0,
  inspectorFocus: null,
  setupScrollTop: 0,
  setupBodyScrollTop: 0,
  preconScrollTops: { p1: 0, p2: 0 },
  setupRenderPending: false,
  setupRenderTimer: null,
  drafts: {
    p1: createDraft('Player 1'),
    p2: createDraft('Player 2'),
  },
 };

const MULTIPLAYER_APP_VERSION = '5.28.0';
const multiplayer = {
  mode: 'solo',
  role: null,
  localPlayerId: null,
  remotePlayerId: null,
  roomCode: '',
  status: 'offline',
  peer: null,
  connection: null,
  remoteDraft: null,
  applyingRemote: false,
  suppressSync: false,
  revision: 0,
  lastNetworkFingerprint: '',
  syncTimer: null,
  pendingJoinCode: '',
  lastError: '',
  startGameId: '',
  startStartedAt: '',
  startAcknowledged: false,
  startRetryCount: 0,
  startRetryTimer: null,
  pendingStartMessage: null,
  publicReveals: { p1: { hand: {}, library: {} }, p2: { hand: {}, library: {} } },
};

function isOnlineMultiplayer() { return multiplayer.mode === 'online'; }
function isMultiplayerConnected() { return isOnlineMultiplayer() && multiplayer.connection?.open; }
function multiplayerLocalPlayerId() { return multiplayer.localPlayerId || 'p1'; }
function multiplayerRemotePlayerId() { return multiplayer.remotePlayerId || (multiplayerLocalPlayerId() === 'p1' ? 'p2' : 'p1'); }
function multiplayerPeerId(code) { return `commander-forge-${String(code || '').toLowerCase()}`; }
function normalizeInviteCode(value = '') { return String(value).toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8); }
function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (value, index) => alphabet[(value || Math.floor(Math.random() * 256) + index) % alphabet.length]).join('');
}

function multiplayerStatusLabel() {
  if (!isOnlineMultiplayer()) return '';
  if (multiplayer.status === 'connected') return `${multiplayer.role === 'host' ? 'Host · Player 1' : 'Joined · Player 2'} · ${multiplayer.roomCode}`;
  if (multiplayer.status === 'waiting') return `Waiting for Player 2 · ${multiplayer.roomCode}`;
  if (multiplayer.status === 'connecting') return `Connecting · ${multiplayer.roomCode}`;
  if (multiplayer.status === 'disconnected') return 'Connection lost';
  if (multiplayer.status === 'error') return multiplayer.lastError || 'Connection error';
  return 'Online multiplayer';
}

function stableCommanderInstanceId(playerId, cardName, index = 0) {
  const slug = String(cardName || `commander-${index}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
  return `online-${multiplayer.roomCode || 'room'}-${playerId}-${slug}-${index}`;
}

function publicCommanderCard(card, playerId, index = 0) {
  if (!card) return null;
  return {
    ...deepClone(card),
    instanceId: stableCommanderInstanceId(playerId, card.name, index),
    owner: playerId,
    controller: playerId,
    commander: true,
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    blockedBy: [],
    counters: {},
    notes: '',
    attachedTo: null,
    attachments: [],
  };
}

function serializePublicDraft(playerId) {
  const draft = ui.drafts[playerId];
  const commanders = (draft.commanders || []).map((name, index) => {
    const card = draft.byName?.[String(name).toLocaleLowerCase()] || draft.cards?.find((item) => item.name === name);
    return publicCommanderCard(card, playerId, index);
  }).filter(Boolean);
  return {
    playerId,
    name: draft.name?.trim() || (playerId === 'p1' ? 'Player 1' : 'Player 2'),
    ready: Boolean(draft.ready && !draft.validation?.errors?.length && commanders.length),
    commanders,
    commanderNames: commanders.map((card) => card.name),
    colorIdentity: [...new Set(commanders.flatMap((card) => card.colorIdentity || []))],
    deckTitle: draft.selectedPrecon?.name || draft.name || 'Custom deck',
    total: Number(draft.validation?.total || draft.entries?.reduce((sum, entry) => sum + Number(entry.count || 0), 0) || 100),
  };
}

function sendNetwork(message) {
  if (!isMultiplayerConnected()) return false;
  try { multiplayer.connection.send({ version: MULTIPLAYER_APP_VERSION, ...message }); return true; }
  catch (error) { multiplayer.lastError = error.message || 'Could not send data.'; return false; }
}

function sendLocalDraft() {
  if (!isMultiplayerConnected() || !multiplayer.localPlayerId) return;
  sendNetwork({ type: 'draft', draft: serializePublicDraft(multiplayer.localPlayerId) });
}

function applyRemoteDraft(draft) {
  if (!draft || draft.playerId !== multiplayer.remotePlayerId) return;
  multiplayer.remoteDraft = draft;
  const remote = ui.drafts[draft.playerId];
  remote.name = draft.name;
  remote.ready = Boolean(draft.ready);
  remote.commanders = [...(draft.commanderNames || [])];
  remote.cards = [...(draft.commanders || [])];
  remote.candidates = [...(draft.commanders || [])];
  remote.validation = draft.ready ? { errors: [], warnings: [], total: draft.total || 100 } : null;
  render();
}

function hiddenNetworkCard(playerId, zone, index) {
  return {
    instanceId: `hidden-${playerId}-${zone}-${index}`,
    scryfallId: null,
    name: 'Hidden card',
    manaCost: '', manaValue: 0,
    typeLine: 'Hidden Card', oracleText: '', producedMana: [],
    power: '', toughness: '', keywords: [], manualKeywords: [], colors: [], colorIdentity: [], legalities: {},
    image: './card-back.svg', imageSmall: './card-back.svg',
    owner: playerId, controller: playerId, faceDown: true, networkHidden: true,
    tapped: false, summoningSick: false, attacking: false, token: false, commander: false,
    counters: {}, notes: '',
  };
}

function hiddenNetworkZone(playerId, zone, count) {
  return Array.from({ length: Math.max(0, Number(count || 0)) }, (_, index) => hiddenNetworkCard(playerId, zone, index));
}

function emptyPublicRevealState() {
  return { p1: { hand: {}, library: {} }, p2: { hand: {}, library: {} } };
}

function publicRevealImage(card, size = 'small') {
  if (!card) return './card-back.svg';
  const direct = size === 'normal'
    ? (card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal)
    : (card.imageSmall || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || card.image);
  if (direct) return direct;
  const id = String(card.scryfallId || '').toLowerCase();
  if (/^[0-9a-f-]{36}$/.test(id)) return `https://cards.scryfall.io/${size === 'normal' ? 'normal' : 'small'}/front/${id[0]}/${id[1]}/${id}.jpg`;
  return './card-back.svg';
}

function revealNetworkSnapshot(card) {
  return {
    instanceId: card?.instanceId || null,
    scryfallId: card?.scryfallId || null,
    oracleId: card?.oracleId || null,
    name: card?.name || 'Revealed card',
    manaCost: card?.manaCost || '',
    manaValue: Number(card?.manaValue || 0),
    typeLine: card?.typeLine || '',
    oracleText: card?.oracleText || '',
    power: card?.power || '',
    toughness: card?.toughness || '',
    keywords: [...(card?.keywords || [])],
    manualKeywords: [...(card?.manualKeywords || [])],
    colors: [...(card?.colors || [])],
    colorIdentity: [...(card?.colorIdentity || [])],
    commander: Boolean(card?.commander),
    token: Boolean(card?.token),
    producedMana: [...(card?.producedMana || [])],
    image: card?.image || card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || null,
    imageSmall: card?.imageSmall || card?.image_uris?.small || card?.card_faces?.[0]?.image_uris?.small || null,
    owner: card?.owner || null,
    controller: card?.controller || null,
    faceDown: false,
    networkHidden: false,
  };
}

function ensureRevealBucket(playerId) {
  multiplayer.publicReveals ||= emptyPublicRevealState();
  multiplayer.publicReveals[playerId] ||= { hand: {}, library: {} };
  const bucket = multiplayer.publicReveals[playerId];
  bucket.hand ||= {};
  bucket.library ||= {};
  // Migrate a reveal created by an older in-memory session.
  if (bucket.libraryTop?.card) {
    const key = bucket.libraryTop.card.instanceId || bucket.libraryTop.id;
    bucket.library[key] = bucket.libraryTop;
    delete bucket.libraryTop;
  }
  return bucket;
}

function applyPublicReveal(reveal, { notify = true } = {}) {
  if (!reveal?.playerId || !reveal?.card?.name) return;
  const bucket = ensureRevealBucket(reveal.playerId);
  const key = reveal.card.instanceId || reveal.id;
  // A known card can move between the library and hand. Keep only one current record.
  for (const [recordKey, record] of Object.entries(bucket.hand || {})) {
    if (recordKey === key || record?.id === reveal.id || record?.card?.instanceId === reveal.card.instanceId) delete bucket.hand[recordKey];
  }
  for (const [recordKey, record] of Object.entries(bucket.library || {})) {
    if (recordKey === key || record?.id === reveal.id || record?.card?.instanceId === reveal.card.instanceId) delete bucket.library[recordKey];
  }
  if (reveal.zone === 'hand') bucket.hand[key] = deepClone(reveal);
  if (reveal.zone === 'library') bucket.library[key] = deepClone(reveal);
  if (notify) {
    ui.publicRevealNotice = deepClone(reveal);
    toast(`${getState().players?.[reveal.playerId]?.name || reveal.playerId} revealed ${reveal.card.name}.`);
  }
}

function clearPublicReveal(revealId, playerId = null) {
  multiplayer.publicReveals ||= emptyPublicRevealState();
  for (const id of playerId ? [playerId] : Object.keys(multiplayer.publicReveals)) {
    const bucket = ensureRevealBucket(id);
    for (const collection of [bucket.hand, bucket.library]) {
      for (const [key, reveal] of Object.entries(collection || {})) {
        if (key === revealId || reveal?.id === revealId || reveal?.card?.instanceId === revealId) delete collection[key];
      }
    }
  }
  if (ui.publicRevealNotice && [ui.publicRevealNotice.id, ui.publicRevealNotice.card?.instanceId].includes(revealId)) ui.publicRevealNotice = null;
  if (ui.knownRevealSelected?.cardId === revealId) ui.knownRevealSelected = null;
}

function findPublishedReveal(playerId, cardId) {
  const bucket = ensureRevealBucket(playerId);
  return [...Object.values(bucket.hand || {}), ...Object.values(bucket.library || {})]
    .find((reveal) => reveal?.card?.instanceId === cardId || reveal?.id === cardId) || null;
}

function publishPublicReveal(card, playerId, zone, options = {}) {
  if (!card || !playerId || !['hand', 'library'].includes(zone)) return;
  const existing = findPublishedReveal(playerId, card.instanceId);
  const reveal = {
    id: existing?.id || uid('network-reveal'),
    playerId,
    zone,
    position: zone === 'library' ? (options.position || existing?.position || 'revealed') : null,
    turn: getState().turnNumber,
    card: revealNetworkSnapshot(card),
  };
  applyPublicReveal(reveal, { notify: false });
  if (options.notifyLocal) ui.publicRevealNotice = deepClone(reveal);
  if (isMultiplayerConnected()) sendNetwork({ type: 'public-reveal', reveal });
  return reveal;
}

function localZoneForPublishedCard(playerId, cardId) {
  const player = getState().players?.[playerId];
  if (!player || !cardId) return null;
  if (player.zones.hand.some((card) => card.instanceId === cardId)) return 'hand';
  if (player.zones.library.some((card) => card.instanceId === cardId)) return 'library';
  return null;
}

function reconcileLocalPublicReveals() {
  if (!isOnlineMultiplayer() || !multiplayer.localPlayerId) return;
  const playerId = multiplayer.localPlayerId;
  const bucket = ensureRevealBucket(playerId);
  const records = [...Object.values(bucket.hand || {}), ...Object.values(bucket.library || {})].filter(Boolean);
  for (const reveal of records) {
    const actualZone = localZoneForPublishedCard(playerId, reveal.card?.instanceId);
    if (!actualZone) {
      clearPublicReveal(reveal.id, playerId);
      if (isMultiplayerConnected()) sendNetwork({ type: 'public-reveal-clear', revealId: reveal.id, playerId });
      continue;
    }
    if (actualZone !== reveal.zone) {
      const actualCard = getState().players[playerId].zones[actualZone].find((card) => card.instanceId === reveal.card.instanceId) || reveal.card;
      publishPublicReveal(actualCard, playerId, actualZone, { position: actualZone === 'library' ? 'revealed' : null });
    }
  }
}

function clearPublishedLibraryReveals(playerId) {
  const bucket = ensureRevealBucket(playerId);
  for (const reveal of Object.values(bucket.library || {})) {
    clearPublicReveal(reveal.id, playerId);
    if (isMultiplayerConnected() && playerId === multiplayer.localPlayerId) {
      sendNetwork({ type: 'public-reveal-clear', revealId: reveal.id, playerId });
    }
  }
}

function knownHandRevealCards(state, playerId) {
  const count = state.players?.[playerId]?.zones?.hand?.length || 0;
  const bucket = ensureRevealBucket(playerId);
  const direct = Object.values(bucket.hand || {}).map((entry) => entry.card).filter(Boolean);
  const remembered = Object.values(state.knowledge?.players?.[playerId]?.knownHand || {}).map((entry) => entry.card).filter(Boolean);
  const unique = new Map();
  for (const card of [...direct, ...remembered]) {
    const key = card.instanceId || card.oracleId || card.scryfallId || card.name;
    if (key && !unique.has(key)) unique.set(key, card);
  }
  return [...unique.values()].slice(0, count);
}

function knownLibraryRevealRecords(state, playerId) {
  const bucket = ensureRevealBucket(playerId);
  const direct = Object.values(bucket.library || {}).filter((entry) => entry?.card);
  const rememberedTop = state.knowledge?.players?.[playerId]?.knownLibraryTop?.map((entry) => ({
    id: `memory-top-${entry.card?.instanceId || entry.card?.name}`,
    playerId,
    zone: 'library',
    position: 'top',
    card: entry.card,
  })) || [];
  const unique = new Map();
  for (const reveal of [...direct, ...rememberedTop]) {
    const key = reveal.card?.instanceId || reveal.card?.oracleId || reveal.card?.scryfallId || reveal.card?.name;
    if (key && !unique.has(key)) unique.set(key, reveal);
  }
  return [...unique.values()];
}

function findKnownRevealCard(playerId, cardId) {
  const bucket = ensureRevealBucket(playerId);
  const direct = [...Object.values(bucket.hand || {}), ...Object.values(bucket.library || {})]
    .find((reveal) => reveal?.card?.instanceId === cardId || reveal?.id === cardId);
  if (direct?.card) return direct;
  const memory = getState().knowledge?.players?.[playerId];
  const hand = Object.values(memory?.knownHand || {}).find((entry) => entry?.card?.instanceId === cardId);
  if (hand?.card) return { id: `memory-hand-${cardId}`, playerId, zone: 'hand', card: hand.card };
  const library = [...(memory?.knownLibraryTop || []), ...(memory?.knownLibraryBottom || [])]
    .find((entry) => entry?.card?.instanceId === cardId);
  if (library?.card) return { id: `memory-library-${cardId}`, playerId, zone: 'library', card: library.card };
  return null;
}

function renderPublicRevealCard(card, label = 'Revealed', playerId = null) {
  const inspect = playerId && card?.instanceId
    ? ` data-action="inspect-revealed-card" data-player-id="${escapeHtml(playerId)}" data-known-card-id="${escapeHtml(card.instanceId)}" role="button" tabindex="0"`
    : '';
  return `<article class="game-card publicly-revealed-card"${inspect} title="${escapeHtml(card.name)} · ${escapeHtml(label)}"><img src="${escapeHtml(publicRevealImage(card))}" alt="${escapeHtml(card.name)}" draggable="false" onerror="this.src='./card-back.svg'" /><span class="public-reveal-badge">${escapeHtml(label)}</span><div class="card-name-strip">${escapeHtml(card.name)}</div></article>`;
}

function compactNetworkCard(card) {
  if (!card) return card;
  return {
    instanceId: card.instanceId || null,
    scryfallId: card.scryfallId || null,
    oracleId: card.oracleId || null,
    name: card.name || 'Card',
    manaCost: card.manaCost || '',
    manaValue: Number(card.manaValue || 0),
    typeLine: card.typeLine || '',
    oracleText: card.oracleText || '',
    producedMana: [...(card.producedMana || [])],
    power: card.power || '', toughness: card.toughness || '',
    keywords: [...(card.keywords || [])],
    manualKeywords: [...(card.manualKeywords || [])],
    colors: [...(card.colors || [])],
    colorIdentity: [...(card.colorIdentity || [])],
    image: card.image || null,
    imageSmall: card.imageSmall || null,
    owner: card.owner || null,
    controller: card.controller || null,
    tapped: Boolean(card.tapped),
    summoningSick: Boolean(card.summoningSick),
    attacking: Boolean(card.attacking),
    blocking: card.blocking || null,
    blockedBy: [...(card.blockedBy || [])],
    faceDown: Boolean(card.faceDown),
    token: Boolean(card.token),
    commander: Boolean(card.commander),
    counters: { ...(card.counters || {}) },
    notes: card.notes || '',
    attachedTo: card.attachedTo || null,
    attachments: [...(card.attachments || [])],
    damageMarked: Number(card.damageMarked || 0),
    deathtouchDamaged: Boolean(card.deathtouchDamaged),
    continuousEffects: deepClone(card.continuousEffects || []),
    abilityActivationsThisTurn: { ...(card.abilityActivationsThisTurn || {}) },
    tokenStyle: card.tokenStyle ? { ...card.tokenStyle } : null,
    tokenFaces: deepClone(card.tokenFaces || []),
    activeTokenFace: Number(card.activeTokenFace || 0),
    backImage: card.backImage || null,
  };
}

function stateForNetwork() {
  // Private zones are counts only. Public cards are reduced to the fields the
  // table and coach actually use, keeping messages below browser channel limits.
  const outgoing = deepClone(getState());
  outgoing.networkSchema = 2;
  outgoing.selected = null;
  outgoing.privateZoneCounts = {};
  outgoing.settings = undefined;
  outgoing.log = (outgoing.log || []).slice(0, 120);
  if (outgoing.knowledge?.events) outgoing.knowledge.events = outgoing.knowledge.events.slice(0, 160);
  for (const playerId of Object.keys(outgoing.players || {})) {
    const zones = outgoing.players[playerId].zones;
    outgoing.privateZoneCounts[playerId] = {
      hand: zones.hand.length,
      library: zones.library.length,
    };
    zones.hand = [];
    zones.library = [];
    for (const zone of ['battlefield', 'graveyard', 'exile', 'command']) {
      zones[zone] = (zones[zone] || []).map(compactNetworkCard);
    }
  }
  outgoing.stack = (outgoing.stack || []).map(compactNetworkCard);
  return outgoing;
}

function mergeNetworkState(incoming) {
  const next = deepClone(incoming);
  const current = getState();
  const localId = multiplayer.localPlayerId;
  const counts = next.privateZoneCounts || {};
  next.settings = current.settings;
  for (const playerId of Object.keys(next.players || {})) {
    const handCount = Number(counts[playerId]?.hand ?? next.players[playerId].zones.hand?.length ?? 0);
    const libraryCount = Number(counts[playerId]?.library ?? next.players[playerId].zones.library?.length ?? 0);
    if (playerId === localId && current.players?.[playerId]) {
      next.players[playerId].zones.hand = current.players[playerId].zones.hand;
      next.players[playerId].zones.library = current.players[playerId].zones.library;
    } else {
      next.players[playerId].zones.hand = hiddenNetworkZone(playerId, 'hand', handCount);
      next.players[playerId].zones.library = hiddenNetworkZone(playerId, 'library', libraryCount);
    }
  }
  delete next.privateZoneCounts;
  next.selected = current.selected;
  return next;
}

function networkFingerprint() {
  if (!isOnlineMultiplayer() || !getState().started) return '';
  return JSON.stringify(stateForNetwork());
}

function broadcastAuthoritativeState() {
  if (!isMultiplayerConnected() || multiplayer.role !== 'host') return;
  multiplayer.revision += 1;
  const state = stateForNetwork();
  multiplayer.lastNetworkFingerprint = JSON.stringify(state);
  sendNetwork({ type: 'state', revision: multiplayer.revision, state });
}

function multiplayerStateChanged() {
  reconcileLocalPublicReveals();
  if (!isMultiplayerConnected() || !getState().started || multiplayer.applyingRemote || multiplayer.suppressSync) return;
  clearTimeout(multiplayer.syncTimer);
  multiplayer.syncTimer = setTimeout(() => {
    const state = stateForNetwork();
    const fingerprint = JSON.stringify(state);
    if (fingerprint === multiplayer.lastNetworkFingerprint) return;
    multiplayer.lastNetworkFingerprint = fingerprint;
    if (multiplayer.role === 'host') {
      multiplayer.revision += 1;
      sendNetwork({ type: 'state', revision: multiplayer.revision, state });
    } else {
      sendNetwork({ type: 'state-proposal', baseRevision: multiplayer.revision, state });
    }
  }, 45);
}

function applyNetworkState(incoming, revision = multiplayer.revision) {
  if (!incoming) return;
  multiplayer.applyingRemote = true;
  try {
    const merged = mergeNetworkState(incoming);
    setState(merged, { save: true });
    multiplayer.revision = Math.max(multiplayer.revision, Number(revision || 0));
    multiplayer.lastNetworkFingerprint = JSON.stringify(stateForNetwork());
  } finally { multiplayer.applyingRemote = false; }
}

function clearOnlineStartRetry() {
  if (multiplayer.startRetryTimer) clearTimeout(multiplayer.startRetryTimer);
  multiplayer.startRetryTimer = null;
}

function closePeerObjects() {
  clearOnlineStartRetry();
  try { multiplayer.connection?.close(); } catch {}
  try { multiplayer.peer?.destroy(); } catch {}
  multiplayer.connection = null;
  multiplayer.peer = null;
}

function disconnectMultiplayer({ keepMode = false } = {}) {
  closePeerObjects();
  multiplayer.status = 'offline';
  multiplayer.role = null;
  multiplayer.localPlayerId = null;
  multiplayer.remotePlayerId = null;
  multiplayer.roomCode = '';
  multiplayer.remoteDraft = null;
  multiplayer.revision = 0;
  multiplayer.lastNetworkFingerprint = '';
  multiplayer.startGameId = '';
  multiplayer.startStartedAt = '';
  multiplayer.startAcknowledged = false;
  multiplayer.startRetryCount = 0;
  multiplayer.pendingStartMessage = null;
  multiplayer.publicReveals = emptyPublicRevealState();
  ui.publicRevealNotice = null;
  if (!keepMode) multiplayer.mode = 'solo';
  render();
}

function attachMultiplayerConnection(connection) {
  if (multiplayer.connection?.open) {
    connection.close();
    return;
  }
  multiplayer.connection = connection;
  connection.on('open', () => {
    multiplayer.status = 'connected';
    multiplayer.lastError = '';
    sendNetwork({ type: 'hello', role: multiplayer.role, playerId: multiplayer.localPlayerId });
    sendLocalDraft();
    render();
    toast(multiplayer.role === 'host' ? 'Player 2 connected.' : 'Connected to the host.');
  });
  connection.on('data', handleNetworkMessage);
  connection.on('close', () => {
    multiplayer.status = 'disconnected';
    render();
    toast('Multiplayer connection closed.', true);
  });
  connection.on('error', (error) => {
    const message = error?.message || 'Connection error';
    if (/too big for JSON channel/i.test(message)) {
      multiplayer.lastError = 'The other browser is still using the old JSON multiplayer channel. Both players must refresh to version 5.18.';
      if (connection.open) multiplayer.status = 'connected';
      else multiplayer.status = 'error';
    } else {
      multiplayer.status = 'error';
      multiplayer.lastError = message;
    }
    render();
  });
}

function createOnlineHost() {
  if (!globalThis.Peer) return toast('The multiplayer connection library did not load. Refresh and try again.', true);
  disconnectMultiplayer({ keepMode: true });
  multiplayer.mode = 'online';
  multiplayer.role = 'host';
  multiplayer.localPlayerId = 'p1';
  multiplayer.remotePlayerId = 'p2';
  multiplayer.roomCode = generateInviteCode();
  multiplayer.status = 'connecting';
  const createPeer = () => {
    multiplayer.peer = new Peer(multiplayerPeerId(multiplayer.roomCode), { debug: 1 });
    multiplayer.peer.on('open', () => { multiplayer.status = 'waiting'; render(); });
    multiplayer.peer.on('connection', attachMultiplayerConnection);
    multiplayer.peer.on('error', (error) => {
      if (error?.type === 'unavailable-id') {
        try { multiplayer.peer.destroy(); } catch {}
        multiplayer.roomCode = generateInviteCode();
        createPeer();
        return;
      }
      multiplayer.status = 'error';
      multiplayer.lastError = error.message || 'Could not create the room.';
      render();
    });
  };
  createPeer();
  render();
}

function joinOnlineHost(codeValue) {
  const code = normalizeInviteCode(codeValue);
  if (code.length < 6) return toast('Enter the host invite code.', true);
  if (!globalThis.Peer) return toast('The multiplayer connection library did not load. Refresh and try again.', true);
  disconnectMultiplayer({ keepMode: true });
  multiplayer.mode = 'online';
  multiplayer.role = 'guest';
  multiplayer.localPlayerId = 'p2';
  multiplayer.remotePlayerId = 'p1';
  multiplayer.roomCode = code;
  multiplayer.status = 'connecting';
  multiplayer.peer = new Peer(undefined, { debug: 1 });
  multiplayer.peer.on('open', () => {
    const connection = multiplayer.peer.connect(multiplayerPeerId(code), {
      reliable: true,
      serialization: 'binary',
      metadata: { app: 'commander-forge', version: MULTIPLAYER_APP_VERSION, role: 'guest' },
    });
    attachMultiplayerConnection(connection);
  });
  multiplayer.peer.on('error', (error) => {
    multiplayer.status = 'error';
    multiplayer.lastError = error.message || 'Could not join that room.';
    render();
  });
  render();
}

function commanderCardsFromPublicDraft(publicDraft, playerId) {
  return (publicDraft?.commanders || []).map((card, index) => publicCommanderCard(card, playerId, index)).filter(Boolean);
}

function normalizeLocalCommanderIds(player, playerId) {
  const oldCounts = player.commanderCastCount || {};
  const nextCounts = {};
  player.zones.command.forEach((card, index) => {
    const oldId = card.instanceId;
    card.instanceId = stableCommanderInstanceId(playerId, card.name, index);
    nextCounts[card.instanceId] = Number(oldCounts[oldId] || 0);
  });
  player.commanderCastCount = nextCounts;
}

function buildRemotePlayerShell(player, publicDraft, playerId) {
  player.name = publicDraft?.name || (playerId === 'p1' ? 'Player 1' : 'Player 2');
  player.colorIdentity = [...(publicDraft?.colorIdentity || [])];
  player.zones.command = commanderCardsFromPublicDraft(publicDraft, playerId);
  player.commanderCastCount = Object.fromEntries(player.zones.command.map((card) => [card.instanceId, 0]));
  const total = Math.max(100, Number(publicDraft?.total || 100));
  const handCount = 7;
  player.zones.hand = hiddenNetworkZone(playerId, 'hand', handCount);
  player.zones.library = hiddenNetworkZone(playerId, 'library', total - player.zones.command.length - handCount);
  player.zones.battlefield = [];
  player.zones.graveyard = [];
  player.zones.exile = [];
}

function buildLocalOnlinePlayer(player, draft, playerId) {
  player.name = draft.name.trim() || player.name;
  buildPlayerDeck(player, draft, draft.commanders);
  normalizeLocalCommanderIds(player, playerId);
  drawCards(getState(), playerId, 0);
}

function createOnlineInitialState(localPlayerId, localDraft, remotePublicDraft, startMeta = {}) {
  const next = createInitialState();
  next.settings.autoDraw = true;
  next.settings.hideOpponentHand = true;
  const remoteId = localPlayerId === 'p1' ? 'p2' : 'p1';
  next.players[localPlayerId].name = localDraft.name.trim() || next.players[localPlayerId].name;
  buildPlayerDeck(next.players[localPlayerId], localDraft, localDraft.commanders);
  normalizeLocalCommanderIds(next.players[localPlayerId], localPlayerId);
  drawCards(next, localPlayerId, 7);
  buildRemotePlayerShell(next.players[remoteId], remotePublicDraft, remoteId);
  next.started = true;
  next.openingHands = { active: true, kept: { p1: false, p2: false }, bottomRequired: { p1: 0, p2: 0 } };
  next.createdAt = startMeta.startedAt || next.createdAt;
  next.onlineGameId = startMeta.gameId || '';
  next.log.unshift({ id: startMeta.gameId ? `online-start-${startMeta.gameId}` : uid('log'), time: startMeta.startedAt || new Date().toISOString(), text: 'Online game created. Each player drew their own opening hand.' });
  return next;
}

function onlineStartMessage() {
  return {
    type: 'start-game',
    gameId: multiplayer.startGameId,
    startedAt: multiplayer.startStartedAt,
    revision: multiplayer.revision,
    hostDraft: serializePublicDraft('p1'),
  };
}

function transmitOnlineStart() {
  clearOnlineStartRetry();
  if (multiplayer.role !== 'host' || multiplayer.startAcknowledged || !multiplayer.startGameId || !isMultiplayerConnected()) return;
  sendNetwork(onlineStartMessage());
  multiplayer.startRetryCount += 1;
  if (multiplayer.startRetryCount >= 20) {
    multiplayer.lastError = 'Player 2 did not confirm the game start. Ask them to stay on the setup screen and try Start again.';
    render();
    return;
  }
  multiplayer.startRetryTimer = setTimeout(transmitOnlineStart, 600);
}

function startOnlineGame() {
  multiplayer.publicReveals = emptyPublicRevealState();
  ui.publicRevealNotice = null;
  if (multiplayer.role !== 'host' || !isMultiplayerConnected()) return toast('Player 2 must be connected before starting.', true);
  const localDraft = ui.drafts.p1;
  if (!localDraft.ready || !multiplayer.remoteDraft?.ready) return toast('Both players must choose and validate a deck.', true);
  clearOnlineStartRetry();
  multiplayer.startGameId = uid('online-game');
  multiplayer.startStartedAt = new Date().toISOString();
  multiplayer.startAcknowledged = false;
  multiplayer.startRetryCount = 0;
  multiplayer.lastError = '';
  multiplayer.suppressSync = true;
  try {
    const next = createOnlineInitialState('p1', localDraft, multiplayer.remoteDraft, {
      gameId: multiplayer.startGameId,
      startedAt: multiplayer.startStartedAt,
    });
    setState(next);
    ui.setupOpen = false;
    ui.inspectorOpen = false;
    ui.drawer = null;
    ui.mulliganBottomSelections = { p1: new Set(), p2: new Set() };
  } finally { multiplayer.suppressSync = false; }
  multiplayer.revision = 1;
  multiplayer.lastNetworkFingerprint = JSON.stringify(stateForNetwork());
  transmitOnlineStart();
  render();
  toast('Starting the online game for both players…');
}

function receiveOnlineStart(message) {
  if (multiplayer.role !== 'guest') return;
  if (message.gameId && getState().started && getState().onlineGameId === message.gameId) {
    sendNetwork({ type: 'start-ack', gameId: message.gameId });
    return;
  }
  if (!ui.drafts.p2.ready) {
    multiplayer.pendingStartMessage = deepClone(message);
    sendNetwork({ type: 'start-pending', gameId: message.gameId || '' });
    render();
    toast('The host started. Finish loading and validating your deck to enter the game.', true);
    return;
  }
  multiplayer.publicReveals = emptyPublicRevealState();
  ui.publicRevealNotice = null;
  multiplayer.remoteDraft = message.hostDraft;
  multiplayer.suppressSync = true;
  multiplayer.applyingRemote = true;
  try {
    const next = createOnlineInitialState('p2', ui.drafts.p2, message.hostDraft, {
      gameId: message.gameId || '',
      startedAt: message.startedAt || new Date().toISOString(),
    });
    setState(next);
    multiplayer.startGameId = message.gameId || '';
    multiplayer.startStartedAt = message.startedAt || '';
    multiplayer.pendingStartMessage = null;
    multiplayer.revision = Number(message.revision || 1);
    multiplayer.lastNetworkFingerprint = JSON.stringify(stateForNetwork());
    ui.setupOpen = false;
    ui.inspectorOpen = false;
    ui.drawer = null;
    ui.mulliganBottomSelections = { p1: new Set(), p2: new Set() };
  } catch (error) {
    multiplayer.lastError = error?.message || 'Player 2 could not open the game table.';
    sendNetwork({ type: 'start-error', gameId: message.gameId || '', message: multiplayer.lastError });
    render();
    return;
  } finally {
    multiplayer.applyingRemote = false;
    multiplayer.suppressSync = false;
  }
  sendNetwork({ type: 'start-ack', gameId: message.gameId || '' });
  render();
  toast('Online game started. You are Player 2.');
}

function maybeProcessPendingOnlineStart() {
  if (multiplayer.role !== 'guest' || !ui.drafts.p2.ready || !multiplayer.pendingStartMessage) return;
  const message = multiplayer.pendingStartMessage;
  multiplayer.pendingStartMessage = null;
  receiveOnlineStart(message);
}

function updateRemoteHiddenCounts(playerId, handCount, libraryCount) {
  updateState((draft) => {
    if (playerId === multiplayer.localPlayerId) return;
    draft.players[playerId].zones.hand = hiddenNetworkZone(playerId, 'hand', handCount);
    draft.players[playerId].zones.library = hiddenNetworkZone(playerId, 'library', libraryCount);
  }, { snapshot: false });
}

function handleNetworkMessage(message) {
  if (!message || message.version !== MULTIPLAYER_APP_VERSION) {
    multiplayer.status = 'error';
    multiplayer.lastError = 'The other player is using a different Commander Forge version.';
    render();
    return;
  }
  if (message.type === 'hello') {
    multiplayer.status = 'connected';
    sendLocalDraft();
    render();
  }
  if (message.type === 'draft') applyRemoteDraft(message.draft);
  if (message.type === 'start-game') receiveOnlineStart(message);
  if (message.type === 'start-ack' && multiplayer.role === 'host' && message.gameId === multiplayer.startGameId) {
    multiplayer.startAcknowledged = true;
    clearOnlineStartRetry();
    multiplayer.lastError = '';
    toast('Player 2 entered the game.');
  }
  if (message.type === 'start-pending' && multiplayer.role === 'host' && message.gameId === multiplayer.startGameId) {
    toast('Player 2 received the start and is finishing deck setup.');
  }
  if (message.type === 'start-error' && multiplayer.role === 'host' && message.gameId === multiplayer.startGameId) {
    clearOnlineStartRetry();
    multiplayer.lastError = message.message || 'Player 2 could not open the game table.';
    toast(multiplayer.lastError, true);
  }
  if (message.type === 'state' && multiplayer.role === 'guest') applyNetworkState(message.state, message.revision);
  if (message.type === 'state-proposal' && multiplayer.role === 'host') {
    if (Number(message.baseRevision || 0) !== multiplayer.revision) {
      sendNetwork({ type: 'state', revision: multiplayer.revision, state: stateForNetwork() });
      return;
    }
    applyNetworkState(message.state, multiplayer.revision);
    broadcastAuthoritativeState();
  }
  if (message.type === 'mulligan-status') {
    updateState((draft) => {
      const playerId = message.playerId;
      draft.openingHands.kept[playerId] = Boolean(message.kept);
      draft.players[playerId].mulligans = Number(message.mulligans || 0);
      if (playerId !== multiplayer.localPlayerId) {
        draft.players[playerId].zones.hand = hiddenNetworkZone(playerId, 'hand', Number(message.handCount || 7));
        draft.players[playerId].zones.library = hiddenNetworkZone(playerId, 'library', Number(message.libraryCount || 92));
      }
      if (multiplayer.role === 'host' && draft.openingHands.kept.p1 && draft.openingHands.kept.p2) draft.openingHands.active = false;
    }, { snapshot: false });
    if (multiplayer.role === 'host' && getState().openingHands.kept.p1 && getState().openingHands.kept.p2) broadcastAuthoritativeState();
  }
  if (message.type === 'public-reveal') {
    // The exact revealed card is the only private-zone identity transmitted.
    // The normal state sync separately carries the public-memory event for the coach.
    applyPublicReveal(message.reveal, { notify: true });
    render();
  }
  if (message.type === 'public-reveal-clear') {
    clearPublicReveal(message.revealId, message.playerId);
    render();
  }
  if (message.type === 'request-state') {
    if (multiplayer.role === 'host') sendNetwork({ type: 'state', revision: multiplayer.revision, state: stateForNetwork() });
  }
}

function sendMulliganStatus(playerId) {
  if (!isMultiplayerConnected() || playerId !== multiplayer.localPlayerId) return;
  const player = getState().players[playerId];
  sendNetwork({
    type: 'mulligan-status',
    playerId,
    kept: Boolean(getState().openingHands.kept[playerId]),
    mulligans: player.mulligans,
    handCount: player.zones.hand.length,
    libraryCount: player.zones.library.length,
  });
}

function multiplayerCanControlCard(cardId) {
  if (!isOnlineMultiplayer() || !multiplayer.localPlayerId) return true;
  const found = findCard(cardId, getState());
  if (!found) return true;
  return found.card.controller === multiplayer.localPlayerId || found.card.owner === multiplayer.localPlayerId;
}

function multiplayerActionAllowed(button, action) {
  if (!isOnlineMultiplayer() || !getState().started) return true;
  const localId = multiplayer.localPlayerId;
  const safeActions = new Set(['coach', 'run-coach', 'cancel-coach', 'close-inspector', 'open-log', 'close-log', 'open-settings', 'close-settings', 'open-setup', 'close-setup', 'open-zone', 'close-drawer', 'open-damage', 'close-damage', 'export-save', 'close-public-reveal', 'close-scry', 'scry-reveal-next', 'inspect-revealed-card', 'open-predefined-tokens', 'refresh-predefined-tokens', 'close-predefined-tokens', 'create-predefined-token', 'more-predefined-tokens']);
  if (safeActions.has(action)) return true;
  const hostOnly = new Set(['undo', 'switch-player', 'reset-game', 'import-save', 'demo-game']);
  if (hostOnly.has(action)) return multiplayer.role === 'host';
  if (action === 'next-phase') return getState().activePlayerId === localId;
  if (['resolve-stack', 'counter-stack', 'clear-combat'].includes(action)) return getState().activePlayerId === localId;
  const playerId = button.dataset.playerId;
  if (playerId && playerId !== localId) return false;
  const cardId = button.dataset.cardId;
  if (cardId && !multiplayerCanControlCard(cardId)) return false;
  return true;
}

function renderOnlineRemoteDeckStatus(playerId) {
  const draft = multiplayer.remoteDraft;
  if (!draft) return `<section class="deck-panel remote-deck-status"><h3>${playerId === 'p1' ? 'Player 1 / Host' : 'Player 2 / Guest'}</h3><div class="validation">Waiting for this player to connect and choose a deck.</div></section>`;
  return `<section class="deck-panel remote-deck-status"><h3>${playerId === 'p1' ? 'Player 1 / Host' : 'Player 2 / Guest'}</h3><div class="remote-ready-mark ${draft.ready ? 'ready' : ''}">${draft.ready ? '✓ Deck ready' : 'Choosing a deck…'}</div><div class="validation"><strong>${escapeHtml(draft.name)}</strong><br /><span class="small muted">${escapeHtml(draft.deckTitle || 'Commander deck')}</span>${draft.commanderNames?.length ? `<br /><span class="small">Commander: ${draft.commanderNames.map(escapeHtml).join(' + ')}</span>` : ''}</div></section>`;
}

function renderMultiplayerConnectionPanel() {
  if (!multiplayer.role) {
    return `<section class="multiplayer-connect-panel"><div class="multiplayer-choice"><h3>Host a game</h3><p class="small muted">You become Player 1. Share the generated invite code with Player 2.</p><button class="btn primary" data-action="host-online">Create invite code</button></div><div class="multiplayer-choice"><h3>Join a game</h3><p class="small muted">Enter the host's invite code. You will be Player 2.</p><div class="join-code-row"><input id="join-code" maxlength="8" value="${escapeHtml(multiplayer.pendingJoinCode || '')}" placeholder="8-character code" /><button class="btn primary" data-action="join-online">Join</button></div></div></section>`;
  }
  const link = `${location.origin}${location.pathname}?join=${encodeURIComponent(multiplayer.roomCode)}`;
  return `<section class="multiplayer-room-card"><div><span class="network-status-dot ${multiplayer.status}"></span><strong>${escapeHtml(multiplayerStatusLabel())}</strong><p class="small muted">Direct encrypted browser connection. Both players must keep the page open.</p></div>${multiplayer.role === 'host' ? `<div class="invite-code-box"><span>Invite code</span><strong>${escapeHtml(multiplayer.roomCode)}</strong><div><button class="btn small-btn" data-action="copy-invite-code">Copy code</button><button class="btn small-btn" data-action="copy-invite-link" data-link="${escapeHtml(link)}">Copy link</button></div></div>` : ''}<button class="btn danger small-btn" data-action="disconnect-online">Disconnect</button></section>`;
}

function renderOnlineSetup(state) {
  const localId = multiplayer.localPlayerId;
  const remoteId = multiplayer.remotePlayerId;
  const connectionPanel = renderMultiplayerConnectionPanel();
  if (!localId) return `${connectionPanel}<div class="validation multiplayer-note">The host is always Player 1. The invited player is always Player 2.</div>`;
  const left = localId === 'p1' ? renderDeckPanel('p1') : renderOnlineRemoteDeckStatus('p1');
  const right = localId === 'p2' ? renderDeckPanel('p2') : renderOnlineRemoteDeckStatus('p2');
  const localReady = ui.drafts[localId]?.ready;
  const remoteReady = multiplayer.remoteDraft?.ready;
  const guestMessage = multiplayer.pendingStartMessage
    ? 'Host started the game. Finishing your deck setup…'
    : (localReady ? 'Your deck is ready. Waiting for the host to start.' : 'Choose and validate your Player 2 deck.');
  const footer = multiplayer.role === 'host'
    ? `<button class="btn primary" data-action="start-game" ${isMultiplayerConnected() && localReady && remoteReady ? '' : 'disabled'}>Start online game</button>`
    : `<div class="validation ${localReady ? 'ok' : ''}">${guestMessage}</div>`;
  const startError = multiplayer.lastError ? `<div class="validation error multiplayer-start-error">${escapeHtml(multiplayer.lastError)}</div>` : '';
  return `${connectionPanel}${startError}<div class="setup-grid">${left}${right}</div><div class="setup-footer"><span class="small muted">Opponent hands and libraries stay hidden. Each player controls their own cards.</span>${footer}</div>`;
}

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

function createTokenDraft() {
  return {
    playerId: 'p1',
    name: 'Zombie',
    power: 2,
    toughness: 2,
    typeLine: 'Token Creature — Zombie',
    keywords: '',
    frameColor: '#1f3329',
    accentColor: '#d4a654',
    textColor: '#f4f1e8',
  };
}

const ORACLE_NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function oracleNumber(value) {
  const token = String(value || '').trim().toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (token === 'card') return 1;
  return ORACLE_NUMBER_WORDS[token] || null;
}

function sentenceAround(text, index) {
  const start = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('\n', index)) + 1;
  const period = text.indexOf('.', index);
  const newline = text.indexOf('\n', index);
  const ends = [period, newline].filter((value) => value >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).trim();
}

function privateLibraryActions(card) {
  const text = String(card?.oracleText || '');
  const actions = [];
  const seen = new Set();
  const numberPattern = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|x)';
  const scryRegex = new RegExp(`\\bscry\\s+(${numberPattern})\\b`, 'gi');
  for (const match of text.matchAll(scryRegex)) {
    const token = String(match[1] || '').toLowerCase();
    const amount = token === 'x' ? null : oracleNumber(token);
    const sentence = sentenceAround(text, match.index || 0);
    const drawMatch = sentence.match(/then draw (a|one|two|three|four|five|\d+) cards?/i);
    const drawAfter = drawMatch ? (oracleNumber(drawMatch[1]) || 1) : 0;
    const key = `scry-${amount ?? 'x'}-${drawAfter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push({
      mode: 'scry',
      amount,
      label: `Scry ${amount ?? 'X'}`,
      allowedDestinations: ['top', 'bottom'],
      defaultDestination: 'top',
      handLimit: 0,
      handRequired: 0,
      drawAfter,
    });
  }

  const lookRegex = new RegExp(`\\blook at the top (card|${numberPattern}) cards? of your library\\b`, 'i');
  const lookMatch = text.match(lookRegex);
  if (lookMatch) {
    const amount = oracleNumber(lookMatch[1]);
    const start = lookMatch.index || 0;
    const segment = text.slice(start, Math.min(text.length, start + 420));
    const allowHand = /put (?:one|a|an) (?:of them|card|[^.]{0,100}card from among them)[^.]{0,100} into your hand/i.test(segment)
      || /put [^.]{0,120} from among them into your hand/i.test(segment);
    const mayHand = /you may [^.]{0,160}put [^.]{0,120}into your hand/i.test(segment);
    const restBottom = /(?:put|then put)?\s*(?:the )?rest [^.]{0,100}(?:on|at) the bottom of your library/i.test(segment);
    const allowGraveyard = /put (?:the )?(?:rest|any number|that card|them)[^.]{0,100}into your graveyard/i.test(segment);
    const allowExile = /put (?:the )?(?:rest|any number|that card|them)[^.]{0,100}into exile/i.test(segment);
    const allowedDestinations = ['top', 'bottom'];
    if (allowHand) allowedDestinations.push('hand');
    if (allowGraveyard) allowedDestinations.push('graveyard');
    if (allowExile) allowedDestinations.push('exile');
    actions.push({
      mode: 'look',
      amount,
      label: `Look at top ${amount}${allowHand ? ' · choose a card' : ''}`,
      allowedDestinations,
      defaultDestination: restBottom ? 'bottom' : 'top',
      handLimit: allowHand ? 1 : 0,
      handRequired: allowHand && !mayHand ? 1 : 0,
      drawAfter: 0,
    });
  }
  const revealTopRegex = new RegExp(`\\breveal (?:the )?top (card|${numberPattern}) cards? of your library\\b`, 'gi');
  for (const match of text.matchAll(revealTopRegex)) {
    const token = String(match[1] || '').toLowerCase();
    const amount = token === 'x' ? null : oracleNumber(token);
    const segment = text.slice(match.index || 0, Math.min(text.length, (match.index || 0) + 520));
    const allowedDestinations = ['top', 'bottom'];
    const handText = /put (?:that card|it|one of them|a card from among them|any number of (?:those|the) cards|all [^.]{0,80}cards revealed this way)[^.]{0,120}into your hand/i.test(segment);
    const graveyardText = /put (?:that card|it|them|those cards|the rest|all [^.]{0,80}cards revealed this way)[^.]{0,100}into (?:your )?graveyard/i.test(segment);
    const exileText = /put (?:that card|it|them|those cards|the rest)[^.]{0,100}into exile/i.test(segment);
    if (handText) allowedDestinations.push('hand');
    if (graveyardText) allowedDestinations.push('graveyard');
    if (exileText) allowedDestinations.push('exile');
    const singularToHand = amount === 1 && /put (?:that card|it) into your hand/i.test(segment);
    const singularToGraveyard = amount === 1 && /put (?:that card|it) into (?:your )?graveyard/i.test(segment);
    const singularToExile = amount === 1 && /put (?:that card|it) into exile/i.test(segment);
    const defaultDestination = singularToHand ? 'hand' : singularToGraveyard ? 'graveyard' : singularToExile ? 'exile' : (/put (?:the )?rest [^.]{0,90}(?:on|at) the bottom/i.test(segment) ? 'bottom' : 'top');
    const key = `reveal-${amount ?? 'x'}-${allowedDestinations.join('-')}-${defaultDestination}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push({
      mode: 'reveal',
      amount,
      label: `Reveal top ${amount ?? 'X'}`,
      allowedDestinations,
      defaultDestination,
      handLimit: handText ? (/(?:one|a) (?:of them|card from among them)/i.test(segment) ? 1 : 0) : 0,
      handRequired: singularToHand && !/\bmay\b/i.test(segment) ? 1 : 0,
      drawAfter: 0,
      allowReveal: true,
      autoRevealAll: true,
    });
  }

  const untilRegex = /\breveal cards? from the top of your library until you reveal (?:a|an) ([^.]+?) card\b/i;
  const untilMatch = text.match(untilRegex);
  if (untilMatch) {
    const segment = text.slice(untilMatch.index || 0, Math.min(text.length, (untilMatch.index || 0) + 650));
    const allowedDestinations = ['top', 'bottom'];
    if (/put (?:that card|it) into your hand/i.test(segment)) allowedDestinations.push('hand');
    if (/put (?:the rest|all other cards|those cards|them)[^.]{0,100}into (?:your )?graveyard/i.test(segment)) allowedDestinations.push('graveyard');
    if (/put (?:the rest|all other cards|those cards|them)[^.]{0,100}into exile/i.test(segment)) allowedDestinations.push('exile');
    actions.push({
      mode: 'reveal-until',
      amount: 1,
      label: `Reveal until ${String(untilMatch[1]).trim()}`,
      allowedDestinations,
      defaultDestination: /put (?:the rest|all other cards)[^.]{0,100}(?:on|at) the bottom/i.test(segment) ? 'bottom' : 'top',
      handLimit: allowedDestinations.includes('hand') ? 1 : 0,
      handRequired: /put (?:that card|it) into your hand/i.test(segment) && !/\bmay\b/i.test(segment) ? 1 : 0,
      drawAfter: 0,
      allowReveal: true,
      autoRevealAll: true,
      dynamicReveal: true,
      conditionText: String(untilMatch[1]).trim(),
    });
  }

  return actions;
}

function openPrivateLibraryTool(playerId, config = {}) {
  if (!playerId || !getState().players[playerId]) return toast('Player not found.', true);
  if (isOnlineMultiplayer() && playerId !== multiplayer.localPlayerId) return toast('Only the library owner can privately view those cards.', true);
  const requested = Math.max(1, Math.floor(Number(config.amount || 1)));
  const library = getState().players[playerId].zones.library;
  const amount = Math.min(requested, library.length);
  if (!amount) return toast('The library is empty.', true);
  const allowedDestinations = [...new Set(config.allowedDestinations || ['top', 'bottom'])];
  const defaultDestination = allowedDestinations.includes(config.defaultDestination) ? config.defaultDestination : 'top';
  const mode = config.mode || 'scry';
  ui.scry = {
    playerId,
    sourceCardId: config.sourceCardId || null,
    mode,
    label: config.label || `Scry ${amount}`,
    amount,
    cardIds: library.slice(0, amount).map((card) => card.instanceId),
    items: library.slice(0, amount).map((card) => ({ cardId: card.instanceId, destination: defaultDestination, reveal: Boolean(config.autoRevealAll) })),
    allowedDestinations,
    allowReveal: config.allowReveal === true || (config.allowReveal !== false && ['look', 'reveal', 'reveal-until'].includes(mode)),
    dynamicReveal: Boolean(config.dynamicReveal),
    conditionText: String(config.conditionText || ''),
    handLimit: Math.max(0, Number(config.handLimit || 0)),
    handRequired: Math.max(0, Number(config.handRequired || 0)),
    drawAfter: Math.max(0, Number(config.drawAfter || 0)),
  };
  ui.libraryReveal = null;
  render();
}

function setPrivateLibraryDestination(cardId, destination) {
  const tool = ui.scry;
  if (!tool || !tool.allowedDestinations.includes(destination)) return;
  const item = tool.items.find((entry) => entry.cardId === cardId);
  if (!item) return;
  if (destination === 'hand' && item.destination !== 'hand') {
    const selectedForHand = tool.items.filter((entry) => entry.destination === 'hand').length;
    if (tool.handLimit && selectedForHand >= tool.handLimit) return toast(`This effect allows only ${tool.handLimit} card${tool.handLimit === 1 ? '' : 's'} into your hand.`, true);
  }
  item.destination = destination;
  render();
}

function togglePrivateLibraryReveal(cardId) {
  const tool = ui.scry;
  if (!tool?.allowReveal) return;
  const item = tool.items.find((entry) => entry.cardId === cardId);
  if (!item) return;
  item.reveal = !item.reveal;
  render();
}

function revealNextPrivateLibraryCard() {
  const tool = ui.scry;
  if (!tool?.dynamicReveal) return;
  const library = getState().players[tool.playerId]?.zones.library || [];
  const next = library[tool.cardIds.length];
  if (!next) return toast('There are no more cards in the library.', true);
  tool.cardIds.push(next.instanceId);
  tool.items.push({ cardId: next.instanceId, destination: tool.allowedDestinations.includes('top') ? 'top' : tool.allowedDestinations[0], reveal: true });
  tool.amount = tool.cardIds.length;
  render();
}

function movePrivateLibraryItem(cardId, direction) {
  const tool = ui.scry;
  if (!tool) return;
  const index = tool.items.findIndex((entry) => entry.cardId === cardId);
  if (index < 0) return;
  const destination = tool.items[index].destination;
  const same = tool.items.map((entry, itemIndex) => ({ entry, itemIndex })).filter((item) => item.entry.destination === destination);
  const within = same.findIndex((item) => item.itemIndex === index);
  const target = same[within + (direction === 'up' ? -1 : 1)];
  if (!target) return;
  [tool.items[index], tool.items[target.itemIndex]] = [tool.items[target.itemIndex], tool.items[index]];
  render();
}

function confirmPrivateLibraryTool() {
  const tool = ui.scry;
  if (!tool) return;
  const handCount = tool.items.filter((entry) => entry.destination === 'hand').length;
  if (handCount < tool.handRequired) return toast(`Choose ${tool.handRequired} card${tool.handRequired === 1 ? '' : 's'} for your hand.`, true);
  if (tool.handLimit && handCount > tool.handLimit) return toast(`Choose no more than ${tool.handLimit} card${tool.handLimit === 1 ? '' : 's'} for your hand.`, true);
  const result = resolvePrivateLibraryDecision(tool.playerId, tool.cardIds, tool.items, {
    label: tool.label,
    mode: tool.mode,
    drawAfter: tool.drawAfter,
  });
  handleResult(result);
  if (result?.ok) {
    const resolved = new Map((result.resolvedCards || []).map((entry) => [entry.card.instanceId, entry]));
    for (const item of tool.items.filter((entry) => entry.reveal)) {
      const entry = resolved.get(item.cardId);
      if (!entry?.card) continue;
      if (entry.destination === 'hand' || entry.destination === 'top' || entry.destination === 'bottom') {
        revealCardPublicly(entry.card.instanceId);
        publishPublicReveal(entry.card, tool.playerId, entry.destination === 'hand' ? 'hand' : 'library', { position: entry.destination === 'hand' ? null : 'revealed', notifyLocal: true });
      }
    }
    ui.scry = null;
  }
  render();
}

const MANUAL_KEYWORD_OPTIONS = [
  'Flying', 'Reach', 'Deathtouch', 'Defender', 'Double strike', 'First strike',
  'Flash', 'Haste', 'Hexproof', 'Indestructible', 'Lifelink', 'Menace',
  'Shroud', 'Trample', 'Vigilance', 'Fear', 'Intimidate', 'Shadow',
  'Horsemanship', 'Skulk', 'Infect', 'Wither', 'Prowess', 'Unblockable',
  'Ward {1}', 'Ward {2}', 'Protection from white', 'Protection from blue',
  'Protection from black', 'Protection from red', 'Protection from green',
];

window.CommanderForgeMode = {
  select(mode) {
    if (mode === 'solo') disconnectMultiplayer();
    else if (mode === 'online') multiplayer.mode = 'online';
    ui.setupOpen = true;
    render();
  },
};

restore();
const joinFromUrl = normalizeInviteCode(new URLSearchParams(location.search).get('join') || '');
if (joinFromUrl) {
  multiplayer.mode = 'online';
  multiplayer.pendingJoinCode = joinFromUrl;
}
if (!getState().started) ui.setupOpen = true;
subscribe(render);
subscribe(multiplayerStateChanged);
render();
if (joinFromUrl) setTimeout(() => joinOnlineHost(joinFromUrl), 250);

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

function activeSetupEditor() {
  if (!ui.setupOpen) return null;
  const active = document.activeElement;
  if (!active || !app.contains(active)) return null;
  return active.matches?.('[data-draft-field], [data-commander-select], #join-code') ? active : null;
}

function scheduleSetupRenderFlush() {
  if (!ui.setupRenderPending) return;
  clearTimeout(ui.setupRenderTimer);
  ui.setupRenderTimer = setTimeout(() => {
    if (activeSetupEditor()) return;
    ui.setupRenderPending = false;
    render({ force: true });
  }, 180);
}

function render(options = {}) {
  const force = Boolean(options?.force);
  if (!force && ui.pointerActionActive) {
    ui.deferredRender = true;
    return;
  }
  if (!force && activeSetupEditor()) {
    ui.setupRenderPending = true;
    return;
  }
  ui.setupRenderPending = false;
  ui.deferredRender = false;
  captureInspectorView();
  // Mobile setup scrolls on .setup-modal itself; desktop can scroll the body.
  // Preserve both so async precon searches/loads never jump the user back to the top.
  const setupModal = ui.setupOpen ? app.querySelector('.setup-modal') : null;
  const setupBody = ui.setupOpen ? app.querySelector('.setup-modal .modal-body') : null;
  if (setupModal) ui.setupScrollTop = setupModal.scrollTop;
  if (setupBody) ui.setupBodyScrollTop = setupBody.scrollTop;
  if (ui.setupOpen) {
    app.querySelectorAll('.deck-panel[data-deck-panel]').forEach((panel) => {
      const playerId = panel.dataset.deckPanel;
      const results = panel.querySelector('.precon-results');
      if (playerId && results) ui.preconScrollTops[playerId] = results.scrollTop;
    });
  }
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
    const replacementSetupModal = ui.setupOpen ? app.querySelector('.setup-modal') : null;
    const replacementSetupBody = ui.setupOpen ? app.querySelector('.setup-modal .modal-body') : null;
    if (replacementSetupModal) replacementSetupModal.scrollTop = ui.setupScrollTop || 0;
    if (replacementSetupBody) replacementSetupBody.scrollTop = ui.setupBodyScrollTop || 0;
    if (ui.setupOpen) {
      app.querySelectorAll('.deck-panel[data-deck-panel]').forEach((panel) => {
        const playerId = panel.dataset.deckPanel;
        const results = panel.querySelector('.precon-results');
        if (playerId && results) results.scrollTop = ui.preconScrollTops[playerId] || 0;
      });
    }
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
        ${isOnlineMultiplayer() ? `<button class="network-pill ${multiplayer.status}" data-action="open-setup" title="Open multiplayer room">● ${escapeHtml(multiplayerStatusLabel())}</button>` : ''}
        <button class="btn small-btn" data-action="undo" title="Undo">↶ <span class="desktop-label">Undo</span></button>
        <button class="btn small-btn" data-action="coach">✦ <span class="desktop-label">Coach</span></button>
        <button class="btn small-btn" data-action="open-log">☷ <span class="desktop-label">Log</span></button>
        <button class="btn small-btn" data-action="open-settings">⚙</button>
        <button class="btn small-btn" data-action="open-setup">Decks</button>
      </div>
    </header>`;
}

function renderTable(state) {
  const bottomPlayerId = isOnlineMultiplayer() && multiplayer.localPlayerId ? multiplayer.localPlayerId : 'p1';
  const topPlayerId = bottomPlayerId === 'p1' ? 'p2' : 'p1';
  return `
    ${state.winner ? `<div class="winner-banner">🏆 ${escapeHtml(state.players[state.winner]?.name || 'A player')} wins the game</div>` : ''}
    ${renderPendingEffects(state)}
    <div class="table">
      ${renderPlayerMat(state, topPlayerId, true)}
      ${renderStack(state)}
      ${renderPlayerMat(state, bottomPlayerId, false)}
    </div>`;
}


function hasUniqueVisualState(card) {
  const hasCounters = Object.values(card?.counters || {}).some((value) => Number(value || 0) !== 0);
  return Boolean(
    card?.faceDown
    || card?.attachedTo
    || (card?.attachments || []).length
    || hasCounters
    || String(card?.notes || '').trim()
    || card?.attacking
    || card?.blocking
    || card?.stackFresh
  );
}

function isBasicLandCard(card) {
  const typeLine = String(card?.typeLine || card?.type_line || '');
  return /\bBasic\b/i.test(typeLine) && /\bLand\b/i.test(typeLine) && !card?.token;
}

function isUtilityCornerPermanent(card) {
  if (card?.token) return !isCreature(card);
  return /\bEnchantment\b/i.test(String(card?.typeLine || card?.type_line || ''));
}

function canVisuallyStack(card, kind) {
  if (!card || hasUniqueVisualState(card) || card.commander) return false;
  if (kind === 'land') return isBasicLandCard(card);
  if (kind === 'token') return Boolean(card.token);
  if (kind === 'enchantment') return !card.token && /\bEnchantment\b/i.test(String(card.typeLine || ''));
  return false;
}

function visualStackKind(card, allowedKinds) {
  if (allowedKinds.includes('land') && isBasicLandCard(card)) return 'land';
  if (allowedKinds.includes('token') && card?.token) return 'token';
  if (allowedKinds.includes('enchantment') && !card?.token && /\bEnchantment\b/i.test(String(card?.typeLine || ''))) return 'enchantment';
  return null;
}

function groupBattlefieldCards(cards, allowedKinds = []) {
  const groups = [];
  const grouped = new Map();
  for (const card of cards || []) {
    const kind = visualStackKind(card, allowedKinds);
    if (!kind || !canVisuallyStack(card, kind)) {
      groups.push({ key: card.instanceId, cards: [card], stacked: false, kind: kind || 'card' });
      continue;
    }
    const key = [
      kind,
      String(card.name || '').trim().toLocaleLowerCase(),
      card.tapped ? 'tapped' : 'untapped',
      card.summoningSick ? 'sick' : 'ready',
      Number(card.activeTokenFace || 0),
      card.controller || card.owner || '',
    ].join('|');
    let group = grouped.get(key);
    if (!group) {
      group = { key, cards: [], stacked: true, kind };
      grouped.set(key, group);
      groups.push(group);
    }
    group.cards.push(card);
  }
  return groups;
}

function renderBattlefieldCardGroup(group, state) {
  if (!group?.cards?.length) return '';
  if (group.cards.length === 1 || !group.stacked) return renderCard(group.cards[0], state);
  const selectedId = state.selected?.instanceId;
  const representative = group.cards.find((card) => card.instanceId === selectedId) || group.cards[0];
  const tapped = Boolean(representative.tapped);
  const count = group.cards.length;
  return `<div class="permanent-stack ${group.kind}-stack ${tapped ? 'tapped-stack' : 'untapped-stack'}" title="${escapeHtml(representative.name)} ×${count} · ${tapped ? 'tapped' : 'untapped'}">
    <span class="permanent-stack-layer layer-one" aria-hidden="true"></span>
    <span class="permanent-stack-layer layer-two" aria-hidden="true"></span>
    ${renderCard(representative, state)}
    <span class="permanent-stack-count" aria-label="${count} copies">×${count}</span>
  </div>`;
}

function renderBattlefieldGroups(groups, state) {
  return (groups || []).map((group) => renderBattlefieldCardGroup(group, state)).join('');
}

function renderPlayerMat(state, playerId, opponent) {
  const player = state.players[playerId];
  const battlefield = player.zones.battlefield;
  const hideHand = isOnlineMultiplayer() && multiplayer.localPlayerId && playerId !== multiplayer.localPlayerId;
  const maximum = maximumHandSize(state, playerId);
  const handLabel = `${player.zones.hand.length} / max ${maximum.label}`;
  const hiddenTokens = Boolean(ui.hiddenTokens[playerId]);
  const attachedIds = new Set(battlefield.filter((card) => card.attachedTo).map((card) => card.instanceId));
  const visibleBattlefield = battlefield.filter((card) => !attachedIds.has(card.instanceId) && (!hiddenTokens || !card.token));
  const utilityPermanents = visibleBattlefield.filter((card) => isUtilityCornerPermanent(card));
  const lands = visibleBattlefield.filter((card) => isLand(card) && !isUtilityCornerPermanent(card));
  const otherPermanents = visibleBattlefield.filter((card) => !utilityPermanents.includes(card) && !lands.includes(card));
  const landGroups = groupBattlefieldCards(lands, ['land']);
  const utilityGroups = groupBattlefieldCards(utilityPermanents, ['token', 'enchantment']);
  const permanentGroups = groupBattlefieldCards(otherPermanents, ['token']);
  const renderedLandGroups = renderBattlefieldGroups(landGroups, state);
  const renderedUtilityGroups = renderBattlefieldGroups(utilityGroups, state);
  const renderedPermanentGroups = renderBattlefieldGroups(permanentGroups, state);
  const tokenCount = battlefield.filter((card) => card.token && !card.attachedTo).length;
  const hiddenUpperTokenCount = hiddenTokens ? battlefield.filter((card) => card.token && !card.attachedTo && isCreature(card)).length : 0;
  const hiddenUtilityTokenCount = hiddenTokens ? battlefield.filter((card) => card.token && !card.attachedTo && !isCreature(card)).length : 0;
  const tokenToggle = tokenCount ? `<button class="token-visibility-btn" data-action="toggle-tokens" data-player-id="${playerId}">${hiddenTokens ? `Show ${tokenCount} token${tokenCount === 1 ? '' : 's'}` : `Hide ${tokenCount} token${tokenCount === 1 ? '' : 's'}`}</button>` : '';
  const resourceCorners = `<div class="resource-corner land-corner"><span class="resource-corner-label">Lands</span><div class="card-row ${landGroups.length < 4 ? 'corner-aligned' : ''}">${renderedLandGroups}</div></div><div class="resource-corner utility-corner"><span class="resource-corner-label">Enchantments & noncreature tokens</span><div class="card-row ${utilityGroups.length < 4 ? 'corner-aligned-end' : ''}">${renderedUtilityGroups}${hiddenUtilityTokenCount ? `<span class="hidden-token-placeholder">${hiddenUtilityTokenCount} token${hiddenUtilityTokenCount === 1 ? '' : 's'} hidden</span>` : ''}</div></div>`;
  return `
    <section class="player-mat ${opponent ? 'opponent' : 'you'}" data-player-mat="${playerId}">
      <aside class="player-sidebar">
        ${renderPlayerStatus(state, playerId)}
        <div class="command-slot zone ${player.zones.command.length ? '' : 'empty'}" data-drop-zone="command" data-player-id="${playerId}">
          <div class="command-zone-heading">
            <span>Command Zone</span>
            <span class="commander-tax-badge">${renderCommanderTaxSummary(player)}</span>
          </div>
          <div class="commander-zone-list">${player.zones.command.map((card) => renderCommanderZoneCard(card, state)).join('') || `<span class="muted small command-zone-empty-text">Drop commander here</span>`}</div>
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
          <div class="card-row">${hideHand ? renderHiddenHand(state, playerId, player.zones.hand.length) : player.zones.hand.map((card) => renderCard(card, state)).join('')}</div>
        </div>` : ''}
        <div class="zone battlefield-zone" data-drop-zone="battlefield" data-player-id="${playerId}">
          <span class="zone-label">${opponent ? `${escapeHtml(player.name)}'s battlefield` : 'Your battlefield'}</span>
          <div class="battlefield-tools">${tokenToggle}</div>
          <div class="battlefield-lanes ${opponent ? 'mirrored-battlefield-lanes' : ''}">
            ${opponent ? `
            <div class="battlefield-lane resource-lane" data-drop-zone="battlefield" data-player-id="${playerId}">${resourceCorners}</div>
            <div class="battlefield-lane permanent-lane" data-drop-zone="battlefield" data-player-id="${playerId}">
              <span class="battlefield-lane-label">Creatures & other permanents</span>
              <div class="card-row ${permanentGroups.length < 4 ? 'centered' : ''}">${renderedPermanentGroups}${hiddenUpperTokenCount ? `<span class="hidden-token-placeholder">${hiddenUpperTokenCount} token${hiddenUpperTokenCount === 1 ? '' : 's'} hidden</span>` : ''}</div>
            </div>` : `
            <div class="battlefield-lane permanent-lane" data-drop-zone="battlefield" data-player-id="${playerId}">
              <span class="battlefield-lane-label">Creatures & other permanents</span>
              <div class="card-row ${permanentGroups.length < 4 ? 'centered' : ''}">${renderedPermanentGroups}${hiddenUpperTokenCount ? `<span class="hidden-token-placeholder">${hiddenUpperTokenCount} token${hiddenUpperTokenCount === 1 ? '' : 's'} hidden</span>` : ''}</div>
            </div>
            <div class="battlefield-lane resource-lane" data-drop-zone="battlefield" data-player-id="${playerId}">${resourceCorners}</div>`}
          </div>
        </div>
        ${!opponent ? `
        <div class="zone hand-zone ${!maximum.unlimited && player.zones.hand.length > maximum.value ? 'hand-over-limit' : ''}" data-drop-zone="hand" data-player-id="${playerId}">
          <span class="zone-label">Your hand · ${handLabel}</span>
          <div class="card-row">${player.zones.hand.map((card) => renderCard(card, state)).join('')}</div>
        </div>` : ''}
      </div>
    </section>`;
}

function getPlayerCommanderCards(player) {
  const seen = new Set();
  const commanders = [];
  for (const zoneCards of Object.values(player.zones || {})) {
    if (!Array.isArray(zoneCards)) continue;
    for (const card of zoneCards) {
      if (!card?.commander || seen.has(card.instanceId)) continue;
      seen.add(card.instanceId);
      commanders.push(card);
    }
  }
  return commanders;
}

function renderCommanderTaxSummary(player) {
  const commanders = getPlayerCommanderCards(player);
  if (!commanders.length) return 'Tax +0';
  const taxes = commanders.map((card) => 2 * Number(player.commanderCastCount?.[card.instanceId] || 0));
  if (taxes.length === 1) return `Tax +${taxes[0]}`;
  return `Tax ${taxes.map((tax) => `+${tax}`).join(' / ')}`;
}

function renderCommanderZoneCard(card, state) {
  return `<div class="commander-zone-card compact">
    ${renderCard(card, state, { compact: true })}
  </div>`;
}

function renderPlayerStatus(state, playerId) {
  const player = state.players[playerId];
  const active = state.activePlayerId === playerId;
  const landAllowance = landPlayAllowance(state, playerId);
  const landUsed = Number(player.landPlaysThisTurn || 0);
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
      <div class="turn-rule-status ${landUsed >= landAllowance ? 'used' : ''}"><span>Land plays this turn</span><strong>${landUsed}/${landAllowance}</strong></div>
      ${manaPanel}
    </div>`;
}

function renderTracker(playerId, field, label, value, deltas) {
  return `<div class="tracker"><div class="tracker-label">${label}</div><div class="tracker-value">${value}</div><div class="tracker-controls">${deltas.map((delta) => `<button data-action="adjust-player" data-player-id="${playerId}" data-field="${field}" data-delta="${delta}">${delta > 0 ? '+' : ''}${delta}</button>`).join('')}</div></div>`;
}

function renderZonePile(playerId, zone, count) {
  return `<button class="zone-pile" data-action="open-zone" data-player-id="${playerId}" data-zone="${zone}" data-drop-zone="${zone}"><strong>${ZONE_LABELS[zone]}</strong><span>${count} card${count === 1 ? '' : 's'}</span></button>`;
}

function renderHiddenHand(state, playerId, count) {
  const revealed = knownHandRevealCards(state, playerId);
  const hiddenCount = Math.max(0, count - revealed.length);
  const revealedHtml = revealed.map((card) => renderPublicRevealCard(card, 'Known in hand', playerId)).join('');
  const backs = Array.from({ length: Math.min(hiddenCount, 12) }, (_, index) => `<div class="game-card hidden-hand-card" aria-label="Hidden card ${index + 1}"><img src="./card-back.svg" alt="Card back" /></div>`).join('');
  return `${revealedHtml}${backs}`;
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
  for (const [counterType, rawCount] of Object.entries(card.counters || {})) {
    const count = Number(rawCount || 0);
    if (!count) continue;
    const type = String(counterType || '').trim();
    const pt = type.match(/^([+-]?\d+)\/([+-]?\d+)$/);
    let label = '';
    if (pt) {
      const showPart = (value) => { const number = Number(value || 0); return number > 0 ? `+${number}` : String(number); };
      label = `${showPart(pt[1])}/${showPart(pt[2])}${count === 1 ? '' : ` ×${count}`}`;
    } else {
      const icon = type.toLocaleLowerCase() === 'charge' ? '⚡ ' : type.toLocaleLowerCase() === 'page' ? '📖 ' : '';
      const prettyType = type.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
      label = `${icon}${prettyType} ${count}`;
    }
    badges.push(`<span class="card-badge purple counter-state" title="${escapeHtml(type)} counter${count === 1 ? '' : 's'}: ${count}">${escapeHtml(label)}</span>`);
  }
  for (const keyword of (card.manualKeywords || []).slice(0, 4)) {
    badges.push(`<span class="card-badge blue manual-keyword-badge" title="Granted ability: ${escapeHtml(keyword)}">✦ ${escapeHtml(keyword)}</span>`);
  }
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

function referencedCounterTypes(card) {
  const types = new Set(Object.keys(card?.counters || {}).map((type) => String(type).toLowerCase()));
  const text = String(card?.oracleText || '');
  for (const match of text.matchAll(/\b(?:a|an|one|two|three|four|five|\d+)\s+([a-z][a-z0-9+\/-]*(?:\s+[a-z0-9+\/-]+)?)\s+counters?\b/gi)) {
    const type = String(match[1] || '').trim().toLowerCase();
    if (type && !['additional', 'that many', 'each kind'].includes(type)) types.add(type);
  }
  return [...types].filter(Boolean);
}


function renderManualKeywordEditor(card) {
  const applied = card.manualKeywords || [];
  const options = MANUAL_KEYWORD_OPTIONS.map((keyword) => `<option value="${escapeHtml(keyword)}">${escapeHtml(keyword)}</option>`).join('');
  const chips = applied.length
    ? `<div class="manual-keyword-list">${applied.map((keyword) => `<span class="manual-keyword-chip"><span>${escapeHtml(keyword)}</span><button class="icon-btn tiny" data-action="remove-keyword" data-card-id="${card.instanceId}" data-keyword="${escapeHtml(keyword)}" title="Remove ${escapeHtml(keyword)}">×</button></span>`).join('')}</div>`
    : '<div class="small muted">No extra keyword abilities added.</div>';
  return `<div class="keyword-ability-editor"><div class="field"><label>Keyword ability</label><select id="manual-keyword-select">${options}</select></div><div class="field"><label>Custom ability wording</label><input id="manual-keyword-custom" placeholder="Example: Ward {3} or Protection from artifacts" /></div><button class="btn" data-action="add-keyword" data-card-id="${card.instanceId}">Add keyword ability</button>${chips}<p class="small muted">These are treated as real granted abilities by combat, targeting, timing, mana, and coach rules until removed.</p></div>`;
}

function renderKnownRevealInspector(reveal) {
  const card = reveal.card;
  const playerName = getState().players?.[reveal.playerId]?.name || reveal.playerId;
  const ownReveal = !isOnlineMultiplayer() || reveal.playerId === multiplayer.localPlayerId;
  const zoneLabel = reveal.zone === 'hand'
    ? (ownReveal ? 'Publicly known in your hand' : 'Known in opponent hand')
    : (ownReveal ? 'Publicly revealed from your library' : 'Revealed from opponent library');
  return `
    <div class="inspector-section" style="display:flex;justify-content:space-between;align-items:center"><h3>Revealed card</h3><button class="icon-btn" data-action="close-inspector">×</button></div>
    <div class="inspector-section">
      <img class="inspector-card-image" src="${escapeHtml(publicRevealImage(card, 'normal'))}" alt="${escapeHtml(card.name)}" onerror="this.src='./card-back.svg'" />
      <h2>${escapeHtml(card.name)}</h2>
      <div class="muted small">${escapeHtml(card.manaCost || '')} · ${escapeHtml(card.typeLine || '')}</div>
      ${card.power ? `<div class="small">${escapeHtml(card.power)}/${escapeHtml(card.toughness)}</div>` : ''}
      <div class="validation ok" style="margin-top:10px"><strong>${escapeHtml(zoneLabel)}</strong><br />Revealed by ${escapeHtml(playerName)}. This view is read-only.</div>
    </div>
    <div class="inspector-section"><h3>Oracle text</h3><div class="oracle">${escapeHtml(card.oracleText || 'No Oracle text.')}</div></div>`;
}

function renderInspector(state) {
  if (ui.inspectorMode === 'coach') return renderCoachInspector(state);
  if (ui.knownRevealSelected) {
    const known = findKnownRevealCard(ui.knownRevealSelected.playerId, ui.knownRevealSelected.cardId);
    if (known?.card) return renderKnownRevealInspector(known);
    ui.knownRevealSelected = null;
  }
  const selected = state.selected?.instanceId ? findCard(state.selected.instanceId, state) : null;
  if (!selected) return `<div class="inspector-empty"><div><div style="font-size:2rem">🃏</div><h3>Select a card</h3><p>Tap a card for actions. Drag it directly between visible zones.</p><button class="btn primary" data-action="coach">Open strategy coach</button></div></div>`;
  const card = selected.card;
  const effects = recognizedEffects(card);
  const activatedAbilities = selected.zone === 'battlefield' ? battlefieldActivatedAbilities(card.instanceId) : [];
  const counterButtons = ['+1/+1', '-1/-1', 'charge', 'page', 'loyalty', 'stun'];
  const referencedCounters = referencedCounterTypes(card);
  const libraryActions = privateLibraryActions(card);
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
      ${isPermanent(card) && selected.zone !== 'battlefield' ? `<button class="btn" data-action="move-card-tapped" data-card-id="${card.instanceId}">Battlefield tapped</button>` : ''}
      ${selected.zone === 'hand' && isLand(card) ? `<button class="btn ghost wide" data-action="put-land-effect" data-card-id="${card.instanceId}">Put by card effect</button><button class="btn ghost wide" data-action="put-land-effect-tapped" data-card-id="${card.instanceId}">Put tapped by card effect</button>` : ''}
      ${card.token ? `${selected.zone === 'battlefield' ? `<button class="btn danger" data-action="token-dies" data-card-id="${card.instanceId}">Token dies</button>` : ''}<button class="btn danger" data-action="remove-token" data-card-id="${card.instanceId}">Remove token</button>` : `${zoneMoveButton(card, 'hand', 'Hand')}${zoneMoveButton(card, 'graveyard', 'Graveyard')}${zoneMoveButton(card, 'exile', 'Exile')}${card.commander ? zoneMoveButton(card, 'command', 'Command zone') : ''}${zoneMoveButton(card, 'stack', 'Stack')}<button class="btn" data-action="move-library" data-card-id="${card.instanceId}" data-position="top">Library top</button><button class="btn" data-action="move-library" data-card-id="${card.instanceId}" data-position="bottom">Library bottom</button>`}
      <button class="btn" data-action="flip-card" data-card-id="${card.instanceId}">${card.tokenFaces?.length > 1 ? 'Transform token' : (card.faceDown ? 'Turn face up' : 'Turn face down')}</button>
      <button class="btn" data-action="reveal-public" data-card-id="${card.instanceId}">Reveal publicly</button>
      ${libraryActions.map((effect, index) => `<button class="btn" data-action="card-library-effect" data-card-id="${card.instanceId}" data-effect-index="${index}">${effect.mode.startsWith('reveal') ? '👁 ' : '🔍 '}${escapeHtml(effect.label)}${effect.mode.startsWith('reveal') ? ' from card text' : ' privately'}</button>`).join('')}
      <button class="btn" data-action="copy-token" data-card-id="${card.instanceId}">Create copy</button>
      ${selected.zone === 'battlefield' ? `<button class="btn" data-action="queue-manual-effect" data-card-id="${card.instanceId}">Queue manual effect</button>` : ''}
    </div></div>
    ${activatedAbilities.length ? `<div class="inspector-section"><h3>Battlefield abilities</h3><div class="ability-list">${activatedAbilities.map((ability, index) => `<button class="ability-button" data-action="activate-ability" data-card-id="${card.instanceId}" data-ability-index="${index}"><strong>Activate</strong><span>${escapeHtml(ability)}</span></button>`).join('')}</div><p class="small muted">Non-mana abilities are queued for manual resolution. Tap costs are applied automatically.</p></div>` : ''}
    ${referencedCounters.length ? `<div class="inspector-section referenced-counter-panel"><h3>Card counters</h3>${referencedCounters.map((counter) => { const count = Number(card.counters?.[counter] || 0); return `<div class="named-counter-control"><strong>${escapeHtml(counter)} counters</strong><div class="named-counter-stepper"><button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="-1">−</button><span>${count}</span><button class="btn small-btn primary" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="1">+</button></div></div>`; }).join('')}</div>` : ''}
    <div class="inspector-section"><h3>All counters</h3><div class="counter-row">${counterButtons.map((counter) => `<button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${counter}" data-delta="1">+ ${counter}</button>`).join('')}</div><div class="custom-pt-counter"><label>Power<input id="custom-counter-power" type="number" value="1" step="1" /></label><label>Toughness<input id="custom-counter-toughness" type="number" value="0" step="1" /></label><button class="btn" data-action="custom-pt-counter" data-card-id="${card.instanceId}">Add custom P/T counter</button></div>${Object.entries(card.counters || {}).map(([counter, count]) => `<div class="counter-row" style="margin-top:6px"><span>${escapeHtml(counter)}: ${count}</span><button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="-1">−</button><button class="btn small-btn" data-action="counter" data-card-id="${card.instanceId}" data-counter="${escapeHtml(counter)}" data-delta="1">+</button></div>`).join('')}</div>
    <div class="inspector-section"><h3>Keyword abilities</h3>${renderManualKeywordEditor(card)}</div>
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
  const choices = manaProductionChoices(card, { player: state.players[card.controller] });
  if (state.settings.manaMode === 'manual' || !choices.length) {
    return `<button class="btn" data-action="toggle-tap" data-card-id="${card.instanceId}">↻ Tap</button>`;
  }
  const manaButtons = choices.map((choice, index) => `<button class="btn mana-choice" data-action="tap-mana" data-card-id="${card.instanceId}" data-choice-index="${index}">↻ Tap → ${escapeHtml(choice.label)}</button>`).join('');
  return `<div class="mana-choice-group"><div class="small muted wide">Choose what this source produces</div>${manaButtons}<button class="btn ghost" data-action="toggle-tap-only" data-card-id="${card.instanceId}">Tap without adding mana</button></div>`;
}

function zoneMoveButton(card, zone, label) {
  return `<button class="btn" data-action="move-card" data-card-id="${card.instanceId}" data-zone="${zone}">${label}</button>`;
}

function simpleCoachReason(result) {
  const details = result.explanationDetails || {};
  const reasons = details.visibleReasons || [];
  if (['play-land', 'advance-land'].includes(result.type)) return 'It gives you more mana and does not spend a card already on the battlefield.';
  if (result.type === 'attack') return reasons.find((reason) => /blocker|evasion|damage|attack/i.test(reason)) || 'This attack gets useful damage through without risking more creatures than necessary.';
  if (result.type === 'hold') return reasons[0] || 'Keeping mana and cards available lets you react to what the opponent does.';
  if (result.type === 'sequence') return reasons[0] || 'Doing these actions in this order uses your mana more efficiently and leaves a stronger board.';
  if (result.type === 'activate-ability') return reasons[0] || 'This ability gives the best immediate value from the cards already on your battlefield.';
  if (/cast/i.test(result.type || '')) return reasons.find((reason) => /contributes|supports|answer|draw|removal|mana/i.test(reason)) || reasons[0] || 'This spell improves your board more than the other available plays.';
  return details.headline || result.explanation || 'This is the strongest simple line found from the visible board.';
}

function simpleCoachRisk(result) {
  const details = result.explanationDetails || {};
  const level = details.riskLevel || 'Low';
  if (level === 'Low') return 'Low risk from the public information currently available.';
  if (level === 'Low–moderate') return 'Some risk: the opponent may have an answer, but the play is still reasonable.';
  if (level === 'Moderate') return 'Be careful: the opponent has enough open resources that interaction is plausible.';
  return 'High risk: the opponent is likely able to disrupt this play based on visible mana and public history.';
}

function renderCoachInspector(state) {
  const active = state.players[state.activePlayerId];
  const defense = defenseAdvice(state);
  const defenseHtml = defense ? `<div class="inspector-section"><h3>Simple defense plan for ${escapeHtml(defense.defenderName)}</h3>${defense.assignments.map((item) => `<div class="coach-result"><strong>Do this: ${escapeHtml(item.blocker)} blocks ${escapeHtml(item.attacker)}</strong><p class="small"><strong>Why:</strong> ${escapeHtml(item.reason)}</p></div>`).join('') || '<div class="validation">No useful legal blocks were found.</div>'}<p class="small">Damage still expected: ${defense.expectedDamage}</p></div>` : '';
  const resultsHtml = ui.coach
    ? ui.coach.results.slice(0, 6).map((result, index) => {
      const details = result.explanationDetails || {};
      const visible = (details.visibleReasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
      const memory = (details.publicMemoryReasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
      const safer = index === 0 && result.saferAlternative
        ? `<div class="coach-safe"><strong>Safer option:</strong> ${escapeHtml(result.saferAlternative.label)}</div>`
        : '';
      return `<article class="coach-result ${index === 0 ? 'best' : ''}">
        <div class="coach-simple-step"><span class="coach-step-number">${index + 1}</span><div><strong>Do this:</strong> ${escapeHtml(result.label)}</div></div>
        <p class="coach-simple-why"><strong>Why:</strong> ${escapeHtml(simpleCoachReason(result))}</p>
        <p class="coach-simple-risk"><strong>Watch out:</strong> ${escapeHtml(simpleCoachRisk(result))}</p>
        ${safer}
        <details class="coach-detail-toggle"><summary>See the detailed reasoning</summary>${visible ? `<div class="coach-detail"><strong>Board reasons:</strong><ul>${visible}</ul></div>` : ''}${memory ? `<div class="coach-detail"><strong>Known public information:</strong><ul>${memory}</ul></div>` : ''}<div class="small muted">Score ${result.score >= 0 ? '+' : ''}${result.score} · Confidence ${result.confidence || 0}% · sampled range ${result.range[0]} to ${result.range[1]}</div></details>
      </article>`;
    }).join('')
    : '<div class="validation">Press Analyze and the coach will tell you what to do first and explain why in plain language.</div>';
  const audit = ui.coach?.informationSetAudit;
  const auditHtml = audit ? `<details class="coach-audit"><summary>What information the coach used</summary><div class="small"><div>✓ Your hand and every public zone</div><div>✓ Visible cards, counters, granted keywords, attachments, and usable mana</div><div>✓ Cards the opponent publicly revealed</div><div>✗ It cannot see the opponent's hidden hand or library</div></div></details>` : '';
  const analysisMeta = ui.coach
    ? `${ui.coach.results.length} useful choices checked in ${(Number(ui.coach.elapsedMs || 0) / 1000).toFixed(1)} seconds${ui.coach.truncated ? ' using the faster crowded-board limit' : ''}.`
    : 'Checks legal plays, attacks, mana, rules, and short action sequences.';
  return `<div class="inspector-section" style="display:flex;justify-content:space-between;align-items:center"><h3>Strategy coach</h3><button class="icon-btn" data-action="close-inspector">×</button></div><div class="coach-panel"><p class="small muted">The coach gives a simple action first, then explains why. Detailed calculations stay hidden unless you open them.</p><button class="btn primary wide" data-action="run-coach" ${ui.coachRunning ? 'disabled' : ''}>${ui.coachRunning ? 'Analyzing…' : `Analyze ${escapeHtml(active.name)}'s position`}</button><p class="small">${analysisMeta}</p>${resultsHtml}${auditHtml}</div>${defenseHtml}`;
}

function renderDrawer(state) {
  if (!ui.drawer) return '<section class="zone-drawer" aria-hidden="true"></section>';
  const { playerId, zone } = ui.drawer;
  const player = state.players[playerId];
  let cards = player.zones[zone] || [];
  if (ui.drawerSearch.trim()) cards = cards.filter((card) => card.name.toLocaleLowerCase().includes(ui.drawerSearch.trim().toLocaleLowerCase()));
  else if (zone === 'library' && ui.libraryReveal?.playerId === playerId) cards = cards.slice(0, 1);
  const remoteHiddenLibrary = isOnlineMultiplayer() && multiplayer.localPlayerId && playerId !== multiplayer.localPlayerId && zone === 'library';
  const hideLibrary = remoteHiddenLibrary || (zone === 'library' && !ui.drawerSearch.trim() && ui.libraryReveal?.playerId !== playerId);
  const libraryTools = remoteHiddenLibrary
    ? '<span class="small muted">Opponent library is hidden</span>'
    : `<input type="search" id="drawer-search" value="${escapeHtml(ui.drawerSearch)}" placeholder="Search library by name" /><button class="btn small-btn" data-action="shuffle-library" data-player-id="${playerId}">Shuffle</button><button class="btn small-btn" data-action="open-scry" data-player-id="${playerId}">Scry…</button><button class="btn small-btn" data-action="open-private-look" data-player-id="${playerId}">Private look…</button><button class="btn small-btn" data-action="reveal-top" data-player-id="${playerId}">Reveal publicly</button><button class="btn small-btn" data-action="draw" data-player-id="${playerId}" data-amount="1">Draw</button><button class="btn small-btn" data-action="mill" data-player-id="${playerId}" data-amount="1">Mill</button>`;
  return `<section class="zone-drawer open" aria-label="${ZONE_LABELS[zone]}"><div class="drawer-header"><div><div class="drawer-title">${escapeHtml(player.name)} · ${ZONE_LABELS[zone]}</div><div class="small muted">${player.zones[zone].length} card${player.zones[zone].length === 1 ? '' : 's'}</div></div><div class="drawer-tools">${zone === 'library' ? libraryTools : `<input type="search" id="drawer-search" value="${escapeHtml(ui.drawerSearch)}" placeholder="Filter cards" />`}<button class="icon-btn" data-action="close-drawer">×</button></div></div><div class="drawer-carousel" data-drop-zone="${zone}" data-player-id="${playerId}">${hideLibrary ? (remoteHiddenLibrary ? renderRemoteLibraryBacks(state, playerId, player.zones.library.length) : renderLibraryBacks(state, playerId, player.zones.library.length)) : cards.map((card) => renderCard(card, state)).join('') || '<span class="muted">No matching cards.</span>'}</div></section>`;
}

function renderLibraryBacks(state, playerId, count) {
  const revealed = knownLibraryRevealRecords(state, playerId);
  const hiddenCount = Math.max(0, count - revealed.length);
  const visible = Math.min(7, hiddenCount);
  const revealedHtml = revealed.map((entry) => renderPublicRevealCard(
    entry.card,
    entry.position === 'top' ? 'Revealed top' : 'Publicly revealed',
    playerId,
  )).join('');
  return `${revealedHtml}${Array.from({ length: visible }, () => `<div class="game-card card-back-stack"><img src="./card-back.svg" alt="Hidden library card" /></div>`).join('')}<div class="validation"><strong>${revealed.length ? `${revealed.length} revealed card${revealed.length === 1 ? '' : 's'} visible to both players.` : 'Library is hidden.'}</strong><br />Use Private look for card effects. Publicly revealed cards remain inspectable until they become unknown.</div>`;
}

function renderRemoteLibraryBacks(state, playerId, count) {
  const revealed = knownLibraryRevealRecords(state, playerId);
  const hiddenCount = Math.max(0, count - revealed.length);
  const visible = Math.min(7, hiddenCount);
  const revealedHtml = revealed.map((entry) => renderPublicRevealCard(
    entry.card,
    entry.position === 'top' ? 'Revealed top' : 'Revealed from library',
    playerId,
  )).join('');
  return `${revealedHtml}${Array.from({ length: visible }, () => `<div class="game-card card-back-stack"><img src="./card-back.svg" alt="Hidden library card" /></div>`).join('')}<div class="validation"><strong>${revealed.length ? `${revealed.length} revealed card${revealed.length === 1 ? '' : 's'} visible.` : 'Library is hidden.'}</strong><br />Click a revealed card to inspect it on the right. All other identities and library order remain private.</div>`;
}

function renderBottomBar() {
  return `<nav class="bottom-bar"><button data-action="next-phase"><strong>›</strong>Phase</button><button data-action="coach"><strong>✦</strong>Coach</button><button data-action="open-token"><strong>＋</strong>Token</button><button data-action="undo"><strong>↶</strong>Undo</button><button data-action="open-settings"><strong>⚙</strong>Tools</button></nav>`;
}

function renderModals(state) {
  return `${ui.setupOpen ? renderSetupModal(state) : ''}${ui.settingsOpen ? renderSettingsModal(state) : ''}${ui.predefinedTokensOpen ? renderPredefinedTokenModal(state) : ''}${ui.tokenOpen && !ui.tokenPeek ? renderTokenModal(state) : ''}${ui.tokenOpen && ui.tokenPeek ? renderTokenPeekReturn() : ''}${state.openingHands?.active ? renderMulliganModal(state) : ''}${ui.damageOpen ? renderDamageModal(state) : ''}${ui.logOpen ? renderLogModal(state) : ''}${ui.publicRevealNotice ? renderPublicRevealModal(state) : ''}${ui.scry ? renderPrivateLibraryModal(state) : ''}`;
}

function renderPrivateLibraryModal(state) {
  const tool = ui.scry;
  if (!tool) return '';
  const player = state.players[tool.playerId];
  const cardById = new Map(player.zones.library.map((card) => [card.instanceId, card]));
  const destinationLabels = { top: 'Top', bottom: 'Bottom', hand: 'Hand', graveyard: 'Graveyard', exile: 'Exile' };
  const handCount = tool.items.filter((item) => item.destination === 'hand').length;
  const validHand = handCount >= tool.handRequired && (!tool.handLimit || handCount <= tool.handLimit);
  const cards = tool.items.map((item) => {
    const card = cardById.get(item.cardId);
    if (!card) return '';
    const sameDestination = tool.items.filter((entry) => entry.destination === item.destination);
    const place = sameDestination.findIndex((entry) => entry.cardId === item.cardId);
    return `<article class="scry-card"><img src="${escapeHtml(cardImage(card))}" alt="${escapeHtml(card.name)}" onerror="this.src='./card-back.svg'" /><h3>${escapeHtml(card.name)}</h3><div class="scry-destinations">${tool.allowedDestinations.map((destination) => `<button class="${item.destination === destination ? 'active' : ''}" data-action="scry-destination" data-card-id="${card.instanceId}" data-destination="${destination}">${destinationLabels[destination]}</button>`).join('')}</div>${tool.allowReveal ? `<button class="btn wide scry-reveal-choice ${item.reveal ? 'active' : ''}" data-action="scry-reveal" data-card-id="${card.instanceId}">${item.reveal ? '✓ Publicly reveal' : '👁 Publicly reveal'}</button>` : ''}<div class="scry-order"><button class="btn small-btn" data-action="scry-order" data-card-id="${card.instanceId}" data-direction="up" ${place <= 0 ? 'disabled' : ''}>← Earlier</button><span>${escapeHtml(destinationLabels[item.destination])} #${place + 1}</span><button class="btn small-btn" data-action="scry-order" data-card-id="${card.instanceId}" data-direction="down" ${place >= sameDestination.length - 1 ? 'disabled' : ''}>Later →</button></div></article>`;
  }).join('');
  const instruction = tool.mode === 'scry'
    ? 'Choose any number for the bottom. Cards left on top can be reordered. Scry does not put a card into your hand.'
    : tool.mode === 'reveal-until'
      ? `Reveal cards one at a time until you reach ${tool.conditionText || 'the named condition'}, then choose the destinations required by the card.`
      : tool.mode === 'reveal'
        ? 'The card text marked these cards for a public reveal. Choose the destinations required by the effect.'
        : 'Choose where each privately viewed card goes. Only use Hand when the effect actually allows it.';
  return `<div class="modal-backdrop scry-backdrop"><section class="modal scry-modal"><header class="modal-header"><div><h2>${escapeHtml(tool.label)}</h2><p class="small muted">Private view for ${escapeHtml(player.name)} · only this browser receives these card identities.</p></div><button class="icon-btn" data-action="close-scry">×</button></header><div class="modal-body"><div class="validation scry-privacy"><strong>These cards stay private unless you mark one as Publicly reveal.</strong><br />Publicly revealed cards remain visible and inspectable for both players until they become hidden again.</div><p class="small">${escapeHtml(instruction)}</p>${tool.handLimit ? `<div class="validation ${validHand ? 'ok' : 'error'}">Hand selection: ${handCount}/${tool.handLimit}${tool.handRequired ? ` · choose at least ${tool.handRequired}` : ' · optional'}</div>` : ''}${tool.drawAfter ? `<div class="validation ok">After these choices, draw ${tool.drawAfter} card${tool.drawAfter === 1 ? '' : 's'} automatically.</div>` : ''}<div class="scry-card-grid">${cards}</div>${tool.dynamicReveal ? `<button class="btn wide" data-action="scry-reveal-next">Reveal next card</button>` : ''}<div class="scry-order-help"><strong>Ordering:</strong> Top #1 becomes the next card of the library. The last Bottom card becomes the absolute bottom card.</div><div class="scry-footer"><button class="btn" data-action="close-scry">Cancel</button><button class="btn primary" data-action="confirm-scry" ${validHand ? '' : 'disabled'}>Confirm private choices</button></div></div></section></div>`;
}

function renderPublicRevealModal(state) {
  const reveal = ui.publicRevealNotice;
  if (!reveal?.card) return '';
  const playerName = state.players?.[reveal.playerId]?.name || reveal.playerId;
  const locationLabel = reveal.zone === 'library' ? (reveal.position === 'top' ? 'the top of their library' : 'their library') : 'their hand';
  return `<div class="modal-backdrop public-reveal-backdrop"><section class="modal small-modal public-reveal-modal"><header class="modal-header"><div><h2>Public card reveal</h2><p class="small muted">${escapeHtml(playerName)} revealed this card from ${escapeHtml(locationLabel)}.</p></div><button class="icon-btn" data-action="close-public-reveal">×</button></header><div class="modal-body"><img class="public-reveal-large-image" src="${escapeHtml(publicRevealImage(reveal.card, 'normal'))}" alt="${escapeHtml(reveal.card.name)}" onerror="this.src='./card-back.svg'" /><h3>${escapeHtml(reveal.card.name)}</h3><p class="small muted">${escapeHtml(reveal.card.manaCost || '')} · ${escapeHtml(reveal.card.typeLine || '')}</p><p class="public-reveal-oracle">${escapeHtml(reveal.card.oracleText || '')}</p><button class="btn primary wide" data-action="close-public-reveal">Done</button></div></section></div>`;
}

function renderSetupModal(state) {
  const solo = !isOnlineMultiplayer();
  const content = solo
    ? `<div class="setup-grid">${renderDeckPanel('p1')}${renderDeckPanel('p2')}</div><div class="setup-footer"><div><button class="btn" data-action="demo-game">Load interactive demo</button> <button class="btn" data-action="import-save">Import saved game</button></div><button class="btn primary" data-action="start-game" ${bothDraftsReady() ? '' : 'disabled'}>Shuffle, draw 7, and start</button></div>`
    : renderOnlineSetup(state);
  const modeTitle = solo ? 'Solo Practice Setup' : 'Online Multiplayer Setup';
  const modeSubtitle = solo
    ? 'Choose both local decks, then shuffle and begin.'
    : 'Host a room or join another player with an invite code.';
  const headerAction = state.started
    ? '<button class="icon-btn" data-action="close-setup">×</button>'
    : '<button class="btn ghost small-btn" data-action="back-title">‹ Main menu</button>';
  return `<div class="modal-backdrop"><section class="modal setup-modal"><header class="modal-header"><div><h2>${modeTitle}</h2><div class="small muted">${modeSubtitle}</div></div>${headerAction}</header><div class="modal-body">${content}<input id="save-file-input" class="hidden" type="file" accept="application/json" /></div></section></div>`;
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
  return `<div class="modal-backdrop"><section class="modal small-modal"><header class="modal-header"><h2>Table tools</h2><button class="icon-btn" data-action="close-settings">×</button></header><div class="modal-body"><div class="field"><label>Rules enforcement</label><select id="rules-mode"><option value="free" ${state.settings.rulesMode === 'free' ? 'selected' : ''}>Free table: never block moves</option><option value="learning" ${state.settings.rulesMode === 'learning' ? 'selected' : ''}>Learning: explain and allow override</option><option value="strict" ${state.settings.rulesMode === 'strict' ? 'selected' : ''}>Strict basics: block known illegal moves</option></select></div><div class="field"><label>Mana handling</label><select id="mana-mode"><option value="manual" ${state.settings.manaMode === 'manual' ? 'selected' : ''}>Manual: tap and edit counters yourself</option><option value="assisted" ${state.settings.manaMode === 'assisted' ? 'selected' : ''}>Assisted: tapping a source adds its mana</option><option value="auto" ${state.settings.manaMode === 'auto' || !state.settings.manaMode ? 'selected' : ''}>Auto-pay: casting taps suggested sources</option></select><div class="small muted" style="margin-top:5px">Dual and hybrid-looking sources appear as choices such as U / B. The floating pool still stores the actual color chosen.</div></div><label><input type="checkbox" id="auto-draw" ${state.settings.autoDraw ? 'checked' : ''}/> Auto draw during draw step <span class="small muted">(Player 1 skips turn 1 in 1v1)</span></label><br /><label><input type="checkbox" id="enforce-land-plays" ${state.settings.enforceLandPlays !== false ? 'checked' : ''}/> Enforce normal land-play limit</label><div class="small muted settings-help">Normally one land may be played during your turn. Battlefield effects that say you may play additional lands increase the limit automatically. Use the card’s “Put by card effect” action when an effect puts a land onto the battlefield instead of playing it.</div><label><input type="checkbox" id="show-names" ${state.settings.showCardNames ? 'checked' : ''}/> Show card-name strips</label><div class="field" style="margin-top:10px"><label>Information-set samples per move</label><input id="coach-rollouts" type="number" min="40" max="240" step="20" value="${state.settings.coachRollouts}" /></div><div class="action-grid"><button class="btn" data-action="switch-player">Switch active player</button><button class="btn" data-action="open-token">Create custom token</button><button class="btn predefined-token-btn" data-action="open-predefined-tokens">Predefined tokens</button><button class="btn" data-action="random-tool" data-kind="d6">Roll D6</button><button class="btn" data-action="random-tool" data-kind="d20">Roll D20</button><button class="btn" data-action="random-tool" data-kind="coin">Flip coin</button><button class="btn" data-action="export-save">Export save</button><button class="btn" data-action="import-save">Import save</button><button class="btn danger" data-action="concede" data-player-id="p1">P1 concede</button><button class="btn danger" data-action="concede" data-player-id="p2">P2 concede</button><button class="btn danger wide" data-action="reset-game">Reset entire table</button></div><input id="settings-file-input" class="hidden" type="file" accept="application/json" /></div></section></div>`;
}


function predefinedTokenMatches(card, query, filter) {
  const type = String(card.typeLine || '').toLocaleLowerCase();
  if (filter === 'creature' && !type.includes('creature')) return false;
  if (filter === 'artifact' && !type.includes('artifact')) return false;
  if (filter === 'other' && (type.includes('creature') || type.includes('artifact'))) return false;
  const words = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = `${card.name} ${card.typeLine} ${card.oracleText} ${card.power}/${card.toughness}`.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

function renderPredefinedTokenModal(state) {
  const localPlayerId = isOnlineMultiplayer() ? multiplayer.localPlayerId : ui.predefinedTokenPlayerId;
  if (isOnlineMultiplayer() && localPlayerId) ui.predefinedTokenPlayerId = localPlayerId;
  const filtered = ui.predefinedTokens.filter((card) => predefinedTokenMatches(card, ui.predefinedTokenSearch, ui.predefinedTokenFilter));
  const visible = filtered.slice(0, ui.predefinedTokenLimit);
  const playerOptions = isOnlineMultiplayer()
    ? `<option value="${escapeHtml(localPlayerId)}">${escapeHtml(state.players[localPlayerId]?.name || localPlayerId)}</option>`
    : ['p1', 'p2'].map((id) => `<option value="${id}" ${ui.predefinedTokenPlayerId === id ? 'selected' : ''}>${escapeHtml(state.players[id]?.name || id)}</option>`).join('');
  const status = ui.predefinedTokensLoading
    ? `<div class="validation predefined-token-status"><span class="mini-spinner"></span>${escapeHtml(ui.predefinedTokenProgress || 'Loading token definitions…')}</div>`
    : ui.predefinedTokensError
      ? `<div class="validation error predefined-token-status">${escapeHtml(ui.predefinedTokensError)} <button class="btn small-btn" data-action="refresh-predefined-tokens">Retry</button></div>`
      : `<div class="small muted predefined-token-count">${filtered.length} matching token definition${filtered.length === 1 ? '' : 's'} · supplied by Scryfall</div>`;
  const cards = visible.map((card) => {
    const creature = /(?:^|\s)Creature(?:\s|$)/i.test(card.typeLine || '');
    const stats = creature ? `<span class="predefined-token-stats">${escapeHtml(card.power || '0')}/${escapeHtml(card.toughness || '0')}</span>` : '';
    const faces = card.tokenFaces?.length > 1 ? '<span class="predefined-token-dfc">Double-faced</span>' : '';
    return `<article class="predefined-token-item"><img src="${escapeHtml(card.imageSmall || card.image || './card-back.svg')}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.src='./card-back.svg'" /><div class="predefined-token-copy"><div class="predefined-token-title"><strong>${escapeHtml(card.name)}</strong>${stats}${faces}</div><div class="small muted">${escapeHtml(card.typeLine || 'Token')}</div><p>${escapeHtml(card.oracleText || 'No rules text.')}</p></div><button class="btn primary small-btn" data-action="create-predefined-token" data-token-id="${escapeHtml(card.scryfallId || card.oracleId || card.name)}">Create</button></article>`;
  }).join('');
  const more = filtered.length > visible.length
    ? `<button class="btn wide" data-action="more-predefined-tokens">Show more (${filtered.length - visible.length} remaining)</button>`
    : '';
  return `<div class="modal-backdrop token-backdrop"><section class="modal predefined-token-modal"><header class="modal-header"><div><h2>Predefined tokens</h2><p class="small muted">Official token definitions with their printed type, stats, abilities, colors, and images. Create them only when a spell or ability tells you to.</p></div><button class="icon-btn" data-action="close-predefined-tokens">×</button></header><div class="modal-body"><div class="predefined-token-controls"><div class="field"><label>Controller</label><select id="predefined-token-player">${playerOptions}</select></div><div class="field"><label>Quantity</label><input id="predefined-token-quantity" type="number" min="1" max="100" value="${Number(ui.predefinedTokenQuantity || 1)}" /></div><label class="predefined-token-tapped"><input id="predefined-token-tapped" type="checkbox" ${ui.predefinedTokenTapped ? 'checked' : ''}/> Enter tapped</label><div class="field predefined-token-filter"><label>Type</label><select id="predefined-token-filter"><option value="all" ${ui.predefinedTokenFilter === 'all' ? 'selected' : ''}>All tokens</option><option value="creature" ${ui.predefinedTokenFilter === 'creature' ? 'selected' : ''}>Creature tokens</option><option value="artifact" ${ui.predefinedTokenFilter === 'artifact' ? 'selected' : ''}>Artifact tokens</option><option value="other" ${ui.predefinedTokenFilter === 'other' ? 'selected' : ''}>Other tokens</option></select></div></div><div class="predefined-token-search-row"><input id="predefined-token-search" value="${escapeHtml(ui.predefinedTokenSearch)}" placeholder="Search Zombie, Treasure, Food, Incubator…" autocomplete="off"/><button class="btn small-btn" data-action="refresh-predefined-tokens" title="Refresh token catalog">↻</button></div>${status}<div class="predefined-token-list">${cards || (!ui.predefinedTokensLoading ? '<div class="validation">No token definitions match that search.</div>' : '')}</div>${more}<div class="small muted predefined-token-rules-note">Tokens enter the battlefield under the chosen player’s control. Creature tokens have summoning sickness unless another effect gives them haste. Double-faced predefined tokens get a Transform token action.</div></div></section></div>`;
}

async function openPredefinedTokens(force = false) {
  ui.settingsOpen = false;
  ui.predefinedTokensOpen = true;
  ui.predefinedTokenPlayerId = isOnlineMultiplayer() ? multiplayer.localPlayerId : (ui.predefinedTokenPlayerId || getState().activePlayerId);
  render({ force: true });
  if (ui.predefinedTokensLoading || (ui.predefinedTokens.length && !force)) return;
  ui.predefinedTokensLoading = true;
  ui.predefinedTokensError = '';
  ui.predefinedTokenProgress = 'Connecting to the token catalog…';
  render({ force: true });
  try {
    ui.predefinedTokens = await fetchPredefinedTokens(force, (progress) => {
      ui.predefinedTokenProgress = progress.message || 'Loading token definitions…';
      const node = document.querySelector('.predefined-token-status');
      if (node && ui.predefinedTokensLoading) node.lastChild.textContent = ui.predefinedTokenProgress;
    });
  } catch (error) {
    console.error('Predefined token catalog failed', error);
    ui.predefinedTokensError = `${error?.message || 'Could not load the token catalog.'} Check the connection and press Retry.`;
  } finally {
    ui.predefinedTokensLoading = false;
    render({ force: true });
  }
}

function createSelectedPredefinedToken(tokenId) {
  const token = ui.predefinedTokens.find((card) => (card.scryfallId || card.oracleId || card.name) === tokenId);
  if (!token) { toast('That token definition is not loaded.', true); return; }
  const state = getState();
  const playerId = isOnlineMultiplayer() ? multiplayer.localPlayerId : (document.querySelector('#predefined-token-player')?.value || ui.predefinedTokenPlayerId || state.activePlayerId);
  const quantity = Math.max(1, Math.min(100, Math.floor(Number(document.querySelector('#predefined-token-quantity')?.value || ui.predefinedTokenQuantity || 1))));
  const tapped = document.querySelector('#predefined-token-tapped')?.checked ?? ui.predefinedTokenTapped;
  if (!playerId || !state.players[playerId]) { toast('Choose a valid controller.', true); return; }
  ui.predefinedTokenPlayerId = playerId;
  ui.predefinedTokenQuantity = quantity;
  ui.predefinedTokenTapped = tapped;
  createToken(playerId, token, { quantity, tapped });
  toast(`${quantity > 1 ? `${quantity} ${token.name} tokens` : `${token.name} token`} created${tapped ? ' tapped' : ''}.`);
}

function renderTokenModal() {
  const draft = ui.tokenDraft || createTokenDraft();
  return `<div class="modal-backdrop token-backdrop"><section class="modal small-modal token-modal"><header class="modal-header"><div><h2>Create a token</h2><p class="small muted">You can hide this window to inspect the battlefield without losing the draft.</p></div><button class="icon-btn" data-action="close-token">×</button></header><div class="modal-body"><div class="field"><label>Controller</label><select id="token-player" data-token-field="playerId">${isOnlineMultiplayer() ? `<option value="${multiplayer.localPlayerId}" selected>${escapeHtml(getState().players[multiplayer.localPlayerId]?.name || multiplayer.localPlayerId)}</option>` : `<option value="p1" ${draft.playerId === 'p1' ? 'selected' : ''}>Player 1</option><option value="p2" ${draft.playerId === 'p2' ? 'selected' : ''}>Player 2</option>`}</select></div><div class="field"><label>Name</label><input id="token-name" data-token-field="name" value="${escapeHtml(draft.name)}" /></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="field"><label>Power</label><input id="token-power" data-token-field="power" type="number" value="${Number(draft.power)}" /></div><div class="field"><label>Toughness</label><input id="token-toughness" data-token-field="toughness" type="number" value="${Number(draft.toughness)}" /></div></div><div class="field"><label>Type line</label><input id="token-type" data-token-field="typeLine" value="${escapeHtml(draft.typeLine)}" /></div><div class="field"><label>Keywords, comma separated</label><input id="token-keywords" data-token-field="keywords" value="${escapeHtml(draft.keywords)}" placeholder="Flying, Haste" /></div><div class="token-colors"><div class="field"><label>Card color</label><input id="token-frame-color" data-token-field="frameColor" type="color" value="${escapeHtml(draft.frameColor)}" /></div><div class="field"><label>Accent</label><input id="token-accent-color" data-token-field="accentColor" type="color" value="${escapeHtml(draft.accentColor)}" /></div><div class="field"><label>Text</label><input id="token-text-color" data-token-field="textColor" type="color" value="${escapeHtml(draft.textColor)}" /></div></div><div class="token-modal-actions"><button class="btn ghost" data-action="peek-token-battlefield">View battlefield</button><button class="btn primary" data-action="create-token">Create on battlefield</button></div></div></section></div>`;
}

function renderTokenPeekReturn() {
  return `<div class="token-peek-return" role="status"><span>Token draft paused</span><button class="btn primary small-btn" data-action="resume-token-creator">Return to token creator</button><button class="icon-btn tiny" data-action="close-token" title="Discard token draft">×</button></div>`;
}

function renderMulliganModal(state) {
  const playerIds = isOnlineMultiplayer() && multiplayer.localPlayerId ? [multiplayer.localPlayerId] : ['p1', 'p2'];
  const playerPanels = playerIds.map((playerId) => {
    const player = state.players[playerId];
    const kept = Boolean(state.openingHands.kept[playerId]);
    const required = Number(state.openingHands.bottomRequired[playerId] || 0);
    const selected = ui.mulliganBottomSelections[playerId];
    return `<article class="mulligan-player ${kept ? 'kept' : ''}"><header><div><h3>${escapeHtml(player.name)}</h3><span class="small muted">Mulligans: ${player.mulligans} · Bottom ${required}</span></div>${kept ? '<span class="kept-badge">Kept</span>' : ''}</header><div class="mulligan-hand">${player.zones.hand.map((card) => `<button class="mulligan-card ${selected.has(card.instanceId) ? 'selected' : ''}" data-action="toggle-mulligan-card" data-player-id="${playerId}" data-card-id="${card.instanceId}" ${kept || !required ? 'disabled' : ''}><img src="${escapeHtml(cardSmallImage(card))}" alt="${escapeHtml(card.name)}" /><span>${escapeHtml(card.name)}</span></button>`).join('')}</div>${kept ? '' : `<div class="mulligan-actions"><button class="btn" data-action="mulligan" data-player-id="${playerId}">Mulligan</button><button class="btn primary" data-action="keep-hand" data-player-id="${playerId}" ${selected.size !== required ? 'disabled' : ''}>${required ? `Bottom ${required} & keep` : 'Keep hand'}</button></div>`}</article>`;
  }).join('');
  const remoteStatus = isOnlineMultiplayer() ? `<div class="validation ${state.openingHands.kept[multiplayer.remotePlayerId] ? 'ok' : ''}">${state.openingHands.kept[multiplayer.remotePlayerId] ? 'Opponent kept their hand.' : 'Waiting for opponent to keep or mulligan…'}</div>` : '';
  return `<div class="modal-backdrop mulligan-backdrop"><section class="modal mulligan-modal"><header class="modal-header"><div><h2>Opening hands</h2><p class="small muted">Commander uses a free first mulligan. After later mulligans, select the required cards to put on the bottom before keeping.</p></div></header><div class="modal-body mulligan-grid">${playerPanels}${remoteStatus}</div></section></div>`;
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
  const cancel = ui.coachRunning ? '<button class="btn ghost" data-action="cancel-coach">Stop analysis</button>' : '';
  return `<div class="loading-overlay"><div class="loading-card"><div class="spinner"></div><strong>${escapeHtml(ui.loading.title || 'Working…')}</strong><p class="muted">${escapeHtml(ui.loading.message || '')}</p>${cancel}</div></div>`;
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
function updateLoading(message) { if (ui.loading) { ui.loading.message = message; const node = document.querySelector('.loading-card p'); if (node) node.textContent = message; else render(); } }
function hideLoading() { ui.loading = null; render(); }

function horizontalWheel(event) {
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  }
}


// A remote sync or another action can request a full render between pointerdown
// and click. Defer that render until pointerup so the pressed button remains in
// the DOM long enough for the browser to deliver its click.
app.addEventListener('pointerdown', (event) => {
  if (event.target.closest?.('[data-action]')) ui.pointerActionActive = true;
}, true);
function releasePointerAction() {
  if (!ui.pointerActionActive) return;
  ui.pointerActionActive = false;
  if (ui.deferredRender) queueMicrotask(() => render({ force: true }));
}
app.addEventListener('pointerup', releasePointerAction, true);
app.addEventListener('pointercancel', releasePointerAction, true);
window.addEventListener('blur', releasePointerAction);

app.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (!multiplayerActionAllowed(button, action)) {
    toast('In online mode, each player controls their own cards and turn actions.', true);
    return;
  }
  try {
    if (action === 'setup-mode') {
      const mode = button.dataset.mode;
      if (mode === 'solo') disconnectMultiplayer();
      else { multiplayer.mode = 'online'; render(); }
    }
    if (action === 'host-online') createOnlineHost();
    if (action === 'join-online') joinOnlineHost(document.querySelector('#join-code')?.value || multiplayer.pendingJoinCode);
    if (action === 'disconnect-online') disconnectMultiplayer();
    if (action === 'copy-invite-code') { await navigator.clipboard?.writeText(multiplayer.roomCode); toast('Invite code copied.'); }
    if (action === 'copy-invite-link') { await navigator.clipboard?.writeText(button.dataset.link || ''); toast('Invite link copied.'); }
    if (action === 'next-phase') handleResult(nextPhase());
    if (action === 'undo') { if (!undo()) toast('Nothing to undo.'); }
    if (action === 'coach') { ui.inspectorMode = 'coach'; ui.inspectorOpen = true; render(); }
    if (action === 'cancel-coach') {
      if (ui.coachRunning) {
        ui.coachRunId += 1;
        ui.coachRunning = false;
        hideLoading();
        toast('Coach analysis stopped.');
      }
      return;
    }
    if (action === 'run-coach') {
      if (ui.coachRunning) { toast('The coach is already analyzing this position.'); return; }
      ui.coachRunning = true;
      const runId = ++ui.coachRunId;
      let lastProgressPaint = 0;
      showLoading('Analyzing possible lines', 'Finding legal plays without freezing the table…');
      await new Promise((resolve) => setTimeout(resolve, 30));
      try {
        const snapshot = deepClone(getState());
        const result = await analyzePositionAsync(snapshot, snapshot.activePlayerId, snapshot.settings.coachRollouts, {
          maxDurationMs: 7500,
          shouldCancel: () => runId !== ui.coachRunId,
          onProgress: (message) => {
            const now = Date.now();
            if (runId === ui.coachRunId && now - lastProgressPaint >= 240) {
              lastProgressPaint = now;
              updateLoading(message);
            }
          },
        });
        if (runId === ui.coachRunId && result) ui.coach = result;
      } catch (error) {
        console.error('Coach analysis failed', error);
        toast(`Coach analysis stopped: ${error?.message || 'unknown error'}`, true);
      } finally {
        if (runId === ui.coachRunId) {
          ui.coachRunning = false;
          hideLoading();
        }
      }
    }
    if (action === 'close-inspector') { ui.inspectorOpen = false; ui.knownRevealSelected = null; getState().selected = null; ui.inspectorMode = 'card'; render(); }
    if (action === 'inspect-revealed-card') { ui.knownRevealSelected = { playerId: button.dataset.playerId, cardId: button.dataset.knownCardId }; ui.inspectorMode = 'card'; ui.inspectorOpen = true; render(); }
    if (action === 'open-log') { ui.logOpen = true; render(); }
    if (action === 'close-log') { ui.logOpen = false; render(); }
    if (action === 'close-public-reveal') { ui.publicRevealNotice = null; render(); }
    if (action === 'open-settings') { ui.settingsOpen = true; render(); }
    if (action === 'close-settings') { saveSettingsFromModal(); ui.settingsOpen = false; render(); }
    if (action === 'open-setup') { ui.setupOpen = true; render(); }
    if (action === 'close-setup') { ui.setupOpen = false; render(); }
    if (action === 'back-title') { if (isOnlineMultiplayer()) disconnectMultiplayer(); ui.setupOpen = false; window.CommanderForgeTitle?.show?.(); render(); }
    if (action === 'open-token') { ui.settingsOpen = false; ui.tokenOpen = true; ui.tokenPeek = false; render(); }
    if (action === 'open-predefined-tokens') await openPredefinedTokens(false);
    if (action === 'refresh-predefined-tokens') await openPredefinedTokens(true);
    if (action === 'close-predefined-tokens') { ui.predefinedTokensOpen = false; render(); }
    if (action === 'create-predefined-token') createSelectedPredefinedToken(button.dataset.tokenId);
    if (action === 'more-predefined-tokens') { ui.predefinedTokenLimit += 80; render(); }
    if (action === 'toggle-tokens') { const playerId = button.dataset.playerId; ui.hiddenTokens[playerId] = !ui.hiddenTokens[playerId]; render(); }
    if (action === 'close-token') { ui.tokenOpen = false; ui.tokenPeek = false; ui.tokenDraft = createTokenDraft(); render(); }
    if (action === 'peek-token-battlefield') { captureTokenDraftFromModal(); ui.tokenPeek = true; render(); }
    if (action === 'resume-token-creator') { ui.tokenPeek = false; render(); }
    if (action === 'create-token') createTokenFromModal();
    if (action === 'open-damage') { ui.damageOpen = button.dataset.playerId; render(); }
    if (action === 'close-damage') { ui.damageOpen = null; render(); }
    if (action === 'adjust-player') adjustPlayer(button.dataset.playerId, button.dataset.field, Number(button.dataset.delta));
    if (action === 'commander-damage') adjustCommanderDamage(button.dataset.playerId, button.dataset.sourceId, Number(button.dataset.delta));
    if (action === 'mana') adjustMana(button.dataset.playerId, button.dataset.color, Number(button.dataset.delta));
    if (action === 'clear-mana') clearMana(button.dataset.playerId);
    if (action === 'open-zone') { ui.drawer = { playerId: button.dataset.playerId, zone: button.dataset.zone }; ui.drawerSearch = ''; ui.libraryReveal = null; render(); }
    if (action === 'close-drawer') { ui.drawer = null; ui.drawerSearch = ''; render(); }
    if (action === 'shuffle-library') { clearPublishedLibraryReveals(button.dataset.playerId); shuffleLibrary(button.dataset.playerId); }
    if (action === 'open-scry') { const answer = prompt('How many cards should you scry?', '1'); const amount = answer === null ? 0 : Math.floor(Number(answer)); if (amount > 0) openPrivateLibraryTool(button.dataset.playerId, { mode: 'scry', amount, label: `Scry ${amount}`, allowedDestinations: ['top', 'bottom'] }); }
    if (action === 'open-private-look') { const answer = prompt('How many top cards does the effect let you look at?', '1'); const amount = answer === null ? 0 : Math.floor(Number(answer)); if (amount > 0) openPrivateLibraryTool(button.dataset.playerId, { mode: 'look', amount, label: `Private look at top ${amount}`, allowedDestinations: ['top', 'bottom', 'hand', 'graveyard', 'exile'], handLimit: amount }); }
    if (action === 'reveal-top') { const result = revealTopPublicly(button.dataset.playerId); handleResult(result); if (result?.ok) publishPublicReveal(result.card, button.dataset.playerId, 'library', { position: 'top', notifyLocal: true }); ui.libraryReveal = { playerId: button.dataset.playerId }; render(); }
    if (action === 'card-library-effect') { const located = findCard(button.dataset.cardId, getState()); if (located) { const effect = privateLibraryActions(located.card)[Number(button.dataset.effectIndex || 0)]; if (effect) { let amount = effect.amount; if (!amount) { const answer = prompt('Choose the value of X for this effect:', '1'); amount = answer === null ? 0 : Math.floor(Number(answer)); } if (amount > 0) openPrivateLibraryTool(located.card.controller || located.card.owner, { ...effect, amount, sourceCardId: located.card.instanceId, label: effect.label.replace('X', String(amount)) }); } } }
    if (action === 'scry-destination') setPrivateLibraryDestination(button.dataset.cardId, button.dataset.destination);
    if (action === 'scry-reveal') togglePrivateLibraryReveal(button.dataset.cardId);
    if (action === 'scry-reveal-next') revealNextPrivateLibraryCard();
    if (action === 'scry-order') movePrivateLibraryItem(button.dataset.cardId, button.dataset.direction);
    if (action === 'confirm-scry') confirmPrivateLibraryTool();
    if (action === 'close-scry') { ui.scry = null; render(); }
    if (action === 'draw') draw(button.dataset.playerId, Number(button.dataset.amount || 1));
    if (action === 'mill') mill(button.dataset.playerId, Number(button.dataset.amount || 1));
    if (action === 'toggle-tap') handleResult(toggleTap(button.dataset.cardId));
    if (action === 'toggle-tap-only') handleResult(toggleTap(button.dataset.cardId, { mana: false }));
    if (action === 'tap-mana') handleResult(tapForMana(button.dataset.cardId, Number(button.dataset.choiceIndex || 0)));
    if (action === 'toggle-attack') handleResult(toggleAttack(button.dataset.cardId));
    if (action === 'assign-block') handleResult(assignBlocker(button.dataset.cardId, button.dataset.attackerId));
    if (action === 'attach-card') handleResult(attachCard(button.dataset.cardId, button.dataset.targetId));
    if (action === 'reveal-public') { const located = findCard(button.dataset.cardId, getState()); const result = revealCardPublicly(button.dataset.cardId); handleResult(result); if (result?.ok && located && ['hand', 'library'].includes(located.zone)) publishPublicReveal(located.card, located.card.owner || located.playerId, located.zone, { notifyLocal: true }); }
    if (action === 'move-card') moveSelectedTo(button.dataset.cardId, button.dataset.zone);
    if (action === 'move-card-tapped') moveSelectedToBattlefieldTapped(button.dataset.cardId);
    if (action === 'put-land-effect') moveSelectedTo(button.dataset.cardId, 'battlefield', 'top', { force: true, countsAsLandPlay: false });
    if (action === 'put-land-effect-tapped') moveSelectedTo(button.dataset.cardId, 'battlefield', 'top', { force: true, countsAsLandPlay: false, enterTapped: true });
    if (action === 'token-dies') handleResult(removeToken(button.dataset.cardId, { died: true, destination: 'graveyard' }));
    if (action === 'remove-token') handleResult(removeToken(button.dataset.cardId));
    if (action === 'move-library') moveSelectedTo(button.dataset.cardId, 'library', button.dataset.position);
    if (action === 'flip-card') flipCard(button.dataset.cardId);
    if (action === 'copy-token') copyAsToken(button.dataset.cardId);
    if (action === 'counter') addCounter(button.dataset.cardId, button.dataset.counter, Number(button.dataset.delta));
    if (action === 'custom-pt-counter') {
      const power = Math.trunc(Number(document.querySelector('#custom-counter-power')?.value || 0));
      const toughness = Math.trunc(Number(document.querySelector('#custom-counter-toughness')?.value || 0));
      if (!power && !toughness) toast('Choose a power or toughness change.', true);
      else {
        const signed = (value) => `${value >= 0 ? '+' : ''}${value}`;
        addCounter(button.dataset.cardId, `${signed(power)}/${signed(toughness)}`, 1);
      }
    }
    if (action === 'add-keyword') {
      const custom = String(document.querySelector('#manual-keyword-custom')?.value || '').trim();
      const selectedKeyword = String(document.querySelector('#manual-keyword-select')?.value || '').trim();
      handleResult(updateManualKeyword(button.dataset.cardId, custom || selectedKeyword, true));
    }
    if (action === 'remove-keyword') handleResult(updateManualKeyword(button.dataset.cardId, button.dataset.keyword, false));
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
    if (action === 'mulligan') { const playerId = button.dataset.playerId; const bottoms = mulligan(playerId); ui.mulliganBottomSelections[playerId].clear(); sendMulliganStatus(playerId); toast(bottoms ? `Draw 7, then choose ${bottoms} card(s) for the bottom.` : 'Free Commander mulligan: draw 7.'); }
    if (action === 'keep-hand') { const playerId = button.dataset.playerId; const result = keepOpeningHand(playerId, [...ui.mulliganBottomSelections[playerId]]); handleResult(result); if (result?.ok) { ui.mulliganBottomSelections[playerId].clear(); sendMulliganStatus(playerId); } }
    if (action === 'concede') { if (confirm(`${getState().players[button.dataset.playerId].name} concedes?`)) concede(button.dataset.playerId); }
    if (action === 'random-tool') runRandomTool(button.dataset.kind);
    if (action === 'export-save') downloadJson(`commander-forge-turn-${getState().turnNumber}.json`, getState());
    if (action === 'import-save') triggerFilePicker();
    if (action === 'reset-game') resetGamePrompt();
    if (action === 'deck-source') { const draft = ui.drafts[button.dataset.playerId]; draft.source = button.dataset.source; if (draft.source === 'precon') await ensurePreconIndex(); render(); }
    if (action === 'prepare-custom') await prepareCustomDeck(button.dataset.playerId);
    if (action === 'search-precon') await searchPrecons(button.dataset.playerId);
    if (action === 'load-precon') await loadPrecon(button.dataset.playerId, button.dataset.fileName);
    if (action === 'start-game') { if (isOnlineMultiplayer()) startOnlineGame(); else startGame(); }
    if (action === 'demo-game') loadDemoGame();
  } catch (error) {
    console.error(error);
    hideLoading();
    toast(error.message || 'Something went wrong.', true);
  }
});

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.matches?.('[data-draft-field]')) {
    const playerId = target.dataset.playerId;
    const field = target.dataset.draftField;
    if (ui.drafts[playerId] && field) ui.drafts[playerId][field] = target.value;
  }
  if (target.id === 'join-code') multiplayer.pendingJoinCode = target.value;
});

app.addEventListener('focusout', () => {
  if (ui.setupRenderPending) scheduleSetupRenderFlush();
}, true);

app.addEventListener('input', debounce((event) => {
  const target = event.target;
  if (target.matches('[data-draft-field]')) {
    ui.drafts[target.dataset.playerId][target.dataset.draftField] = target.value;
    if (isOnlineMultiplayer() && target.dataset.playerId === multiplayer.localPlayerId) setTimeout(sendLocalDraft, 160);
  }
  if (target.matches('[data-token-field]')) {
    const field = target.dataset.tokenField;
    ui.tokenDraft[field] = ['power', 'toughness'].includes(field) ? Number(target.value || 0) : target.value;
  }
  if (target.id === 'predefined-token-search') {
    const position = target.selectionStart ?? target.value.length;
    ui.predefinedTokenSearch = target.value;
    ui.predefinedTokenLimit = 80;
    render();
    requestAnimationFrame(() => {
      const replacement = document.querySelector('#predefined-token-search');
      replacement?.focus({ preventScroll: true });
      replacement?.setSelectionRange(position, position);
    });
  }
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
  if (target.matches('.card-note')) {
    if (multiplayerCanControlCard(target.dataset.cardId)) updateCardNote(target.dataset.cardId, target.value);
  }
}, 120));

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'predefined-token-player') ui.predefinedTokenPlayerId = target.value;
  if (target.id === 'predefined-token-quantity') ui.predefinedTokenQuantity = Math.max(1, Math.min(100, Math.floor(Number(target.value || 1))));
  if (target.id === 'predefined-token-tapped') ui.predefinedTokenTapped = target.checked;
  if (target.id === 'predefined-token-filter') { ui.predefinedTokenFilter = target.value; ui.predefinedTokenLimit = 80; render(); }
  if (target.matches('[data-token-field]')) {
    const field = target.dataset.tokenField;
    ui.tokenDraft[field] = ['power', 'toughness'].includes(field) ? Number(target.value || 0) : target.value;
  }
  if (target.matches('[data-commander-select]')) {
    const draft = ui.drafts[target.dataset.playerId];
    const index = target.dataset.commanderSelect === 'primary' ? 0 : 1;
    draft.commanders[index] = target.value;
    draft.commanders = draft.commanders.filter(Boolean);
    refreshDraftValidation(target.dataset.playerId);
    if (isOnlineMultiplayer() && target.dataset.playerId === multiplayer.localPlayerId) sendLocalDraft();
    render({ force: true });
  }
});

function saveSettingsFromModal() {
  const mode = document.querySelector('#rules-mode');
  if (!mode) return;
  updateState((draft) => {
    draft.settings.rulesMode = mode.value;
    draft.settings.manaMode = document.querySelector('#mana-mode')?.value || 'auto';
    draft.settings.hideOpponentHand = false;
    draft.settings.autoDraw = document.querySelector('#auto-draw')?.checked ?? true;
    draft.settings.enforceLandPlays = document.querySelector('#enforce-land-plays')?.checked ?? true;
    draft.settings.showCardNames = document.querySelector('#show-names')?.checked ?? true;
    draft.settings.coachRollouts = Math.max(40, Math.min(240, Number(document.querySelector('#coach-rollouts')?.value || 240)));
  }, { snapshot: false });
}

function captureTokenDraftFromModal() {
  const read = (selector, fallback = '') => document.querySelector(selector)?.value ?? fallback;
  ui.tokenDraft = {
    playerId: read('#token-player', ui.tokenDraft.playerId || 'p1'),
    name: read('#token-name', ui.tokenDraft.name || 'Zombie'),
    power: Number(read('#token-power', ui.tokenDraft.power ?? 2)),
    toughness: Number(read('#token-toughness', ui.tokenDraft.toughness ?? 2)),
    typeLine: read('#token-type', ui.tokenDraft.typeLine || 'Token Creature — Zombie'),
    keywords: read('#token-keywords', ui.tokenDraft.keywords || ''),
    frameColor: read('#token-frame-color', ui.tokenDraft.frameColor || '#1f3329'),
    accentColor: read('#token-accent-color', ui.tokenDraft.accentColor || '#d4a654'),
    textColor: read('#token-text-color', ui.tokenDraft.textColor || '#f4f1e8'),
  };
  return ui.tokenDraft;
}

function createTokenFromModal() {
  const draft = captureTokenDraftFromModal();
  const name = draft.name.trim() || 'Token';
  const typeLine = draft.typeLine.trim() || 'Token Creature';
  const keywords = String(draft.keywords || '').split(',').map((value) => value.trim()).filter(Boolean);
  createToken(draft.playerId, {
    name,
    power: Number(draft.power || 0),
    toughness: Number(draft.toughness || 0),
    typeLine,
    keywords,
    frameColor: draft.frameColor,
    accentColor: draft.accentColor,
    textColor: draft.textColor,
  });
  ui.tokenOpen = false;
  ui.tokenPeek = false;
  ui.tokenDraft = createTokenDraft();
  toast(`${name} token created.`);
}


function handleResult(result) {
  if (result && result.ok === false) toast(result.message || 'Action not allowed.', true);
}

function moveSelectedTo(cardId, zone, position = 'top', options = {}) {
  const found = findCard(cardId, getState());
  if (!found) return;
  const targetPlayerId = zone === 'hand' || zone === 'library' || zone === 'graveyard' || zone === 'exile' || zone === 'command' ? found.card.owner : found.card.controller;
  handleResult(moveCard(cardId, targetPlayerId, zone, { libraryPosition: position, ...options }));
}

function moveSelectedToBattlefieldTapped(cardId) {
  const found = findCard(cardId, getState());
  if (!found || !isPermanent(found.card)) return;
  const manualEffectSource = ['library', 'graveyard', 'exile'].includes(found.zone);
  handleResult(moveCard(cardId, found.card.controller, 'battlefield', {
    enterTapped: true,
    force: manualEffectSource,
  }));
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
  if (isOnlineMultiplayer() && playerId === multiplayer.localPlayerId) sendLocalDraft();
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
  if (isOnlineMultiplayer() && playerId === multiplayer.localPlayerId) sendLocalDraft();
}

function refreshDraftValidation(playerId) {
  const draft = ui.drafts[playerId];
  draft.validation = validateDeck(draft.entries, draft.byName, draft.commanders);
  draft.ready = draft.validation.errors.length === 0;
  if (playerId === 'p2' && draft.ready && multiplayer.pendingStartMessage) setTimeout(maybeProcessPendingOnlineStart, 0);
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
  if (isOnlineMultiplayer()) return toast('The interactive demo is only available in solo practice.', true);
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
  if (isOnlineMultiplayer()) disconnectMultiplayer();
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
    draggable: multiplayerCanControlCard(card.dataset.cardId),
  };
});

document.addEventListener('pointermove', (event) => {
  const candidate = dragState.candidate;
  if (!candidate || candidate.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
  if (!candidate.draggable) return;
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
      if (isOnlineMultiplayer() && playerId !== multiplayer.localPlayerId) {
        toast('Move your own cards on your own side in online mode.', true);
      } else {
        const result = moveCard(candidate.cardId, playerId, zone);
        handleResult(result);
      }
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
  ui.knownRevealSelected = null;
  updateState((draft) => { draft.selected = { instanceId: cardId }; }, { snapshot: false });
  ui.inspectorMode = 'card';
  ui.inspectorOpen = true;
  render();
}

// Service worker temporarily disabled by the synchronized recovery build.

})();
