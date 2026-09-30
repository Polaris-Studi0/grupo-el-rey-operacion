# Traspaso vigente — bot de Grupo Almacenes El Rey

Actualizado el **29/09/2026, noche de Colombia**. Este documento determina el estado real; los documentos de arquitectura describen el objetivo.

## Publicado y autorizado

- Aplicación real: `/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma`. Samuel autorizó editar código y publicar el piloto. **No manejar pantalla; usar MCP/CLI. No commit/push**: Samuel usa GitHub Desktop. HEAD encontrado al retomar: `34c9154 bot`.
- Worker `grupo-el-rey-operacion`: **`238cf6fc-3a52-48de-a1eb-e20333987f14`**, 100%. Versión inmediatamente anterior: `44ad4cee-b275-4e82-92a0-2fda22169db4`. Bindings y runtime comparados e iguales a `32b47bc9-a257-405b-9a60-b75c34f0a939`, publicación de Samuel. Assets `index-CkmM4vzk.js` / `index-CHMuJAxa.css`.
- [Motor nuevo de n8n](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ), 17 nodos, gpt-5-mini mediante Gateway. Publicado **`c0d66b23-aaa8-465a-8693-cdee2d054f05`**. Misma lógica probada en `38bbc638-986a-4de3-97d4-60dd66993f8c`; la última publicación solo actualizó notas del lienzo.
- Webhook privado `POST /webhook/el-rey-assistant-turn-v1`. Solo propone: no envía ni escribe en la base. No guardar datos de ejecuciones exitosas/fallidas/manuales ni progreso.
- Piloto habilitado únicamente para **+57 312 737 8289**, inicio `2026-09-29T05:00:41.000Z`. WhatsApp empresarial **+57 314 789 9116**. No ampliar al público automáticamente. El piloto permite pruebas fuera del horario; no trasladar esa excepción a clientes.
- Otros teléfonos conservan la ruta anterior. Hay eventos ajenos al piloto con `n8n respondió 404`: **no afirmar que esa ruta de mantenimiento funciona**, ni reactivar el bot viejo para resolverlo. Debe resolverse antes de abrir al público.
- Meta autenticado; contexto remoto legible. Durante el incidente, La Estrella tenía **0 productos activos y 0 QR activos**. El diagnóstico debe comprobar de nuevo la sede elegida y sus recursos. Samuel pidió no cargar promociones todavía; las subirá cuando existan. No sembrar productos ficticios.

## Incidente de sedes: resuelto y entrega real confirmada

Samuel escribió «muestrame todas las sedes» y «que sedes son?» y recibió avisos internos. Dos problemas:

1. Reproducción HTTP con contexto reconstruido del caso: n8n devolvía `409 missing_tool_evidence`. La respuesta informativa omitía consultar la herramienta. Se exige `consultar_informacion` explícitamente para cada turno informativo, aun cuando haya referencias en el historial. La misma reproducción dio `200 decision_ready` y los diez nombres verificados después de corregirlo. Se conservó el control que rechaza hechos sin herramienta; no se relajó para aceptar invenciones.
2. La ruta de derivación hacía más de 50 consultas externas entre recepción, dos lecturas de contexto, aviso y respuesta. La prueba integrada con el Worker anterior falla al imponer ese presupuesto; la nueva completa el ciclo en **33 consultas**. La lectura consistente `bot_context_snapshot` reduce cada contexto de 13 consultas a 2, incluida la autorización. El cliente recibe primero su respuesta y después se procesa el aviso interno. Los turnos obsoletos no vuelven a fallar diez veces por un cambio de contexto.

Las solicitudes claras de lista de sedes se resuelven directamente con `branches.active`: nombres, orden numérico normal y sin códigos b1/b10. No consumen IA ni crean pendientes. «cambiar sede» y «creo que me queda mejor la de Campo Valdez» actualizan la sede real respetando carrito/control; seleccionar un número requiere una lista previamente entregada. No basta con que el modelo diga que cambió de sede.

