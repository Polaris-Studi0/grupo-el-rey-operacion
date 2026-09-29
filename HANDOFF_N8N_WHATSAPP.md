# Traspaso vigente — Grupo Almacenes El Rey

Actualizado el **29/09/2026**, Colombia.

## Estado vigente

Samuel pidió lanzar el nuevo bot a WhatsApp para probarlo con su número personal y confirmó que, si falta información, debe recibir un aviso para aclararla en la intranet. Se publicó un **piloto limitado**, no la versión comercial completa.

- Worker activo: `b4ec81dc-6818-4237-bbf6-6b565aca9409`, al 100%. Anterior: `d48b21d3-7e03-4592-83da-b04e45e6628f`.
- [Motor nuevo en n8n](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ): 17 nodos, modelo gpt-5-mini por Gateway y seis herramientas. Publicado: `5f3fbc3f-9180-4b5a-b291-1332916472a2`.
- Entrada privada: `POST /webhook/el-rey-assistant-turn-v1`. Modos test, preview y pilot; el motor solo devuelve propuestas. No guarda datos de ejecuciones.
- `BOT_PILOT_ENABLED=true`, contacto autorizado **+57 312 737 8289**, mensajes posteriores a `2026-09-29T05:00:41.000Z`. Número empresarial **+57 314 789 9116**.
- Los mensajes de otros contactos conservan la ruta antigua de mantenimiento. No se cambiaron las URLs comerciales antiguas ni se reactivó el agente anterior.
- Se conservaron bindings, secretos, configuración de ejecución y PQRS. Nuevos assets: `index-BagG0HoE.js` / `index-CHMuJAxa.css`. No se aplicaron migraciones en este avance.
- Comprobación remota: Meta autenticado, funciones de Supabase presentes y contexto de la sede de prueba legible (2 registros informativos, 0 productos activos, 1 referencia QR). Esto no prueba entrega de WhatsApp.
- **Entrega real confirmada:** mensaje de horario recibido a las 09:00:26 Colombia y procesado a las 09:00:39, un solo intento; respuesta con estado Meta `read`. El recorrido pendiente → aviso → aclaración → respuesta también pasó: la aclaración de Samuel se envió a las 09:03:32 y tiene estado Meta `read`.

## Cómo probar

Desde el teléfono personal autorizado, escribir **PROBAR BOT** al número empresarial. Este comando inicia la prueba y libera control manual únicamente en ese chat; los reintentos del mismo evento no vuelven a liberarlo. Los demás mensajes respetan la pausa manual.

Preguntar información de la sede y luego algo no registrado. La segunda consulta debe crear un pendiente propio del piloto, avisar al WhatsApp personal y permitir responder desde la intranet. El aviso se excluye del historial que recibe la IA. La respuesta del equipo se devuelve al cliente y queda disponible como información de esa conversación.

La intranet también incluye **Generar respuesta de prueba** y **Usar como borrador** dentro de una conversación. La vista previa no envía nada y requiere sesión, sede, consentimiento y control automático.

## Implementación y comprobaciones

- `src/bot-pilot.js`: selección por contacto/fecha, ingreso durable, adjuntos antes de IA, contexto, respuestas, pendientes, avisos y continuación desde intranet.
- `src/bot-preview.js`: contexto limitado por sede y conversación; claves modernas de Supabase sin Bearer JWT; descarte por cambios de permisos/contexto; separación de notificaciones internas y respuestas humanas.
- El piloto reutiliza las funciones transaccionales revisadas `ingest_whatsapp_message`, `persist_whatsapp_commercial_response`, `create_human_task` y la cola/claims existentes. El adaptador solo permite responder o consultar al equipo; nunca mapea a finalizar pedidos, aprobar pagos o enviar QR.
- Pendientes del piloto identificados por `context.pilot_engine=new-whatsapp-v1`; recuperación cada minuto con leases e idempotencia. La aclaración en la intranet se enruta al consumidor nuevo en vez del webhook anterior.
- 18 pruebas de contexto/contrato, 10 de piloto, 11 de conexión y 12 de control manual aprobadas; dos variantes PostgreSQL de control manual y 148 regresiones heredadas aprobadas. Lint/build correctos.
- 7 comprobaciones HTTP del motor publicado con datos sintéticos y llamadas reales al modelo aprobadas. Prueba de workerd local hacia n8n publicado con base sintética aprobada.
- Exportación, fixtures, evidencia y comandos en [n8n/rebuild/README.md](n8n/rebuild/README.md). Archivos privados de despliegue en `~/.config/grupo-el-rey/attention-20260928/`; no copiar secretos.

## Límites y siguiente trabajo

1. Primer intercambio real y ciclo aviso → aclaración desde intranet → devolución al cliente aprobados. Mantener el piloto limitado mientras se completan compras e inventario.
2. El inventario de la sede de prueba no tiene productos activos. Implementar confirmación explícita del conteo manual y su vigencia; `updated_at` no acredita stock. Cargar promociones reales desde la intranet.
3. Completar consumidor comercial con transacciones que comparen versiones de control/contexto al confirmar efectos. El piloto revalida antes de guardar y despachar, pero aún reutiliza RPC heredadas sin un CAS completo del contrato nuevo.
4. Carrito/opciones durables, reserva de stock, cotización aceptada, QR exacto y creación de pedido siguen pendientes. Actualmente cualquier propuesta de QR/cotización se deriva al equipo.
5. Visión/audio/PDF, respuesta humana por WhatsApp vinculada, horarios comerciales/recordatorio y plantillas para avisos fuera de ventana todavía no están completos. El piloto del dueño permite pruebas fuera del horario comercial; no extender esa excepción.
6. Avisos al dueño requieren un mensaje suyo en las últimas 23 horas; si no hay ventana, quedan pendientes. No afirmar que se enviaron.
7. Las 37 pruebas comerciales de aceptación no están todas ejecutadas. Los tests heredados no acreditan el bot completo.

