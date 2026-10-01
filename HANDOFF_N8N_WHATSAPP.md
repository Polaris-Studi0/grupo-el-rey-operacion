# Traspaso vigente — bot de Grupo Almacenes El Rey

Actualizado el **30/09/2026, tarde de Colombia**. Este documento determina el estado real; los documentos de arquitectura describen el objetivo.

## Publicado y autorizado

- Aplicación real: `/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma`. Samuel autorizó editar código y publicar el piloto. **No manejar pantalla; usar MCP/CLI. No commit/push**: Samuel usa GitHub Desktop. HEAD comprobado de Samuel: `3f46c9f test bot sep 30`; cambios de esta corrección sin commit.
- Worker `grupo-el-rey-operacion`: **`893f2f57-9b39-4bdb-9e9e-205fe4eac419`**, 100%. Versión inmediatamente anterior: `eab9085d-1936-4476-ad01-97b1c5730c54`; antes de esta tarea, `08599e3e-0390-4027-bf0e-d5f7d7971835` (publicación de Samuel). Bindings y runtime comparados e iguales a esa versión. Assets `index-BJ9dlxUb.css` / `index-D8ggvs72.js`.
- [Motor nuevo de n8n](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ), 17 nodos, gpt-5-mini mediante Gateway. Publicado **`f0414e5c-3466-4f57-88fc-4888e1f7c491`**. Conserva la corrección de sedes y añade continuidad comercial después de una aclaración humana.
- Webhook privado `POST /webhook/el-rey-assistant-turn-v1`. Solo propone: no envía ni escribe en la base. No guardar datos de ejecuciones exitosas/fallidas/manuales ni progreso.
- Piloto habilitado únicamente para **+57 312 737 8289**, inicio `2026-09-29T05:00:41.000Z`. WhatsApp empresarial **+57 314 789 9116**. No ampliar al público automáticamente. El piloto permite pruebas fuera del horario; no trasladar esa excepción a clientes.
- Otros teléfonos conservan la ruta anterior. Hay eventos ajenos al piloto con `n8n respondió 404`: **no afirmar que esa ruta de mantenimiento funciona**, ni reactivar el bot viejo para resolverlo. Debe resolverse antes de abrir al público.
- Meta autenticado; contexto remoto legible. Durante el incidente, La Estrella tenía **0 productos activos y 0 QR activos**. El diagnóstico debe comprobar de nuevo la sede elegida y sus recursos. Samuel pidió no cargar promociones todavía; las subirá cuando existan. No sembrar productos ficticios.

## Limpieza completa solicitada — pendiente de ejecución manual, 30/09

Samuel confirmó borrar todo el dato operativo: pedidos/domicilios, domiciliarios, personal de caja, chats/contactos/consentimientos/pendientes, PQRS, catálogo, inventario, conocimientos, QR, fotos vinculadas y datos preparatorios de publicidad. Se conservan **auth (usuarios/sesiones), profiles (permisos/sede), branches y estructura/configuración técnica**. Es una autorización nueva y más amplia que la del 29/09. Publicidad continúa aplazada.

- Entregable: `scripts/reset-all-business-data-20260930.sql`; Samuel lo ejecuta completo en SQL Editor como postgres. **No se ejecutó en producción. No asumir limpieza completada hasta su confirmación y verificación.** Evitar mensajes/ediciones mientras corre.
- Lista explícita: 31 tablas vacías, 2 preservadas; cotejada contra las 33 tablas reales mediante consulta de metadatos. No CASCADE, no reinicio de numeración, no migraciones antiguas. Rechaza tablas/dependencias desconocidas y actividad en curso.
- Respaldo transaccional privado `elrey_reset_20260930`, con manifiesto y copias verificadas fila por fila. No toca `elrey_reset_20260929`. Revoca acceso de roles de aplicación y habilita RLS en las copias. Ante error, revierte; impide repetición si el respaldo ya existe.
- Archivos físicos de los cinco buckets privados se conservan para recuperación junto a copia de sus metadatos. Se eliminan sus vínculos activos al vaciar tablas; **no es un borrado físico de Storage**, ni del historial en el teléfono/Meta.
- Prueba aislada `node tests/full-reset-20260930.test.mjs`: aprobada. Verifica copia exacta, preservación de cuentas/permisos/sedes/Storage/secuencia/respaldo anterior, rechazo de dependencias y envíos en curso, rollback incluso después del TRUNCATE y protección contra repetición sobre datos nuevos. No mensajes enviados ni datos ficticios en producción.

