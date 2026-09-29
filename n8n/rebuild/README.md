# Bot nuevo — piloto al 29/09/2026

[Motor de atención](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ) publicado en versión `5f3fbc3f-9180-4b5a-b291-1332916472a2`. Worker activo: `b4ec81dc-6818-4237-bbf6-6b565aca9409`.

## Alcance del piloto

El Worker permite la ruta nueva solo al teléfono personal configurado de Samuel y a mensajes posteriores a la fecha de inicio. El resto conserva mantenimiento. **PROBAR BOT** inicia la prueba desde ese teléfono y permite salir de su control manual. Se preservan consentimiento, conversación, historial y pedidos.

El motor usa gpt-5-mini con seis herramientas de contexto: información, promociones, cotización preliminar, referencia QR, pedido vinculado y propuesta de consulta humana. No tiene acceso SQL ni facultad de enviar mensajes por sí mismo.

El consumidor del piloto puede guardar respuestas, crear pendientes, avisar al responsable y devolver su aclaración desde la intranet. Las compras, reservas, aprobaciones de pago y envíos de QR comerciales aún no se ejecutan. El stock sin confirmación explícita se consulta al equipo. La sede de prueba tenía 0 productos activos en la comprobación remota.

Las notificaciones internas se excluyen del contexto público del modelo. Los pendientes se vinculan al mensaje exacto, se recuperan con leases y usan claves idempotentes. La respuesta en intranet conserva la pausa manual; se entrega cuando la conversación vuelve a ser elegible. Avisos fuera de ventana permanecen pendientes; aún faltan plantillas.

## Archivos y contratos

- `attention-core.workflow.json`: exportación del grafo vigente, con `active:false` para no activar al importar. Actualizar el ID existente por MCP, no crear duplicados.
- `attention-fixtures.mjs`: escenarios sintéticos con IDs y vigencia nuevos.
- `attention-evidence-20260928.json`: iteraciones con modelo real, fallos encontrados y correcciones. Un estado success de n8n no equivale a prueba aprobada.
- `pilot-evidence-20260929.json`: publicación, validación remota y límites del piloto.
- `acceptance-cases.json`: 37 escenarios comerciales; aún no todos ejecutados.

Entrada `el-rey.bot.turn.v1`: test/synthetic, preview/intranet o pilot/intranet. Los modos reales exigen huella de contexto y versiones; control manual, falta de autorización o contexto vencido bloquean IA. Salida `el-rey.bot.decision.v1`, siempre una propuesta con `send_allowed=false` y `mutations_executed=[]`. Solo el Worker puede validar y ejecutar los efectos permitidos del piloto.

El webhook privado usa la credencial `EL REY · Intranet → n8n`. **No guardar ejecuciones exitosas, fallidas, manuales ni progreso**: contienen cabecera privada e historial. Las exportaciones conservan estos ajustes.

## Pruebas realizadas

- 18 pruebas locales de vista previa y validadores extraídos del workflow exportado.
- 10 pruebas del piloto: aislamiento por teléfono/fecha, persistencia previa, control manual, cambios durante IA, pendientes/avisos, historial separado, retirada de consentimiento y continuación humana.
- 11 pruebas de conexión, 12 de control manual y dos variantes PostgreSQL de ese control.
- 148 regresiones heredadas y escenarios PostgreSQL aislados. No son pruebas de aceptación del motor nuevo.
- 7 pruebas HTTP del motor publicado con datos sintéticos y modelo real: autenticación, bloqueo general, pausa, atención humana, vista previa y piloto.
- Workerd local → n8n publicado con base sintética: aprobado. Supabase remoto: contexto y funciones disponibles; Meta: autenticación y número empresarial comprobados.
- Build/lint aprobados. Persiste el aviso de tamaño de bundle de Vite. Sin manejo de pantalla ni revisión visual de UI.

**Entrega real aprobada el 29/09 a las 09:00 Colombia:** recepción, respuesta y confirmación Meta `read`, un intento y unos 13 segundos. Recorrido completo del aviso/aclaración aprobado también: aviso personal y devolución de la respuesta desde intranet con estado Meta `read`. No se simularon mensajes suyos ni se enviaron compras ficticias.

```bash
npm run test:bot-preview
npm run test:bot-pilot
npm run test:bot-connection
npm run test:whatsapp-control
npm run test:whatsapp
npm run check:bot-attention
```

El último comando consume ejecuciones/modelo del motor publicado y usa solo datos sintéticos. Lee la clave privada desde `~/.config/grupo-el-rey/n8n-rebuild-secrets.json`, sin imprimirla. `npm run check:bot-connection` prueba separadamente el diagnóstico.

