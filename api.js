import {
  CARD_CACHE_KEY,
  DECK_CACHE_KEY,
  DECK_PAYLOAD_CACHE_KEY,
  MTGJSON_DECK_BASE_URLS,
  MTGJSON_DECK_LIST_URLS,
  SCRYFALL_COLLECTION_URL,
} from './constants.js';
import { normalizeName } from './utils.js';

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

export async function fetchCardsByNames(names, onProgress = () => {}) {
  const uniqueNames = [...new Set(names.map(normalizeName).filter(Boolean))];
  const cache = readCache(CARD_CACHE_KEY);
  const missing = uniqueNames.filter((name) => !cache[name.toLocaleLowerCase()]);
  const notFound = [];

  for (let start = 0; start < missing.length; start += 75) {
    const batch = missing.slice(start, start + 75);
    onProgress({ loaded: start, total: missing.length, message: `Loading cards ${start + 1}-${Math.min(start + 75, missing.length)}…` });
    const response = await fetch(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
    });
    if (!response.ok) throw new Error(`Scryfall returned ${response.status}. Try again in a moment.`);
    const payload = await response.json();
    for (const raw of payload.data || []) {
      const compact = compactScryfallCard(raw);
      cache[compact.name.toLocaleLowerCase()] = compact;
      for (const requested of batch) {
        const key = requested.toLocaleLowerCase();
        const faceMatch = raw.card_faces?.some((face) => face.name?.toLocaleLowerCase() === key);
        if (compact.name.toLocaleLowerCase() === key || faceMatch) cache[key] = compact;
      }
    }
    for (const item of payload.not_found || []) notFound.push(item.name || item);
    await delay(90);
  }
  writeCache(CARD_CACHE_KEY, cache);
  onProgress({ loaded: missing.length, total: missing.length, message: 'Cards loaded.' });
  return {
    cards: uniqueNames.map((name) => cache[name.toLocaleLowerCase()]).filter(Boolean),
    byName: Object.fromEntries(uniqueNames.map((name) => [name.toLocaleLowerCase(), cache[name.toLocaleLowerCase()]])),
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
    }));
}

export async function fetchPreconIndex(force = false) {
  const cached = readCache(DECK_CACHE_KEY);
  if (!force && cached.index?.length && Date.now() - cached.updatedAt < 21_600_000) return cached.index;

  try {
    const { payload } = await fetchJsonFromCandidates(MTGJSON_DECK_LIST_URLS, { attempts: 2 });
    const index = normalizeDeckIndex(payload);
    if (!index.length) throw new Error('The deck index was empty.');
    writeCache(DECK_CACHE_KEY, { index, updatedAt: Date.now() });
    return index;
  } catch (error) {
    // A stale index is still better than no search at all during an outage.
    if (cached.index?.length) return cached.index;
    throw error;
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

  const commanderBoard = deck.commander || deck.commanders || [];
  const mainBoard = deck.mainBoard || deck.mainboard || deck.main || deck.cards || [];
  const sideBoard = deck.sideBoard || deck.sideboard || [];
  const commanderNames = commanderBoard
    .filter((card) => card?.name)
    .flatMap((card) => Array(Math.max(1, Number(card.count ?? card.quantity ?? card.qty ?? 1))).fill(card.name));

  const counts = new Map();
  // Some MTGJSON products place relevant cards in sideBoard, so use it only if
  // the main board is unexpectedly empty.
  const board = mainBoard.length ? mainBoard : sideBoard;
  for (const card of board) {
    if (!card?.name) continue;
    const count = Math.max(1, Number(card.count ?? card.quantity ?? card.qty ?? 1));
    counts.set(card.name, (counts.get(card.name) || 0) + count);
  }
  for (const commander of commanderNames) {
    if (!counts.has(commander)) counts.set(commander, 1);
  }
  if (!counts.size) throw new Error('The deck file contained no readable cards.');

  return {
    name: deck.name || entry.name,
    entries: [...counts.entries()].map(([name, count]) => ({ name, count })),
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

export async function fetchPreconDeck(entry) {
  const payloadCache = readCache(DECK_PAYLOAD_CACHE_KEY);
  const cacheKey = `${entry.code || ''}|${entry.name || ''}`.toLocaleLowerCase();

  const attemptEntry = async (candidateEntry) => {
    const { payload } = await fetchJsonFromCandidates(deckFileCandidates(candidateEntry.fileName), { attempts: 2 });
    const normalized = normalizeDeckPayload(payload, candidateEntry);
    payloadCache[cacheKey] = { deck: normalized, updatedAt: Date.now(), fileName: candidateEntry.fileName };
    writeCache(DECK_PAYLOAD_CACHE_KEY, payloadCache);
    return normalized;
  };

  try {
    return await attemptEntry(entry);
  } catch (firstError) {
    // MTGJSON rebuilds its files regularly. A cached DeckList can temporarily
    // point at an old filename, so refresh the index and retry with the latest.
    try {
      const freshIndex = await fetchPreconIndex(true);
      const freshEntry = matchingFreshEntry(freshIndex, entry);
      if (freshEntry) return await attemptEntry(freshEntry);
    } catch { /* use cached deck or original error below */ }

    const cachedDeck = payloadCache[cacheKey]?.deck;
    if (cachedDeck?.entries?.length) return cachedDeck;
    throw new Error(`${firstError.message} Try Search again to refresh the precon list, or paste the decklist manually.`);
  }
}
