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

test('reconnect storage, reservation state, and token generation ship in the production bundle', () => {
  expect(/MULTIPLAYER_RECONNECT_STORAGE_KEY\s*=\s*'commander-forge-multiplayer-reconnect-v1'/, 'Reconnect storage key is missing.');
  expect(/seatReservations:\s*Object\.create\(null\)/, 'Seat reservation state is missing.');
  expect(/function generateReconnectToken\(\)/, 'Reconnect token generator is missing.');
  expect(/function seatReservationActive\(playerId\)/, 'Seat reservation lifetime check is missing.');
});

test('reconnect validates the remembered seat and private token before restoring it', () => {
  expect(/metadata\.reconnectPlayerId/, 'Reconnect player id metadata is not read.');
  expect(/metadata\.reconnectToken/, 'Reconnect token metadata is not read.');
  expect(/reservationMatches\(requestedPlayerId, reconnectToken\)/, 'Reconnect does not validate the private token.');
  expect(/seatReservationActive\(requestedPlayerId\)/, 'Reconnect does not require an active reservation.');
  expect(/let playerId = validReconnect \? requestedPlayerId : nextAvailableGuestSeat\(\)/, 'Valid reconnect no longer restores the original seat.');
});

test('seat assignment returns the reconnect token and resumed state to the reconnecting browser', () => {
  expect(/function sendSeatAssignment\(playerId, \{ resumed = false \} = \{\}\)/, 'Seat assignment function is missing.');
  expect(/reconnectToken:\s*multiplayer\.seatReservations\?\.\[playerId\]\?\.token \|\| ''/, 'Seat assignment no longer returns the reconnect token.');
  expect(/resumed:\s*Boolean\(resumed\)/, 'Seat assignment no longer reports resumed state.');
});

test('reservation cleanup and host free-seat protection remain present', () => {
  expect(/MULTIPLAYER_SEAT_RESERVATION_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/, '15 minute pregame reservation period changed unexpectedly.');
  expect(/function releaseExpiredSeatReservation\(playerId\)/, 'Expired seat cleanup is missing.');
  expect(/function releaseReservedSeat\(playerId\)/, 'Host free-seat action is missing.');
  expect(/onlineGameId/, 'Active-game reservation protection no longer references the game id.');
});
