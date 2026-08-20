/*
 * Commander Forge Oracle Compiler V7
 * Conservative Oracle text -> ordered instruction compiler.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CommanderForgeOracleCompilerV7 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '7.2.0-static-restrictions';
  const WORD_NUMBERS = Object.freeze({
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12,
  });

  const SAFE_FOLLOW_UP_TYPES = new Set([
    'SEARCH_LIBRARY',
    'DRAW',
    'MILL',
    'GAIN_LIFE',
    'LOSE_LIFE',
    'SHUFFLE_LIBRARY',
    'BECOME_MONARCH',
  ]);

  function numberFromWord(value, fallback = 1) {
    const raw = String(value ?? '').trim().toLocaleLowerCase();
    if (/^\d+$/.test(raw)) return Number(raw);
    return WORD_NUMBERS[raw] ?? fallback;
  }

  function normalizeOracle(text = '') {
    return String(text || '').replace(/\u2212/g, '-').replace(/\s+/g, ' ').trim();
  }

  function stripReminderText(text = '') {
    return String(text || '').replace(/\s*\([^()]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function splitSentences(text = '') {
    const clean = stripReminderText(String(text || '').replace(/\n+/g, ' '));
    if (!clean) return [];
    const matches = clean.match(/[^.!?]+(?:[.!?]+|$)/g) || [clean];
    return matches.map((part) => part.trim().replace(/[.!?]+$/, '').trim()).filter(Boolean);
  }

  function normalizeFilter(raw = '') {
    let filter = String(raw || '').trim();
    filter = filter.replace(/^up to\s+/i, '');
    filter = filter.replace(/^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+/i, '');
    filter = filter.replace(/\bcards?\s*$/i, '').trim();
    if (!filter || /^(?:a|an|any)?\s*$/i.test(filter)) return 'card';
    return filter;
  }

  function parseSearchLibrary(sentence) {
    const clean = normalizeOracle(sentence);
    if (!/^search your library for\b/i.test(clean)) return null;

    const head = clean.match(
      /^search your library for\s+(up to\s+)?(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(.+?\bcards?)(?=,|\s+then\b|\s+and\b|$)/i
    );
    if (!head) return null;

    const zeroAllowed = Boolean(head[1]);
    const maxCount = Math.max(1, numberFromWord(head[2], 1));
    const filterText = normalizeFilter(head[3]);

    let destination = null;
    if (/\bput\s+(?:it|that card|the card|them|those cards|the chosen cards?)\s+(?:onto|on)\s+the battlefield\b/i.test(clean)) {
      destination = 'battlefield';
    } else if (/\bput\s+(?:it|that card|the card|them|those cards|the chosen cards?)\s+into your hand\b/i.test(clean)) {
      destination = 'hand';
    } else if (/\bput\s+(?:it|that card|the card|them|those cards|the chosen cards?)\s+into your graveyard\b/i.test(clean)) {
      destination = 'graveyard';
    } else if (/\bput\s+(?:it|that card|the card|them|those cards|the chosen cards?)\s+into exile\b/i.test(clean)) {
      destination = 'exile';
    } else if (
      /\bput\s+(?:it|that card|the card|them|those cards|the chosen cards?)\s+(?:on|onto)\s+top(?: of (?:your|the) library)?\b/i.test(clean)
      || /\bput\s+(?:it|that card|the card|them|those cards|the chosen cards?)\s+on top\b/i.test(clean)
    ) {
      destination = 'library-top';
    }

    const shuffle = /\bshuffle\b/i.test(clean);
    const shuffleBeforePlacement = Boolean(
      destination === 'library-top'
      && /\bshuffle(?: your library)?\s+and\s+put\b/i.test(clean)
    );

    if (!destination) {
      return { type: 'UNSUPPORTED', text: clean, reason: 'Library search destination was not understood.' };
    }

    return {
      type: 'SEARCH_LIBRARY',
      player: 'YOU',
      filterText,
      maxCount,
      zeroAllowed,
      destination,
      tapped: destination === 'battlefield' && /\bbattlefield tapped\b/i.test(clean),
      reveal: /\breveal\s+(?:it|that card|them|those cards)\b/i.test(clean),
      shuffle,
      shuffleBeforePlacement,
      text: clean,
    };
  }

  function parseSimpleSentence(sentence) {
    const clean = normalizeOracle(sentence);
    let match;

    const search = parseSearchLibrary(clean);
    if (search) return search;

    if ((match = clean.match(/^you lose\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+life$/i))) {
      return { type: 'LOSE_LIFE', player: 'YOU', amount: numberFromWord(match[1], 1), text: clean };
    }
    if ((match = clean.match(/^you gain\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+life$/i))) {
      return { type: 'GAIN_LIFE', player: 'YOU', amount: numberFromWord(match[1], 1), text: clean };
    }
    if ((match = clean.match(/^(?:you\s+)?draw\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+cards?$/i))) {
      return { type: 'DRAW', player: 'YOU', amount: numberFromWord(match[1], 1), text: clean };
    }
    if ((match = clean.match(/^(?:you\s+)?mill\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+cards?$/i))) {
      return { type: 'MILL', player: 'YOU', amount: numberFromWord(match[1], 1), text: clean };
    }
    if (/^shuffle your library$/i.test(clean) || /^then shuffle$/i.test(clean)) {
      return { type: 'SHUFFLE_LIBRARY', player: 'YOU', text: clean };
    }
    if (/^you become the monarch$/i.test(clean)) {
      return { type: 'BECOME_MONARCH', player: 'YOU', text: clean };
    }

    // Additional reusable IR shapes are compiled for diagnostics, but they are
    // not yet live-authoritative in this first adapter.
    if ((match = clean.match(/^sacrifice\s+(?:a|an|one)\s+(.+)$/i))) {
      return { type: 'SACRIFICE', player: 'YOU', filterText: match[1].trim(), text: clean };
    }
    if (/^discard\s+(?:a|an|one)\s+card$/i.test(clean)) {
      return { type: 'DISCARD', player: 'YOU', amount: 1, text: clean };
    }
    if ((match = clean.match(/^destroy target\s+(.+)$/i))) {
      return { type: 'DESTROY', target: match[1].trim(), text: clean };
    }
    if ((match = clean.match(/^exile target\s+(.+)$/i))) {
      return { type: 'EXILE', target: match[1].trim(), text: clean };
    }
    if ((match = clean.match(/^put\s+(?:a|an|one)\s+([+-]\d+\/[+-]\d+)\s+counter on target\s+(.+)$/i))) {
      return { type: 'ADD_COUNTER', counter: match[1], target: match[2].trim(), amount: 1, text: clean };
    }
    if ((match = clean.match(/^target\s+(.+)\s+fights target\s+(.+)$/i))) {
      return { type: 'FIGHT', firstTarget: match[1].trim(), secondTarget: match[2].trim(), text: clean };
    }

    return { type: 'UNSUPPORTED', text: clean, reason: 'No safe Oracle primitive matched this sentence.' };
  }

  function parseAttackCostStatics(input = '') {
    const oracleText = typeof input === 'string'
      ? input
      : String(input?.oracle_text ?? input?.oracleText ?? '');

    const clean = normalizeOracle(oracleText);
    const results = [];

    // Generic family:
    // "Creatures can't attack you [or planeswalkers you control] unless their
    // controller pays {N} for each ... attacking you / each of those creatures."
    //
    // This covers the Propaganda / Ghostly Prison / Windborn Muse wording,
    // plus "as long as this is untapped" variants and Sphere of Safety's {X}.
    const pattern = /(?:(as long as [^.]+?,)\s*)?creatures can't attack you(?: or planeswalkers you control)? unless their controller pays\s+((?:\{[^}]+\})+)\s+for each\s+(?:creature they control that's attacking you|of those creatures)(?:,\s*where x is the number of enchantments you control)?/ig;

    let match;
    while ((match = pattern.exec(clean))) {
      const conditionText = String(match[1] || '').trim();
      const costTemplate = String(match[2] || '').trim();
      const dynamicEnchantments = /\{X\}/i.test(costTemplate)
        && /where x is the number of enchantments you control/i.test(match[0]);

      results.push({
        type: 'ATTACK_COST',
        appliesTo: 'YOU',
        alsoPlaneswalkers: /or planeswalkers you control/i.test(match[0]),
        perAttackerCost: costTemplate,
        dynamicAmount: dynamicEnchantments ? 'ENCHANTMENTS_YOU_CONTROL' : null,
        sourceMustBeUntapped: /\bas long as\b.*\bis untapped\b/i.test(conditionText),
        conditionText,
        text: match[0],
      });
    }

    return results;
  }

  function parseStaticRestrictions(input = '') {
    const oracleText = typeof input === 'string'
      ? input
      : String(input?.oracle_text ?? input?.oracleText ?? '');

    const clean = normalizeOracle(oracleText);
    const results = [];

    function subjectFromPrefix(prefix) {
      const value = String(prefix || '').toLocaleLowerCase().trim();
      if (value.startsWith('your opponents')) return 'OPPONENTS';
      if (value.startsWith('opponents')) return 'OPPONENTS';
      if (value.startsWith('players')) return 'ALL_PLAYERS';
      return null;
    }

    // Void Winnower family:
    // "Your opponents can't cast spells with even mana values."
    // "Your opponents can't block with creatures with even mana values."
    //
    // The parser deliberately supports odd as well so the rule primitive is
    // about parity, not about one card name.
    const castParity = /\b(your opponents|opponents|players) can't cast spells with (even|odd) mana values?\b/ig;
    let match;
    while ((match = castParity.exec(clean))) {
      results.push({
        type: 'CAST_PROHIBITION',
        appliesTo: subjectFromPrefix(match[1]),
        predicate: {
          property: 'MANA_VALUE_PARITY',
          parity: String(match[2]).toLocaleUpperCase(),
        },
        text: match[0],
      });
    }

    const blockParity = /\b(your opponents|opponents|players) can't block with creatures with (even|odd) mana values?\b/ig;
    while ((match = blockParity.exec(clean))) {
      results.push({
        type: 'BLOCK_PROHIBITION',
        appliesTo: subjectFromPrefix(match[1]),
        predicate: {
          property: 'MANA_VALUE_PARITY',
          parity: String(match[2]).toLocaleUpperCase(),
        },
        text: match[0],
      });
    }

    // Generic fixed/comparative mana-value prohibitions.
    const castCompare = /\b(your opponents|opponents|players) can't cast (creature |noncreature )?spells with mana value (greater than or equal to|less than or equal to|greater than|less than|equal to|exactly)\s+(\d+)\b/ig;
    while ((match = castCompare.exec(clean))) {
      const operatorMap = {
        'greater than or equal to': 'GTE',
        'less than or equal to': 'LTE',
        'greater than': 'GT',
        'less than': 'LT',
        'equal to': 'EQ',
        'exactly': 'EQ',
      };
      results.push({
        type: 'CAST_PROHIBITION',
        appliesTo: subjectFromPrefix(match[1]),
        cardType: String(match[2] || '').trim().toLocaleUpperCase() || 'ANY',
        predicate: {
          property: 'MANA_VALUE_COMPARE',
          operator: operatorMap[String(match[3]).toLocaleLowerCase()],
          value: Number(match[4]),
        },
        text: match[0],
      });
    }

    const blockCompare = /\b(your opponents|opponents|players) can't block with creatures with mana value (greater than or equal to|less than or equal to|greater than|less than|equal to|exactly)\s+(\d+)\b/ig;
    while ((match = blockCompare.exec(clean))) {
      const operatorMap = {
        'greater than or equal to': 'GTE',
        'less than or equal to': 'LTE',
        'greater than': 'GT',
        'less than': 'LT',
        'equal to': 'EQ',
        'exactly': 'EQ',
      };
      results.push({
        type: 'BLOCK_PROHIBITION',
        appliesTo: subjectFromPrefix(match[1]),
        predicate: {
          property: 'MANA_VALUE_COMPARE',
          operator: operatorMap[String(match[2]).toLocaleLowerCase()],
          value: Number(match[3]),
        },
        text: match[0],
      });
    }

    // Common global casting restrictions already partly understood by legacy
    // code, now exposed through the same descriptor model.
    if (/\bplayers can't cast spells from graveyards\b/i.test(clean)) {
      results.push({
        type: 'CAST_PROHIBITION',
        appliesTo: 'ALL_PLAYERS',
        sourceZone: 'graveyard',
        predicate: { property: 'ANY' },
        text: 'Players can’t cast spells from graveyards.',
      });
    }

    if (/\byour opponents can't cast spells during your turn\b/i.test(clean)) {
      results.push({
        type: 'CAST_PROHIBITION',
        appliesTo: 'OPPONENTS',
        timing: 'SOURCE_CONTROLLER_TURN',
        predicate: { property: 'ANY' },
        text: 'Your opponents can’t cast spells during your turn.',
      });
    }

    // Rule-of-Law family.
    const spellLimit = clean.match(/\b(?:each player|players) can't cast more than (one|1) spell each turn\b/i);
    if (spellLimit) {
      results.push({
        type: 'CAST_LIMIT',
        appliesTo: 'ALL_PLAYERS',
        limitPerTurn: 1,
        predicate: { property: 'ANY' },
        text: spellLimit[0],
      });
    }

    return results;
  }

  function compileStaticAbilities(input, options = {}) {
    const oracleText = typeof input === 'string'
      ? input
      : String(input?.oracle_text ?? input?.oracleText ?? '');

    const staticAbilities = [
      ...parseAttackCostStatics(oracleText),
      ...parseStaticRestrictions(oracleText),
    ];

    return {
      compilerVersion: VERSION,
      cardName: options.cardName || input?.name || '',
      oracleText,
      staticAbilities,
      recognized: staticAbilities.length,
    };
  }

  function compileProgram(input, options = {}) {
    const oracleText = typeof input === 'string'
      ? input
      : String(input?.oracle_text ?? input?.oracleText ?? '');

    const sentences = splitSentences(oracleText);
    const steps = sentences.map(parseSimpleSentence);
    const unsupported = steps.filter((step) => step.type === 'UNSUPPORTED');
    const coverage = sentences.length ? (sentences.length - unsupported.length) / sentences.length : 1;

    // First live adapter: ordered programs that begin with a private library
    // choice, followed only by safe automatic primitives. This avoids resolving
    // triggered abilities early just because they were queued.
    const authoritative = steps.length > 0
      && steps[0].type === 'SEARCH_LIBRARY'
      && unsupported.length === 0
      && steps.every((step) => SAFE_FOLLOW_UP_TYPES.has(step.type));

    return {
      compilerVersion: VERSION,
      cardName: options.cardName || input?.name || '',
      oracleText,
      steps,
      unsupported,
      coverage,
      authoritative,
      keepTogether: authoritative,
    };
  }

  function diagnostics(input, options = {}) {
    const program = compileProgram(input, options);
    return {
      compilerVersion: program.compilerVersion,
      authoritative: program.authoritative,
      coverage: program.coverage,
      stepTypes: program.steps.map((step) => step.type),
      unsupported: program.unsupported.map((step) => ({ text: step.text, reason: step.reason })),
    };
  }

  return {
    VERSION,
    SAFE_FOLLOW_UP_TYPES: [...SAFE_FOLLOW_UP_TYPES],
    numberFromWord,
    normalizeOracle,
    splitSentences,
    parseSearchLibrary,
    parseSimpleSentence,
    parseAttackCostStatics,
    parseStaticRestrictions,
    compileStaticAbilities,
    compileProgram,
    diagnostics,
  };
});
