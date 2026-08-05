import {
  CARD_CACHE_KEY,
  DECK_CACHE_KEY,
  DECK_PAYLOAD_CACHE_KEY,
  LOCAL_PRECON_BASE_URL,
  LOCAL_PRECON_INDEX_URL,
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

export async function fetchCardsByNames(items, onProgress = () => {}) {
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

export async function fetchPreconIndex(force = false) {
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

export async function fetchPreconDeck(entry) {
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
