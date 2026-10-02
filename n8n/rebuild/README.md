# Bot de WhatsApp — 01/10/2026

Estado vigente y límites: [HANDOFF_N8N_WHATSAPP.md](../../HANDOFF_N8N_WHATSAPP.md).

[Motor de atención](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ) publicado en `67d1cdbc-a5ee-4bc0-99f8-99f65d7fca07`; Worker `85efc235-f216-49ee-9834-903a8e65c0cf`. Apertura pública y demo individual autorizados y publicados el 01/10; campañas completas aplazadas.

## Contrato y responsabilidades

Meta → Worker (firma, inbox durable y adjuntos) → contexto verificado de Supabase → n8n → propuesta validada → transacción comercial → cola → Meta.

n8n usa gpt-5-mini y seis herramientas acotadas. Entrada privada `el-rey.bot.turn.v1`: modos test/synthetic, preview/intranet o pilot/intranet. Contexto real exige huella, versiones, consentimiento, sede y control automático. Salida `el-rey.bot.decision.v1`, siempre `send_allowed=false`, sin mutaciones; propone información, productos, cotización, QR, pendiente humano o parche checkout/aceptación/cancelación.

El Worker y Supabase validan las acciones: carrito, stock confirmado hasta el cierre del día, tarifa humana, resumen entregado/aceptado, reserva, QR exacto, comprobante y aprobación humana explícita. El bot nunca aprueba pagos. Un pedido solo se anuncia después de insertarlo de forma idempotente. Las aclaraciones humanas se incorporan naturalmente, sin atribuciones internas.

`attention-core.workflow.json` es la exportación vigente con `active:false` para evitar activación al importar. Actualizar el ID existente por MCP. **No guardar ejecuciones**: las cabeceras y el contexto incluyen información privada.

## Corrección de sedes y envíos

«muéstrame todas las sedes» y «qué sedes son» usan el directorio activo directamente desde el Worker, sin IA ni tareas humanas. Nombres y numeración normal; sin b1/b10. Cambiar sede actualiza la conversación real y respeta compras activas.

Se reprodujo `missing_tool_evidence` en la IA y se corrigió la obligación de consultar información. Se redujeron las consultas por turno mediante `bot_context_snapshot`; respuesta al cliente primero y aviso privado después. Prueba integrada de derivación: 33 consultas, debajo del presupuesto de 50 usado por la regresión. La misma prueba con el Worker anterior supera ese presupuesto. Recuperación cron de un trabajo por ejecución.

**Entrega real confirmada el 29/09 a las 20:29 Colombia**: lista recibida por Samuel, estado Meta read, un intento, evento completo en 4,3 segundos. El ciclo humano anterior también tiene evidencia real (09:03). No confundirlo con aceptación comercial completa.

## Pruebas

```bash
npm run test:bot-commerce
node --test tests/whatsapp-ingress.test.mjs
npm run check
npm run build
npm run check:bot-commerce
```

El último comando consume modelo/n8n con datos sintéticos y no envía mensajes a clientes. Claves leídas fuera del repositorio, sin imprimir valores. 51 pruebas Node comerciales y 12 grupos PostgreSQL aislados aprobados; cinco propuestas comerciales HTTP con modelo real aprobadas. Las pruebas del webhook simulan Meta/base, mientras que la confirmación real de sedes está documentada por separado.

Otros casos/evidencia: `acceptance-cases.json` (no todos ejecutados), `attention-fixtures.mjs`, `pilot-evidence-20260929.json`, `clarification-evidence-20260929.json`, `commerce-evidence-20260929.json`, `sedes-evidence-20260929.json`. Los archivos anteriores conservan la versión/hora a la que corresponden.

## Pendientes

Samuel no quiere cargar promociones todavía; las subirá a la intranet cuando existan. No crear catálogo ficticio. Faltan compra real completa y QR por sede, horarios/recordatorios, lectura de medios, respuesta humana por WhatsApp citado y plantillas fuera de ventana. Todos los números usan ahora el motor nuevo; no se restauró el bot antiguo. Ver límites de avisos fuera de ventana y recuperación en el traspaso.

