# Traspaso de contexto — Grupo Almacenes El Rey

Actualizado: 8 de septiembre de 2026 (America/Bogota)

## Última revisión del bot

9 de septiembre, después de la pausa por créditos: revisión de descubrimiento de productos y reinicio de compras publicada en 03, versión `b5b5af00-803e-43ae-b3fd-8ebee75c389f`. Migración `202609090001_whatsapp_purchase_reset.sql` aplicada y verificada. Historial de pruebas limpiado: cero contactos, conversaciones, mensajes y pedidos. Respaldo privado en Supabase `elrey_test_backups.whatsapp_20260909` (506 registros). Las siguientes pruebas comienzan desde el consentimiento. No borrar ni reejecutar ese respaldo. Ver detalles en `n8n/REVISION_20260908.md`.

9 de septiembre: se corrigieron errores observados en una conversación real (destinatario, prueba de producto manual, tareas anunciadas sin crearse, tarifa interna y pagos declarados). Leer la sección «Corrección tras transcripción real» del informe enlazado abajo. La compra previa pagada en tienda requiere verificación y coordinación de Operación; no se aprueba ni se duplica automáticamente.

Se aplicó la revisión comercial v3: flujos 01, 03, 04 y 05 publicados y nueva función de persistencia aplicada en Supabase. Leer primero [el informe de revisión](n8n/REVISION_20260908.md) para conocer cambios, versiones, pruebas y límites. Las ofertas aún no están definidas. Queda pendiente una conversación real de extremo a extremo y el envío de listas interactivas de sedes. Hay cambios locales sin commit ni push. Se mantiene el horario temporal de pruebas.

Este documento permite continuar el trabajo en un chat nuevo sin reconstruir el contexto. No contiene contraseñas, tokens ni llaves privadas: esos valores ya están guardados en Cloudflare, n8n, Supabase y Meta.

## Mensaje para iniciar el chat nuevo

Copia y pega este bloque como primer mensaje del chat nuevo:

```text
Continúa el proyecto de WhatsApp, n8n e intranet de Grupo Almacenes El Rey.

El repositorio local está en:
/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma

Lee primero el archivo:
/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma/HANDOFF_N8N_WHATSAPP.md

Usa la conexión de n8n ya autorizada para inspeccionar y modificar los flujos existentes. Antes de cambiar algo, verifica el estado real en el repositorio y en n8n. No recrees los flujos desde cero ni dupliques workflows. Conserva la idempotencia y evita ejecuciones de prueba innecesarias porque el plan de n8n tiene un límite bajo.

Estado importante: el historial de conversaciones y pedidos de prueba se limpió y el consecutivo volvió a 1001. La restricción de horario del asistente está desactivada temporalmente para hacer pruebas; debe restaurarse antes de producción. El siguiente paso es probar una conversación completa desde cero, incluyendo QR, comprobante, intervención humana y creación del pedido.

El usuario prefiere hacer manualmente commit y push con GitHub Desktop cuando se lo pidan. Si comparte una credencial durante el trabajo, no le pidas rotarla únicamente por haberla compartido con el asistente. Nunca publiques secretos en GitHub ni los copies a archivos de traspaso.
```

## Objetivo del sistema

Operar un asistente comercial de WhatsApp conectado con la intranet de Almacenes El Rey. El bot debe:

- pedir consentimiento una sola vez por contacto;
- saludar y confirmar el nombre real del cliente;
- identificar la sede;
- conservar el contexto completo de la compra;
- consultar o escalar existencia, precio, domicilio, pago y crédito;
- continuar la venta de forma natural, sin repetir “¿seguimos con el pedido?”;
- enviar el QR específico de la sede;
- recibir comprobantes y mostrarlos en la intranet;
- permitir intervención humana, instrucciones al bot y toma manual de la conversación;
- crear el pedido operativo al completar la venta;
- conservar trazabilidad e idempotencia sin duplicar mensajes, pedidos ni consumos.

## Repositorio y publicación

