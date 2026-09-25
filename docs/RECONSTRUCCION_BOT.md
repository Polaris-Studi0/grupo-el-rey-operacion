# Reconstrucción del bot — estado técnico para retomar

Fecha del traspaso: 25/09/2026. Requisitos: [CHATBOT_N8N.md](CHATBOT_N8N.md). Accesos: [ACCESOS.md](ACCESOS.md).

**Actualización de dirección:** Samuel decidió empezar de cero en la cuenta `intranetelrey.app.n8n.cloud`. Seguir [ARQUITECTURA_BOT_NUEVO.md](ARQUITECTURA_BOT_NUEVO.md). Este documento conserva el inventario del trabajo anterior y sus riesgos; su lista de pendientes no implica restaurar ni completar automáticamente la arquitectura v2. Las tablas y funciones existentes se revisarán como componentes candidatos, preservando los datos.

## Qué está guardado y qué no está desplegado

Los fundamentos v2 están en el commit `4389834` (`new`). Antes de esta actualización documental, HEAD era `edd3788` (`pqrs`) y el árbol estaba limpio. No son cambios locales pendientes de commit como al comienzo del trabajo anterior.

| Archivo | Contenido | Límite actual |
|---|---|---|
| `n8n/v2/policy.js` | Horarios, etiquetas de landing, elegibilidad del recordatorio y borrador de validación comercial | No integrado al flujo publicado ni al Worker; requiere completar/revisar reglas y pruebas |
| `supabase/migrations/202609200001_whatsapp_v2_runtime.sql` | Configuración desactivada por defecto, slug de sedes, nombre confirmado, preparación de entrada, cola de apertura y recordatorio con leases | Probado en base aislada; no consta aplicación remota ni scheduler conectado |
| `supabase/migrations/202609200002_whatsapp_v2_owner.sql` | Respuesta del dueño por teléfono configurado y aviso citado, imágenes vinculadas a tarea y autorización de envío | Esquema cargado en pruebas locales; faltan pruebas funcionales del recorrido dueño→cliente y conexiones |
| `tests/whatsapp-v2-database.mjs` | Casos locales de entrada, consentimiento, web, horario, reapertura, recordatorio y concurrencia | Se ejecuta desde `tests/whatsapp-database.mjs`; no sustituye una conversación real |
| `tests/whatsapp-database.mjs` | Escenarios anteriores más los de v2, en PostgreSQL aislado PGlite | No prueba integración remota; leer fallos y no confundirlos con despliegue |
| `scripts/reset-whatsapp-test-history.sql` | Limpieza histórica de prueba, actualizada con tablas nuevas para pruebas locales | **No ejecutar en producción** al retomar; autorización anterior era puntual |

El código posterior de PQRS está en `src/PqrsHub.jsx`, `src/lib/api.js`, `src/worker.js`, `wrangler.jsonc` y `supabase/migrations/202609210001_pqrs_service.sql`. Debe conservarse.

## Últimas pruebas conocidas

- Durante la sesión del 20/09 pasó `node tests/whatsapp-database.mjs` en base aislada, incluidos los nuevos escenarios de consentimiento, sede web, rechazo, reapertura a las 09:00, leases, recordatorio único, reintentos y respuesta concurrente.
- No hubo mensajes reales ni pedidos de producción en esas pruebas. No se probó funcionalmente todo el módulo de respuesta del dueño, ni el agente v2 completo.
- El 25/09 no se volvió a ejecutar esa batería: la petición fue preparar el traspaso. Tampoco se verificó el efecto de la migración posterior de PQRS sobre la batería.
- Evaluación antigua del agente con herramientas: se observaron fallos; no constituye aceptación de la nueva arquitectura. El documento `n8n/AGENTE_CON_HERRAMIENTAS.md` es histórico.
- No hay evidencia de aplicación en producción de las migraciones v2 en este trabajo. Verificar esquema remoto antes de decidir si aplicarlas, corregirlas o crear una migración adicional.

## Pendientes concretos, en orden sugerido