## Estado anterior que se conserva

El control manual y el historial por conversación se publicaron previamente. Migración remota confirmada: `202609260001_whatsapp_manual_control.sql`. No volver a aplicarla sin comprobar historial. Las migraciones v2 del 20/09 se probaron localmente, pero no están acreditadas en producción; **no ejecutar todas las migraciones pendientes**.

El diagnóstico `9rR5rLK8oW5FLnF0` continúa publicado en versión `04d9bd27-8bcc-4a28-8c06-a7e402c9c54c`. El laboratorio `FNofeL4WI8mcU2qE` permanece separado del canal real.

## Accesos, preferencias y referencias

Aplicación: `/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma`. Repositorio: `Polaris-Studi0/grupo-el-rey-operacion`.

Usar MCP nativo `mcp__n8n__*`, que funcionó. El conector `mcp__codex_apps__n8n_*` había fallado con -32603. Redescubrir acceso al retomar. No manejar pantalla; sí editar código y usar CLI.

No borrar datos ni revertir PQRS. No commit/push: Samuel los realiza en GitHub Desktop y un push puede desplegar por Cloudflare Builds. HEAD al iniciar: `e0922ad`; los cambios nuevos siguen sin commit.

Leer [accesos](docs/ACCESOS.md), [arquitectura objetivo](docs/ARQUITECTURA_BOT_NUEVO.md), [requisitos](docs/CHATBOT_N8N.md) y [evidencia actual](n8n/rebuild/README.md). La arquitectura del 25/09 describe el objetivo; este traspaso determina el estado implementado. La infraestructura antigua está documentada como referencia y no debe restaurarse.

## Incidente de recepción corregido — 29/09, 09:00 Colombia

Samuel reportó que envió mensajes y no recibió respuesta. El diagnóstico privado confirmó recepción auténtica por Meta y persistencia de los mensajes; el bloqueo ocurrió antes de llamar a n8n. `privacy_consents` usa `captured_at`, pero el piloto ordenaba por `created_at`. Se corrigió la consulta y se incluyó en la comprobación del esquema remoto. Las pruebas del piloto ahora contrastan las columnas de esa consulta contra la migración SQL.

Worker corregido `c613bd76-07c6-49b2-8325-9fc56f13a533` publicado al 100%, con bindings y runtime conservados respecto a `2779f9b5-3acf-49ef-a780-b8406bbd704c`. Comprobación privada de producción aprobada (Meta, datos, consentimiento y contexto). No se reenviaron mensajes históricos; algunos eventos agotaron sus reintentos antes de la corrección. Se solicitó un mensaje nuevo de horario para comprobar la respuesta completa. **Prueba posterior aprobada:** el mensaje nuevo de horario fue recibido a las 09:00:26, procesado a las 09:00:39 y la respuesta tiene estado Meta `read`.

`GET /api/bot/pilot/status?diagnostics=true`, protegido por `N8N_REBUILD_GATEWAY_SECRET`, muestra metadatos de recepción/entrega del teléfono piloto sin incluir textos de clientes ni secretos.

**Prueba de información faltante aprobada (09:02 Colombia):** la consulta del cargador generó una respuesta al cliente y un aviso al dueño; ambos tienen estado Meta `read`. Pendiente humano `f8a8dd2a-3c35-470a-87c6-b9076aeab71f`. Samuel lo aclaró en **WhatsApp e IA → Pendientes → Confirmar respuesta**. Su aclaración se envió a las **09:03:32 Colombia**, mensaje `7711310f-80fb-4bf5-b261-856566e97fc0`, con estado Meta `read`. El ciclo completo está aprobado con mensajes reales; no se inventó información comercial.

## Aclaraciones naturales — 29/09, 09:16 Colombia

Samuel pidió que la respuesta del operador se use como información y no se cite con «el equipo responde» ni se copie la pregunta interna. La continuación de un pendiente ahora consulta el motor nuevo con una aclaración confirmada vinculada al pendiente y a la sede. El motor consulta ese hecho y redacta una o dos frases sin atribución interna, sin datos ajenos ni nuevas gestiones. No transforma la aclaración en pedido, pago, QR o nueva derivación. Las aclaraciones también se integran naturalmente en las consultas posteriores de esa conversación.

Antes de encolar se revalidan contexto, control manual y la respuesta confirmada. Los reintentos reutilizan el texto ya encolado; no generan otra redacción. Si falla el modelo, se usa el dato confirmado directamente, sin el encabezado anterior ni la pregunta interna. No se reenviaron respuestas históricas ni se modificaron pedidos.

Workflow publicado: `5f3fbc3f-9180-4b5a-b291-1332916472a2`. Worker: `b4ec81dc-6818-4237-bbf6-6b565aca9409`. Pruebas: 14 de piloto, 19 de contexto/contrato, 7 HTTP del motor y 3 casos de aclaración con modelo real y datos sintéticos. Los tres casos conservan negación, precio/condiciones e incertidumbre. Evidencia: `n8n/rebuild/clarification-evidence-20260929.json`; reproducir con `node scripts/check-bot-clarifications.mjs`. Esta nueva redacción todavía no se ha comprobado con otro envío real al teléfono; la entrega y el ciclo humano del piloto anterior sí están acreditados arriba.
