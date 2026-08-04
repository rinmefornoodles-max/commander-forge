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