## Imágenes y sesiones — 30/09, última actualización

**Samuel aplazó explícitamente la publicidad durante esta tarea. No continuarla ni habilitarla hasta que la retome.** Se conservan tablas y código preparatorio, sin campañas ni envíos creados. Pestaña oculta por `CAMPAIGNS_ENABLED=false`; API y recuperación requieren `WHATSAPP_CAMPAIGNS_ENABLED=true`, ausente en producción. La consulta de Meta confirmó acceso, pero cero plantillas Marketing compatibles con imagen. No crear plantillas, flyers o campañas de prueba reales por iniciativa propia. La ruta ajena al piloto sigue heredada: resolver la atención de esas respuestas antes de publicidad pública.

- **Fotos:** `BotImages.jsx` permite subir JPG/PNG (máximo 5 MB) al editar un producto guardado en Inventario o al aclarar un pendiente que no sea pago/domicilio. Pie de foto obligatorio para identificar el producto/variante. Se pueden guardar tres fotos; máximo dos por respuesta para respetar el presupuesto del Worker, incluso con archivos entrantes. Se pueden retirar sin borrar el historial.
- `bot_media_assets` y bucket privado `bot-images` separan esas fotos de comprobantes y QR. `bot_context_snapshot` expone solo referencias/descriciones de activos autorizados para sede y conversación. n8n propone `media_ids`; el servidor rechaza IDs ajenos y revalida vigencia, consentimiento, control y último mensaje al enviar. No recibe URLs libres del modelo.
- Fotografías propuestas se añaden dentro de `commit_bot_commerce_turn` **antes** del registro inmutable en `ai_runs`. No actualizar `ai_runs` después; las repeticiones deben reutilizar el mismo resultado. Una aclaración humana adjunta sus fotos aprobadas después del texto, también con claves idempotentes. Las tareas comerciales usan el mismo resultado transaccional.
- `ConversationDrawer` permite abrir la imagen saliente guardada. Falta prueba de entrega real: aún no hay imágenes cargadas en producción. Tres pruebas con el modelo publicado eligieron la foto correcta, permitieron mostrarla sin afirmar stock y derivaron una foto inexistente sin sustituirla por otra. Evidencia `product-images-evidence-20260930.json`; no hubo envíos a clientes.
- **Sesiones:** Samuel eligió **24 horas sin escribir el cliente**. Al recibir un nuevo mensaje tras ese intervalo, el ingreso cierra la sesión anterior y crea otra sin sede/carrito/contexto. Los mensajes salientes no prolongan el intervalo. Se preservan contacto, consentimiento vigente, control manual si estaba tomado, pedidos e historial; se liberan reservas activas del chat anterior. Un reintento del mismo mensaje no crea otra sesión. No se cerraron ni borraron conversaciones para forzar una prueba.
- Conversaciones separa «Chats actuales», «Historial de chats» y «Todos», mostrando inicio y motivo de cierre. `previous_conversation_id` conserva la relación. Consultar pedidos sigue ligado al contacto, incluso entre sesiones; los pendientes viejos no se reenvían a la nueva.
- Migraciones **202609300005**, **202609300006** y **202609300007** aplicadas específicamente (sesiones, fotos, preparación de publicidad). No ejecutar toda la carpeta ni repetirlas. Respaldo privado previo de seis funciones: `features-before-functions.json`.
- Verificación: 58 pruebas Node comerciales + 15 grupos PostgreSQL aprobados antes de aplazar publicidad; después, 18 pruebas específicas de publicidad deshabilitada/control manual. Lint/build aprobados. Webhook firmado simulado con dos fotos: 40 solicitudes, límite comprobado de 50. Modelo real: 3/3 propuestas sintéticas sin enviar. Diagnóstico remoto Meta/esquema/contexto: 200. Publicidad bloqueada en API y cron. No commit/push.