1. Reconectar acceso de lectura a n8n y revisar el grafo publicado de 01/03/04/05. Confirmar mantenimiento. Revisar git y no sobrescribir cambios posteriores.
2. Revisar y completar `policy.js`. Falta integrar confirmaciones de productos/costo de envío en fuentes verificadas, evitar preguntas genéricas al faltar un dato y probar la selección natural. Revisar nombres, invalidación del resumen, límites numéricos, cambio de sede e imágenes.
3. Construir el contexto, contrato de herramientas y prompt propios de v2. No reutilizar automáticamente el normalizador antiguo: sus reglas de avance podían reemplazar respuestas pertinentes por el mismo mensaje. Separar datos, validación y ejecución.
4. Conectar la persistencia: nombre confirmado, sede, espera del cliente/equipo, fuentes de ofertas, resumen aceptado y compra. Reutilizar y reforzar las transacciones existentes de pedidos, inventario, comprobantes y avisos en lugar de duplicarlas.
5. Completar respuesta humana por WhatsApp e intranet. `route_whatsapp_owner_reply` guarda la respuesta del dueño vinculada a una solicitud, pero por sí sola **no interpreta ni aprueba pagos**. Implementar la continuación con origen humano comprobado y manejo de negación/ambigüedad, sin frases obligatorias. Probar aviso citado, tarea ya resuelta, repetición y múltiples clientes.
6. Completar las imágenes. El Worker actual solo envía imágenes del bucket `payment-qrs`; todavía no consume `shared_media_authorized`. La nueva tabla/RPC no bastan para enviar la imagen del producto. Probar la autorización por conversación y excluir comprobantes como imágenes comerciales.
7. Resolver el orden de recepción de archivos: el Worker reenvía a n8n antes de terminar de guardar el adjunto. El nuevo flujo no debe procesar un comprobante o imagen del dueño como si el archivo ya existiera cuando aún se descarga. Mantener reintentos idempotentes.
8. Conectar trabajos de apertura y recordatorio a un ejecutor que solo despierte n8n cuando haya trabajo. La cola SQL está preparada, pero no está conectada al cron del Worker. Revalidar horario, consentimiento, control humano, nuevos mensajes, pedidos y tareas antes del envío.
9. Revisar las consultas antiguas que devuelven `true as service_open` y `true as delivery_open`. No ponerlas en producción con v2. Confirmar notificaciones y plantillas de Meta disponibles; no atribuir errores a créditos sin comprobarlos.
10. Ejecutar pruebas locales y del modelo real en un flujo aislado, luego una compra completa controlada y seguimiento. Solo después conectar/publicar la nueva atención y retirar mantenimiento, con rollback documentado.

## Riesgos y detalles que ahorran depuración

- `whatsapp_bot_runtime.enabled` nace en `false`. No ponerlo en `true` solo para hacer que una pieza incompleta responda.
- `policy.js` no es un agente terminado: tiene respuestas de bloqueo provisionales; algunas deben convertirse en datos faltantes que la IA pueda resolver con una pregunta útil. Falta validar toda su correspondencia con SQL.
- Los datos confiables del pago vienen de una resolución humana vinculada al mismo pedido/sede/importe, no de `approved=true` propuesto por un cliente o por el agente comercial.
- Los cambios de dirección no deben borrar pruebas de stock; los cambios de carrito o sede sí pueden invalidar precio, total y aprobación.
- El índice de `whatsapp_messages.idempotency_key` es parcial. Los `ON CONFLICT` que lo usan requieren `WHERE idempotency_key IS NOT NULL` cuando corresponda.
- Mantener la corrección que ignora campos mutables de Meta al comparar payloads idempotentes (`202609070011...`).
- `orders.total` es subtotal; no sumar domicilio dentro y fuera del pedido. Mantener correcciones de total, notificación y comprobante del 10/09.
- El flujo aislado de n8n contiene nodos antiguos desconectados. Inspeccionar el recorrido real desde el trigger; ejecutar un workflow no significa que se haya ejecutado el agente.
- En pruebas antiguas, los subnodos de IA de n8n podían resolver `.item` contra el primer elemento en un bucle. Probar una conversación por ejecución o demostrar aislamiento antes de agrupar casos.
- `Extra Body` del nodo OpenAI debe contener JSON serializado, por ejemplo `{"store":false}`, no un objeto que se convierta en `[object Object]`.
- No asumir que un modelo está permitido por una credencial gratuita. El candidato aislado llegó a ejecutarse con `gpt-5-mini` y Gateway credits; comprobar disponibilidad actual antes de elegir un modelo.
- Las confirmaciones internas y avisos enviados al teléfono de Samuel se excluyen del historial del cliente. Su teléfono se usó también en pruebas; no enrutar toda respuesta suya como aprobación administrativa.
- No publicar los export antiguos de `respaldos-n8n-20260908` como si fueran la versión vigente.

## Validación local al retomar implementación

Desde la carpeta Plataforma:

```bash
npm run test:whatsapp
npm run check
npm run build
```

La batería de base de datos usa PGlite, sin conexión remota ni envíos. Revisar `package.json` antes de modificar comandos. Agregar pruebas de los nuevos efectos; pasar solo los escenarios viejos no valida v2.

## Alcance de este traspaso

El 25/09 se actualizaron instrucciones, requisitos, referencias de acceso y documentación de despliegue; se archivaron guías superadas. No se aplicaron migraciones, no se modificaron workflows, no se enviaron mensajes, no se borró historial y no se creó un commit.
