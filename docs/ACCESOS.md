# Accesos e identificadores

Actualizado: 25/09/2026. Inventario de referencias conocidas; **no contiene secretos**. Salvo indicación expresa, los servicios no fueron autenticados ni verificados nuevamente ese día. No pedir al usuario claves que ya están configuradas sin antes revisar las conexiones existentes.

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
| n8n | https://almaceneselrey.app.n8n.cloud |
| Supabase | https://supabase.com/dashboard/project/xmfltwhgvoaleejatxtg |

## n8n

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
