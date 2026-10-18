import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, rename, unlink, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEuchreLeagueRepository } from '../netlify/functions/_euchre-league-store.mjs';

const MARKER = 'disposable-euchre-league-simulation-v1';
const CONFIG = { id: 'process-restart-league', name: 'Disposable 32-player Euchre season',
  playerCap: 32, divisionCount: 4, playoffSize: 8, firstRoundDate: '2026-10-25',
  weeklyPlayTime: '18:00', timeZone: 'America/New_York' };

/** Local test data only. This adapter cannot resolve a Netlify store or URL. */
export async function simulationDirectory(requested = '', initialize = false) {
  const tempRoot = await realpath(tmpdir());
  const directory = requested ? await realpath(resolve(requested)) : await mkdtemp(join(tempRoot, 'euchre-league-sim-'));
  if (!directory.startsWith(`${tempRoot}${sep}`)) throw new Error('Simulation data must stay in a disposable system-temporary directory.');
  const markerPath = join(directory, 'simulation-marker.json');
  if (initialize) {
    await writeFile(markerPath, JSON.stringify({ purpose: MARKER }), { flag: 'wx', mode: 0o600 });
  }
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  if (marker.purpose !== MARKER) throw new Error('Refusing to open data without the disposable simulation marker.');
  return directory;
}

export function localSimulationStore(directory, namespace = 'league-state') {
  if (!/^[a-z][a-z-]{0,80}$/.test(namespace)) throw new Error('Choose a local simulation collection name.');
  const file = join(directory, `${namespace}.json`);
  const lockFile = join(directory, `${namespace}.lock`);
  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  const store = {
    async getWithMetadata(key) {
      const record = (await read())[key];
      return record ? { data: JSON.parse(record.body), etag: record.etag } : null;
    },
    async get(key) { return (await store.getWithMetadata(key))?.data || null; },
    async list(options = {}) {
      return { blobs: Object.keys(await read()).filter(key => !options.prefix || key.startsWith(options.prefix)).map(key => ({ key })) };
    },
    async setJSON(key, value, options) { return store.set(key, JSON.stringify(value), options); },
    async set(key, body, options = {}) {
      let lock;
      try { lock = await open(lockFile, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') return { modified: false }; throw error; }
      const pending = join(directory, `${namespace}-${process.pid}.pending`);
      try {
        const records = await read();
        const old = records[key];
        if ((options.onlyIfNew && old) || (options.onlyIfMatch && old?.etag !== options.onlyIfMatch)) return { modified: false };
        const etag = createHash('sha256').update(`${old?.etag || ''}:${body}`).digest('hex');
        records[key] = { body, etag };
        await writeFile(pending, JSON.stringify(records), { mode: 0o600 });
        await rename(pending, file);
        return { modified: true, etag };
      } finally {
        await lock.close();
        await unlink(lockFile);
      }
    },
  };
  return store;
}

async function finishNextGame(repo, league, matchId) {
  const match = league.matches.find(m => m.id === matchId);
  const gameNumber = match.series.games.length + 1;
  const digest = createHash('sha256').update(`${matchId}:${gameNumber}`).digest('hex').slice(0, 24);
  const assignment = { tournamentSlug: `disposable-${digest}`, tournamentMatchId: `disposable-${digest}-r1-m1` };
  await repo.assignGame(CONFIG.id, matchId, assignment);
  // Every regular-season series splits 1–1 before its decider. Playoffs 2–0.
  const homeWins = match.phase === 'playoff' || gameNumber !== 2;
  const completion = { ...assignment, completionId: `completion-${digest}`,
    winnerCanonicalAccountId: homeWins ? match.homePlayerId : match.awayPlayerId,
    scores: homeWins ? { north: 10, south: 8 } : { north: 9, south: 13 } };
  return (await repo.recordGame(CONFIG.id, matchId, completion)).league;
}

export async function simulateEuchreLeagueStage({ stage, stateDirectory = '' }) {
  if (!['init', 'regular', 'playoffs'].includes(stage)) throw new Error('Choose init, regular, or playoffs.');
  const directory = await simulationDirectory(stateDirectory, stage === 'init');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const repo = createEuchreLeagueRepository({ store: localSimulationStore(directory),
    clock: () => new Date('2026-10-18T12:00:00Z') });
  let league;
  if (stage === 'init') {
    await repo.create(CONFIG, 'disposable-host');
    for (let i = 1; i <= 32; i += 1) await repo.enroll(CONFIG.id, {
      canonicalAccountId: `sim-player-${String(i).padStart(3, '0')}`,
      username: `sim_player_${String(i).padStart(3, '0')}`,
    });
    league = (await repo.start(CONFIG.id)).league;
    league = await finishNextGame(repo, league, league.matches[0].id);
  } else {
    league = await repo.load(CONFIG.id);
    if (!league) throw new Error('Initialize the disposable simulation first.');
    const expected = stage === 'regular' ? 'regular-season' : 'playoffs';
    if (league.phase !== expected) throw new Error(`The ${stage} stage requires ${expected}, got ${league.phase}.`);
    for (;;) {
      const match = league.matches.find(m => m.phase === (stage === 'regular' ? 'regular' : 'playoff')
        && ['scheduled', 'playing'].includes(m.status));
      if (!match) break;
      league = await finishNextGame(repo, league, match.id);
    }
  }
  return { directory, phase: league.phase, players: league.participants.length,
    divisions: league.divisions.length, regularRounds: league.seasonConfig.regularWeeks,
    regularSeries: league.matches.filter(m => m.phase === 'regular').length,
    completedRegularSeries: league.matches.filter(m => m.phase === 'regular' && m.status === 'complete').length,
    games: league.matches.reduce((total, m) => total + m.series.games.length, 0),
    qualifiers: league.championship?.qualifiers.length || 0,
    playoffSeries: league.matches.filter(m => m.phase === 'playoff').length,
    champions: league.championship?.champion ? 1 : 0,
    champion: league.championship?.champion?.displayName || null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = new Map();
  for (let i = 2; i < process.argv.length; i += 2) options.set(process.argv[i], process.argv[i + 1]);
  if ([...options.keys()].some(key => !['--stage', '--state'].includes(key))) throw new Error('Only --stage and --state are supported.');
  const summary = await simulateEuchreLeagueStage({ stage: options.get('--stage'), stateDirectory: options.get('--state') });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
