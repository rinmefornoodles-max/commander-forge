# Ability coverage UI and manual combat-damage trigger helper in card inspector.
needle="""function renderInspector(state) {\n"""
insert="""function renderAbilityCoverage(card) {\n  const report = abilityCoverageForCard(card);\n  const abilities = report?.abilities || [];\n  if (!abilities.length) return '';\n  const badge = (ability) => ability.automation === 'automatic'\n    ? '<span class=\"compiler-ready\">✓ Automated</span>'\n    : ability.automation === 'assisted'\n      ? '<span class=\"compiler-warning\">◐ Assisted</span>'\n      : '<span class=\"compiler-warning\">⚠ Manual</span>';\n  return `<div class=\"inspector-section\"><h3>Ability coverage</h3><div class=\"ability-list\">${abilities.map((ability) => `<div class=\"compiler-status ${ability.automation === 'automatic' ? 'ready' : 'partial'}\">${badge(ability)}<span class=\"small\">${escapeHtml(ability.text || '')}</span>${ability.reason ? `<span class=\"small muted\">${escapeHtml(ability.reason)}</span>` : ''}</div>`).join('')}</div><p class=\"small muted\">Forge never treats an unrecognized ability as if it does nothing. Unsupported text stays visible here and is resolved manually until an adapter is added.</p></div>`;\n}\n\nfunction renderCombatDamageTriggerActions(card, selected, state) {\n  if (selected.zone !== 'battlefield') return '';\n  const traits = cardTraits(card, state.players?.[card.controller]?.zones?.battlefield || []);\n  if (!traits.combatDamageTrigger) return '';\n  const targets = Object.values(state.players || {}).filter((player) => player.id !== (card.controller || card.owner) && !player.lost);\n  if (!targets.length) return '';\n  return `<div class=\"mana-choice-group\"><div class=\"small muted wide\"><strong>Combat-damage trigger helper.</strong> Use this only when combat was resolved manually and this creature actually dealt combat damage to that player.</div>${targets.map((player) => `<button class=\"btn primary\" data-action=\"report-combat-damage\" data-card-id=\"${card.instanceId}\" data-target-player-id=\"${player.id}\">Hit ${escapeHtml(player.name)} — queue trigger</button>`).join('')}</div>`;\n}\n\nfunction renderInspector(state) {\n"""
rep(needle,insert,'ability coverage renderer')
rep("""      ${selected.zone === 'battlefield' ? `${renderManaTapActions(card, state)}<button class=\"btn\" data-action=\"toggle-attack\" data-card-id=\"${card.instanceId}\">${card.attacking ? 'Stop attack' : '⚔ Attack'}</button>${renderBlockActions(card, state)}${renderAttachActions(card, state)}` : ''}\n""", """      ${selected.zone === 'battlefield' ? `${renderManaTapActions(card, state)}<button class=\"btn\" data-action=\"toggle-attack\" data-card-id=\"${card.instanceId}\">${card.attacking ? 'Stop attack' : '⚔ Attack'}</button>${renderCombatDamageTriggerActions(card, selected, state)}${renderBlockActions(card, state)}${renderAttachActions(card, state)}` : ''}\n""", 'inspector combat helper')
rep("""    <div class=\"inspector-section\"><h3>Oracle text</h3><div class=\"oracle\">${escapeHtml(card.oracleText || 'No Oracle text.')}</div>${renderOracleCompilerDiagnostic(card)}${effects.length ? `<p class=\"small muted\">Recognized: ${effects.map(escapeHtml).join(' · ')}</p>` : ''}</div>\n""", """    <div class=\"inspector-section\"><h3>Oracle text</h3><div class=\"oracle\">${escapeHtml(card.oracleText || 'No Oracle text.')}</div>${renderOracleCompilerDiagnostic(card)}${effects.length ? `<p class=\"small muted\">Recognized: ${effects.map(escapeHtml).join(' · ')}</p>` : ''}</div>\n    ${renderAbilityCoverage(card)}\n""", 'inspector ability coverage')

