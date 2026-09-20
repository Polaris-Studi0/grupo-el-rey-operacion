# Modo temporal de atención humana

Activado por solicitud urgente del usuario el 19 de septiembre de 2026. No reactivar el bot comercial sin una nueva solicitud.

Mensaje publicado:

¡Hola! 👋 Gracias por escribir a Almacenes El Rey. Estamos trabajando en grandes cosas para ti y mejorando nuestra atención por WhatsApp. ✨

Déjanos tu consulta por aquí. Un asistente humano podrá leer tu mensaje y responderte.

01 conserva el registro de mensajes y estados de Meta. Desde `Solo mensajes nuevos` pasa a `Respuesta temporal de mantenimiento` y `Enviar aviso temporal`; no ejecuta consentimiento ni el asistente comercial. El aviso se registra como mensaje de sistema con clave `maintenance-reply:<inbound_message_id>`, sin conceder consentimiento ni modificar pedidos. Se respetan conversaciones cerradas y consentimiento denegado.

03 está publicado con `Filtrar autorizados` devolviendo null para impedir respuestas automáticas desde llamadas internas. 05 (reapertura automática) está despublicado. Los mensajes entrantes siguen disponibles en la plataforma.

Versiones publicadas: 01 `63dcfc1c-c6a6-474d-8b39-5fe296d0f47f`; 03 `64a36633-3b25-4223-8f12-4a3ed64c1884`.

Para una futura restauración autorizada: 01 debe volver a conectar `Solo mensajes nuevos` con `Consentimiento vigente`; su versión previa era `b62c9170-ad48-4ebe-88e7-e1da03215350`. Restaurar también el filtro anterior de 03 y revisar qué versión comercial se publica; no publicar el candidato experimental automáticamente. Parámetros anteriores del filtro:

```json
{
  "mode": "runOnceForEachItem",
  "jsCode": "if ($json.ready_for_next_step !== true || !$json.inbound_message_id || !$json.conversation_id) return null;\nreturn { json: $json };"
}
```
