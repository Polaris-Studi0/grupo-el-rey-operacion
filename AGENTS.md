# Instrucciones para continuar Grupo El Rey

Leer primero `HANDOFF_N8N_WHATSAPP.md`, actualizado el 29/09/2026, y `n8n/rebuild/README.md`.

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
- Migraciones nuevas 202609290001, 202609290002, 202609290003 y 202609290004 aplicadas por Management API, sin activar v2. La base no tiene tabla supabase_migrations.schema_migrations; no deducir estado del historial CLI ni ejecutar toda la carpeta.

- Incidente de sedes corregido y probado realmente el 29/09, 20:29 Colombia (Meta read y Samuel confirmó). Sedes directas sin IA; contexto comercial agrupado; un trabajo de recuperación por ejecución. No quitar esos límites ni volver a las lecturas separadas.