# Keep multi-sentence triggered ability paragraphs together and understand ability-word labels.
rep(r"""function oracleAbilityLines(card) {
  return String(card?.oracleText || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z{])/))
    .map((line) => line.trim())
    .filter(Boolean);
}
""", r"""function oracleAbilityLines(card) {
  return String(card?.oracleText || '')
    .split(/\n+/)
    .flatMap((line) => {
      const clean = String(line || '').trim();
      // A triggered ability often contains multiple effect sentences in one
      // Oracle paragraph. Keep that paragraph together so follow-up clauses
      // such as \"If you did...\" are not detached from their trigger.
      const triggerish = /^(?:when|whenever|at)\b/i.test(clean)
        || /^[^—\n]+—\s*(?=(?:when|whenever|at)\b)/i.test(clean);
      return triggerish ? [clean] : clean.split(/(?<=[.!?])\s+(?=[A-Z{])/);
    })
    .map((line) => line.trim())
    .filter(Boolean);
}
""", 'trigger paragraph preservation')

rep(r"""function effectResolutionText(text = '') {
  const raw = String(text || '').trim();
  if (/^(?:when|whenever|at)\b/i.test(raw)) {
    const comma = raw.indexOf(',');
    if (comma >= 0) return raw.slice(comma + 1).trim();
  }
  const colon = raw.indexOf(':');
  if (colon >= 0 && !/^https?:/i.test(raw)) return raw.slice(colon + 1).trim();
  return raw;
}
""", r"""function effectResolutionText(text = '') {
  let raw = String(text || '').trim();
  raw = raw.replace(/^[^—\n]+—\s*(?=(?:when|whenever|at)\b)/i, '').trim();
  if (/^(?:when|whenever|at)\b/i.test(raw)) {
    const comma = raw.indexOf(',');
    if (comma >= 0) return raw.slice(comma + 1).trim();
  }
  const colon = raw.indexOf(':');
  if (colon >= 0 && !/^https?:/i.test(raw)) return raw.slice(colon + 1).trim();
  return raw;
}
""", 'ability-word resolution text')

rep(r"""function triggerConditionClause(line = '') {
  const raw = String(line || '').trim();
  if (!/^(?:when|whenever|at)\b/i.test(raw)) return '';
  const comma = raw.indexOf(',');
  return (comma >= 0 ? raw.slice(0, comma) : raw).trim();
}
""", r"""function triggerConditionClause(line = '') {
  let raw = String(line || '').trim();
  // Ability words such as \"Starscourge —\" and \"Landfall —\" are labels,
  // not part of the trigger condition. Strip them before event matching.
  raw = raw.replace(/^[^—\n]+—\s*(?=(?:when|whenever|at)\b)/i, '').trim();
  if (!/^(?:when|whenever|at)\b/i.test(raw)) return '';
  const comma = raw.indexOf(',');
  return (comma >= 0 ? raw.slice(0, comma) : raw).trim();
}
""", 'ability-word trigger condition')

# Export new game helpers and import them into the UI module.
rep("""return { attachmentTargetLegality, castAuraTargeting, testOverrideMove, changeControl, castPublicCardForFree, putPublicCardOntoBattlefield, playPublicLand, moveCard, sacrificePermanent, removeToken, tapForMana, toggleTap, toggleAttack, addCounter, updateManualKeyword, createToken, copyAsToken, adjustPlayer, adjustCommanderDamage, adjustMana, clearMana, draw, mill, shuffleLibrary, nextPhase, setPhase, switchActivePlayer, resolveStackTop, counterStackTop, mulligan, keepOpeningHand, concede, queueManualEffect, activateBattlefieldAbility, setPendingEffectCondition, resolvePendingEffect, smartPendingEffectState, smartLibraryDestinationLabel, resolveSmartLibraryEffect, resolveSmartPendingEffect, resolveSmartPendingEffectMulti, resolveSmartPendingEffectNoResult, resolveSmartFightEffect, clearCombatMarkers, battlefieldActivatedAbilities, updateCardNote, flipCard, revealTop, revealTopPublicly, revealCardPublicly, resolvePrivateLibraryDecision, assignBlocker, attachCard, ninjutsuOptions, activateNinjutsu, mutateOptions, mutateStatus, isHumanCreature, castForMutate };
""", """return { attachmentTargetLegality, castAuraTargeting, testOverrideMove, changeControl, castPublicCardForFree, putPublicCardOntoBattlefield, playPublicLand, moveCard, sacrificePermanent, removeToken, tapForMana, toggleTap, toggleAttack, reportCombatDamage, processResolvedCombatEvents, addCounter, updateManualKeyword, createToken, copyAsToken, adjustPlayer, adjustCommanderDamage, adjustMana, clearMana, draw, mill, shuffleLibrary, nextPhase, setPhase, switchActivePlayer, resolveStackTop, counterStackTop, mulligan, keepOpeningHand, concede, queueManualEffect, activateBattlefieldAbility, setPendingEffectCondition, resolvePendingEffect, smartPendingEffectState, smartLibraryDestinationLabel, resolveSmartLibraryEffect, resolveSmartPendingEffect, resolveSmartRandomEffect, resolveSmartPendingEffectMulti, resolveSmartPendingEffectNoResult, resolveSmartFightEffect, abilityCoverageForCard, clearCombatMarkers, battlefieldActivatedAbilities, updateCardNote, flipCard, revealTop, revealTopPublicly, revealCardPublicly, resolvePrivateLibraryDecision, assignBlocker, attachCard, ninjutsuOptions, activateNinjutsu, mutateOptions, mutateStatus, isHumanCreature, castForMutate };
""", 'game exports')

