import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const src = fs.readFileSync(path.join(root, `commander-forge-${pkg.commanderForge.bundleVersion}.js`), 'utf8');

function expect(pattern, message) {
  assert.match(src, pattern, message);
}

test('reconnect storage and private token generation remain present', () => {
  expect(/MULTIPLAYER_RECONNECT_STORAGE_KEY\s*=\s*'commander-forge-multiplayer-reconnect-v1'/, 'Reconnect storage key is missing.');
  expect(/function generateReconnectToken\(\)/, 'Reconnect token generator is missing.');
  expect(/randomUUID|crypto\.getRandomValues/, 'Reconnect token generation must use browser crypto.');
});

test('seat reservations preserve a reconnect token and disconnected timestamp', () => {
  expect(/seatReservations:\s*Object\.create\(null\)/, 'Seat reservation state is missing.');
  expect(/seatReservations\?\.\[playerId\]\?\.token/, 'Seat assignment no longer sends the reserved reconnect token.');
  expect(/disconnectedAt/, 'Seat reservation disconnect timestamp is missing.');
});

test('valid reconnect requires both player id and matching token', () => {
  expect(/metadata\.reconnectPlayerId/, 'Reconnect player id metadata is not read.');
  expect(/metadata\.reconnectToken/, 'Reconnect token metadata is not read.');
  expect(/reservationMatches\(requestedPlayerId, reconnectToken\)/, 'Reconnect does not validate the private token.');
  expect(/seatReservationActive\(requestedPlayerId\)/, 'Reconnect does not require an active reservation.');
});

test('same reserved seat is restored and marked resumed', () => {
  expect(/let playerId = validReconnect \? requestedPlayerId : nextAvailableGuestSeat\(\)/, 'Valid reconnect no longer restores the original seat.');
  expect(/let resumed = validReconnect/, 'Reconnect no longer records resumed state.');
  expect(/resumed:\s*Boolean\(resumed\)/, 'Seat assignment no longer tells the guest it resumed.');
});

test('connected reserved seat rejects duplicate reconnect attempts', () => {
  expect(/seat-in-use/, 'Duplicate reconnect rejection message is missing.');
  expect(/multiplayer\.connections\?\.\[requestedPlayerId\]/, 'Connected-seat ownership check is missing.');
});

test('pregame reservations expire while active game reservations persist', () => {
  expect(/MULTIPLAYER_SEAT_RESERVATION_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/, '15 minute pregame reservation period changed unexpectedly.');
  expect(/function seatReservationActive\(playerId\)/, 'Seat reservation lifetime check is missing.');
  expect(/onlineGameId/, 'Active game reservation check no longer considers the game id.');
  expect(/releaseExpiredSeatReservation/, 'Expired pregame seat cleanup is missing.');
});

test('host can free a disconnected pregame seat but active-game seats are protected', () => {
  expect(/function releaseReservedSeat\(playerId\)/, 'Host free-seat action is missing.');
  expect(/Only the host can release a reserved seat|multiplayer\.role\s*!==\s*'host'/, 'Free-seat action is no longer host-only.');
  expect(/active game|onlineGameId/i, 'Free-seat logic no longer protects active-game reservations.');
});
