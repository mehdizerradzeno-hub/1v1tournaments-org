import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';

const playerCounts = [8, 16, 32, 64, 128, 256, 512, 1000];

function fakeSignup(index) {
  const playerNumber = index + 1;

  return {
    id: `signup-${String(playerNumber).padStart(4, '0')}`,
    accountId: `account-${String(playerNumber).padStart(4, '0')}`,
    tournamentSlug: 'capacity-test',
    playerName: `Player ${playerNumber}`,
    playerHandle: `player${playerNumber}`,
    discord: `player${playerNumber}`,
    email: `player${playerNumber}@example.test`,
    createdAt: new Date(Date.UTC(2026, 6, 9, 20, 0, index)).toISOString(),
  };
}

function publicSignup(signup) {
  return {
    id: signup.id,
    playerName: signup.playerName,
    playerHandle: signup.playerHandle,
    createdAt: signup.createdAt,
  };
}

function payloadBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function checkCapacity(count) {
  const startedAt = performance.now();
  const signups = Array.from({ length: count }, (_, index) => fakeSignup(index));
  const orderedSignups = [...signups].sort((left, right) => (
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  ));
  const publicPayload = {
    tournamentSlug: 'capacity-test',
    signupCount: orderedSignups.length,
    signups: orderedSignups.map(publicSignup),
  };
  const elapsedMs = performance.now() - startedAt;
  const sizeKb = payloadBytes(publicPayload) / 1024;

  return {
    players: count,
    ms: Number(elapsedMs.toFixed(2)),
    payloadKb: Number(sizeKb.toFixed(1)),
    tier: count <= 128 ? 'normal' : count <= 512 ? 'large' : 'stress',
  };
}

console.table(playerCounts.map(checkCapacity));
console.log('Local capacity model only. It measures signup list sorting and public payload size without sending traffic to production.');
