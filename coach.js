import { PHASES } from './constants.js';
import { attackLegality, canPayMana } from './rules.js';
import { deepClone, isCreature, isLand, isPermanent, numericStat, totalMana } from './utils.js';

export function possibleMoves(state, playerId = state.activePlayerId) {
  const player = state.players[playerId];
  const opponentId = Object.keys(state.players).find((id) => id !== playerId);
  const moves = [];
  const phase = PHASES[state.phaseIndex].id;

  for (const card of player.zones.hand) {
    if (isLand(card)) {
      if (['main1', 'main2'].includes(phase) && player.landPlaysThisTurn < 1) moves.push({ type: 'play-land', cardId: card.instanceId, label: `Play ${card.name}` });
    } else {
      const instantSpeed = card.typeLine.includes('Instant') || (card.keywords || []).includes('Flash');
      if ((['main1', 'main2'].includes(phase) || instantSpeed) && canPayMana(player.mana, card.manaCost, 0).ok) {
        moves.push({ type: isPermanent(card) ? 'cast-permanent' : 'cast-spell', cardId: card.instanceId, label: `Cast ${card.name}` });
      }
    }
  }
  for (const card of player.zones.command) {
    const tax = 2 * (player.commanderCastCount[card.instanceId] || 0);
    if ((['main1', 'main2'].includes(phase) || (card.keywords || []).includes('Flash')) && canPayMana(player.mana, card.manaCost, tax).ok) {
      moves.push({ type: 'cast-commander', cardId: card.instanceId, label: `Cast ${card.name}${tax ? ` (+${tax} tax)` : ''}` });
    }
  }

  const castMoves = moves.filter((move) => ['cast-permanent', 'cast-spell'].includes(move.type)).slice(0, 7);
  for (let i = 0; i < castMoves.length; i += 1) {
    for (let j = i + 1; j < castMoves.length; j += 1) {
      const first = player.zones.hand.find((card) => card.instanceId === castMoves[i].cardId);
      const second = player.zones.hand.find((card) => card.instanceId === castMoves[j].cardId);
      if (first && second && Number(first.manaValue || 0) + Number(second.manaValue || 0) <= totalMana(player.mana)) {
        moves.push({ type: 'sequence', steps: [castMoves[i], castMoves[j]], label: `${castMoves[i].label} → ${castMoves[j].label.replace(/^Cast /, '')}` });
      }
      if (moves.filter((move) => move.type === 'sequence').length >= 8) break;
    }
  }

  const attackers = player.zones.battlefield.filter((card) => attackLegality(state, card).legal);
  if (attackers.length) {
    attackers.slice(0, 8).forEach((card) => moves.push({ type: 'attack', cardIds: [card.instanceId], opponentId, label: `Attack with ${card.name}` }));
    if (attackers.length > 1) moves.push({ type: 'attack', cardIds: attackers.map((card) => card.instanceId), opponentId, label: 'Attack with all legal creatures' });
  }
  moves.push({ type: 'hold', label: 'Pass / hold resources' });
  return moves;
}

export function analyzePosition(state, playerId = state.activePlayerId, rollouts = state.settings.coachRollouts || 450) {
  const moves = possibleMoves(state, playerId);
  const results = moves.map((move) => evaluateMove(state, playerId, move, rollouts));
  results.sort((a, b) => b.score - a.score);
  return { moves, results, baseline: boardScore(state, playerId), rollouts };
}

function evaluateMove(state, playerId, move, rollouts) {
  let total = 0;
  let high = -Infinity;
  let low = Infinity;
  for (let i = 0; i < rollouts; i += 1) {
    const simulated = applyApproximateMove(state, playerId, move);
    const uncertainty = hiddenInformationNoise(simulated, playerId, move);
    const score = boardScore(simulated, playerId) + uncertainty;
    total += score;
    high = Math.max(high, score);
    low = Math.min(low, score);
  }
  const average = total / Math.max(1, rollouts);
  return {
    ...move,
    score: Number(average.toFixed(2)),
    range: [Number(low.toFixed(1)), Number(high.toFixed(1))],
    explanation: explainMove(state, playerId, move, average),
  };
}

