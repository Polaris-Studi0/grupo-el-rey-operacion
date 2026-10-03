# Bot de WhatsApp — 03/10/2026

Estado vigente y límites: [HANDOFF_N8N_WHATSAPP.md](../../HANDOFF_N8N_WHATSAPP.md).

[Motor de atención](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ), última versión conocida `7a0006c7-ab76-4738-ad65-b3aeebb427fa`; Worker vigente `48b10c7d-10f1-4218-ac4c-da55618fc25f`. El03/10 MCP nativo requirió autenticación y el plugin devolvió error interno; no se modificó ni revalidó el workflow ese día. Apertura pública y demo individual autorizados y publicados el01/10; campañas completas aplazadas.

## Categorías generales y avisos internos — 03/10

Las seis líneas confirmadas por Samuel están en conocimiento general activo, sin afirmar existencias: hogar, aseo, cosméticos, electrodomésticos, belleza y juguetería. Una pregunta general clara usa directamente esa fuente. La consulta real09:24 creó un pendiente sin intentar aviso por el corte prematuro de23h; el responsable llevaba23h20. Ventana del responsable ampliada a23h55 y revalidada antes de enviar, cliente intacto. Migración específica202610030001 aplicada; no reenviar el pendiente antiguo.99 pruebas Node/26 grupos DB y diagnóstico publicados aprobados. Fuera de24h todavía falta plantilla interna adecuada. Detalles en [revisión del03/10](../../docs/BOT_REVIEW_20261003.md).

## Datos de domicilio juntos — 02/10

Revisión de siete conversaciones/155 mensajes. Formulario único para catálogo/selección humana; captura de listas y frases, comprador/receptor compartido solo cuando corresponde, datos parciales y recordatorio únicamente de faltantes. Audio solicita texto y no avanza compra. Migración específica 202610020001 aplicada; no volver a ejecutarla ni aplicar todas las migraciones. Detalles y pendientes en [revisión](../../docs/BOT_REVIEW_20261002.md).

87 pruebas Node/20 grupos DB y ocho propuestas del modelo sintético verificadas, lint/build y diagnóstico remoto aprobados. Falta nueva entrega real por WhatsApp; no enviar ni reproducir mensajes históricos para comprobarlo. `node scripts/check-bot-checkout-batch.mjs` genera decisiones sintéticas; `--verify-saved` revalida la evidencia existente sin llamadas al modelo.

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

### Horarios — 02/10 noche

Atención diaria09:00–20:00 y domicilios09:00–19:00, hora Colombia, aplicados por Worker/SQL con `BOT_SERVICE_HOURS_ENABLED`. n8n recibe los horarios como información confirmada y mantiene versión7a0006c7. Las esperas y mensajes desde la siguiente apertura están en `bot_service_waits`, con un trabajo por cron, autorización vigente y sin duplicar envíos inciertos. Privacidad inicial reconoce SI/SÍ/ACEPTO tras aviso entregado. Ver `docs/BOT_SERVICE_HOURS_20261002.md`; no activar v2 ni repetir la limpieza.