- Repositorio local: `/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma`
- GitHub: `https://github.com/Polaris-Studi0/grupo-el-rey-operacion.git`
- Rama de producción: `main`
- Worker de Cloudflare: `grupo-el-rey-operacion`
- URL de Worker: `https://grupo-el-rey-operacion.throbbing-salad-55e3.workers.dev`
- Archivo principal del Worker: `src/worker.js`
- Configuración de despliegue: `wrangler.jsonc`
- Comandos de verificación: `npm run check` y `npm run build`
- Publicación directa del Worker, cuando sea necesaria: `npx wrangler deploy`
- El usuario normalmente hace `commit` y `push` manualmente con GitHub Desktop.

Últimos commits relevantes:

- `ad65b03` — corrección de idempotencia del payload saliente.
- `22a5449` — actualización de `wrangler.jsonc`.
- `add4efc` — envío de QR y comprobantes visibles en vivo.
- `28e7477` — control manual de WhatsApp y QR por sede.
- `6814b7f` — correcciones del flujo comercial y pendientes.
- `6e92fb3` — identidad de contactos de WhatsApp.
- `44cd7bc` — continuidad del chatbot.

## Dominios y DNS

- Landing: `https://almaceneselrey.co`
- Landing alternativa: `https://www.almaceneselrey.co`
- Intranet: `https://intranet.almaceneselrey.co`
- Registrador: GoDaddy.
- DNS autoritativo: Cloudflare; los nameservers ya fueron cambiados y el dominio quedó activo/protegido.
- Cloudflare Zone ID: `82113267d59fc567af548408f90e8419`
- Cloudflare Account ID: `f5f40fe15b916c77d5eb9d5f08d413ff`

La landing y la intranet son rutas del mismo Worker. No volver a crear hosting en GoDaddy ni apuntar el dominio a las antiguas IP de aparcamiento.

## Accesos e identificadores de servicios

### n8n

- Instancia: `https://almaceneselrey.app.n8n.cloud`
- Proyecto: `My project`
- Project ID: `3NR51Xmtie3lqXUU`
- Carpeta de flujos EL REY: `GepTwb36yydYZ922`
- Webhook llamado por el Worker: `https://almaceneselrey.app.n8n.cloud/webhook/el-rey-whatsapp-automation`
- Credenciales visibles en el proyecto, sin incluir sus valores:
  - `SX6d04isGVo4Szxs` — `EL REY · n8n → Cloudflare` (`httpHeaderAuth`).
  - `iDdHW9zawz0wNIas` — `Header Auth account` (`httpHeaderAuth`).
  - `wnBGAjYX8OzatHnU` — `n8n free OpenAI API credits` (`openAiApi`, administrada por n8n).
  - `yJrsmndjECTPrvyp` — `Postgres account` (`postgres`).
- Las credenciales de OpenAI, PostgreSQL y las cabeceras internas se administran desde n8n; no copiar sus valores a código.

### Supabase

- Project ref: `xmfltwhgvoaleejatxtg`
- Project URL: `https://xmfltwhgvoaleejatxtg.supabase.co`
- Se usa como PostgreSQL, Auth, Storage y Realtime.
- La llave pública del frontend se configura como `VITE_SUPABASE_ANON_KEY`.
- La llave privada moderna se guarda como `SUPABASE_SECRET_KEY` exclusivamente en Cloudflare/n8n.
- No exponer `service_role` en el frontend ni en GitHub.

### Meta / WhatsApp

- Negocio y app: `Almacenes El Rey`
- WhatsApp Business Account ID: `1108612821745260`
- Número conectado: `+57 314 7899116`
- Phone Number ID: `1339067702616155`
- El número figuraba como Registered/Connected y con calidad High.
- El webhook de Meta apunta al Worker en `/api/whatsapp/webhook`.

## Secretos existentes

Los valores no están en este documento. Comprobarlos o administrarlos en los paneles correspondientes.

Secretos/variables privadas del Worker:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` solo como compatibilidad heredada
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- `N8N_GATEWAY_SECRET`
- `META_GRAPH_VERSION` opcional

Variables públicas de compilación:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Variable no secreta en `wrangler.jsonc`:

- `N8N_AUTOMATION_URL=https://almaceneselrey.app.n8n.cloud/webhook/el-rey-whatsapp-automation`

## Arquitectura activa