## Diagnóstico y control manual anteriores

El diagnóstico `9rR5rLK8oW5FLnF0` sigue publicado en versión `04d9bd27-8bcc-4a28-8c06-a7e402c9c54c`. Evidencia: `connection-evidence-20260926.json`. Control manual: `manual-control-evidence-20260926.json`; migración del 26/09 previamente aplicada. No aplicar las migraciones v2 históricas automáticamente.

## Pendientes antes de ampliar

Completar versión/lease transaccional del turno nuevo, inventario confirmado y catálogo operable, carrito/opciones persistidos, reservas, cotización y pedido, QR comercial, medios interpretados, respuesta del dueño por WhatsApp, horarios/recordatorios y plantillas. Revalidar cada efecto y el control humano en pruebas integradas.

Título sugerido de commit: **Activar piloto de WhatsApp con n8n, consultas humanas y pruebas desde intranet**. No se hizo commit ni push; Samuel los realiza manualmente.

## Incidente de recepción corregido — 29/09, 09:00 Colombia

Samuel reportó que envió mensajes y no recibió respuesta. El diagnóstico privado confirmó recepción auténtica por Meta y persistencia de los mensajes; el bloqueo ocurrió antes de llamar a n8n. `privacy_consents` usa `captured_at`, pero el piloto ordenaba por `created_at`. Se corrigió la consulta y se incluyó en la comprobación del esquema remoto. Las pruebas del piloto ahora contrastan las columnas de esa consulta contra la migración SQL.

Worker corregido `c613bd76-07c6-49b2-8325-9fc56f13a533` publicado al 100%, con bindings y runtime conservados respecto a `2779f9b5-3acf-49ef-a780-b8406bbd704c`. Comprobación privada de producción aprobada (Meta, datos, consentimiento y contexto). No se reenviaron mensajes históricos; algunos eventos agotaron sus reintentos antes de la corrección. Se solicitó un mensaje nuevo de horario para comprobar la respuesta completa. **Prueba posterior aprobada:** el mensaje nuevo de horario fue recibido a las 09:00:26, procesado a las 09:00:39 y la respuesta tiene estado Meta `read`.

`GET /api/bot/pilot/status?diagnostics=true`, protegido por `N8N_REBUILD_GATEWAY_SECRET`, muestra metadatos de recepción/entrega del teléfono piloto sin incluir textos de clientes ni secretos.

**Prueba de información faltante aprobada (09:02 Colombia):** la consulta del cargador generó una respuesta al cliente y un aviso al dueño; ambos tienen estado Meta `read`. Pendiente humano `f8a8dd2a-3c35-470a-87c6-b9076aeab71f`. Samuel lo aclaró en **WhatsApp e IA → Pendientes → Confirmar respuesta**. Su aclaración se envió a las **09:03:32 Colombia**, mensaje `7711310f-80fb-4bf5-b261-856566e97fc0`, con estado Meta `read`. El ciclo completo está aprobado con mensajes reales; no se inventó información comercial.

## Aclaraciones naturales — 29/09, 09:16 Colombia

Samuel pidió que la respuesta del operador se use como información y no se cite con «el equipo responde» ni se copie la pregunta interna. La continuación de un pendiente ahora consulta el motor nuevo con una aclaración confirmada vinculada al pendiente y a la sede. El motor consulta ese hecho y redacta una o dos frases sin atribución interna, sin datos ajenos ni nuevas gestiones. No transforma la aclaración en pedido, pago, QR o nueva derivación. Las aclaraciones también se integran naturalmente en las consultas posteriores de esa conversación.

Antes de encolar se revalidan contexto, control manual y la respuesta confirmada. Los reintentos reutilizan el texto ya encolado; no generan otra redacción. Si falla el modelo, se usa el dato confirmado directamente, sin el encabezado anterior ni la pregunta interna. No se reenviaron respuestas históricas ni se modificaron pedidos.

Workflow publicado: `5f3fbc3f-9180-4b5a-b291-1332916472a2`. Worker: `b4ec81dc-6818-4237-bbf6-6b565aca9409`. Pruebas: 14 de piloto, 19 de contexto/contrato, 7 HTTP del motor y 3 casos de aclaración con modelo real y datos sintéticos. Los tres casos conservan negación, precio/condiciones e incertidumbre. Evidencia: `n8n/rebuild/clarification-evidence-20260929.json`; reproducir con `node scripts/check-bot-clarifications.mjs`. Esta nueva redacción todavía no se ha comprobado con otro envío real al teléfono; la entrega y el ciclo humano del piloto anterior sí están acreditados arriba.
