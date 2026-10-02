# Instrucciones para continuar Grupo El Rey

Leer primero `HANDOFF_N8N_WHATSAPP.md`, actualizado el 01/10/2026, y `n8n/rebuild/README.md`.

- Aplicación real: esta carpeta Plataforma. La carpeta de chat en Documents es otro repositorio.
- Samuel autorizó el 01/10 abrir el bot a TODOS los clientes entrantes y un demo de una imagen a un único número. Alcance publicado; no pedir autorización otra vez para trabajo rutinario. Campañas masivas completas siguen aplazadas.
- Usar MCP de n8n. **No manejar la pantalla del PC**: esta es la preferencia más reciente. Se permiten archivos y CLI.
- Bot nuevo público desde el 01/10, con corte de mensajes nuevos 2026-10-01T19:39:54.198Z. El número terminado en 8289 sigue siendo responsable de avisos. No reactivar la IA anterior ni reenviar mensajes históricos.
- Piloto comercial nuevo implementado: carrito, conteo hasta cierre, tarifa humana de domicilio, resumen aceptado, reserva, QR, pago explícitamente aprobado y pedido idempotente. Consultar el traspaso para versiones y límites: la compra REY-1003 fue probada por Samuel; apertura pública autorizada el 01/10.
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

- 30/09: imágenes de producto/aclaraciones y sesiones nuevas tras 24 horas sin escribir publicadas; migraciones 202609300005/006/007 aplicadas. **Campañas masivas aplazadas; excepción del 01/10: demo individual de imagen autorizado y publicado.** Código preparatorio conservado; pestaña/API/cron deshabilitados, cero campañas enviadas. Ver HANDOFF para versiones y pruebas.

- Nueva limpieza autorizada el 30/09: TODO el dato operativo, incluidos domiciliarios, personal de caja, chats, pendientes, PQRS, catálogo, inventario, conocimientos y QR. Conservar auth, profiles/permisos y branches. Samuel ejecutará personalmente `scripts/reset-all-business-data-20260930.sql` en SQL Editor. **Preparado y probado en base aislada; NO ejecutado en producción ni confirmado aún.** Respaldo privado nuevo elrey_reset_20260930, sin sobrescribir el del 29/09; Storage físico privado y secuencias conservados. No ejecutar por CLI ni asumir que ya está vacío. Esta autorización reemplaza el alcance de conservación de catálogo/QR de la limpieza anterior, únicamente para este SQL.

- 01/10: n8n publicado en 67d1cdbc-a5ee-4bc0-99f8-99f65d7fca07. Continuidad tras descuento/tallas, fuente literal, nombre de perfil excluido del modelo y máximo dos intentos de generación sin efectos. El fallo original del 30/09 23:06 no tiene causa exacta guardada; sí se reprodujo un agent_unavailable intermitente en pruebas. Ver HANDOFF/evidencia y distinguir de entrega real. No reenviar mensajes históricos.

- 01/10: Worker público `12fbea86-6eba-4fbf-8380-4f0040a04dbb` al 100%; migración 202610010001 aplicada específicamente. Demo exige admin, imagen privada y mensaje entrante del destinatario en últimas 24 h; respeta bajas y no repite envíos inciertos. 78 pruebas Node/17 grupos DB, lint/build y diagnóstico remoto aprobados. Falta envío real del demo por Samuel. SQL de limpieza anterior ahora rechaza la tabla nueva por diseño; NO ejecutarlo sin actualizar y revisar su alcance.

- Incidente público 01/10: Meta puede omitir teléfono y enviar from_user_id (BSUID). Corregido en Worker0f200912-4e6f-4388-b6a4-ce9630ddc788: normalizar identidad y enlazar contacto explícitamente. Nunca exigir teléfono para responder ni inventarlo; recipient para BSUID. 33 pruebas Node/18 grupos DB, lint/build; Samuel confirmó respuesta desde el otro número y Meta registró consentimiento/menú leídos a las19:49 UTC. Ver HANDOFF.

- 01/10 noche: privacidad movida a almaceneselrey.co/privacidad (responsable/datos confirmados por Samuel); enlaces de intranet redirigen y bot usaURL pública. Chat interno admin↔sedes publicado, migración202610010002 aplicada. Worker85efc235, web e1846717. Avisos de escritorio con permiso y pestaña abierta; no WebPush cerrado. Ver HANDOFF antes de continuar. Samuel realizó commits durante el trabajo; Codex no.

- Incidente de login 01/10 noche: la tabla internal_chat_reads crea una segunda relación profiles↔branches. Mantener el hint explícito `branches!profiles_branch_id_fkey` en getProfile. Error de acceso visible/reintentable y callback Auth síncrono; Worker584367da publicado. Ingreso real de Samuel confirmado después de recargar. Ver HANDOFF para evidencia y límites.

- Chat de caja 01/10 noche: mantener color oscuro explícito y color-scheme light en .branch-chat-room para que no herede el texto claro de .cashier-shell. Corrección CSS977b626a publicada y comprobada en caja/admin y móvil. Captura de Samuel confirma acceso de caja y mensajes; aviso nativo aún sin prueba de entrega.

- Manual de marca público 01/10 noche: https://almaceneselrey.co/manual-de-marca, Worker web cd0ecb97. Fuente fuera de Git en carpeta hermana `Landing page/manual-de-marca/`; kit original con licencias, fuentes locales, sin Analytics. Conservar logo PNG sin alteraciones y excluir dashboard antiguo al publicar la web. Ver HANDOFF; sin cambios de bot/base/Auth ni commit/push de Codex.
