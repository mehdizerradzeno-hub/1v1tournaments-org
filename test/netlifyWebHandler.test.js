import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { connectLambda, getStore, setEnvironmentContext } from '@netlify/blobs';
import { handleNetlifyWebRequest } from '../netlify/functions/_netlify-web-handler.mjs';
import leagues from '../netlify/functions/euchre-leagues.mjs';
import bracket from '../netlify/functions/tournament-bracket.mjs';
import matchAccess from '../netlify/functions/tournament-match-access.mjs';
import { createEuchreLeagueSeason } from '../src/lib/euchreLeagueSeason.js';

const context = { siteID: 'synthetic-site', token: 'synthetic-token', deployID: 'synthetic-deploy',
  edgeURL: 'https://cached.synthetic.invalid', uncachedEdgeURL: 'https://uncached.synthetic.invalid' };

function withSyntheticContext(run) {
  const previous = process.env.NETLIFY_BLOBS_CONTEXT;
  setEnvironmentContext(context);
  return Promise.resolve().then(run).finally(() => {
    if (previous === undefined) delete process.env.NETLIFY_BLOBS_CONTEXT;
    else process.env.NETLIFY_BLOBS_CONTEXT = previous;
  });
}

test('actual SDK reproduces legacy Lambda loss of the uncached endpoint; native context supports strong reads', async () => {
  await withSyntheticContext(async () => {
    let reads = 0;
    const options = { name: 'leagues', fetch: async url => {
      reads += 1;
      assert.equal(new URL(url).origin, context.uncachedEdgeURL);
      return new Response('{"synthetic":true}', { headers: { etag: 'test-etag' } });
    } };
    const before = await getStore(options).getWithMetadata('fixture.json', { type: 'json', consistency: 'strong' });
    assert.deepEqual(before.data, { synthetic: true });
    assert.equal(before.etag, 'test-etag');
    connectLambda({ headers: { 'x-nf-site-id': context.siteID, 'x-nf-deploy-id': context.deployID },
      blobs: Buffer.from(JSON.stringify({ url: context.edgeURL, token: context.token })).toString('base64') });
    await assert.rejects(getStore(options).getWithMetadata('fixture.json', { type: 'json', consistency: 'strong' }),
      { name: 'BlobsConsistencyError' });
    assert.equal(reads, 1, 'legacy strong read fails before sending a request');
  });
});

test('Web adapter preserves JSON, authentication, query, status and response headers without accepting client storage context', async () => {
  const request = new Request('https://preview.synthetic.invalid/.netlify/functions/example?slug=fixture&matchId=one', {
    method: 'POST', headers: { Cookie: 'session=synthetic', Authorization: 'Bearer synthetic-reporter',
      'Content-Type': 'application/json', blobs: 'untrusted-client-context' }, body: '{"action":"report-result"}',
  });
  const response = await handleNetlifyWebRequest(request, async event => {
    assert.equal(event.httpMethod, 'POST');
    assert.deepEqual(event.queryStringParameters, { slug: 'fixture', matchId: 'one' });
    assert.equal(event.headers.cookie, 'session=synthetic');
    assert.equal(event.headers.authorization, 'Bearer synthetic-reporter');
    assert.equal(event.body, '{"action":"report-result"}');
    assert.equal(event.isBase64Encoded, false);
    assert.equal(Object.hasOwn(event, 'blobs'), false);
    return { statusCode: 409, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Cookie, Authorization' },
      body: '{"code":"conflict"}', multiValueHeaders: { 'X-Test': ['one', 'two'] }, cookies: ['session=; Max-Age=0'] };
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: 'conflict' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Vary'), 'Cookie, Authorization');
  assert.equal(response.headers.get('X-Test'), 'one, two');
  assert.equal(response.headers.get('Set-Cookie'), 'session=; Max-Age=0');
});

test('all league-facing deployed entry points select the native API and retain preflight and invalid-JSON behavior', async () => {
  for (const [name, handler] of [['euchre-leagues', leagues], ['tournament-bracket', bracket], ['tournament-match-access', matchAccess]]) {
    const source = readFileSync(new URL(`../netlify/functions/${name}.mjs`, import.meta.url), 'utf8');
    assert.match(source, /export default function netlifyHandler/);
    assert.doesNotMatch(source, /export (?:async )?function handler\b|export const handler\b|connectLambda/);
    const options = await handler(new Request(`https://synthetic.invalid/${name}`, { method: 'OPTIONS' }));
    assert.equal(options.status, 204);
    assert.equal(await options.text(), '');
    const malformed = await handler(new Request(`https://synthetic.invalid/${name}`, { method: 'POST', body: '{' }));
    assert.equal(malformed.status, 400, name);
  }
});

test('native league entry point lists records through real SDK strong reads without touching remote storage', async () => {
  await withSyntheticContext(async () => {
    const league = createEuchreLeagueSeason({ id: 'synthetic-native', name: 'Synthetic native runtime', playerCap: 8,
      divisionCount: 1, playoffSize: 2, firstRoundDate: '2027-01-10' }, 'synthetic-host');
    const previousFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, method: init.method });
      assert.equal(init.method.toLowerCase(), 'get', 'this test must never write');
      if (url.pathname.endsWith('/site:leagues')) {
        assert.equal(url.origin, context.edgeURL);
        return new Response(JSON.stringify({ blobs: [{ key: 'synthetic-native.json' }] }));
      }
      assert.equal(url.origin, context.uncachedEdgeURL);
      assert.ok(url.pathname.endsWith('/site:leagues/synthetic-native.json'));
      return new Response(JSON.stringify(league), { headers: { etag: 'synthetic-etag' } });
    };
    try {
      const response = await leagues(new Request('https://preview.synthetic.invalid/.netlify/functions/euchre-leagues'));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.leagues.length, 1);
      assert.equal(data.leagues[0].id, league.id);
      assert.equal(data.canManage, false);
      assert.doesNotMatch(JSON.stringify(data), /synthetic-host|synthetic-token/);
      assert.equal(calls.length, 2);
    } finally { globalThis.fetch = previousFetch; }
  });
});
