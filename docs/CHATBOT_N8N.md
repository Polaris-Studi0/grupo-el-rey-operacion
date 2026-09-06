# Chatbot de WhatsApp — arquitectura operativa

## Objetivo de la primera versión

El asistente orienta sobre sedes, horarios, promociones y productos previamente verificados. Puede recopilar los datos de un pedido, pero no toma decisiones sensibles por su cuenta. Precio, inventario, costo del domicilio, aprobación de pago y crédito deben provenir de datos confirmados o de una respuesta humana registrada.

## Flujo principal

1. Meta envía el evento firmado al Worker de Cloudflare en `/api/whatsapp/webhook`.
2. El Worker valida la firma, guarda el evento original en `whatsapp_webhook_inbox` y lo reenvía a n8n con una clave interna.
3. n8n descarta eventos duplicados usando `x-elrey-event-key`.
4. n8n crea o actualiza el contacto y abre su conversación.
5. Si no existe autorización vigente, envía el aviso de privacidad y espera una respuesta explícita.
6. Con autorización, clasifica la intención y obtiene la sede desde el contexto de la landing, el historial o una pregunta directa.
7. Las reglas determinísticas consultan conocimiento, catálogo e inventario. OpenAI redacta la respuesta únicamente con esos datos.
8. Si falta una confirmación, n8n crea un registro en `human_tasks`, marca la conversación como `waiting_human` y envía la notificación al administrador.
9. Al resolver el pendiente desde el panel, n8n retoma la conversación y responde al cliente.
10. Cada mensaje, decisión, autorización, reserva y movimiento queda registrado en Supabase.

## Aviso de privacidad inicial

Texto sugerido para revisión jurídica antes de producción:

> Hola. Soy el asistente virtual de Almacenes El Rey. Para atender tu consulta necesitamos tratar tu nombre, número de teléfono y los datos que compartas durante esta conversación conforme a nuestra Política de Tratamiento de Datos. Responde **ACEPTO** para autorizar el tratamiento y continuar, o **NO ACEPTO** para finalizar. Puedes solicitar consulta, corrección o eliminación de tus datos por los canales indicados en la política.

No se debe interpretar el silencio ni cualquier mensaje posterior como autorización. n8n solo cambia `consent_status` a `granted` si normaliza una respuesta inequívoca como `ACEPTO`, `SÍ ACEPTO` o la respuesta interactiva equivalente. Se conserva el texto mostrado, la respuesta, versión de política, fecha y `meta_message_id` en `privacy_consents`.

## Estados de conversación

- `open`: puede responder o recopilar datos.
- `waiting_customer`: falta una respuesta del cliente.
- `waiting_human`: falta precio, existencia, domicilio, pago o crédito confirmado.
- `converted`: se creó un pedido operativo.
- `closed`: conversación finalizada.

## Pendientes humanos

### Producto no mapeado

n8n crea `human_tasks.task_type = product_lookup` con sede, texto exacto del cliente, datos ya recopilados y teléfono. La respuesta humana debe incluir disponibilidad, precio, nombre comercial y cualquier característica segura para comunicar.

### Costo del domicilio

Antes de solicitar cotización se deben tener sede, nombre, teléfono, municipio, barrio, dirección completa, referencias y productos aproximados. El total no se comunica hasta que `delivery_quote` esté resuelto.

### Transferencia

El comprobante se almacena en el bucket privado existente. El estado de pago solo se confirma después de resolver `payment_verification`. La IA nunca interpreta por sí sola una captura como pago aprobado.

### Addi o Sistecrédito

Se crea `credit_application` para que caja gestione la solicitud. No se afirma que el cliente tiene cupo ni que la compra está aprobada hasta recibir el resultado humano.

## Inventario

- `available_qty` representa unidades físicas confirmadas.
- `reserved_qty` impide ofrecer dos veces la misma unidad.
- `reserve_chat_inventory` crea una reserva con expiración y un movimiento auditable.
- Al confirmar la compra, el flujo debe convertir la reserva en venta, disminuir `available_qty` y liberar `reserved_qty` en una sola transacción.
- Si el cliente abandona o vence la reserva, se libera automáticamente.
- Excel o CSV se usa solamente como formato de carga; Supabase es la fuente real durante la conversación.

