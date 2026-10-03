# Consulta general y aviso al responsable — 03/10/2026

## Hallazgo real

La última conversación revisada corresponde a San Antonio de Prado. A las **09:24 del 03/10, hora Colombia**, el cliente preguntó «y que venden alla». El bot respondió «Dame un momento y te confirmo», con estado Meta `read`, y creó un pendiente humano. No intentó enviar el aviso al responsable: el evento permaneció pendiente, con cero intentos y sin `admin_notified_at`.

No había conocimientos activos con las líneas generales del negocio. La falta de ese dato provocó una derivación innecesaria; no demuestra que falte una referencia concreta del catálogo.

El último mensaje entrante del responsable había sido el 02/10 a las10:04. En el momento de crear el pendiente habían pasado **23 horas y20 minutos**. El código y la recuperación SQL cortaban los avisos a las23 horas. Ese margen de una hora fue excesivo: todavía quedaba ventana de respuesta cuando se creó la tarea. No hubo rechazo de Meta porque ni siquiera se intentó el envío.

## Corrección publicada

- Información general confirmada por Samuel: hogar, aseo, cosméticos, electrodomésticos, belleza y juguetería. Registro global activo en `branch_knowledge`, separado de catálogo e inventario. Las preguntas generales claras usan esa información directamente; preguntas específicas o compuestas siguen el motor habitual. Si el conocimiento se desactiva o no está en el contexto autorizado, no se inventa la respuesta.
- Ventana del responsable ampliada a **23 horas55 minutos**, con cinco minutos para transporte. Aplicada tanto al aviso inmediato como a la recuperación de pendientes y avisos de pedidos. La ventana del cliente se conserva.
- El envío revalida la ventana del destinatario del aviso, incluso si el mensaje quedó preparado antes. Un aviso vencido queda diferido y no se registra como enviado ni se inicia un intento incierto.
- Diagnóstico privado opcional de las plantillas Utility disponibles, sin crear plantillas ni enviar mensajes.

La migración específica `202610030001_business_categories_owner_window.sql` se aplicó mediante Management API con hashes de las definiciones remotas como precondición. No ejecutar todas las migraciones. No se borraron chats, pedidos ni pendientes, no se cargaron promociones y no se reprodujo la consulta antigua.

Worker **48b10c7d-10f1-4218-ac4c-da55618fc25f**, publicado al100%. La versión anterior inmediata de Samuel era f597c87b-ff3e-48f5-a810-5060343af349. Se preservaron las25 vinculaciones y la configuración de ejecución. n8n no cambió: el MCP nativo pidió autenticación y el plugin devolvió un error interno; la última versión conocida sigue siendo7a0006c7, sin revalidación del workflow en esta revisión.

## Límite pendiente

La ventana de24 horas corresponde al destinatario y se reinicia con su mensaje entrante, aunque el destinatario sea el número personal del administrador. Fuera de ella, la API requiere una plantilla aprobada; no depende de que el contenido sea publicidad. Referencia: [política de WhatsApp Business Platform](https://whatsappbusiness.com/policy/), sección2.

Las tres plantillas Utility aprobadas observadas fueron `confirmacion_pedido`, `3p_direct_integration_test_template` y `hello_world`. Ninguna corresponde a un aviso interno de información pendiente. No se usó una confirmación de pedido para ese fin. **Los avisos por WhatsApp fuera de la ventana todavía requieren una plantilla adecuada aprobada por Meta.** El pendiente permanece visible en la intranet; no afirmar entrega del aviso histórico ni avisos indefinidos.

## Verificación

- **99 pruebas Node y26 grupos PostgreSQL aislados** aprobados: pregunta general, fuente ausente/específica, aviso a las23h20 y23h54, vencimiento a las24h y revalidación antes del envío. Consentimiento, control manual, compras, fotos, horarios y recuperación existentes conservados.
- ESLint, compilación y diagnóstico publicado aprobados; Meta y esquema conectados, bot público activo. Advertencia previa de tamaño del paquete sin cambios.
- SQL remoto confirma las categorías activas/globales, la ventana de recuperación, la guarda de envío y la conservación del pendiente original. No hubo mensajes de prueba a contactos reales.
- También se observó evidencia real de la funcionalidad anterior de horarios: aviso de cierre a las08:55 y aviso de reapertura a las09:01 del03/10, ambos `read`. No es una nueva prueba comercial.

Evidencia real y respaldos privados: `~/.config/grupo-el-rey/review-20261003/`, fuera de Git. Copia temporal del token administrativo eliminada al terminar; credencial original del llavero intacta. Sin commit/push de Codex.