## Pedido registrado, seguimiento y tono — 30/09

Samuel confirmó que la continuidad mejoró. La compra piloto llegó a **REY-1003**, con productos por 50.000, domicilio por 15.000 y aprobación manual de pago por 65.000. Su captura muestra el pedido y el aviso de nueva compra recibidos en WhatsApp. Esto confirma el recorrido de compra piloto; todavía no certifica un lanzamiento público.

Al preguntar «Sabes en cuánto tiempo llega?» recibió el mensaje de error. La consulta de datos verificó que `promised_at` sí estaba guardado: `2026-09-30T19:00:56.865Z` (aproximadamente 14:01 Colombia). La reproducción posterior con n8n devolvió correctamente `order_status`; no se reprodujo el error intermitente ni debe atribuirse a una causa exacta no observada.

- `src/bot-orders.js` resuelve preguntas claras de llegada/estado directamente con el pedido que `bot_customer_orders` ya autorizó por contacto. No busca otros clientes ni necesita IA. Usa la hora guardada, zona Colombia y lenguaje aproximado; no reinicia minutos cada vez que preguntan.
- Ante una consulta de llegada con estimación vencida o ausente, crea una solicitud humana para actualizarla. Los pedidos entregados/cancelados y recogidas listas no prometen una llegada futura. Una consulta general de estado puede responder el estado conocido aunque falte ETA.
- El contexto y la herramienta de n8n comparten el resumen del pedido. La ruta directa evita depender de que el modelo llame la herramienta para preguntas sencillas. El prompt exige consultarla para otros seguimientos.
- Respuesta de espera/fallo: **«Dame un momento y te confirmo.»**; disponibilidad y PQRS tienen variantes breves. Los avisos al responsable y la aprobación explícita de pagos se conservan. El recibo de pedido ya no añade la frase fija «Aún no tenemos una hora de entrega confirmada».
- Migración `202609300004_bot_natural_handoffs.sql` aplicada. 51 pruebas Node y 12 grupos PostgreSQL aprobados; lint/build aprobados. Se probó llegada sin modelo, estimación estable, vencimiento, cierre y número desconocido. Reproducción del contexto real a las 13:46: respuesta con la estimación registrada, sin tarea ni envío. Evidencia privada `eta-context.json`, `eta-model-before.json`, `eta-direct-replay.json`.
- **Falta verificar una nueva entrega por WhatsApp del seguimiento corregido.** Si Samuel pregunta después de la hora estimada y la intranet no la actualizó, es correcto solicitar una actualización; no extenderla artificialmente. No se reenviaron mensajes históricos ni se eliminaron pendientes.

## Incidente de nombre y teléfono — corrección publicada el 30/09 por la tarde

La captura posterior confirmó que la selección de Superman ya continuaba por WhatsApp (08:54), pero falló al recoger datos: «A nombre de Samuel porfa» quedó como `recipient_name`, faltaba `customer_name`, y un turno con texto libre anunció «listo para enviar» sin dirección. Al recibir el teléfono llegó una derivación técnica. **La prueba anterior de selección no cubría adecuadamente esa continuación.**