## División recomendada en n8n

Mantener varios flujos pequeños facilita pruebas y evita que un fallo afecte todo:

1. `EL REY · WhatsApp · Entrada`: valida el secreto, normaliza Meta, deduplica y persiste el mensaje.
2. `EL REY · WhatsApp · Consentimiento`: administra aviso, respuesta expresa y bloqueo por rechazo.
3. `EL REY · WhatsApp · Orquestador`: identifica sede/intención, consulta datos y decide responder o escalar.
4. `EL REY · WhatsApp · Pendientes`: notifica al administrador y retoma conversaciones resueltas.
5. `EL REY · WhatsApp · Estados`: procesa `sent`, `delivered`, `read` y `failed`.
6. `EL REY · Inventario · Vencimientos`: ejecución programada que libera reservas expiradas.
7. `EL REY · WhatsApp · Errores`: registra errores y alerta solo cuando requieren acción.

## Modelo de IA

Usar `gpt-5.4-nano` para intención, extracción de campos y elección de la siguiente acción. Usar `gpt-5.4-mini` solo cuando se necesite una respuesta conversacional más compleja. En ambos casos:

- Responses API con `store: false`.
- Salida estructurada JSON para intención y extracción.
- Temperatura conservadora cuando esté disponible.
- Enviar únicamente el resumen y los últimos mensajes necesarios, no el historial completo.
- Nunca incluir llaves, tokens ni comprobantes en el prompt.

Salida mínima esperada del clasificador:

```json
{
  "intent": "product_question",
  "branch_id": "b1",
  "needs_human": false,
  "missing_fields": [],
  "customer_name": "Valentina",
  "requested_products": [{ "name": "freidora de aire", "quantity": 1 }]
}
```

## Variables secretas de Cloudflare

Configurar como secretos, nunca como variables `VITE_` ni dentro de Git:

- `WHATSAPP_VERIFY_TOKEN`: ya se usa para verificar la suscripción de Meta.
- `WHATSAPP_APP_SECRET`: secreto de la aplicación Meta; valida `X-Hub-Signature-256`.
- `WHATSAPP_ACCESS_TOKEN`: token permanente de usuario del sistema, no el token temporal de prueba.
- `WHATSAPP_PHONE_NUMBER_ID`: ID del número de producción.
- `SUPABASE_URL`: URL del proyecto.
- `SUPABASE_SERVICE_ROLE_KEY`: llave exclusiva del backend.
- `N8N_WEBHOOK_URL`: URL de producción del flujo de entrada.
- `N8N_WEBHOOK_SECRET`: secreto que n8n compara al recibir eventos.
- `N8N_GATEWAY_SECRET`: secreto que n8n envía al endpoint `/api/whatsapp/send`.
- `META_GRAPH_VERSION`: opcional; por defecto `v26.0`.

El endpoint `/api/whatsapp/health` solo devuelve si cada grupo está configurado; nunca devuelve los valores.

## Contrato de salida hacia WhatsApp

n8n hace `POST /api/whatsapp/send` con `x-elrey-gateway-secret`.

Mensaje de texto dentro de la ventana de atención:

```json
{ "to": "573001234567", "type": "text", "text": "Mensaje confirmado" }
```

Plantilla aprobada para iniciar o retomar fuera de la ventana:

```json
{
  "to": "573001234567",
  "type": "template",
  "template": {
    "name": "pedido_actualizacion",
    "language": { "code": "es_CO" },
    "components": []
  }
}
```

## Antes de activar producción

1. Revisar el aviso y publicar la política de datos con un profesional competente.
2. Regenerar cualquier token que haya sido compartido por chat o captura.
3. Aplicar `202609050003_whatsapp_commerce.sql` en Supabase.
4. Crear un token permanente de usuario del sistema en Meta.
5. Configurar secretos de Cloudflare y credenciales de Supabase/OpenAI en n8n.
6. Crear y aprobar plantillas de utilidad: consentimiento, pendiente recibido, pago validado, pedido confirmado y domiciliario en camino.
7. Probar duplicados, rechazo de consentimiento, falta de sede, producto inexistente, inventario agotado, pago rechazado y caída de OpenAI.
8. Publicar los flujos solo después de completar las pruebas con el número de prueba.
