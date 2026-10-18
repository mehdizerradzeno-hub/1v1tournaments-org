import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { leagueHttpFixture, fixturePlayer, fixtureHost } from '../integration/euchreLeagueFixture.mjs';

// Deliberately synthetic and loopback-only: never read .env or construct live stores.
const root = path.resolve(process.argv[2] || '/private/tmp/euchre-leagues-web-preview');
const fixture = leagueHttpFixture();
await fixture.seed(32, { name: 'Synthetic preview · Euchre Autumn League' });
const leagueId = 'synthetic-euchre-league';
const initial = await fixture.repository().load(leagueId);
for (const match of initial.matches.filter(item => item.weekIndex === 1).slice(0, 4)) {
  const account = fixturePlayer(Number(match.homePlayerId.split('-').at(-1)));
  for (let game = 0; game < 2; game += 1) {
    const opened = await fixture.request(account, { action: 'open-match', leagueId, matchId: match.id });
    const result = await fixture.report(opened.data);
    if (result.error) throw new Error(result.error.body);
  }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const admin = url.searchParams.get('admin') === 'true';
    let reply;
    if (url.pathname === '/.netlify/functions/euchre-leagues') {
      let body = '';
      for await (const chunk of request) { body += chunk; if (body.length > 65536) throw new Error('Request too large'); }
      reply = await fixture.request(admin ? fixtureHost : fixturePlayer(1), body ? JSON.parse(body) : null, Object.fromEntries(url.searchParams));
    } else if (url.pathname.startsWith('/.netlify/functions/')) {
      const data = url.pathname.endsWith('/player-account') ? { ok: true, account: { ...fixturePlayer(1), username: 'tester_001' } }
        : { ok: true, tournaments: [], friends: [], invitations: [], requests: [] };
      reply = { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    }
    if (reply) { response.writeHead(reply.statusCode, reply.headers); response.end(reply.body); return; }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let target = path.resolve(root, relative || 'index.html');
    if (!target.startsWith(`${root}/`)) { response.writeHead(403); response.end(); return; }
    let info = await stat(target).catch(() => null);
    if (!info) { target += '.html'; info = await stat(target).catch(() => null); }
    if (info?.isDirectory()) target = path.join(target, 'index.html');
    const bytes = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end('Synthetic preview resource unavailable'); }
});
server.listen(4317, '127.0.0.1', () => console.log('Synthetic-only Euchre league preview: http://127.0.0.1:4317/leagues/euchre'));
