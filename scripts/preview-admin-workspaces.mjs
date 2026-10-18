import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { leagueHttpFixture, fixtureHost, fixturePlayer } from '../integration/euchreLeagueFixture.mjs';

// Synthetic, read-only, loopback-only preview. No .env, credentials, or live stores.
const root = path.resolve(process.argv[2] || '/private/tmp/euchre-admin-cleanup-web');
const fixture = leagueHttpFixture();
await fixture.seed(8, { name: 'Synthetic preview — Euchre league' });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };

createServer(async (request, response) => {
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
  try {
    const url = new URL(request.url, 'http://[::1]');
    if (request.method !== 'GET') { send(405, { ok: false, error: 'This synthetic preview is read-only.' }); return; }
    if (url.pathname === '/admin-review.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><html><head><title>Admin phone layout review</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#222;color:white;font:14px sans-serif"><p>Synthetic preview · actual 390 × 844 CSS viewport</p><iframe title="Admin phone preview" src="/admin" style="display:block;width:390px;height:844px;border:0"></iframe></body></html>');
      return;
    }
    if (url.pathname === '/.netlify/functions/euchre-leagues') {
      const reply = await fixture.request(url.searchParams.get('admin') === 'true' ? fixtureHost : fixturePlayer(1), null, Object.fromEntries(url.searchParams));
      response.writeHead(reply.statusCode, reply.headers); response.end(reply.body); return;
    }
    if (url.pathname.startsWith('/.netlify/functions/')) {
      const data = url.pathname.endsWith('/player-account')
        ? { ok: true, account: { ...fixtureHost, username: 'preview_host', hostApproved: true } }
        : { ok: true, tournaments: [], leagues: [], rosters: [], bracket: null, settings: null, friends: [], invitations: [], requests: [] };
      send(200, data); return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let target = path.resolve(root, relative || 'index.html');
    if (!target.startsWith(`${root}/`)) { send(403, { ok: false }); return; }
    let info = await stat(target).catch(() => null);
    // Expo may emit admin.html alongside an admin/ folder for nested routes.
    if (info?.isDirectory() && !path.extname(target)) {
      const page = await stat(`${target}.html`).catch(() => null);
      if (page?.isFile()) { target += '.html'; info = page; }
    }
    if (!info) { target += '.html'; info = await stat(target).catch(() => null); }
    if (info?.isDirectory()) target = path.join(target, 'index.html');
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(target));
  } catch { if (!response.headersSent) response.writeHead(404); response.end('Synthetic preview resource unavailable'); }
// IPv6 loopback also prevents the app's IPv4 static-preview production API fallback.
}).listen(4321, '::1', () => console.log('Synthetic admin preview: http://[::1]:4321/admin'));
