import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Only diagnostic endpoints are called. Never log response headers or secrets.
const secretFile = process.env.ELREY_REBUILD_SECRETS_FILE || join(homedir(), '.config/grupo-el-rey/n8n-rebuild-secrets.json');
const secrets = JSON.parse(await readFile(secretFile, 'utf8'));
const gateway = secrets.N8N_REBUILD_GATEWAY_SECRET;
if (!gateway) throw new Error('Falta N8N_REBUILD_GATEWAY_SECRET en el archivo privado.');
const origin = 'https://intranet.almaceneselrey.co';
const webhook = 'https://intranetelrey.app.n8n.cloud/webhook/el-rey-rebuild-connection-v1';
const results = [];
async function check(name, url, options, accepts) {
  const response = await fetch(url, {...options, redirect: 'error', signal: AbortSignal.timeout(30000)});
  const body = await response.json().catch(() => null);
  const passed = accepts(response.status, body);
  results.push({name, passed, status: response.status});
  if (!passed) {
    console.error(JSON.stringify({checked_at: new Date().toISOString(), results}, null, 2));
    throw new Error(`No pasó la comprobación «${name}» (HTTP ${response.status}). Revisar credenciales y versión publicada.`);
  }
}

const challenge = randomUUID();
const url = `${origin}/api/bot/connection?challenge=${challenge}`;
await check('gateway_rejects_missing_key', url, {}, status => status === 401);
await check('gateway_rejects_wrong_key', url, {headers: {'x-elrey-gateway-secret': 'invalid-diagnostic-test'}}, status => status === 401);
await check('gateway_authenticates_new_key', url, {headers: {'x-elrey-gateway-secret': gateway}}, (status, body) =>
  status === 200 && body?.ok === true && body.api_version === 'elrey-bot-connection-v1' && body.mode === 'diagnostic' && body.challenge === challenge);
await check('webhook_rejects_missing_key', webhook, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'}, status => [401, 403].includes(status));
await check('webhook_rejects_wrong_key', webhook, {method: 'POST', headers: {'content-type': 'application/json', 'x-elrey-webhook-secret': 'invalid-diagnostic-test'}, body: '{}'}, status => [401, 403].includes(status));
await check('cloudflare_n8n_cloudflare_round_trip', `${origin}/api/bot/connection/probe`, {method: 'POST', headers: {'x-elrey-gateway-secret': gateway}}, (status, body) =>
  status === 200 && body?.ok === true && body.mode === 'diagnostic' && body.checks?.intranet_to_n8n === true && body.checks?.n8n_to_intranet === true);

console.log(JSON.stringify({checked_at: new Date().toISOString(), workflow_id: '9rR5rLK8oW5FLnF0', scope: 'connection_only', results}, null, 2));
