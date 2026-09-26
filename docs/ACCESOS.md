# Accesos e identificadores

Actualizado: 26/09/2026. Inventario de referencias conocidas; **no contiene secretos**. Las verificaciones de conexión de la cuenta nueva se detallan abajo; no equivalen a una prueba de atención comercial. No pedir al usuario claves que ya están configuradas sin antes revisar las conexiones existentes.

## Aplicaciones y repositorios

| Recurso | Ubicación |
|---|---|
| Plataforma local | `/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma` |
| Landing local | `/Users/samuel/Desktop/Cowork for Grupo El Rey/Landing page` |
| Carpeta del chat y respaldos | `/Users/samuel/Documents/ChatGPT/Grupo El Rey` |
| GitHub plataforma | https://github.com/Polaris-Studi0/grupo-el-rey-operacion.git |
| Sitio público | https://almaceneselrey.co |
| Intranet | https://intranet.almaceneselrey.co |
| Worker | https://grupo-el-rey-operacion.throbbing-salad-55e3.workers.dev |
| n8n nuevo — construcción desde cero | https://intranetelrey.app.n8n.cloud |
| n8n anterior — referencia, no restaurar | https://almaceneselrey.app.n8n.cloud |
| Supabase | https://supabase.com/dashboard/project/xmfltwhgvoaleejatxtg |

## n8n

### Cuenta nueva vigente

