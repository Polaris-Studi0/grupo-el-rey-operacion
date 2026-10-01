# Instrucciones para continuar Grupo El Rey

Leer primero `HANDOFF_N8N_WHATSAPP.md`, actualizado el 30/09/2026, y `n8n/rebuild/README.md`.

- Aplicación real: esta carpeta Plataforma. La carpeta de chat en Documents es otro repositorio.
- Samuel autorizó el piloto en WhatsApp con su número personal, además de la reconstrucción por MCP y las ediciones del proyecto. No pedir autorización otra vez para trabajo rutinario de ese alcance.
- Usar MCP de n8n. **No manejar la pantalla del PC**: esta es la preferencia más reciente. Se permiten archivos y CLI.
- Piloto nuevo publicado para el contacto terminado en 8289 desde el 29/09. El resto mantiene la ruta anterior de mantenimiento. No reactivar la IA anterior ni ampliar el piloto automáticamente.
- Piloto comercial nuevo implementado: carrito, conteo hasta cierre, tarifa humana de domicilio, resumen aceptado, reserva, QR, pago explícitamente aprobado y pedido idempotente. Consultar el traspaso para versiones y límites: falta probar una compra real cuando haya promociones; no abrir al público automáticamente.
- Estado, versiones, evidencia y límites en el traspaso; comprobar el remoto antes de editar. Los workflows antiguos son de otra cuenta.
- Excepción autorizada el 29/09: Samuel pidió vaciar historial de WhatsApp, pedidos/domicilios y PQRS con respaldo. Eligió ejecutar personalmente el SQL en Supabase; entregar `scripts/reset-operational-data-20260929.sql`, no ejecutarlo por CLI. Ejecución manual confirmada el 29/09: respaldo privado presente y pedidos/PQRS vacíos. No repetir la limpieza. Conservar usuarios, sedes, catálogo, inventario, QR y código/configuración de PQRS.
- No copiar secretos al chat ni al repositorio. Referencias en `docs/ACCESOS.md`.
- Distinguir tests locales, modelo real con datos sintéticos, versión desplegada y entrega real por WhatsApp.
- Samuel prefiere commit/push manual desde GitHub Desktop. Dejar título descriptivo; no crear commit/push salvo petición.
- Comunicar avances breves en español. Evitar agentes paralelos salvo solicitud explícita.
- Documentos en `docs/archivo/` son históricos.

- Samuel indicó el 29/09 que aún NO se carguen promociones. Él las subirá a la intranet cuando estén disponibles. No sembrar productos ficticios en producción.
- Migraciones nuevas 202609290001, 202609290002, 202609290003, 202609290004, 202609300001, 202609300002, 202609300003 y 202609300004 aplicadas por Management API, sin activar v2. La base no tiene tabla supabase_migrations.schema_migrations; no deducir estado del historial CLI ni ejecutar toda la carpeta.

- Incidente de sedes corregido y probado realmente el 29/09, 20:29 Colombia (Meta read y Samuel confirmó). Sedes directas sin IA; contexto comercial agrupado; un trabajo de recuperación por ejecución. No quitar esos límites ni volver a las lecturas separadas.

- Corrección del 30/09: selección comercial desde una respuesta humana guardada como pending_selection, sin inventar stock. Conteo explícito en intranet antes del resumen/pago. Publicado, probado en base aislada y propuesta con contexto real; falta nueva entrega real por WhatsApp. Detalles y límites en HANDOFF.

- Incidente posterior del 30/09: nombre confundido con destinatario y teléfono derivado. Corregido con captura directa de datos inequívocos, recuperación de campos explícitos de la cotización y preguntas progresivas. 49 pruebas Node/12 grupos DB y 5 casos de continuidad aprobados; falta nueva entrega real. No pedir repetir los datos ya dados: puede seguir con dirección y barrio.

- 30/09: Samuel completó el pedido piloto REY-1003 con aprobación manual de pago; confirmado en captura y datos. Seguimiento directo conectado a promised_at y esperas naturales publicados. No reiniciar estimaciones ni inventar otra al vencer. Falta nueva entrega real de la corrección de ETA; no repetir la compra.

- 30/09: imágenes de producto/aclaraciones y sesiones nuevas tras 24 horas sin escribir publicadas; migraciones 202609300005/006/007 aplicadas. **Samuel aplazó publicidad: no continuarla ni habilitarla.** Código preparatorio conservado; pestaña/API/cron deshabilitados, cero campañas enviadas. Ver HANDOFF para versiones y pruebas.

- Nueva limpieza autorizada el 30/09: TODO el dato operativo, incluidos domiciliarios, personal de caja, chats, pendientes, PQRS, catálogo, inventario, conocimientos y QR. Conservar auth, profiles/permisos y branches. Samuel ejecutará personalmente `scripts/reset-all-business-data-20260930.sql` en SQL Editor. **Preparado y probado en base aislada; NO ejecutado en producción ni confirmado aún.** Respaldo privado nuevo elrey_reset_20260930, sin sobrescribir el del 29/09; Storage físico privado y secuencias conservados. No ejecutar por CLI ni asumir que ya está vacío. Esta autorización reemplaza el alcance de conservación de catálogo/QR de la limpieza anterior, únicamente para este SQL.
