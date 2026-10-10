# Revisión de conversaciones y atención comercial — 09/10/2026

## Alcance y evidencia

Se leyeron completas las **24 conversaciones conservadas, con 380 mensajes**, desde el 01/10 hasta el 09/10, hora Colombia. La lectura incluyó respuestas del bot, aclaraciones del equipo y avisos internos. En el corte inicial había 44 tareas humanas, 43 avisos internos y 107 registros de ejecución del bot: son tipos de registros diferentes, **no un conteo de fallos**. Un resultado transaccional correcto en `ai_runs` puede corresponder a una derivación de respaldo; no prueba que el modelo haya respondido correctamente.

Las consultas privadas y la lectura completa permanecen fuera de Git en `~/.config/grupo-el-rey/review-20261009/`. Este informe usa ejemplos anónimos y no reproduce teléfonos, direcciones, nombres de clientes ni conversaciones completas. No se borraron ni reprodujeron mensajes, pedidos o pendientes. No se enviaron pruebas a clientes.

## Hallazgos y cambios

| Comportamiento observado | Mejora publicada |
| --- | --- |
| Una consulta de precio anterior al consentimiento se perdía al seleccionar sede. La selección numérica podía interpretarse como cantidad. | Se conserva la consulta inicial durante consentimiento y sede. n8n recibe esa pregunta como texto de trabajo, manteniendo el ID y las comprobaciones del mensaje actual. Una selección como «7» sigue siendo una sede. |
| El saludo del sitio público indicando una sede provocaba otro menú o conservaba una sede distinta. | Se reconoce también el saludo normal del sitio, además de la etiqueta de sede. Se respeta el cambio explícito y se protegen las compras activas. |
| «Gracias», «dale», «quedo atento» o una pregunta de precio ya incluida en un pendiente abrían tareas repetidas. | Respuestas directas para cortesías y seguimiento simple. Los pendientes de esta conversación/sede forman parte del contexto agrupado. Si el precio ya está solicitado, el bot comunica que espera la confirmación, sin crear otra tarea. |
| Una consulta de precio podía abrir carrito o pedir permiso repetidamente para consultar. | Una pregunta inequívoca por el nombre exacto de un único producto usa su precio confirmado y termina con una invitación a comprar, sin carrito. Exige sede, inventario vigente y promoción válida; preguntas compuestas o ambiguas siguen el motor habitual. n8n también distingue consulta y compra. |
| Una respuesta aprobada terminaba en «¿Lo» o «Si». | Se elimina la invitación generada como una cláusula completa. Se conserva una pregunta explícita del operador, por ejemplo domicilio o recogida. Si falta evidencia de herramienta en una propuesta exclusivamente informativa, se sustituye por la respuesta literal aprobada: no se aceptan afirmaciones generadas ni acciones comerciales por esa vía. |
| Una foto con un texto como «De estos que brillan» perdía el producto mencionado antes. El ID del adjunto entrante podía confundirse con una foto para enviar. | La derivación conserva el contexto reciente y señala el adjunto recibido. El ID del archivo del cliente se omite de la entrada del modelo; siguen disponibles las fotos autorizadas del catálogo para envío. No se atribuye visión al modelo. |
| Preguntas comerciales concretas necesitaban confirmación, pero el aviso podía ser vago o pedir demasiados datos técnicos. | Instrucciones para una consulta humana útil y acotada: producto, sede y dato solicitado, usando cantidad/talla solo cuando el cliente las dio. Respuestas breves y naturales, sin inventar existencias, descuentos, reservas o información de empleo. |

Se mantienen la captura conjunta de domicilio y el recordatorio únicamente de faltantes: comprador, receptor, teléfono, dirección y barrio pueden llegar juntos o en varias respuestas. No se usan nombres del perfil como datos confirmados de compra. Se conservan consentimiento, control manual, sesiones nuevas tras 24 horas de inactividad, stock hasta el cierre del día, aprobación humana de tarifas/pagos, reserva e idempotencia.

Atención de WhatsApp **09:00–20:00** y domicilios **09:00–19:00**, diariamente en `America/Bogota`. El modelo distingue el horario del canal de los horarios físicos de cada sede.

## Datos y arquitectura

La revisión encontró dos productos activos, dos registros de inventario, siete imágenes y una entrada global de conocimiento con las categorías del negocio. Ese catálogo es reducido frente a la variedad de consultas. Que vendamos hogar, aseo, cosméticos, electrodomésticos, belleza y juguetería no demuestra stock de una referencia particular.