```text
Cliente en WhatsApp
  -> webhook de Meta
  -> Cloudflare Worker
  -> persistencia y deduplicación en Supabase
  -> n8n 01 Entrada
      -> n8n 02 Consentimiento, si hace falta
      -> n8n 03 Asistente comercial
      -> n8n 04 Pendientes humanos, cuando se requiere confirmación
  -> cola saliente idempotente en Supabase
  -> Cloudflare Worker
  -> Meta / WhatsApp

n8n 05 ejecuta la reapertura de conversaciones a las 9:00 a. m.
La intranet lee y modifica el mismo estado en Supabase y recibe cambios en tiempo real.
```

El Worker persiste el evento antes de responder a Meta. Los eventos y mensajes usan claves idempotentes y leases para impedir duplicados. n8n debe responder `2xx` solo cuando el procesamiento termine correctamente.

## Workflows de n8n

Todos los flujos operativos estaban activos al cerrar este traspaso.

| ID | Nombre | Función |
|---|---|---|
| `dgAsTSuWoX6mfYOn` | `EL REY · 01 · WhatsApp · Entrada y trazabilidad` | Recibe eventos, guarda mensajes/estados, elimina duplicados y enruta. |
| `SmmZnTB6tvSmtntt` | `EL REY · 02 · WhatsApp · Consentimiento` | Solicita y registra autorización una sola vez por contacto. |
| `xP8kOe3z2GSnRqkJ` | `EL REY · 03 · WhatsApp · Asistente comercial` | Mantiene el contexto comercial, decide el siguiente paso y genera respuestas. |
| `gi0Vdd1W3weL6i4W` | `EL REY · 04 · WhatsApp · Pendientes humanos` | Notifica responsables y reanuda automáticamente al resolverse un pendiente. |
| `dUaIlsHiPpEooFs7` | `EL REY · 05 · WhatsApp · Reapertura 9 AM` | Recontacta a clientes que escribieron fuera de horario. |

Workflows temporales de migración/limpieza ya archivados:

- `yPugJ339dDRZ9Zr8` — migración de corrección de idempotencia.
- `nU7rA5bX3ToLysZ6` — limpieza de historial de pruebas.

## Estado temporal de pruebas

La restricción horaria está desactivada temporalmente en el workflow 03 para poder probar el bot en cualquier momento.

- Workflow: `xP8kOe3z2GSnRqkJ`
- Nodo: `Cargar contexto comercial`
- Versión activa al aplicar el cambio: `ee424d0e-7e00-440f-90c6-c1bc60ef3900`
- Actualmente la consulta devuelve:

```sql
true as service_open,
true as delivery_open
```

Antes de producción debe restaurarse:

```sql
(timezone('America/Bogota', now())::time >= time '09:00'
  and timezone('America/Bogota', now())::time < time '20:00') as service_open,
(timezone('America/Bogota', now())::time >= time '09:00'
  and timezone('America/Bogota', now())::time < time '19:00') as delivery_open
```

Después hay que publicar nuevamente el workflow 03.

## Estado de los datos de prueba

El 8 de septiembre de 2026 se eliminó, a solicitud del usuario, todo el historial de prueba de conversaciones y pedidos. Se verificó que quedaron en cero:

- contactos de WhatsApp;
- conversaciones;
- mensajes y adjuntos;
- pendientes humanos;
- ejecuciones de IA registradas en la base;
- pedidos, eventos y reservas;
- inbox de webhooks y outbox de automatización.

El consecutivo de pedidos volvió a `1001`.

Se conservaron:

- sedes;
- productos;
- inventario por sede;
- usuarios y configuración;
- conocimiento por sede;
- códigos QR de pago.

El historial técnico de ejecuciones dentro de n8n es independiente y no fue borrado.

## Corrección crítica ya aplicada

Los workflows 01 y 03 se caían con el error `La clave ya pertenece a otro mensaje.`. La causa era que `queue_outbound_whatsapp_message` comparaba el `raw_payload` completo para idempotencia, aunque Meta agrega después campos mutables como `send_response` y `send_error`.