- `src/bot-checkout.js` procesa respuestas inequívocas del cliente durante una compra activa: nombre explícito del comprador, destinatario explícito, teléfono móvil colombiano y modalidad. No consume IA ni crea pendientes para esos datos. Las respuestas ambiguas/compuestas y consultas siguen en n8n.
- El contexto conserva `checkout_inputs` limitado a mensajes de la cotización actual. Se recuperan únicamente campos explícitos faltantes; no se usa el nombre del perfil, notificaciones internas ni nombres de compras anteriores. La corrección recupera el nombre y teléfono del incidente al continuar, sin modificar/reemitir el historial.
- La salida de IA con datos comerciales o una aclaración durante recogida de datos pasa por la transacción de checkout; no se envía como una promesa libre. Se conserva la posibilidad de hacer preguntas informativas aparte. El prompt distingue comprador/destinatario y mantiene los datos parciales.
- SQL menciona producto/precio una vez y luego pregunta solo lo que falta. No anuncia envío antes de completar el pedido. Conteo, tarifa, aceptación y pago mantienen sus validaciones.
- Migración `202609300003_bot_checkout_continuity.sql` aplicada por CLI administrativa. No se sembraron productos, no se borraron tareas ni se enviaron mensajes desde las pruebas.
- **49 pruebas Node y 12 grupos PostgreSQL** aprobados; lint/build aprobados. Recorrido aislado: selección → domicilio → nombre → teléfono → dirección → barrio → destinatario → conteo. El modelo publicado pasó dirección/barrio/destinatario/teléfono juntos, «recibo yo» y costo sin dirección. Otros dos casos usan el procesamiento directo del servidor. Evidencia `checkout-continuity-evidence-20260930.json`.
- Reproducción privada con el contexto real: recupera el comprador y el teléfono correctos, sin IA ni tarea humana (`checkout-sep30-direct-replay.json`). **Samuel confirmó la mejoría y completó el pedido piloto REY-1003**. El siguiente incidente de ETA se documenta arriba.
- El pendiente técnico antiguo `5b8c5e8a-11b7-4edc-8207-90619dbb86b4` permanece sin borrar. No resolverlo automáticamente ni volver a enviar mensajes históricos. Una consulta natural/compuesta todavía puede depender de n8n; no afirmar que todo funciona sin IA.

## Incidente de sedes: resuelto y entrega real confirmada

Samuel escribió «muestrame todas las sedes» y «que sedes son?» y recibió avisos internos. Dos problemas:

1. Reproducción HTTP con contexto reconstruido del caso: n8n devolvía `409 missing_tool_evidence`. La respuesta informativa omitía consultar la herramienta. Se exige `consultar_informacion` explícitamente para cada turno informativo, aun cuando haya referencias en el historial. La misma reproducción dio `200 decision_ready` y los diez nombres verificados después de corregirlo. Se conservó el control que rechaza hechos sin herramienta; no se relajó para aceptar invenciones.
2. La ruta de derivación hacía más de 50 consultas externas entre recepción, dos lecturas de contexto, aviso y respuesta. La prueba integrada con el Worker anterior falla al imponer ese presupuesto; la nueva completa el ciclo en **33 consultas**. La lectura consistente `bot_context_snapshot` reduce cada contexto de 13 consultas a 2, incluida la autorización. El cliente recibe primero su respuesta y después se procesa el aviso interno. Los turnos obsoletos no vuelven a fallar diez veces por un cambio de contexto.

Las solicitudes claras de lista de sedes se resuelven directamente con `branches.active`: nombres, orden numérico normal y sin códigos b1/b10. No consumen IA ni crean pendientes. «cambiar sede» y «creo que me queda mejor la de Campo Valdez» actualizan la sede real respetando carrito/control; seleccionar un número requiere una lista previamente entregada. No basta con que el modelo diga que cambió de sede.

**Prueba real del 29/09, 20:29 Colombia:** entrada `5d243bd6-2593-4080-b46e-ed74448f8fd0`, respuesta `f11f438e-5311-483b-82ab-2eebba767330`, estado Meta **read**. Evento recibido `2026-09-30T01:29:18.394414Z`, completado `01:29:22.721100Z`, **un intento**, sin error. Samuel confirmó «Sí, recibí la lista». Esta prueba fue sobre `bfc661ac`; la versión final conserva esa ruta y acota adicionalmente el cron a un trabajo por ejecución.

Cron: un evento pendiente por ejecución; si no hay evento, una tarea humana de la conversación piloto activa más reciente. Evita combinar varias recuperaciones completas dentro del mismo presupuesto. Pendientes y leases permanecen durables.

## Selección después de una aclaración humana — corrección del 30/09

Samuel confirmó en intranet «super man unitalla a 50.000» y «sharkboy talla s a 100.000». El bot los ofreció, pero «me darias porfa el de superman» volvía a pedir información de catálogo. La sede b1 no tenía productos registrados: el texto humano estaba en el historial, pero no existía un camino para conservar esa elección sin inventar stock.