No se crearon productos ficticios ni se convirtieron automáticamente respuestas de un chat en conocimientos globales. Las respuestas humanas siguen limitadas a su conversación/sede. Para reducir derivaciones legítimas, el equipo debe completar catálogo, fotos, inventario diario y conocimientos vigentes por sede desde la intranet.

La migración específica `202610090001_bot_pending_context.sql` reemplaza únicamente el envoltorio `bot_context_snapshot(uuid)`: conserva las imágenes autorizadas y agrega hasta diez tareas generales pendientes/en proceso del motor nuevo, de la misma conversación y sede. Excluye tareas resueltas y comerciales. Acceso solo de `service_role`; se incorpora al mismo contexto agrupado y su huella. Verificación remota: las 24 conversaciones tienen ambos arreglos y hay cero tareas fuera del alcance esperado.

Aplicada mediante Management API con hash de la definición previa como precondición. Hash posterior: `18736235f4a08037263b8f607f247920`. No ejecutar todas las migraciones ni el SQL de limpieza antiguo. La base sigue sin historial CLI que permita deducir qué migraciones faltan.

## Publicación y verificación

- Worker `grupo-el-rey-operacion`: **4134d63b-d099-416d-a066-7c10a2aa1ee7**, publicado al 100%. Versión inicial de Samuel al comenzar esta revisión: `26069818-36c1-463a-9219-d52f6b67a00f`. Las 25 vinculaciones y la configuración de ejecución se conservaron.
- [Motor de n8n](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ): **b2801dd4-1753-4315-8fe7-ba45a9c1f21e**, activo y coincidente con el borrador. Se actualizaron parámetros de tres nodos; permanecen los 17 nodos, las conexiones, credenciales, modelo y configuración de privacidad. No se guardan ejecuciones ni progreso.
- **115 pruebas Node y 27 grupos PostgreSQL aislados** aprobados. Cubren continuidad, pendientes, precio sin compra, respuestas humanas completas, captura conjunta, alcance de tareas, fotos, pagos, consentimiento, control manual, horarios y envíos idempotentes. ESLint y compilación aprobados; advertencia previa de tamaño de paquete.
- **Ocho decisiones con el modelo publicado aprobadas**, todas al primer intento: pregunta anterior a elegir sede, precio ya pendiente, producto no registrado, foto con contexto, respuesta humana de precio completa, pregunta explícita del operador, visita sin reserva inventada y datos de domicilio juntos. Evidencia sintética en [conversation-review-evidence-20261009.json](../n8n/rebuild/conversation-review-evidence-20261009.json). `node scripts/check-bot-conversation-review.mjs --verify-saved` revalida las ocho comprobaciones sin llamar al modelo; sin esa opción genera decisiones nuevas y consume n8n/modelo, sin envíos ni cambios en la base.
- Seis comprobaciones de conexión aprobadas, incluidas cabeceras inválidas y circuito Cloudflare→n8n→Cloudflare. Diagnóstico final publicado HTTP200, bot público activo, esquema verificado, Meta conectado y ninguna función faltante. A la hora de comprobarlo el canal estaba cerrado, correctamente, con reapertura09:00 Colombia. Despliegue final Cloudflare `6206f7e6-2fe1-4695-b538-89758ed98c8e`, 23:52 del09/10 Colombia.

Durante las pruebas apareció «Your trial has ended»: guardar/publicar un workflow no garantizaba poder ejecutarlo. Samuel activó el plan y se completaron las ocho comprobaciones del modelo. La evidencia sintética y la comprobación remota final se registran por separado; ninguna representa una nueva entrega real a un cliente por WhatsApp. La copia temporal del token administrativo de Supabase se eliminó al terminar; la credencial original del llavero se conserva.

## Límites y seguimiento

- Las imágenes entrantes y los audios todavía no tienen lectura visual/transcripción. El bot usa texto/contexto y solicita revisión humana cuando corresponde.
- Fuera de la ventana del destinatario, los avisos internos por WhatsApp todavía necesitan una plantilla adecuada aprobada. Los pendientes permanecen en la intranet. Esta revisión no cambió las ventanas ni envió avisos históricos.
- Las campañas completas siguen aplazadas; se conserva el demo individual ya autorizado.
- Revisión basada en todos los datos conservados al corte indicado, no en chats borrados previamente ni en conversaciones futuras. Las pruebas sintéticas verifican decisiones; una prueba nueva por WhatsApp debe hacerse con un mensaje nuevo, sin reproducir clientes anteriores.

Sin commit/push de Codex. Título sugerido para GitHub Desktop: **Mejora continuidad y atención comercial del bot**.