La migración `supabase/migrations/202609070011_whatsapp_idempotency_payload_fix.sql` hace que esos campos se ignoren durante la comparación. La migración fue aplicada en la base de producción y se verificó que `prepare_branch_payment_qr()` devuelve el mensaje existente con `created=false` en vez de fallar.

No volver a deshacer esta corrección ni comparar como inmutable el payload enriquecido después del envío.

## Migraciones de Supabase

Aplicadas en orden:

1. `202609030001_initial.sql`
2. `202609040002_operational_traceability.sql`
3. `202609050003_whatsapp_commerce.sql`
4. `202609050004_whatsapp_hardening.sql`
5. `202609070001_fix_whatsapp_ai_persistence.sql`
6. `202609070002_whatsapp_human_task_automation.sql`
7. `202609070003_whatsapp_conversation_continuity.sql`
8. `202609070004_whatsapp_contact_identity_fix.sql`
9. `202609070005_whatsapp_admin_channel_fix.sql`
10. `202609070006_whatsapp_sales_state_and_orders.sql`
11. `202609070007_whatsapp_consent_continuity.sql`
12. `202609070008_whatsapp_operator_and_opening_followup.sql`
13. `202609070009_branch_payment_qr.sql`
14. `202609070010_whatsapp_media_realtime.sql`
15. `202609070011_whatsapp_idempotency_payload_fix.sql`

## Datos, tablas y almacenamiento

Tablas principales:

- `whatsapp_contacts`
- `whatsapp_conversations`
- `whatsapp_messages`
- `privacy_consents`
- `whatsapp_attachments`
- `conversation_events`
- `ai_runs`
- `whatsapp_message_status_events`
- `human_tasks`
- `whatsapp_webhook_inbox`
- `automation_outbox`
- `orders`
- `order_events`
- `products`
- `branch_inventory`
- `inventory_reservations`
- `inventory_movements`
- `branch_knowledge`
- `branch_payment_qrs`
- `branches`, `profiles` y tablas operativas de domiciliarios/personal.

Buckets:

- `whatsapp-media`: imágenes, documentos y audio recibidos por WhatsApp.
- `payment-qrs`: códigos QR de pago por sede.
- `payment-receipts`: comprobantes operativos de pedidos.

El QR de Robledo Aures ya fue cargado y marcado como activo. La intranet debe conservar la opción de subir o reemplazar el QR de cada sede cuando estén disponibles los demás archivos.

## Reglas comerciales acordadas

### Inicio y consentimiento

- Saludar al cliente.
- Solicitar consentimiento solamente si el contacto aún no lo ha otorgado.
- Preguntar el nombre; `display_name` de WhatsApp ayuda, pero no garantiza la identidad.
- Preguntar o confirmar la sede después del nombre.

### Conversación de venta

- Mantener producto, cantidad, precio, sede, domicilio, dirección, destinatario, forma de pago y confirmaciones humanas dentro del contexto.
- Una respuesta humana debe incorporarse al pedido y producir inmediatamente el siguiente paso lógico.
- Evitar bucles del tipo “¿deseas seguir?” cuando el cliente ya confirmó.
- Pedir confirmación explícita solo para decisiones finales, cargos nuevos o cambios materiales.
- Acumular direcciones enviadas en varios mensajes; no reemplazar una parte con la siguiente.
- Si falta información real, pedir únicamente el dato faltante.
- Al terminar la venta, crear el pedido operativo y registrar la trazabilidad.

### Horario normal de producción

- Atención: 9:00 a. m. a 8:00 p. m., hora de Colombia.
- Domicilios: disponibles hasta las 7:00 p. m.
- Después de las 8:00 p. m. no hay servicio; se reanuda a las 9:00 a. m.
- Si alguien escribe en las tres horas anteriores a la apertura o después del cierre, el workflow 05 debe escribirle a las 9:00 a. m. para continuar.

### Pagos

- Transferencia por QR o número de cuenta.
- Addi.
- Sistecrédito.
- Pago en el local solamente cuando el cliente retira en tienda.
- No existe pago contraentrega.
- Para Addi y Sistecrédito, recopilar primero cédula y teléfono y luego crear la revisión humana.
- No afirmar que un crédito o pago está aprobado sin confirmación humana registrada.
- Al elegir QR, enviar realmente la imagen activa de la sede; no prometer “en el siguiente mensaje” si no se creó el mensaje multimedia.
- Una imagen de comprobante se guarda y se muestra al operador, pero la IA no la aprueba por sí sola.

