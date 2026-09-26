const CONNECTION_PATH = "/api/bot/connection";
const PROBE_PATH = `${CONNECTION_PATH}/probe`;
const PROBE_URL = "https://intranetelrey.app.n8n.cloud/webhook/el-rey-rebuild-connection-v1";
const API_VERSION = "elrey-bot-connection-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  }});
}

async function authenticates(request, expected) {
  const received = request.headers.get("x-elrey-gateway-secret");
  if (!received || received.length > 4096) return false;
  const encoder = new TextEncoder();
  const hashes = await Promise.all([expected, received].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const left = new Uint8Array(hashes[0]), right = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

// This diagnostic has no database, Meta, queue or customer-message side effects.
// The destination is fixed: a caller cannot use the credentials as an HTTP proxy.
export async function handleBotConnection(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== CONNECTION_PATH && url.pathname !== PROBE_PATH) return null;
  const method = url.pathname === CONNECTION_PATH ? "GET" : "POST";
  if (request.method !== method) return reply({ok: false, error: "method_not_allowed"}, 405, {allow: method});
  if (!env.N8N_REBUILD_GATEWAY_SECRET) return reply({ok: false, error: "connection_not_configured"}, 503);
  if (!await authenticates(request, env.N8N_REBUILD_GATEWAY_SECRET)) return reply({ok: false, error: "unauthorized"}, 401);

  if (url.pathname === CONNECTION_PATH) {
    const challenge = url.searchParams.get("challenge");
    if (!UUID.test(challenge || "")) return reply({ok: false, error: "invalid_challenge"}, 400);
    return reply({ok: true, mode: "diagnostic", api_version: API_VERSION, challenge, checked_at: new Date().toISOString()});
  }

  if (!env.N8N_REBUILD_WEBHOOK_SECRET) return reply({ok: false, error: "webhook_not_configured"}, 503);
  const challenge = crypto.randomUUID();
  let result, data;
  try {
    result = await fetch(PROBE_URL, {
      method: "POST",
      headers: {"content-type": "application/json", "x-elrey-webhook-secret": env.N8N_REBUILD_WEBHOOK_SECRET},
      body: JSON.stringify({event_type: "connection.probe", challenge}),
      redirect: "manual",
      signal: AbortSignal.timeout(20000)
    });
    if (!result.ok) return reply({ok: false, error: "n8n_rejected_probe", upstream_status: result.status}, 502);
    data = await result.json();
  } catch {
    return reply({ok: false, error: "n8n_probe_unavailable"}, 502);
  }
  if (data?.ok !== true || data.mode !== "diagnostic" || data.api_version !== API_VERSION || data.challenge !== challenge) {
    return reply({ok: false, error: "invalid_probe_response"}, 502);
  }
  return reply({ok: true, mode: "diagnostic", api_version: API_VERSION,
    checks: {intranet_to_n8n: true, n8n_to_intranet: true}, checked_at: new Date().toISOString()});
}