function applyApproximateMove(state, playerId, move) {
  const draft = deepClone(state);
  const player = draft.players[playerId];
  const opponentId = Object.keys(draft.players).find((id) => id !== playerId);
  const opponent = draft.players[opponentId];
  const findIn = (zone, id) => player.zones[zone].find((card) => card.instanceId === id);

  if (move.type === 'sequence') {
    let sequenceState = draft;
    for (const step of move.steps || []) sequenceState = applyApproximateMove(sequenceState, playerId, step);
    return sequenceState;
  }
  if (move.type === 'play-land') {
    const card = findIn('hand', move.cardId);
    if (card) {
      player.zones.hand = player.zones.hand.filter((c) => c.instanceId !== card.instanceId);
      player.zones.battlefield.push(card);
      player.landPlaysThisTurn += 1;
    }
  }
  if (['cast-permanent', 'cast-spell', 'cast-commander'].includes(move.type)) {
    const source = move.type === 'cast-commander' ? 'command' : 'hand';
    const card = findIn(source, move.cardId);
    if (card) {
      player.zones[source] = player.zones[source].filter((c) => c.instanceId !== card.instanceId);
      if (move.type === 'cast-spell') player.zones.graveyard.push(card);
      else {
        card.summoningSick = isCreature(card);
        player.zones.battlefield.push(card);
      }
    }
  }
  if (move.type === 'attack') {
    const attackers = player.zones.battlefield.filter((card) => move.cardIds.includes(card.instanceId));
    const blockers = opponent.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
    const sortedAttackers = [...attackers].sort((a, b) => numericStat(b.power) - numericStat(a.power));
    const sortedBlockers = [...blockers].sort((a, b) => numericStat(b.toughness) - numericStat(a.toughness));
    let damage = 0;
    sortedAttackers.forEach((attacker, index) => {
      const blocker = sortedBlockers[index];
      if (!blocker || (attacker.keywords || []).includes('Unblockable')) damage += numericStat(attacker.power, 1);
      else if ((attacker.keywords || []).includes('Trample')) damage += Math.max(0, numericStat(attacker.power) - numericStat(blocker.toughness));
    });
    opponent.life -= damage;
  }
  return draft;
}

function boardScore(state, playerId) {
  const opponentId = Object.keys(state.players).find((id) => id !== playerId);
  return playerScore(state.players[playerId]) - playerScore(state.players[opponentId]);
}

function playerScore(player) {
  let score = player.life * 0.35 - player.poison * 3.5 + player.zones.hand.length * 2.3 + player.zones.library.length * 0.015;
  for (const card of player.zones.battlefield) {
    score += (card.manaValue || 0) * 1.2;
    if (isCreature(card)) score += numericStat(card.power, 1) * 0.85 + numericStat(card.toughness, 1) * 0.55;
    const keywordWeight = { Flying: 1.1, Trample: 0.8, Deathtouch: 1.1, 'Double strike': 1.8, 'First strike': 0.7, Haste: 0.5, Hexproof: 1.4, Indestructible: 1.6, Lifelink: 0.8, Vigilance: 0.5 };
    for (const keyword of card.keywords || []) score += keywordWeight[keyword] || 0.15;
    if (card.commander) score += 2;
    if (card.tapped) score -= 0.25;
    score += Object.values(card.counters || {}).reduce((sum, n) => sum + Number(n || 0) * 0.35, 0);
  }
  score += Object.values(player.mana || {}).reduce((sum, n) => sum + Number(n || 0), 0) * 0.45;
  const highestCommanderDamage = Math.max(0, ...Object.values(player.commanderDamage || {}).map(Number));
  score -= highestCommanderDamage * 0.65;
  if (player.life <= 0 || player.poison >= 10 || highestCommanderDamage >= 21 || player.lost) score -= 1000;
  return score;
}

