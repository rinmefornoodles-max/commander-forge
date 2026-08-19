/* Conservative Oracle -> Engine 6 compiler for common, deterministic patterns.
 * It never guesses unsupported text: unsupported clauses are returned as warnings.
 */
(function (root, factory) {
  const api = factory(root.CommanderForgeRulesV6 || (typeof require === 'function' ? require('./commander-forge-engine-v6.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CommanderForgeOracleCompilerV6 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Rules) {
  'use strict';
  const { EVENTS, EFFECTS } = Rules || {};
  const WORD = { a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
  const KEYWORDS = ['flying','vigilance','lifelink','deathtouch','haste','trample','reach','menace','hexproof','indestructible','first strike','double strike','flash','defender'];
  const num = (s, fallback=1) => /^\d+$/.test(String(s||'')) ? Number(s) : (WORD[String(s||'').toLowerCase()] || fallback);

  function parseEffect(text) {
    const t = text.trim().replace(/\.$/, '');
    let m;
    if ((m=t.match(/^draw (a|an|one|two|three|four|five|six|\d+) cards?$/i))) return { type:EFFECTS.DRAW, playerId:'YOU', amount:num(m[1]) };
    if ((m=t.match(/^you gain (\d+) life$/i))) return { type:EFFECTS.GAIN_LIFE, playerId:'YOU', amount:Number(m[1]) };
    if ((m=t.match(/^you lose (\d+) life$/i))) return { type:EFFECTS.LOSE_LIFE, playerId:'YOU', amount:Number(m[1]) };
    if ((m=t.match(/^mill (\d+) cards?$/i))) return { type:EFFECTS.MILL, playerId:'YOU', amount:Number(m[1]) };
    if ((m=t.match(/^destroy target creature$/i))) return { type:EFFECTS.DESTROY, target:{kind:'CREATURE',zone:'battlefield',min:1,max:1} };
    if ((m=t.match(/^exile target creature$/i))) return { type:EFFECTS.EXILE, target:{kind:'CREATURE',zone:'battlefield',min:1,max:1} };
    if ((m=t.match(/^destroy target permanent$/i))) return { type:EFFECTS.DESTROY, target:{kind:'PERMANENT',zone:'battlefield',min:1,max:1} };
    if ((m=t.match(/^exile target permanent$/i))) return { type:EFFECTS.EXILE, target:{kind:'PERMANENT',zone:'battlefield',min:1,max:1} };
    return null;
  }

  function parseTrigger(line, cardName) {
    let body = null, event = null, condition = null;
    const escaped = cardName ? cardName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') : '.+';
    let m;
    if ((m=line.match(new RegExp(`^When ${escaped} enters(?: the battlefield)?, (.+)$`,'i')))) { event=EVENTS.ENTERS_BATTLEFIELD; condition={type:'SOURCE_IS_SUBJECT'}; body=m[1]; }
    else if ((m=line.match(/^Whenever another creature enters(?: the battlefield)?(?: under your control)?, (.+)$/i))) { event=EVENTS.ENTERS_BATTLEFIELD; condition=[{type:'SUBJECT_IS_OTHER'},{type:'SUBJECT_IS_CREATURE'}]; body=m[1]; }
    else if ((m=line.match(new RegExp(`^Whenever ${escaped} attacks, (.+)$`,'i')))) { event=EVENTS.ATTACKS; condition={type:'SOURCE_IS_SUBJECT'}; body=m[1]; }
    else if ((m=line.match(/^Whenever you gain life, (.+)$/i))) { event=EVENTS.LIFE_GAINED; condition={type:'PLAYER_IS_YOU'}; body=m[1]; }
    if (!event) return null;
    const effect = parseEffect(body);
    return effect ? { type:'trigger', event, condition, effects:[effect] } : { unsupportedTrigger:true, text:line };
  }

  function compileCard(card) {
    const oracle = String(card.oracle_text ?? card.oracleText ?? '');
    const typeLine = card.type_line ?? card.typeLine ?? '';
    const definition = {
      id: card.oracle_id || card.id || String(card.name||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-'),
      name: card.name || 'Unknown Card', typeLine, manaCost: card.mana_cost ?? card.manaCost ?? '',
      power: Number.isFinite(Number(card.power)) ? Number(card.power) : undefined,
      toughness: Number.isFinite(Number(card.toughness)) ? Number(card.toughness) : undefined,
      keywords: [], abilities: [], spellEffects: [], oracleText: oracle
    };
    const unsupported = [];
    const lower = oracle.toLowerCase();
    for (const k of KEYWORDS) if (new RegExp(`(?:^|[,\\n]\\s*)${k}(?:[,\\n.]|$)`,'i').test(oracle)) definition.keywords.push(k);
    const mutate = oracle.match(/(?:^|\n)Mutate\s+([^\n]+)/i); if (mutate) definition.abilities.push({type:'mutate',cost:mutate[1].trim()});
    const ninjutsu = oracle.match(/(?:^|\n)(?:Commander )?Ninjutsu\s+([^\n]+)/i); if (ninjutsu) definition.abilities.push({type:'ninjutsu',cost:ninjutsu[1].trim()});
    for (const rawLine of oracle.split(/\n+/)) {
      const line=rawLine.trim(); if (!line) continue;
      if (/^(Mutate|(?:Commander )?Ninjutsu)\b/i.test(line)) continue;
      if (KEYWORDS.some(k=>line.toLowerCase()===k)) continue;
      const trigger=parseTrigger(line,definition.name);
      if (trigger) { if (trigger.unsupportedTrigger) unsupported.push(line); else definition.abilities.push(trigger); continue; }
      const effect=parseEffect(line);
      if (effect && !/(Creature|Artifact|Enchantment|Planeswalker|Battle)/i.test(typeLine)) { definition.spellEffects.push(effect); continue; }
      unsupported.push(line);
    }
    return { definition, unsupported, coverage: oracle ? Math.max(0, 1 - unsupported.length / Math.max(1, oracle.split(/\n+/).length)) : 1 };
  }

  return { compileCard, parseEffect, parseTrigger };
});
