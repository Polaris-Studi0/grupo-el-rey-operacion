import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const challenge = '794f2a08-af64-47ce-86ac-3a5eff1eae67';
const env = {N8N_REBUILD_GATEWAY_SECRET: 'test-new-gateway', N8N_REBUILD_WEBHOOK_SECRET: 'test-new-webhook', N8N_GATEWAY_SECRET: 'test-legacy'};
const base = 'https://intranet.almaceneselrey.co/api/bot/connection';
function request(path = `?challenge=${challenge}`, method = 'GET', secret = env.N8N_REBUILD_GATEWAY_SECRET) {
  return new Request(base + path, {method, headers: secret ? {'x-elrey-gateway-secret': secret} : {}});
}
async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('gateway requires the new secret: missing, wrong, old and webhook secrets fail without effects', async () => {
  await withFetch(() => { throw new Error('Unexpected network effect'); }, async () => {
    for (const secret of [null, 'incorrect', env.N8N_GATEWAY_SECRET, env.N8N_REBUILD_WEBHOOK_SECRET]) {
      for (const [path, method] of [[`?challenge=${challenge}`, 'GET'], ['/probe', 'POST']]) {
        const result = await worker.fetch(request(path, method, secret), env, {});
        assert.equal(result.status, 401);
        assert.deepEqual(await result.json(), {ok: false, error: 'unauthorized'});
      }
    }
  });
});

test('authenticated check returns only diagnostic evidence without database or Meta access', async () => {
  await withFetch(() => { throw new Error('Unexpected network effect'); }, async () => {
    const result = await worker.fetch(request(), env, {});
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const data = await result.json();
    assert.equal(data.challenge, challenge);
    assert.equal(data.api_version, 'elrey-bot-connection-v1');
    assert.equal(data.mode, 'diagnostic');
    assert.equal(data.ok, true);
    for (const secret of Object.values(env)) assert.ok(!JSON.stringify(data).includes(secret));
  });
});

test('gateway check rejects missing or arbitrary challenge text', async () => {
  for (const path of ['', '?challenge=undefined', '?challenge=https://example.com', '?challenge=%3Cscript%3E']) {
    assert.equal((await worker.fetch(request(path), env, {})).status, 400);
  }
});

test('connection fails closed when either required secret is absent', async () => {
  assert.equal((await worker.fetch(request(), {}, {})).status, 503);
  const result = await worker.fetch(request('/probe', 'POST'), {N8N_REBUILD_GATEWAY_SECRET: env.N8N_REBUILD_GATEWAY_SECRET}, {});
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, 'webhook_not_configured');
});

test('connection methods are explicit; unsupported paths never become a proxy', async () => {
  for (const [path, method, allowed] of [['', 'POST', 'GET'], ['/probe', 'GET', 'POST'], ['/probe', 'OPTIONS', 'POST']]) {
    const result = await worker.fetch(request(path, method), env, {});
    assert.equal(result.status, 405);
    assert.equal(result.headers.get('allow'), allowed);
  }
  assert.equal((await worker.fetch(request('/arbitrary'), env, {})).status, 404);
});

test('probe completes a real round trip using separate keys and a server-generated challenge', async () => {
  let calls = 0;
  await withFetch(async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://intranetelrey.app.n8n.cloud/webhook/el-rey-rebuild-connection-v1');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-elrey-webhook-secret'], env.N8N_REBUILD_WEBHOOK_SECRET);
    assert.equal(options.headers['x-elrey-gateway-secret'], undefined);
    assert.equal(options.redirect, 'manual');
    const body = JSON.parse(options.body);
    assert.equal(body.event_type, 'connection.probe');
    assert.notEqual(body.challenge, challenge);
    return worker.fetch(request(`?challenge=${body.challenge}`), env, {});
  }, async () => {
    const req = new Request(base + '/probe?url=https://example.com', {
      method: 'POST', headers: {'x-elrey-gateway-secret': env.N8N_REBUILD_GATEWAY_SECRET},
      body: JSON.stringify({url: 'https://example.com', challenge})
    });
    const result = await worker.fetch(req, env, {});
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).checks, {intranet_to_n8n: true, n8n_to_intranet: true});
    assert.equal(calls, 1);
  });
});

test('an accepted webhook or cached answer alone never proves a connection', async () => {
  for (const response of [{message: 'Workflow was started'}, {ok: true, mode: 'diagnostic', api_version: 'elrey-bot-connection-v1', challenge}]) {
    await withFetch(async () => Response.json(response), async () => {
      const result = await worker.fetch(request('/probe', 'POST'), env, {});
      assert.equal(result.status, 502);
      assert.equal((await result.json()).error, 'invalid_probe_response');
    });
  }
});

test('probe failure does not expose upstream response contents or retry uncontrolled executions', async () => {
  for (const status of [301, 302, 307, 308, 401, 403, 404, 429, 500]) {
    let calls = 0;
    await withFetch(async () => { calls += 1; return new Response('private upstream contents', {status}); }, async () => {
      const result = await worker.fetch(request('/probe', 'POST'), env, {});
      assert.equal(result.status, 502);
      assert.deepEqual(await result.json(), {ok: false, error: 'n8n_rejected_probe', upstream_status: status});
      assert.equal(calls, 1);
    });
  }
});

test('network errors and malformed responses are reported without credentials', async () => {
  for (const mock of [async () => { throw new Error('private transport error'); }, async () => new Response('<html>Error</html>')]) {
    await withFetch(mock, async () => {
      const result = await worker.fetch(request('/probe', 'POST'), env, {});
      assert.equal(result.status, 502);
      assert.deepEqual(await result.json(), {ok: false, error: 'n8n_probe_unavailable'});
    });
  }
});

test('new gateway credential does not authorize the legacy WhatsApp send endpoint', async () => {
  const result = await worker.fetch(new Request('https://intranet.almaceneselrey.co/api/whatsapp/send', {
    method: 'POST', headers: {'x-elrey-gateway-secret': env.N8N_REBUILD_GATEWAY_SECRET}, body: '{}'
  }), env, {});
  assert.equal(result.status, 401);
});

test('existing health and frontend routing are preserved', async () => {
  const health = await worker.fetch(new Request('https://intranet.almaceneselrey.co/api/whatsapp/health'), env, {});
  assert.equal(health.status, 200);
  const page = await worker.fetch(new Request('https://intranet.almaceneselrey.co/'), {
    ...env, ASSETS: {fetch: async () => new Response('existing frontend')}
  }, {});
  assert.equal(await page.text(), 'existing frontend');
});
