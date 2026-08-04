export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function deepClone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function shuffle(array) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function normalizeName(name = '') {
  return name
    .replace(/\s+\([A-Z0-9]+\)\s+\d+[a-z]?$/i, '')
    .replace(/\s+\*[A-Za-z0-9-]+\*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDecklist(text = '') {
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

export function manaSymbols(cost = '') {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

export function manaRequirement(cost = '', tax = 0) {
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

export function manaBundleAmount(mana = {}) {
  return MANA_COLORS.reduce((sum, color) => sum + Number(mana[color] || 0), 0);
}

export function formatManaBundle(mana = {}) {
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
export function manaProductionChoices(card) {
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
export function manaProductionOptions(card) {
  return manaProductionChoices(card).flatMap((choice, choiceIndex) =>
    MANA_COLORS
      .filter((color) => Number(choice.mana[color] || 0) > 0)
      .map((color) => ({ color, amount: Number(choice.mana[color] || 0), choiceIndex, mana: choice.mana, label: choice.label })),
  );
}

export function manaSourceLabel(card) {
  const choices = manaProductionChoices(card);
  return choices.map((choice) => choice.label).join(' / ');
}

export function untappedManaSources(player) {
  return (player?.zones?.battlefield || [])
    .filter((card) => !card.tapped)
    .map((card) => ({ card, choices: manaProductionChoices(card) }))
    .filter((source) => source.choices.length);
}

export function totalMana(pool) {
  return Object.values(pool || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function cardImage(card) {
  if (!card) return './card-back.svg';
  return card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || './card-back.svg';
}

export function cardSmallImage(card) {
  if (!card) return './card-back.svg';
  return card.imageSmall || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || cardImage(card);
}

export function isCreature(card) {
  return card?.typeLine?.includes('Creature') || card?.type_line?.includes('Creature');
}

export function isLand(card) {
  return card?.typeLine?.includes('Land') || card?.type_line?.includes('Land');
}

export function isPermanent(card) {
  const type = card?.typeLine || card?.type_line || '';
  return ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'].some((word) => type.includes(word));
}

export function hasFlash(card) {
  return (card?.keywords || []).includes('Flash') || /flash/i.test(card?.oracleText || card?.oracle_text || '');
}

export function numericStat(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatZone(zone) {
  return zone ? zone[0].toUpperCase() + zone.slice(1) : '';
}

export function debounce(fn, delay = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