## Funciones ya implementadas en la intranet

- Centro de conversaciones de WhatsApp.
- Actualización de mensajes en tiempo real sin recargar la página.
- Visualización/descarga de adjuntos recibidos, incluidos comprobantes.
- Respuesta humana a pendientes.
- Envío de instrucciones internas al bot aunque no exista un pendiente.
- Toma de control manual de una conversación y envío directo al cliente.
- Resumen operativo de conversación/pedido.
- Administración de QR por sede.
- Creación y trazabilidad de pedidos.

## Sedes e identificadores

| ID | Sede |
|---|---|
| `b1` | Robledo Aures |
| `b2` | Robledo Diamante - Calle 80 |
| `b3` | Santa Cruz |
| `b4` | San Gabriel, Itagüí |
| `b5` | Robledo Diamante - Diagonal 85 |
| `b6` | Floresta |
| `b7` | La 80 |
| `b8` | La Estrella |
| `b9` | Campo Valdez |
| `b10` | San Antonio de Prado |

## Próxima prueba recomendada

Hacer una sola conversación completa desde un número limpio para no gastar ejecuciones innecesarias:

1. Enviar “Hola”.
2. Aceptar el tratamiento de datos.
3. Dar nombre y sede.
4. Consultar un producto que requiera confirmación humana.
5. Responder desde la intranet y comprobar que el bot continúa sin que el cliente tenga que insistir.
6. Completar cantidad y domicilio enviando la dirección en dos mensajes.
7. Elegir transferencia por QR en Robledo Aures.
8. Verificar que WhatsApp recibe la imagen QR.
9. Enviar una imagen como comprobante.
10. Confirmar que el archivo aparece en vivo en la intranet.
11. Aprobar el pago desde la intranet.
12. Confirmar que el cliente recibe la continuación y que se crea el pedido `1001`.
13. Repetir solamente el caso mínimo desde un segundo teléfono para comprobar aislamiento entre contactos.

Si aparece un error, abrir primero la ejecución más reciente del workflow 01 o 03 y revisar el nodo exacto que falló. No hacer múltiples reintentos a ciegas.

## Criterios antes de producción

- Restaurar las restricciones de horario.
- Cargar y probar el QR de cada sede.
- Confirmar que Meta entrega texto e imágenes desde al menos dos números reales.
- Probar una conversación completa sin intervención manual adicional.
- Confirmar que un pedido se crea una sola vez y descuenta/reserva inventario correctamente.
- Ejecutar `npm run check` y `npm run build`.
- Revisar que no existan secretos en Git ni en archivos del frontend.
- Mantener los workflows temporales archivados y evitar schedulers que consuman ejecuciones cada minuto sin necesidad.

## Documentación adicional del repositorio

### Aviso interno de compra — 9 septiembre noche / 10 septiembre UTC

03 publicado y verificado `ad6ea299-d7fa-4b6e-9dc0-94586d9bc8ce`, 13 nodos, mismo borrador. `persist.sql` añade como tercer mensaje opcional el aviso al administrador, usando el mismo destinatario de 04 (+573127378289) como quinto parámetro SQL. `prepare_whatsapp_order_notification` valida el recibo contra un pedido real y usa clave única por pedido; excluye el aviso del contexto del bot. Sin ejecución adicional por mensaje ni nueva llamada al modelo.

Migraciones `202609100001_whatsapp_order_notification.sql` y `202609100002_whatsapp_order_subtotal.sql` aplicadas con conexión PostgreSQL existente de n8n (ejecución manual 1259). La segunda corrige `orders.total` para almacenar subtotal de productos, como espera el panel, y repara únicamente filas automáticas con el patrón exacto de domicilio duplicado. REY-1001: subtotal 250000 + domicilio 10000 = 260000, verificado en producción.