**Prueba real del 29/09, 20:29 Colombia:** entrada `5d243bd6-2593-4080-b46e-ed74448f8fd0`, respuesta `f11f438e-5311-483b-82ab-2eebba767330`, estado Meta **read**. Evento recibido `2026-09-30T01:29:18.394414Z`, completado `01:29:22.721100Z`, **un intento**, sin error. Samuel confirmó «Sí, recibí la lista». Esta prueba fue sobre `bfc661ac`; la versión final conserva esa ruta y acota adicionalmente el cron a un trabajo por ejecución.

Cron: un evento pendiente por ejecución; si no hay evento, una tarea humana de la conversación piloto activa más reciente. Evita combinar varias recuperaciones completas dentro del mismo presupuesto. Pendientes y leases permanecen durables.

## Comercio implementado, todavía sin compra real de aceptación

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

La migración de control manual del 26/09 ya estaba aplicada. V2 del 20/09 NO está aplicada. La base no tiene `supabase_migrations.schema_migrations`: comprobar funciones/columnas, no inferir estado por historial CLI. No ejecutar toda la carpeta.

La limpieza operativa fue solicitada por Samuel y ejecutada **por él** con `scripts/reset-operational-data-20260929.sql`. Respaldo privado `elrey_reset_20260929` comprobado; nuevos mensajes posteriores a la limpieza son válidos. **No repetir borrado**. Conservar catálogo, usuarios, sedes, QR y cambios PQRS.

Claves de reconstrucción fuera de Git: `~/.config/grupo-el-rey/n8n-rebuild-secrets.json`. Nombres: `N8N_REBUILD_GATEWAY_SECRET` y `N8N_REBUILD_WEBHOOK_SECRET`. Referencias sin secretos: `docs/ACCESOS.md`.

`GET /api/bot/pilot/status?diagnostics=true`, protegido por cabecera de gateway nueva, muestra metadatos de entrada/salida sin textos ni secretos. Evidencia privada de este incidente bajo `~/.config/grupo-el-rey/attention-20260928/sedes-*`. No copiar contexto real al repositorio. MCP nativo `mcp__n8n__*` funcionó.

## Verificación y siguientes pasos

- 42 pruebas Node del conjunto comercial (incluye 2 recorridos del webhook firmado con Meta/base simulados), 10 grupos PostgreSQL aislados y 9 pruebas de ingreso heredadas aprobados. Lint y build aprobados; advertencia de bundle Vite >500 kB existente.
- Cinco casos comerciales con modelo real y datos sintéticos aprobados tras cambiar la regla informativa. Son propuestas, **no compras reales**. Evidencia en `n8n/rebuild/commerce-evidence-20260929.json`.
- Prueba real de sedes aprobada por Samuel y estado Meta read. No se reenviaron mensajes históricos, no se borraron pendientes ni pedidos y no se cargó stock.
- Antes de público: compra completa con producto/precio/conteo real y QR de la sede cuando Samuel los cargue; probar dirección/tarifa/resumen/pago/pedido/seguimiento/control humano en WhatsApp.
- Faltan horarios operativos/recordatorio, interpretación de audio/imágenes/PDF, respuesta humana mediante aviso citado en WhatsApp, envío de imagen de producto y plantillas de aviso fuera de 23 horas. El responsable hoy contesta desde intranet.
- La ejecución de IA sigue sujeta al límite de tiempo del trabajo de fondo HTTP; el inbox durable recupera turnos interrumpidos. Antes de público conviene separar ejecución prolongada en cola. El arreglo de sedes es directo y no depende de ese tiempo de IA.
- No afirmar «perfecto» ni «listo para público». La siguiente prueba puede ser cambiar sede, consultar medios de pago y crear/aclarar una consulta desconocida. La compra real espera el catálogo de Samuel.
