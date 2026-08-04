import {
  CARD_CACHE_KEY,
  DECK_CACHE_KEY,
  MTGJSON_DECK_BASE_URL,
  MTGJSON_DECK_LIST_URL,
  SCRYFALL_COLLECTION_URL,
} from './constants.js';
import { normalizeName } from './utils.js';

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cache is optional */ }
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
    await new Promise((resolve) => setTimeout(resolve, 90));
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

export async function fetchPreconIndex(force = false) {
  const cached = readCache(DECK_CACHE_KEY);
  if (!force && cached.index?.length && Date.now() - cached.updatedAt < 86_400_000) return cached.index;
  const response = await fetch(MTGJSON_DECK_LIST_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`MTGJSON deck index returned ${response.status}.`);
  const payload = await response.json();
  const data = Array.isArray(payload) ? payload : payload.data || [];
  const index = data
    .filter((deck) => deck?.name && deck?.fileName)
    .map((deck) => ({
      name: deck.name,
      fileName: deck.fileName,
      code: deck.code || '',
      releaseDate: deck.releaseDate || '',
      type: deck.type || '',
    }));
  writeCache(DECK_CACHE_KEY, { index, updatedAt: Date.now() });
  return index;
}

export async function fetchPreconDeck(entry) {
  const file = String(entry.fileName).endsWith('.json') ? entry.fileName : `${entry.fileName}.json`;
  const response = await fetch(`${MTGJSON_DECK_BASE_URL}/${encodeURIComponent(file)}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`MTGJSON could not load this precon (${response.status}).`);
  const payload = await response.json();
  const deck = payload.data || payload;
  const commanderNames = (deck.commander || []).flatMap((card) => Array(card.count || 1).fill(card.name));
  const counts = new Map();
  for (const card of deck.mainBoard || []) {
    if (!card?.name) continue;
    counts.set(card.name, (counts.get(card.name) || 0) + Number(card.count || 1));
  }
  for (const commander of commanderNames) {
    if (!counts.has(commander)) counts.set(commander, 1);
  }
  const entries = [...counts.entries()].map(([name, count]) => ({ name, count }));
  return {
    name: deck.name || entry.name,
    entries,
    commanderNames,
    releaseDate: deck.releaseDate || entry.releaseDate || '',
    type: deck.type || entry.type || '',
  };
}