Aviso de REY-1001 recuperado en ejecución 1260; mensaje `30ed9c3a-0f88-498b-a7ce-7b6f92ce704a`, estado `delivered` y una sola copia comprobados en ejecución 1261. Los dos nodos temporales de instalación/verificación se eliminaron antes de publicar. Pruebas: 87 unitarias + 18 escenarios PostgreSQL; verificación de destinatario, clave única, reintento en caché y total sin duplicar envío. ESLint pasa. No se creó otro pedido.

### Cierre real después del pago — 2026-09-09

Última versión de 03: `54b1bd96-931f-4031-ae13-5c1b2b227304`. Corrige las ejecuciones 1245/1249/1252/1254: alias `transferencia (QR)` y solicitud directa de QR; comprobante inicia revisión sin volver a preguntar; `Validado/Validada` del responsable se reconoce solo con tarea y compra coincidentes; aceptación del resumen (`Todo correcto`) activa `finalize_order` aunque el modelo devuelva `reply`. Las promesas de preparación se sustituyen por el paso real pendiente. La confirmación numerada la produce PostgreSQL después de insertar el pedido, de forma idempotente.

Migración `202609090002_whatsapp_payment_checkout.sql` aplicada en Supabase; hash verificado de `persist_whatsapp_commercial_response`: `1f7a173191c12073da25e3a431878e58`, recibo numerado habilitado. 87 pruebas unitarias + 17 escenarios PostgreSQL aislados pasan; incluye un pedido manual de ventilador con domicilio por COP 260000 y un único mensaje numerado. No se ejecutaron envíos reales ni se creó retroactivamente el pedido de Samuel. Para continuar la prueba actual, el cliente puede escribir `Confirmo el pedido`; conserva la aprobación humana existente. Sin nodos adicionales y sin commit/push.

### Corrección de confirmaciones de producto — 2026-09-09, tarde

Workflow 03 publicado y verificado: `e40f12af-6b74-4d0c-ad49-a74fd3cca2a9` (activo, igual al borrador). Ejecuciones 1225, 1229 y 1235 reproducidas localmente: la respuesta real «Si hay, tenemos marca kalley a 250.000» ahora se vincula al interés original «ventilador de torre» y confirma una unidad, sin inferir existencias ilimitadas. La dirección no invalida esa prueba. Una afirmación corta confirma una cotización concreta solo si su precio está expuesto en la pregunta; también se conserva la evidencia original. Se evita repetir product_lookup cuando los productos ya están verificados y se avanza al domicilio. El barrio explícito de la dirección prevalece sobre la sede: Tricentenario, no Robledo Aures. No se borró historial ni se enviaron mensajes durante esta corrección. 79 pruebas unitarias y 16 escenarios PostgreSQL aislados pasan; ESLint pasa. Sin nodos ni ejecuciones adicionales. Falta comprobar el siguiente intercambio real por WhatsApp; no se reejecutaron mensajes anteriores.

- `README.md`
- `docs/CHATBOT_N8N.md`
- `docs/DESPLIEGUE.md`
- `knowledge/README.md`


### Compra natural y datos antes de cobrar — 2026-09-10

03 publicado: `12febf8a-bc3e-4004-a714-5a0f8c9c9a0b`, conserva 13 nodos. Orden de compra: verificar producto/cantidad → nombre → modalidad/datos de entrega → cotizar domicilio → resumen completo y aceptación → pago → validación humana → creación real. Elegir QR tras el resumen acepta la cotización; recibir comprobante conserva esa aceptación. La validación de pago ya no provoca otra pregunta para crear un pedido previamente confirmado. El comprobante sin texto después del QR inicia revisión directamente. Se conservan los controles de pago real, cantidades, cambios de compra e idempotencia.

Reconoce «sí tenemos disponibilidad», «sí hay disponibles» y «sí hay» para la cantidad solicitada cuando la pregunta interna incluye el producto y precio concreto. El nombre explícito se guarda aunque el modelo omita `name_confirmed`; se recuperan respuestas de nombre descartadas por la versión anterior dentro de la compra actual. «Listo», QR y otras confirmaciones no se interpretan como nombres. Confirmar que comprador y destinatario son la misma persona avanza al siguiente paso.

