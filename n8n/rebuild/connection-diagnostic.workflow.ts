const inbound = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: {name: 'Recibir prueba autenticada', parameters: {
    httpMethod: 'POST', path: 'el-rey-rebuild-connection-v1',
    authentication: 'headerAuth', responseMode: 'responseNode', options: {}
  }, credentials: {httpHeaderAuth: {id: 'WJMZ9eXLCg3akSvc', name: 'EL REY · Intranet → n8n'}}},
  output: [{json: {body: {event_type: 'connection.probe', challenge: '794f2a08-af64-47ce-86ac-3a5eff1eae67'}}}]
});
const normalize = node({
  type: 'n8n-nodes-base.set', version: 3.4,
  config: {name: 'Conservar solo el identificador de prueba', parameters: {
    mode: 'manual', includeOtherFields: false,
    assignments: {assignments: [{id: 'challenge', name: 'challenge', type: 'string', value: expr('{{ $json.body?.challenge ?? "" }}')}]},
    options: {}
  }},
  output: [{json: {challenge: '794f2a08-af64-47ce-86ac-3a5eff1eae67'}}]
});
const checkGateway = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {name: 'Verificar acceso a la intranet', parameters: {
    method: 'GET', url: 'https://intranet.almaceneselrey.co/api/bot/connection',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendQuery: true, queryParameters: {parameters: [{name: 'challenge', value: expr('{{ $json.challenge }}')}]},
    options: {timeout: 10000, redirect: {redirect: {followRedirects: false}}, response: {response: {responseFormat: 'json'}}}
  }, credentials: {httpHeaderAuth: {id: 'mE0LulIzVpRFckRy', name: 'EL REY · n8n → Intranet'}}},
  output: [{json: {ok: true, mode: 'diagnostic', api_version: 'elrey-bot-connection-v1', challenge: '794f2a08-af64-47ce-86ac-3a5eff1eae67', checked_at: '2026-09-26T15:00:00.000Z'}}]
});
const respond = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {name: 'Devolver evidencia de conexión', parameters: {
    respondWith: 'json', responseBody: expr('{{ $json }}'),
    options: {responseCode: 200, responseHeaders: {entries: [{name: 'Cache-Control', value: 'no-store'}]}}
  }},
  output: [{json: {ok: true, mode: 'diagnostic', api_version: 'elrey-bot-connection-v1'}}]
});
const note = sticky('Prueba de conexión de la cuenta nueva. No atiende clientes, no llama a Meta y no consulta ni modifica pedidos. La entrada usa WEBHOOK; la consulta a la intranet usa GATEWAY. No cambiar las rutas del bot comercial hacia este flujo.', [], {color: 5});
export default workflow('el-rey-rebuild-connection-v1', 'EL REY · Diagnóstico de conexión')
  .add(inbound).to(normalize).to(checkGateway).to(respond)
  .add(note)
  .group('Comprobar ida y vuelta', [normalize, checkGateway, respond], {description: 'Verifica el acceso a la intranet y devuelve el mismo identificador. Sin efectos sobre clientes.'});