function hiddenInformationNoise(state, playerId, move) {
  const opponentId = Object.keys(state.players).find((id) => id !== playerId);
  const opponent = state.players[opponentId];
  const handRisk = opponent.zones.hand.length * 0.16;
  let noise = (Math.random() - 0.5) * (3 + handRisk);
  if (move.type === 'attack') noise -= Math.random() * handRisk;
  if (move.type === 'hold') noise += Math.random() * Math.min(3, Object.values(state.players[playerId].mana).reduce((a, b) => a + b, 0) * 0.35);
  if (['cast-permanent', 'cast-commander'].includes(move.type) && opponent.zones.hand.length >= 4 && Math.random() < 0.12) noise -= 4.5;
  return noise;
}

function explainMove(state, playerId, move, score) {
  const card = Object.values(state.players[playerId].zones).flat().find((item) => item.instanceId === move.cardId);
  if (move.type === 'sequence') return 'Compares a two-spell sequence against single plays. The order is valued by board development and estimated interaction risk.';
  if (move.type === 'play-land') return 'Uses the normal land drop and improves future mana without spending a card from the battlefield.';
  if (move.type === 'cast-commander') return `Develops the commander engine${card?.manaValue ? ` with a ${card.manaValue}-mana permanent` : ''}. The score includes removal risk from unknown cards.`;
  if (move.type === 'cast-permanent') return `Adds ${card?.name || 'a permanent'} to the board. The coach values mana value, creature stats, keywords, cards in hand, and removal risk.`;
  if (move.type === 'cast-spell') return 'Uses a nonpermanent spell. Because Oracle text is not fully simulated, the estimate is conservative.';
  if (move.type === 'attack') return 'Estimates blockers, evasion, trample, likely damage, and the value of keeping attackers untapped.';
  return score > 0 ? 'Holding resources preserves flexibility and may protect an existing advantage.' : 'Passing avoids committing into a potentially unfavorable board, but may lose tempo.';
}


export function defenseAdvice(state) {
  const attackerPlayer = Object.values(state.players).find((player) => player.zones.battlefield.some((card) => card.attacking));
  if (!attackerPlayer) return null;
  const defenderId = Object.keys(state.players).find((id) => id !== attackerPlayer.id);
  const defender = state.players[defenderId];
  const attackers = attackerPlayer.zones.battlefield.filter((card) => card.attacking);
  const blockers = defender.zones.battlefield.filter((card) => isCreature(card) && !card.tapped);
  const assignments = [];
  const unused = [...blockers];
  const ordered = [...attackers].sort((a, b) => numericStat(b.power, 1) - numericStat(a.power, 1));
  let expectedDamage = 0;
  for (const attacker of ordered) {
    const evasion = (attacker.keywords || []).includes('Flying');
    const eligible = unused.filter((blocker) => !evasion || (blocker.keywords || []).includes('Flying') || (blocker.keywords || []).includes('Reach'));
    eligible.sort((a, b) => {
      const aSurvives = numericStat(a.toughness, 1) > numericStat(attacker.power, 1) ? 3 : 0;
      const bSurvives = numericStat(b.toughness, 1) > numericStat(attacker.power, 1) ? 3 : 0;
      const aKills = numericStat(a.power, 1) >= numericStat(attacker.toughness, 1) ? 2 : 0;
      const bKills = numericStat(b.power, 1) >= numericStat(attacker.toughness, 1) ? 2 : 0;
      return (bSurvives + bKills - numericStat(b.power, 1) * .05) - (aSurvives + aKills - numericStat(a.power, 1) * .05);
    });
    const blocker = eligible[0];
    if (blocker) {
      assignments.push({ attacker: attacker.name, blocker: blocker.name, reason: numericStat(blocker.power, 1) >= numericStat(attacker.toughness, 1) ? 'trades with or kills the attacker' : 'absorbs the most urgent damage' });
      unused.splice(unused.findIndex((card) => card.instanceId === blocker.instanceId), 1);
      if ((attacker.keywords || []).includes('Trample')) expectedDamage += Math.max(0, numericStat(attacker.power, 1) - numericStat(blocker.toughness, 1));
    } else expectedDamage += numericStat(attacker.power, 1);
  }
  return { attackerName: attackerPlayer.name, defenderId, defenderName: defender.name, assignments, expectedDamage };
}
