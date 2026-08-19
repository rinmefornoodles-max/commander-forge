'use strict';
importScripts('./commander-forge-engine-v6.js');
importScripts('./commander-forge-oracle-compiler-v6.js');
const { createEngine } = self.CommanderForgeRulesV6;
const engine = createEngine({ commander: true, strict: true });

function reply(id, ok, payload) {
  postMessage({ id, ok, ...(ok ? { result: payload } : { error: payload }) });
}

self.onmessage = (event) => {
  const msg = event.data || {};
  try {
    let result = null;
    switch (msg.type) {
      case 'PING':
        result = { version: self.CommanderForgeRulesV6.ENGINE_VERSION, status: 'ready' };
        break;
      case 'CREATE_GAME':
        result = engine.createGame(msg.players || []);
        break;
      case 'REGISTER_DEFINITIONS':
        engine.registerDefinitions(msg.definitions || []);
        result = { count: msg.definitions?.length || 0 };
        break;
      case 'ADD_CARD':
        result = engine.addCard(msg.definitionId, msg.ownerId, msg.zone, msg.options || {});
        break;
      case 'LOAD_SNAPSHOT':
        result = engine.loadSnapshot(msg.state);
        break;
      case 'IMPORT_LEGACY_STATE': {
        const shadow = engine.importLegacyState(msg.state);
        const seen = new Set();
        let compiled = 0; let unsupportedClauses = 0;
        for (const p of Object.values(msg.state?.players || {})) {
          for (const cards of Object.values(p.zones || {})) {
            for (const card of cards || []) {
              const key = card.oracleId || card.scryfallId || card.name;
              if (!key || seen.has(key)) continue; seen.add(key);
              const out = self.CommanderForgeOracleCompilerV6.compileCard({
                id: card.scryfallId || card.id, oracle_id: card.oracleId, name: card.name,
                type_line: card.typeLine, mana_cost: card.manaCost, oracle_text: card.oracleText,
                power: card.power, toughness: card.toughness
              });
              engine.registerDefinition(out.definition); compiled += 1; unsupportedClauses += out.unsupported.length;
            }
          }
        }
        result = { shadow, compiled: { cards: compiled, unsupportedClauses } };
        break;
      }
      case 'COMPILE_CARD': {
        result = self.CommanderForgeOracleCompilerV6.compileCard(msg.card || {});
        if (msg.register !== false) engine.registerDefinition(result.definition);
        break;
      }
      case 'GET_STATE':
        result = engine.snapshot();
        break;
      case 'GET_LEGAL_ACTIONS':
        result = engine.legalActions(msg.playerId);
        break;
      case 'PERFORM_ACTION':
        result = engine.performAction(msg.action || {});
        break;
      case 'RESOLVE_TOP':
        result = engine.resolveTop(msg.options || {});
        break;
      case 'VALIDATE_TARGET_SELECTION':
        result = engine.validateTargetSelection(msg.spec || {}, msg.ids || [], msg.context || {});
        break;
      case 'UNDO':
        result = engine.undo();
        break;
      default:
        throw new Error(`Unknown worker message: ${msg.type}`);
    }
    reply(msg.id, true, result);
  } catch (err) {
    reply(msg.id, false, { message: err?.message || String(err), code: err?.code || 'ENGINE_ERROR', data: err?.data || null });
  }
};