Migraciones 202609290001 a 202609290004 y 202609300001/002/003/004 aplicadas; v2 del 20/09 no aplicada. Limpieza manual de Samuel terminada: no repetirla. No commit/push automático. Información detallada, accesos y versiones en el traspaso principal.

## Selección después de la respuesta humana

`confirmed_answers` contiene hechos del operador de esta conversación/sede. `confirmed_item` permite recordar un artículo elegido con fuente literal, precio y talla verificados. SQL guarda `pending_selection` y recoge los datos faltantes; después pide solo conteo. La intranet exige conteo y aprobación explícitos antes de registrar inventario regular. Luego se aplican resumen, reserva y pago existentes.

La prueba aislada cubre desde aclaración hasta pedido. La propuesta con contexto real identificó Superman unitalla a $50.000 sin derivación; no fue enviada. Falta probar nuevamente por WhatsApp. No se cargaron productos. Evidencia sintética en `confirmed-selection-evidence-20260930.json`; reproducir con `node scripts/check-bot-confirmed-selection.mjs` (o un nombre de caso como argumento para repetir solo ese caso).

## Recogida de datos de domicilio

`bot-checkout.js` interpreta datos inequívocos sin IA y recupera campos explícitos faltantes de la cotización actual. Nombres del perfil y compras previas no rellenan campos. n8n interpreta datos compuestos y consultas; una aclaración de compra incompleta usa preguntas de la transacción y no puede anunciar un envío listo. El nombre del comprador y el destinatario son distintos.

La prueba de base aislada recorre las frases del incidente hasta confirmar datos completos y solicitar conteo. `node scripts/check-bot-checkout-continuity.mjs` verifica además dos rutas directas y tres propuestas con el modelo publicado. Evidencia en `checkout-continuity-evidence-20260930.json`. Falta nueva entrega real tras esta corrección; continuar en WhatsApp con dirección y barrio sin repetir nombre/teléfono.

## Seguimiento y esperas naturales

Pedido piloto REY-1003 registrado y recibido por Samuel, con aprobación manual de pago. `bot-orders.js` responde consultas claras de estado/llegada desde el pedido autorizado, usando `promised_at` en Colombia. La estimación no se reinicia; si venció o falta, solicita actualización humana. Esperas naturales: «Dame un momento y te confirmo». La confirmación inicial ya no afirma automáticamente que falta la hora. Pruebas aprobadas y reproducción de contexto real sin enviar mensajes; falta nueva entrega de esta corrección por WhatsApp.

## Fotos y sesiones

`product_images` contiene referencias autorizadas; n8n propone hasta dos `media_ids` y el servidor revalida y envía desde el bucket privado. El operador carga fotos en Inventario o Pendientes. Las sesiones nuevas se crean tras 24 horas sin mensajes del cliente, conservando pedidos/historial/control manual y sin arrastrar sede o carrito. Migraciones 202609300005/006/007 aplicadas. `node scripts/check-bot-product-images.mjs`: tres casos sintéticos con el modelo real aprobados, sin enviar mensajes; falta foto real cargada para la prueba de entrega.

**Publicidad aplazada por Samuel.** Código preparatorio conservado y deshabilitado en interfaz, API y cron. No hay campañas enviadas. No habilitar ni seguir construyéndola hasta que él la retome.

## Continuidad de talla y descuento — 01/10

Se pregunta la talla pendiente entre varias opciones, conservando producto/precio después de negar un descuento. Selección humana literal y stock contado siguen siendo cosas distintas. Agente: máximo dos intentos de generación; las validaciones posteriores y el envío idempotente se conservan. Nombre del perfil omitido del prompt para evitar tratarlo como comprador confirmado. Error clasificado sin exponer contenido ni guardar ejecuciones.

Prueba con modelo sin envíos: `node scripts/check-bot-size-discount.mjs`. Evidencia: `size-discount-evidence-20261001.json`. Contrato/contexto: 28 pruebas aprobadas. Falta prueba real de Samuel; no atribuir una causa exacta al fallo original sin evidencia.

Privacidad vigente pública: https://almaceneselrey.co/privacidad. Aviso nuevo/version2026-10-01; autorizaciones anteriores conservadas. Chat interno de sedes es independiente de n8n/WhatsApp; estado y límites de avisos en HANDOFF.