- URL: `https://intranetelrey.app.n8n.cloud`.
- MCP: `https://intranetelrey.app.n8n.cloud/mcp-server/http`, configurado como `n8n` en Codex; autenticación completada.
- El 26/09 se verificaron por MCP las dos credenciales nuevas y se creó/publicó un workflow de diagnóstico. La prueba real Cloudflare → n8n → intranet pasó a las 10:12 Colombia. Cobertura de Gateway de IA informada previamente, sin verificar saldo/modelos.
- Proyecto personal nuevo: `jajq9MlwnXJjmBRQ`. No reutilizar IDs de la cuenta antigua.
- Workflow [EL REY · Diagnóstico de conexión](https://intranetelrey.app.n8n.cloud/workflow/9rR5rLK8oW5FLnF0): `9rR5rLK8oW5FLnF0`, publicado en versión `04d9bd27-8bcc-4a28-8c06-a7e402c9c54c`, coincidente con el borrador. No es el asistente comercial.
- Diseño vigente: [ARQUITECTURA_BOT_NUEVO.md](ARQUITECTURA_BOT_NUEVO.md).

Credenciales guardadas por Samuel y comprobadas el 26/09:

| Nombre en n8n | Tipo / cabecera | Valor privado que debe coincidir | Estado |
|---|---|---|---|
| `EL REY · n8n → Intranet` | Header Auth: `x-elrey-gateway-secret` | `N8N_REBUILD_GATEWAY_SECRET` | ID `mE0LulIzVpRFckRy`; autenticación real aprobada; dominio configurado por Samuel: `intranet.almaceneselrey.co` |
| `EL REY · Intranet → n8n` | Header Auth: `x-elrey-webhook-secret` | `N8N_REBUILD_WEBHOOK_SECRET` | ID `WJMZ9eXLCg3akSvc`; autenticación real aprobada; uso saliente HTTP configurado en `None` |

- El MCP permite listar credenciales, pero su alta se hizo en la interfaz. Las dos claves se comprobaron sin mostrar sus valores. El diagnóstico no conserva datos de ejecuciones, para evitar almacenar las cabeceras entrantes.
- `.env.local` contiene únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; no se encontraron allí los secretos de integración. Samuel indicó que probablemente no conserva los valores originales.
- Cloudflare no vuelve a mostrar valores de secretos ya definidos. Se generaron dos secretos independientes de 32 bytes aleatorios, almacenados fuera del repositorio en `/Users/samuel/.config/grupo-el-rey/n8n-rebuild-secrets.json` (archivo `0600`, directorio `0700`). No copiar sus valores al chat, documentos o Git.
- **Cloudflare actualizado:** `wrangler secret bulk` confirmó la creación de `N8N_REBUILD_GATEWAY_SECRET` y `N8N_REBUILD_WEBHOOK_SECRET`. El listado posterior confirmó ambos nuevos y los siete secretos anteriores. La operación creó una revisión de configuración `39e09f96-0820-470b-8e57-059d5b6a49fb` a las 22:16 del 25/09, Colombia; no se desplegó código del checkout. La versión anterior era `746b03b7-a354-4cb5-92a5-7fcec1711ba3`.
- **Implementado el 26/09:** `GET /api/bot/connection` comprueba la clave nueva de gateway y un identificador de prueba. `POST /api/bot/connection/probe` inicia una prueba contra el webhook fijo `el-rey-rebuild-connection-v1` de la nueva cuenta, usando la clave nueva de webhook. Ninguna ruta accede a clientes, pedidos o Meta. El envío comercial mantiene las claves y URLs antiguas; las herramientas del agente aún están pendientes.
- Worker activo para este avance: `0b81162c-9f63-47fe-8e3c-58c3d0f17945`. Evidencia y comprobación reproducible en [n8n/rebuild/README.md](../n8n/rebuild/README.md).
- La comprobación de salud posterior conservó todos los indicadores en `true`. No demuestra autenticación con las claves nuevas ni entrega de WhatsApp.
- Las credenciales de Meta y Supabase siguen administradas en Cloudflare. La arquitectura nueva no requiere copiar la credencial administrativa de Postgres a n8n para acceder a las herramientas limitadas.
- `list_n8n_gateway_services` devolvió `available:true` para nodos de modelos de chat. No se ha elegido modelo, probado una llamada ni comprobado saldo; no hay que crear una clave de OpenAI por defecto para esta etapa.
- Referencias: [Header Auth de n8n](https://docs.n8n.io/integrations/builtin/credentials/httprequest/), [secretos de Cloudflare](https://developers.cloudflare.com/workers/configuration/secrets/).

### Cuenta anterior — referencias históricas

- Proyecto conocido: `My project`, ID `3NR51Xmtie3lqXUU`.
- Carpeta EL REY: `GepTwb36yydYZ922`.
- IDs de workflows y versiones: [traspaso principal](../HANDOFF_N8N_WHATSAPP.md).
- URL del webhook de pendientes: `https://almaceneselrey.app.n8n.cloud/webhook/el-rey-whatsapp-automation`.
- Entrada Meta→n8n: consultar `N8N_WEBHOOK_URL` del Worker; no confundirla con el webhook de pendientes.
- Preferencia de Samuel: controlar n8n por MCP. El MCP nativo `mcp__n8n__*` funcionó en la sesión anterior. El 25/09 solo estaba disponible la familia `mcp__codex_apps__n8n_*` y la consulta de 01 falló con `-32603: Internal error`. Redescubrir las herramientas disponibles en el chat nuevo; no asumir que persisten los nombres.

Credenciales conocidas por nombre/ID, sin valores:

| ID | Nombre | Uso |
|---|---|---|
| `yJrsmndjECTPrvyp` | `Postgres account` | PostgreSQL existente |
| `SX6d04isGVo4Szxs` | `EL REY · n8n → Cloudflare` | Cabecera del gateway saliente |
| `iDdHW9zawz0wNIas` | `Header Auth account` | Autenticación de entrada |
| `wnBGAjYX8OzatHnU` | `n8n free OpenAI API credits` | Credencial histórica; saldo y modelos permitidos no verificados hoy |

Las pruebas aisladas también usaron Gateway credits de n8n con una credencial administrada. No copiar una ID inventada ni sustituirla por la credencial gratuita. El saldo de ChatGPT/Codex, el saldo del Gateway y los créditos gratuitos de n8n son cuentas distintas; no consta saldo actual. Leer el valor real del modelo y la credencial: el nombre visual del nodo puede estar desactualizado.

## Supabase

- Project ref: `xmfltwhgvoaleejatxtg`.
- URL: `https://xmfltwhgvoaleejatxtg.supabase.co`.
- Servicios: PostgreSQL, Auth, Storage y Realtime.
- Buckets conocidos: `whatsapp-media`, `payment-qrs`, `payment-receipts`.
- Las migraciones locales no demuestran que se hayan aplicado en remoto. Verificar el historial y el esquema antes de ejecutar SQL.
- Los fundamentos v2 del 20/09 se probaron localmente; no hay constancia en este trabajo de aplicación en producción.

## Cloudflare y dominios

- El 25/09 el endpoint `/api/whatsapp/health` de la intranet respondió `ok:true` y todos sus indicadores de configuración en `true`. Solo comprueba presencia de variables, no validez de credenciales ni estado de entrega. El destino remoto de n8n no se inspeccionó. `wrangler.jsonc` local aún contiene la URL de automatización de la cuenta anterior.

- Más tarde se inspeccionó Settings del Worker en la sesión autenticada de Safari: `N8N_WEBHOOK_URL` apunta a `https://almaceneselrey.app.n8n.cloud/webhook/el-rey-whatsapp-inbound` y `N8N_AUTOMATION_URL` a `https://almaceneselrey.app.n8n.cloud/webhook/el-rey-whatsapp-automation`. Ambos secretos antiguos aparecen como `Value encrypted`. Las URLs se conservaron.
- Acceso administrativo de Wrangler verificado para la cuenta conocida. Cloudflare Builds está conectado a `Polaris-Studi0/grupo-el-rey-operacion`, rama de producción `main`, build `npm run build`, deploy `npx wrangler deploy`. **Un push puede activar un despliegue** aunque no exista un workflow de GitHub Actions.

- Worker: `grupo-el-rey-operacion`; configuración en `wrangler.jsonc`, entrada `src/worker.js`, assets compilados en `dist`.
- Cuenta conocida: `f5f40fe15b916c77d5eb9d5f08d413ff`.
- Zona conocida: `82113267d59fc567af548408f90e8419`.
- GoDaddy es el registrador; según la configuración documentada, DNS y alojamiento están en Cloudflare. No recrear hosting ni apuntar a IP antiguas.
- Cron configurado en el código: cada minuto, para recuperar inbox del Worker. No equivale a un scheduler de recordatorios v2 ya integrado.

## Meta / WhatsApp

- Negocio/app conocido: `Almacenes El Rey`.
- WABA ID: `1108612821745260`.
- Phone Number ID: `1339067702616155`.
- Número empresarial del bot: **+57 314 789 9116**.
- WhatsApp personal de Samuel para avisos/aprobaciones: **+57 312 737 8289**. También se utilizó como cliente de pruebas; separar siempre notificaciones internas del contexto comercial.
- Webhook: `/api/whatsapp/webhook` del Worker. Firma de Meta validada con el secreto configurado.
- Estados de conexión, calidad, plantillas aprobadas y permisos actuales: comprobar en Meta si hacen falta; los documentos antiguos no los acreditan hoy.

## Dónde están las claves y variables

Los valores privados se administran en Cloudflare/n8n y los paneles correspondientes. No imprimirlos, copiarlos al traspaso, incluirlos en el frontend ni en Git.

| Nombre | Ubicación / finalidad |
|---|---|
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` | Secretos del Worker para Meta |
| `WHATSAPP_PHONE_NUMBER_ID`, `META_GRAPH_VERSION` | Configuración de Meta del Worker |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Backend del Worker |
| `SUPABASE_SERVICE_ROLE_KEY` | Compatibilidad heredada; no sustituir una llave moderna funcional |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_GATEWAY_SECRET` | Integración Worker↔n8n |
| `N8N_AUTOMATION_URL` | Webhook de pendientes, definido en `wrangler.jsonc` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Variables públicas de compilación; ejemplo en `.env.example` |
| `RESEND_API_KEY` | Secreto para correo de PQRS; presencia remota no verificada |
| `PQRS_NOTIFICATION_EMAIL`, `PQRS_FROM_EMAIL`, `PQRS_REPLY_TO_EMAIL` | Configuración de correo PQRS en `wrangler.jsonc` |

PQRS está incorporado al código posterior al bot: notificación/respuesta configuradas hacia `elrey@polaris-studio.tech`, remitente `PQRS Almacenes El Rey <pqrs@almaceneselrey.co>`. Conservar esta integración; no inferir su estado remoto a partir del commit.
