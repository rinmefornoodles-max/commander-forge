/* Commander Forge Oracle Ability Inventory V8
 * Adds conservative ability classification on top of Oracle Compiler V7.
 * Every non-empty Oracle ability line returns a descriptor; unsupported text is
 * marked manual instead of disappearing.
 */
(function (root) {
  'use strict';
  const base = root?.CommanderForgeOracleCompilerV7 || null;
  const VERSION = '8.0.0-ability-inventory';
  const KEYWORDS = new Set([
    'deathtouch','defender','double strike','first strike','flash','flying','haste',
    'hexproof','indestructible','lifelink','menace','reach','shroud','trample',
    'vigilance','infect','wither','prowess','exalted','battle cry','persist',
    'undying','myriad','fear','intimidate','shadow','horsemanship','skulk',
    'changeling','convoke','delve','improvise','ninjutsu','mutate','ward'
  ]);

  function textOf(input) {
    return typeof input === 'string' ? input : String(input?.oracleText ?? input?.oracle_text ?? '');
  }

  function abilityLines(input) {
    return textOf(input)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function triggerClause(line) {
    const raw = String(line || '').replace(/^[^—-]+[—-]\s*(?=(?:At|When|Whenever)\b)/i, '').trim();
    if (!/^(?:At|When|Whenever)\b/i.test(raw)) return '';
    const comma = raw.indexOf(',');
    return (comma >= 0 ? raw.slice(0, comma) : raw).trim();
  }

  function effectText(line) {
    const raw = String(line || '').replace(/^[^—-]+[—-]\s*(?=(?:At|When|Whenever)\b)/i, '').trim();
    if (/^(?:At|When|Whenever)\b/i.test(raw)) {
      const comma = raw.indexOf(',');
      if (comma >= 0) return raw.slice(comma + 1).trim();
    }
    const colon = raw.indexOf(':');
    if (colon >= 0) return raw.slice(colon + 1).trim();
    return raw;
  }

  function triggerEventFromClause(clause) {
    const text = String(clause || '').toLowerCase();
    if (!text) return null;
    if (/beginning of combat/.test(text)) return 'BEGIN_COMBAT';
    if (/upkeep/.test(text)) return 'BEGIN_UPKEEP';
    if (/end step|end of turn/.test(text)) return 'BEGIN_END_STEP';
    if (/enters(?: the battlefield)?/.test(text)) return 'ENTER_BATTLEFIELD';
    if (/dies|put into a graveyard from the battlefield/.test(text)) return 'DIES';
    if (/leaves the battlefield/.test(text)) return 'LEAVE_BATTLEFIELD';
    if (/deals? combat damage to (?:a player|an opponent|one or more players)/.test(text)) return 'COMBAT_DAMAGE_PLAYER';
    if (/attacks?/.test(text)) return 'ATTACK';
    if (/casts?/.test(text)) return 'CAST';
    if (/draws?/.test(text)) return 'DRAW';
    if (/gains? life/.test(text)) return 'LIFE_GAIN';
    if (/loses? life/.test(text)) return 'LIFE_LOSS';
    if (/discards?/.test(text)) return 'DISCARD';
    if (/sacrific/.test(text)) return 'SACRIFICE';
    if (/becomes? tapped/.test(text)) return 'TAPPED';
    return null;
  }

  function staticGrantDescriptor(line) {
    const m = String(line || '').match(/^(?:other )?([A-Za-z][A-Za-z '-]+?)s you control have ([^.]+)\.?$/i);
    if (!m) return null;
    const phrase = m[2].toLowerCase();
    const keywords = [...KEYWORDS].filter((name) => new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'i').test(phrase));
    if (!keywords.length) return null;
    return { type: 'GRANT_KEYWORDS', filter: { controller: 'YOU', subtype: m[1].replace(/s$/i, '') }, keywords };
  }

  function specialEffectSteps(line) {
    const effect = effectText(line);
    if (/roll a d20\.\s*draw cards equal to the result\.\s*you have no maximum hand size for the rest of the game/i.test(effect)) {
      return [
        { type: 'ROLL_DIE', sides: 20, resultKey: 'roll1' },
        { type: 'DRAW', player: 'YOU', amountRef: 'roll1' },
        { type: 'NO_MAX_HAND_SIZE', player: 'YOU', duration: 'GAME' },
      ];
    }
    const copy = effect.match(/exile up to one target creature card from a graveyard\.\s*if you exiled a card this way, create a token (?:that|that's|that’s) a copy of that card, except (?:it|it's|it’s) a (\d+)\/(\d+) ([a-z]+) ([a-z][a-z -]*)/i);
    if (copy) {
      return [
        { type: 'CHOOSE_CARD', zone: 'ANY_GRAVEYARD', filter: 'creature card', maxCount: 1, zeroAllowed: true, resultKey: 'chosen1' },
        { type: 'EXILE_CHOSEN', cardRef: 'chosen1', conditional: true },
        { type: 'CREATE_COPY_TOKEN', cardRef: 'chosen1', conditional: true, power: Number(copy[1]), toughness: Number(copy[2]), color: copy[3].toLowerCase(), subtype: copy[4].trim().replace(/[.]+$/, '') },
      ];
    }
    return null;
  }

  function classifyAbility(line, cardName = '') {
    const text = String(line || '').trim();
    const normalized = text.replace(/[.]+$/, '').trim();
    const lower = normalized.toLowerCase();
    const trigger = triggerClause(text);
    const triggerEvent = triggerEventFromClause(trigger);
    const special = specialEffectSteps(text);

    if (KEYWORDS.has(lower) || [...KEYWORDS].some((keyword) => lower.startsWith(`${keyword} `) && ['ward','ninjutsu','mutate'].includes(keyword))) {
      return { text, abilityType: 'keyword', automation: 'automatic', reason: 'Keyword is handled by the core rules model.', effects: [] };
    }

    const grant = staticGrantDescriptor(text);
    if (grant) return { text, abilityType: 'static', automation: 'automatic', reason: 'Continuous keyword grant is applied by derived card state.', effects: [grant] };

    if (special) {
      return { text, abilityType: trigger ? 'triggered' : 'static', triggerEvent, automation: 'assisted', reason: triggerEvent === 'COMBAT_DAMAGE_PLAYER' ? 'Trigger detection is automatic; the player presses the die-roll button to see the result.' : 'Trigger and legal choices are surfaced automatically; the player makes the target choice.', effects: special };
    }

    if (trigger) {
      const effect = effectText(text);
      let program = null;
      try { program = base?.compileProgram?.(effect, { cardName }) || null; } catch {}
      if (triggerEvent && program?.authoritative) return { text, abilityType: 'triggered', triggerEvent, automation: 'assisted', reason: 'Trigger timing is recognized and its ordered effect has a live adapter.', effects: program.steps || [] };
      if (triggerEvent) return { text, abilityType: 'triggered', triggerEvent, automation: 'assisted', reason: 'Trigger timing is recognized. Unsupported resolution text remains visible for manual completion.', effects: program?.steps || [] };
      return { text, abilityType: 'triggered', triggerEvent: null, automation: 'manual', reason: 'Forge recognizes this as a trigger but cannot safely determine its event yet.', effects: [] };
    }

    if (text.includes(':')) {
      return { text, abilityType: 'activated', automation: 'assisted', reason: 'Activated ability is surfaced on the battlefield; unsupported instructions remain manual.', effects: [] };
    }

    try {
      const staticResult = base?.compileStaticAbilities?.(text, { cardName });
      if (staticResult?.staticAbilities?.length) return { text, abilityType: 'static', automation: 'automatic', reason: 'Static restriction is enforced by the rules engine.', effects: staticResult.staticAbilities };
    } catch {}

    return { text, abilityType: 'static-or-special', automation: 'manual', reason: 'No safe general adapter exists for this ability yet; Forge will not silently ignore it.', effects: [] };
  }

  function compileCardAbilities(input, options = {}) {
    const cardName = options.cardName || input?.name || '';
    const abilities = abilityLines(input).map((line) => classifyAbility(line, cardName));
    const automated = abilities.filter((a) => a.automation === 'automatic').length;
    const assisted = abilities.filter((a) => a.automation === 'assisted').length;
    const manual = abilities.filter((a) => a.automation === 'manual').length;
    return {
      compilerVersion: VERSION,
      cardName,
      oracleText: textOf(input),
      abilities,
      automated,
      assisted,
      manual,
      coverage: abilities.length ? (automated + assisted) / abilities.length : 1,
      completeInventory: true,
    };
  }

  root.CommanderForgeOracleCompilerV8 = Object.freeze({
    VERSION,
    abilityLines,
    triggerClause,
    triggerEventFromClause,
    effectText,
    classifyAbility,
    compileCardAbilities,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