- Se pasan respuestas humanas acotadas a conversación/sede como `confirmed_answers`. El modelo propone `confirmed_item` con tarea fuente, fragmento literal, nombre, talla, precio y cantidad; n8n y Supabase verifican la prueba por separado. Fuentes ajenas, vacías y precios distintos se rechazan.
- La validación de un pendiente humano ya no exige que el modelo llame además `solicitar_equipo`: esa herramienta solo duplicaba la validación local de una propuesta sin hechos ni efectos. Se conserva la obligación de herramientas para respuestas informativas, catálogo, cotización, QR y seguimiento, y el servidor registra/notifica después. Caso intermitente `handoff/missing_tool_evidence` reproducido y cubierto por regresión.
- Se guarda `pending_selection` en el estado comercial. Se pregunta modalidad, nombre y datos faltantes de domicilio; dar datos adicionales conserva la elección. La lista de preguntas internas añadida por el modelo se acota.
- Al completar los datos se crea un pendiente **solo para el conteo físico**. La intranet muestra los datos ya conocidos y exige conteo suficiente y casilla explícita. Esa confirmación crea un artículo regular, sin descuento, con stock válido hasta las 20:00 de Colombia. El texto libre por sí solo no crea inventario, reserva, pago ni pedido.
- Tras el conteo aprobado se retoma el flujo existente de carrito, tarifa si aplica, resumen, aceptación y pago. Los cambios de sede también respetan una selección pendiente.
- No se sembraron productos/promociones ni se borraron pendientes. El pendiente repetido antiguo `9d1f1660-b6db-42a1-9856-ff3f9c578fad` permanece como historial; no resolverlo para probar la corrección. Reenviar una nueva elección en WhatsApp.
- Límite actual: selección de **un producto** desde la aclaración, precio literal en pesos (50000 o 50.000). Expresiones como «50 mil» necesitan aclaración. Antes de ampliar al público, revisar reutilización de productos ya catalogados para evitar duplicados al confirmar artículos similares desde distintas consultas.

Comprobación con el contexto real de la conversación `1ebe4418-0684-4358-8cd5-b635e107a8b6`: propuesta `checkout`, tarea fuente correcta, 1 unidad por 50000, sin derivación, sin mutaciones y sin envío. Evidencia privada `confirmed-selection-live-proposal.json` bajo la carpeta de diagnóstico. **La selección sí llegó realmente a WhatsApp a las 08:54; falta la compra real completa**; la prueba aislada sí completó el pedido después del conteo y aceptación. Producción respondió 200, Meta conectado, contexto legible, assets nuevos y catálogo todavía vacío.

## Comercio implementado, compra piloto registrada

- Catálogo/stock manual en intranet, promociones con vigencia, conteo explícito por sede y operador hasta **20:00 Colombia del mismo día**. `updated_at` no certifica stock. Descuentos no inventados; QR solo JPEG/PNG.
- Estado durable de carrito/opciones/datos en `sales_state.pilot_commerce`; versión de compra y comparación transaccional del control y último mensaje.
- Tarifa de domicilio confirmada por operador para la dirección/cotización exactas. Resumen completo entregado y aceptado antes de pagar. Cambios materiales invalidan aceptación y liberan reservas.
- Reserva de hasta 30 minutos y nunca después del cierre del conteo. Comprobante privado vinculado al mensaje exacto. Aprobación **explícita** del operador y monto exacto; «ya pagué», una imagen o un texto de IA no aprueban pago.
- Transferencia, Addi, Sistecrédito y pago al recoger. Sin contraentrega. Pedido idempotente con comprobante y descuento de stock. `orders.total` es subtotal de productos; sumar domicilio una sola vez.
- Seguimiento por contacto verificado; no permite consultar pedidos de otro cliente. No inventar tiempo de entrega.
- Pendiente humano → aviso al número personal → aclaración desde intranet → respuesta natural, sin «el equipo responde» ni copiar la pregunta interna. Ese ciclo tuvo entregas reales `read` a las 09:03 del 29/09. La redacción nueva fue comprobada además con datos sintéticos/modelo real.
- Control manual, consentimiento, adjuntos y revalidación antes de enviar se conservan. Envíos inciertos no se reintentan ciegamente.

