# Horarios del bot y autorización de datos — 02/10/2026

Samuel confirmó atención de **09:00 a 20:00** y domicilios de **09:00 a 19:00**, hora de Colombia. Se aplica diariamente, con apertura a las09:00 incluidas y cierres exclusivos. No se cambian horarios de pedidos ya registrados ni se promete una entrega a las09:00.

## Comportamiento

- El primer mensaje de un cliente nuevo muestra el aviso de privacidad. Acepta `sí`, `si`, `acepto` y `sí acepto`, con mayúsculas o puntuación. `sí`/`no` solo se interpretan como consentimiento después de un aviso entregado y mientras falte autorización. Una confirmación normal durante una compra no crea otra autorización. Se guarda el mensaje original y el aviso que realmente se mostró. `NO ACEPTO`/`NO AUTORIZO` siguen retirando la autorización.
- Fuera de atención no se consulta al modelo, se selecciona una sede ni se confirma una compra. Se informa el horario y se deja un aviso de reapertura desde las09:00. Antes del consentimiento solo se muestra privacidad y horario; no se programa contacto posterior hasta la aceptación.
- Entre19:00 y20:00 se permiten información, seguimiento y recogida en sede. El nuevo checkout a domicilio se pausa, conserva los datos y ofrece continuar al día siguiente o recoger. No se crea pedido, tarifa, reserva ni nuevo QR en ese turno. Se conservan un comprobante y una aprobación recibidos antes del corte; no se pide otro pago.
- SQL vuelve a comprobar el horario antes de guardar un turno y antes de tomar la autorización de envío. Si una respuesta empezó a generarse antes del cierre y terminó después, se sustituye por el aviso de horario. También se comprueban imágenes automáticas.

## Persistencia y entrega

`BOT_SERVICE_HOURS_ENABLED=true` activa la regla en el Worker público. `src/bot-hours.js` calcula el reloj colombiano; `bot_service_window` lo confirma en SQL. La información de horarios se incorpora al contexto agrupado del modelo sin lecturas adicionales. n8n permanece en7a0006c7-ab76-4738-ad65-b3aeebb427fa; no cambia el agente ni se activan workflows antiguos.

Migración **202610020002_bot_service_hours.sql**, aplicada específicamente por Management API con hashes de las tres funciones actuales como precondición. Modifica fragmentos del consentimiento, commit comercial y autorización de envío; conserva las demás validaciones y permisos.

La tabla nueva `bot_service_waits` guarda conversación, último mensaje, versión de control, motivo, próxima apertura, aviso y estado. Un cierre genera un solo aviso por conversación/motivo/apertura; una ráfaga actualiza su mensaje de origen sin repetir un aviso enviado. El cron prepara **un trabajo por invocación**, antes de recuperar el inbox y las aclaraciones. La cola idempotente y la autorización de envío impiden duplicados. Si dos motivos coinciden, solo se envía un aviso de reapertura.

Se cancela un aviso si el cliente ya volvió a escribir, cambió el control, la conversación se cerró, alguien tomó el control manual o se retiró el consentimiento. La finalización se registra solo cuando existe confirmación de Meta. Los envíos inciertos no se repiten automáticamente.

La espera normal hasta la apertura dura como máximo13 horas. Se conserva el margen de23 horas para mensajes libres. Si una interrupción prolongada vence esa ventana, el aviso queda `expired`; no se inventa una plantilla ni se marca como enviado. Fuera de24 horas Meta exige una plantilla aprobada: [política oficial de WhatsApp](https://whatsappbusiness.com/policy/).

## Publicación y evidencia

Worker **6b15ebaf-04d6-4dd3-8ace-12fdf3826134**, publicado al100%. Conserva las24 vinculaciones originales (incluidos9 secretos), compatibilidad2026-09-03 y configuración de archivos; agrega únicamente la bandera de horarios. Respaldo de definiciones, verificaciones y registros en el directorio privado `~/.config/grupo-el-rey/hours-20261002/`; ningún secreto en el repositorio.

- **95 pruebas Node y25 grupos de base aislada**: límites de horas/mes, privacidad antes de aceptación, aceptación natural, control manual, ráfagas, reapertura idempotente, ventana vencida, nuevo mensaje, cierre, recogida, datos del domicilio y aprobación de pago tardía. El reloj simulado se limita a la base aislada.
- ESLint y compilación aprobados. Se conserva la advertencia previa de tamaño del paquete web.
- SQL remoto confirma permisos, RLS, guardas y cortes horarios. Diagnóstico del candidato y producción confirma Meta conectado, esquema completo y horario correcto; sin enviar mensajes a clientes como prueba.
- **Entrega real observada el03/10**: aviso fuera de horario a las08:55 Colombia y aviso de la siguiente apertura a las09:01, ambos con estado Meta `read`. La consulta real fue observada durante la revisión; no se reprodujeron mensajes antiguos ni se enviaron pruebas a clientes. Evidencia privada en `~/.config/grupo-el-rey/review-20261003/` y explicación en `docs/BOT_REVIEW_20261003.md`.

No se borraron datos ni se reactivó v2. No se ejecutó la limpieza pendiente. El SQL antiguo de limpieza rechaza tablas desconocidas, incluida ahora `bot_service_waits`; requiere una nueva revisión de alcance antes de que Samuel lo ejecute. Sin commit/push de Codex.