rep("""const { buildStrategyProfile, strategyLabel } = __modules[\"./strategy-profile.js\"];
""", """const { buildStrategyProfile, strategyLabel } = __modules[\"./strategy-profile.js\"];
const { cardTraits } = __modules[\"./card-evaluation.js\"];
""", 'main cardTraits import')

rep("""const { addCounter, updateManualKeyword, assignBlocker, attachCard, attachmentTargetLegality, castAuraTargeting, testOverrideMove, changeControl, castPublicCardForFree, putPublicCardOntoBattlefield, playPublicLand, activateBattlefieldAbility, battlefieldActivatedAbilities, adjustCommanderDamage, adjustMana, adjustPlayer, clearMana, copyAsToken, counterStackTop, createToken, draw, flipCard, mill, moveCard, sacrificePermanent, removeToken, mulligan, keepOpeningHand, concede, nextPhase, queueManualEffect, resolvePendingEffect, smartPendingEffectState, smartLibraryDestinationLabel, resolveSmartLibraryEffect, resolveSmartPendingEffect, resolveSmartPendingEffectMulti, resolveSmartPendingEffectNoResult, resolveSmartFightEffect, resolveStackTop, setPendingEffectCondition, clearCombatMarkers, revealCardPublicly, revealTopPublicly, resolvePrivateLibraryDecision, setPhase, shuffleLibrary, switchActivePlayer, toggleAttack, toggleTap, tapForMana, updateCardNote, ninjutsuOptions, activateNinjutsu, mutateOptions, mutateStatus, isHumanCreature, castForMutate } = __modules[\"./game.js\"];
""", """const { addCounter, updateManualKeyword, assignBlocker, attachCard, attachmentTargetLegality, castAuraTargeting, testOverrideMove, changeControl, castPublicCardForFree, putPublicCardOntoBattlefield, playPublicLand, activateBattlefieldAbility, battlefieldActivatedAbilities, adjustCommanderDamage, adjustMana, adjustPlayer, clearMana, copyAsToken, counterStackTop, createToken, draw, flipCard, mill, moveCard, sacrificePermanent, removeToken, mulligan, keepOpeningHand, concede, nextPhase, queueManualEffect, resolvePendingEffect, smartPendingEffectState, smartLibraryDestinationLabel, resolveSmartLibraryEffect, resolveSmartPendingEffect, resolveSmartRandomEffect, resolveSmartPendingEffectMulti, resolveSmartPendingEffectNoResult, resolveSmartFightEffect, resolveStackTop, setPendingEffectCondition, clearCombatMarkers, revealCardPublicly, revealTopPublicly, resolvePrivateLibraryDecision, setPhase, shuffleLibrary, switchActivePlayer, toggleAttack, reportCombatDamage, processResolvedCombatEvents, toggleTap, tapForMana, updateCardNote, ninjutsuOptions, activateNinjutsu, mutateOptions, mutateStatus, isHumanCreature, castForMutate, abilityCoverageForCard } = __modules[\"./game.js\"];
""", 'main game imports')