## Base de datos y acceso

Proyecto Supabase `xmfltwhgvoaleejatxtg`. CLI administrativa autenticada, consulta vía Management API disponible. Credenciales Meta/Supabase administradas en Cloudflare; no imprimirlas ni copiarlas a n8n.

Aplicadas **solo** las migraciones aditivas:

- `202609290001_bot_pilot_commerce.sql`.
- `202609290002_bot_payment_review_guard.sql`.
- `202609290003_bot_qr_image_format.sql`.
- `202609290004_bot_context_snapshot.sql` (lectura estable, acotada por conversación/sede, solo service_role).
- `202609300001_bot_confirmed_selection.sql` (selección humana provisional y aprobación explícita de conteo).
- `202609300002_bot_confirmed_selection_source_guard.sql` (rechaza tareas resueltas sin respuesta).
- `202609300003_bot_checkout_continuity.sql` (preguntas progresivas sin repetir producto/precio).
- `202609300004_bot_natural_handoffs.sql` (esperas naturales y recibo sin contradicción fija de ETA).

La migración de control manual del 26/09 ya estaba aplicada. V2 del 20/09 NO está aplicada. La base no tiene `supabase_migrations.schema_migrations`: comprobar funciones/columnas, no inferir estado por historial CLI. No ejecutar toda la carpeta.

La limpieza operativa fue solicitada por Samuel y ejecutada **por él** con `scripts/reset-operational-data-20260929.sql`. Respaldo privado `elrey_reset_20260929` comprobado; nuevos mensajes posteriores a la limpieza son válidos. **No repetir borrado**. Conservar catálogo, usuarios, sedes, QR y cambios PQRS.

Claves de reconstrucción fuera de Git: `~/.config/grupo-el-rey/n8n-rebuild-secrets.json`. Nombres: `N8N_REBUILD_GATEWAY_SECRET` y `N8N_REBUILD_WEBHOOK_SECRET`. Referencias sin secretos: `docs/ACCESOS.md`.

`GET /api/bot/pilot/status?diagnostics=true`, protegido por cabecera de gateway nueva, muestra metadatos de entrada/salida sin textos ni secretos. Evidencia privada de este incidente bajo `~/.config/grupo-el-rey/attention-20260928/sedes-*`. No copiar contexto real al repositorio. MCP nativo `mcp__n8n__*` funcionó.

## Verificación y siguientes pasos

- 51 pruebas Node del conjunto comercial (incluye 2 recorridos del webhook firmado con Meta/base simulados), 12 grupos PostgreSQL aislados y 9 pruebas de ingreso heredadas aprobados. Lint y build aprobados; advertencia de bundle Vite >500 kB existente.
- Cinco casos comerciales con modelo real y datos sintéticos aprobados tras cambiar la regla informativa. Son propuestas, **no compras reales**. Evidencia en `n8n/rebuild/commerce-evidence-20260929.json`.
- Prueba real de sedes aprobada por Samuel y estado Meta read. No se reenviaron mensajes históricos, no se borraron pendientes ni pedidos y no se cargó stock.
- Antes de público: compra completa con producto/precio/conteo real y QR de la sede cuando Samuel los cargue; probar dirección/tarifa/resumen/pago/pedido/seguimiento/control humano en WhatsApp.
- Faltan horarios operativos/recordatorio, interpretación de audio/imágenes/PDF, respuesta humana mediante aviso citado en WhatsApp, envío de imagen de producto y plantillas de aviso fuera de 23 horas. El responsable hoy contesta desde intranet.
- La ejecución de IA sigue sujeta al límite de tiempo del trabajo de fondo HTTP; el inbox durable recupera turnos interrumpidos. Antes de público conviene separar ejecución prolongada en cola. El arreglo de sedes es directo y no depende de ese tiempo de IA.
- No afirmar «perfecto» ni «listo para público». La siguiente prueba es preguntar de nuevo por el tiempo del pedido, con la estimación vigente en la intranet. No pedir repetir la compra para probar el seguimiento.