Migración `202609100004_whatsapp_confirmed_payment.sql` aplicada en ejecución manual 1311: «Confirmo/Confirmado/Confirmada» del responsable aprueba únicamente una tarea de pago resuelta y coincidente con la compra. Hash de persistencia verificado: `931051bac999834378af8f5f522910de`. Nodos temporales retirados antes de publicar. Pruebas: 94 unitarias y 20 escenarios PostgreSQL aislados; incluye secuencia completa de 8 Labubu por 2.420.000 COP, comprobante, aprobación, creación idempotente y asociación del archivo. Reproducción local de ejecución 1309 termina en `finalize_order` recuperando Emmanuel. No se reejecutaron mensajes reales ni se creó otro pedido durante estas pruebas. Falta validar una nueva conversación real tras esta publicación.

### Comprobante del pedido y total del panel — 2026-09-10

Migración `202609100003_whatsapp_order_receipt.sql` aplicada en ejecución 1263. El pedido enlaza el archivo del mensaje exacto revisado en la tarea de pago verificada; no toma una imagen arbitraria del historial. También enlaza archivos cuya descarga termina después de crear el pedido, sin sustituir comprobantes existentes. `payment_receipt_bucket` distingue `whatsapp-media` y `payment-receipts`; el panel abre el archivo privado con URL firmada y permisos por sede.

REY-1001: comprobante `archivo-whatsapp.jpg`, 63162 bytes, asociado al campo correspondiente; panel recargado muestra 260.000 COP y botón «Ver comprobante». Frontend publicado en Worker versión `de66a44b-c28e-4c90-a3e7-8ac4f9df993a`. ESLint y build aprobados. El subtotal de productos es 250.000 y el domicilio 10.000; no se vuelve a sumar el envío al subtotal guardado.

Preferencia de Samuel: preparar un título descriptivo en GitHub Desktop para que él confirme el commit con un clic; no hacer commit ni push automáticamente.

### Recepción fiable y seguimiento natural — 2026-09-10, tarde

Incidente confirmado: el mensaje «me gustaria preguntar por algun producto para amor y amistad» de las 18:10 quedó en `whatsapp_webhook_inbox` con `last_error = n8n respondió 502`. No llegó a 01 ni a 03. La ejecución 1315 recibió únicamente «?» y el historial de saludo; no era una falta de comprensión de la consulta por la IA. La recepción acusaba recibo a Meta tras guardar el evento, pero no había consumidor de reintentos.

Worker `385ac5ca-e337-4510-b0b3-eec00ae82f87` publicado: reintenta fallos transitorios de n8n hasta tres veces con los mismos IDs, conserva el error si persiste y recupera la bandeja durable mediante un cron de Cloudflare cada minuto. No ejecuta n8n cuando no hay mensajes pendientes. Reclama como máximo cinco eventos con leases existentes y los procesa en paralelo para no dejar leases esperando en cola. Una interrupción del Worker se recupera después de expirar el lease; eventos ya terminados no se vuelven a reclamar. La ausencia de configuración n8n deja un error recuperable en lugar de marcar el mensaje como procesado.

03 publicado `793f047a-3db2-4d67-8d1f-eee4f561d668`, 13 nodos: conserva el interés semántico en seguimientos y tolera indicadores de formato que el modelo coloque dentro de sales_state. Un branch_id sugerido por el modelo ya no selecciona una sede que el cliente no indicó. Sin catálogo se consulta la sede; no se presentan categorías inventadas como surtido confirmado.

Validación: 100 pruebas unitarias y 21 escenarios PostgreSQL, ESLint y build. Pruebas con IA REAL en ramas temporales sin envíos: 1318 detectó turn_kind anidado; 1319 detectó sede sugerida tomada como elegida; ambas respuestas quedaron como fixtures de regresión. Ejecución 1321 pasa consulta textual original, seguimiento «?» con historial y consulta con sede conocida. Las ocho ramas/nodos auxiliares se retiraron antes de publicar. Mantener los fallos de estas evaluaciones como evidencia de diagnóstico, no interpretarlos como errores de conversaciones reales.

Título preparado en GitHub Desktop: «Recupera mensajes de WhatsApp y conserva el contexto». No hacer commit ni push por Samuel.
