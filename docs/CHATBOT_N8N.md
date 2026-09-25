# Bot WhatsApp — requisitos vigentes y arquitectura objetivo

Acuerdos de Samuel consolidados al 25/09/2026. **Este documento describe el resultado solicitado, no una implementación ya publicada.** Estado real y pendientes: [traspaso](../HANDOFF_N8N_WHATSAPP.md) y [reconstrucción](RECONSTRUCCION_BOT.md).

## Principio de diseño

La IA interpreta lenguaje libre y el historial, responde la pregunta actual y utiliza herramientas limitadas de la plataforma. Las validaciones protegen consentimiento, autorizaciones, precios, pagos y transacciones; no convierten cada conversación en un formulario ni fuerzan una respuesta fija según la etapa de venta.

Todo se integra con la intranet y la misma base de Supabase: conversaciones, información, productos, inventario, QR, pendientes, comprobantes y pedidos. No mantener una segunda fuente comercial desconectada. Se permite rehacer la arquitectura y aumentar ejecuciones si mejora la fiabilidad; optimizar después de comprobar el comportamiento.

## Entrada, consentimiento, nombre y sede

1. Comprobar autorización de datos antes de la atención comercial con IA. Si falta, mostrar el aviso y registrar una aceptación expresa; silencio, un saludo o un comprobante no conceden autorización. No inventar consentimiento.
2. Conservar el primer mensaje y su información útil durante esa espera. Ejemplo real:

   ```text
   Hola, quiero comunicarme con la sede San Antonio de Prado. [ORIGEN:WEB] [SEDE:san-antonio-prado] [METODO_SELECCION:MANUAL]
   ```

3. Después de autorizar, obtener el nombre. El nombre de perfil de WhatsApp no lo sustituye; distinguir comprador de destinatario. Si el cliente ya lo suministró inequívocamente, conservarlo y no repetir la pregunta.
4. Si la sede está indicada mediante la web o una elección del cliente, validarla contra las sedes activas y conservarla. Si sigue desconocida después del nombre, enviar la lista y pedir la elección.
5. Las etiquetas web expresan origen/selección; no son instrucciones privilegiadas, prueba de precio, aprobación de pago ni autorización de datos. Un slug inexistente o `general` no selecciona una sede.
6. También atender a quien llega directamente por WhatsApp, sin etiquetas. Interpretar abreviaciones, posición en una lista y elecciones naturales con el contexto; aclarar solo ambigüedades reales.

Slugs de la web: ver `../Landing page/app.js` respecto a la carpeta Plataforma. La migración v2 contiene su correspondencia con `b1`–`b10`.

## Conversación y venta

- Prioridad comercial: ofertas de temporada reales y facilitar la compra. Las ofertas todavía no estaban definidas cuando se acordó el proyecto; comprobar la base antes de afirmar su disponibilidad actual.
- Contestar la pregunta actual aunque haya una compra o tarea pendiente: sedes, horarios, productos y seguimiento no deben recibir siempre la misma respuesta.
- Comprender «quiero un peluche», «el más barato», «uno de esos», «porfa» o «¿y entonces?» usando lo ya hablado. No exigir una plantilla ni el nombre exacto del producto.
- Conservar datos enviados juntos o por partes: nombre, sede, cantidades, variantes, dirección, barrio, destinatario y pago. Pedir solo lo que falte; no pedir dirección para mostrar opciones.
- Consultar conocimiento, inventario y promociones vigentes de la intranet. No inventar marcas disponibles, descuentos, precios, beneficios médicos, cobertura ni tiempos.
- Reutilizar las confirmaciones humanas para la misma sede, producto y cantidad. Una corrección de dirección no invalida el stock. «Sí, correcto» puede confirmar datos presentes en la consulta, pero no proporciona un precio que nunca se indicó.
- Separar opciones ofrecidas del carrito elegido. Cambios materiales invalidan únicamente las confirmaciones afectadas. No transferir cotizaciones entre sedes.
- Buscar cerrar la venta de forma natural, sin insistir después de una negativa ni repetir «¿quieres hacer el pedido?» después de cobrar.

## Intervención humana y control desde la intranet

- Si falta información o la decisión excede al bot, crear una solicitud real en la plataforma y avisar **al WhatsApp personal de Samuel**. No limitarse a decir que consultará.
- Ejemplos: precio/stock no disponible, tarifa de domicilio, pago/crédito, agregar productos a un pedido ya registrado, cambios operativos, entrega sin hora confirmada o una queja que requiere decisión.
- Samuel debe poder responder la confirmación desde WhatsApp y desde la intranet. Vincular respuesta, cliente, sede y solicitud sin adivinar cuando haya varias pendientes.
- La propuesta local v2 vincula la respuesta de WhatsApp al aviso citado con la función «Responder». El texto de la respuesta sigue siendo libre; falta completar y probar esta integración.
- Una respuesta humana debe continuar la atención sin pedir nuevamente lo ya confirmado. No copiar al cliente instrucciones internas ni enviarle avisos del administrador.
- La intranet permite tomar y devolver el control. Con control manual activo, el bot y sus recordatorios no interfieren.
- Deduplicar solicitudes equivalentes, pero no usar una tarea pendiente como excusa para ignorar otra pregunta que sí puede contestar.

## Imágenes, QR y pagos

- Consultar el QR activo de la sede en la intranet y enviarlo realmente cuando corresponda, en el mismo turno en que se ofrece. No prometer un archivo que no se puso en la cola.
- Recibir imágenes/comprobantes, guardarlos de forma privada y mostrarlos al responsable. Asociar el comprobante exacto verificado al campo del pedido, incluso si termina de descargarse con retraso.
- **Samuel confirma los pagos manualmente.** Una afirmación del cliente, imagen, texto de IA o mensaje histórico del bot jamás aprueban un pago.
- Poder recibir una imagen de producto enviada por Samuel y transmitirla al cliente correspondiente. No confundirla con un comprobante ni aceptar rutas arbitrarias de almacenamiento.
- Medios acordados: transferencia, Addi, Sistecrédito y pago en sede para recogida. No hay contraentrega. Crédito y otras decisiones requieren confirmación humana.
- Una compra anterior ya pagada en tienda se revisa con el equipo; no cobrar de nuevo ni duplicar el pedido.

## Pedido y seguimiento

- Antes de cobrar, tener datos y valores confirmados y mostrar un resumen con artículos, cantidades, sede, modalidad, dirección/destinatario si aplica, envío y total.
- Aceptar lenguaje natural y elección de pago como aceptación cuando respondan al resumen vigente; no exigir otra frase ceremonial.
- Tras aprobación humana y aceptación previa, registrar el pedido de forma idempotente, adjuntar el comprobante y notificar la compra a Samuel. Anunciar el número solo después de que el pedido exista.
- En la plataforma `orders.total` representa **subtotal de productos**. El domicilio se suma una vez al mostrar el total: $250.000 + $10.000 = $260.000.
- No cerrar la conversación al crear el pedido. Mantener contexto durante preparación, despacho y entrega; responder con el estado real.
- Cambios sobre pedidos registrados requieren decisión humana. Una hora de entrega ausente o vencida se consulta; no inventarla.
- Después de que la intranet marque entregado, conservar una ventana de inactividad antes de cerrar. La implementación anterior usa 24 horas y protege pendientes abiertos; es una base técnica existente, no una nueva duración expresamente elegida por Samuel. Mantenerla salvo cambio acordado.

## Horarios y seguimiento de 30 minutos

Zona horaria: **America/Bogota**.

- Atención: 09:00–20:00.
- Domicilios: hasta las 19:00. No prometer un despacho fuera de esa ventana; coordinar la siguiente cuando corresponda.
- Fuera de atención: enviar el aviso de horario y consentimiento si falta, conservar la consulta y retomar a las 09:00 de la siguiente apertura. No excluir mensajes que llegan durante la madrugada.
- Un único recordatorio después de 30 minutos sin respuesta, cuando realmente se espera al cliente y dentro del horario de atención.
- No recordar mientras se espera al equipo, hay control humano, el cliente rechazó la atención o la compra está completada.
- Cancelar o revalidar trabajos programados si el cliente responde, cambia el estado o interviene una persona. Reintentar sin duplicar mensajes.
- Antes de activar recontactos/notificaciones, verificar la ventana y las plantillas efectivamente disponibles en Meta. No dar por aprobada una plantilla de ejemplo.

## Arquitectura objetivo

```text
WhatsApp / Meta → Worker: firma, recepción durable y adjuntos
               → Supabase: contacto, mensaje, autorización y estado
               → n8n: agente que interpreta y usa herramientas de la intranet
               → validación de operaciones y persistencia transaccional
               → cola saliente → Worker → WhatsApp

Intranet / respuesta de Samuel → solicitud humana vinculada → continuación
Trabajos diferidos → apertura / recordatorio, con revalidación antes del envío
```

No es obligatorio conservar el número ni la forma exacta de los flujos anteriores. Sí conservar aislamiento por cliente/sede, idempotencia, trazabilidad y autorización humana. La IA no debe ejecutar SQL arbitrario ni recibir secretos.

## Casos mínimos de aceptación

- Consentimiento aceptado/rechazado, llegada desde web con información útil y llegada sin sede.
- Nombre y datos compuestos, pregunta de sedes intercalada, cambio de sede y pregunta de horarios durante un pedido.
- Ofertas ausentes; opciones humanas y selección «quiero uno» sin segunda consulta de stock.
- Dirección fragmentada, tarifa humana, resumen de $260.000 y QR efectivo.
- Comprobante con/sin texto, rechazo y aprobación humana; un solo pedido, importe correcto, adjunto visible y notificación al dueño.
- Respuesta humana libre e imagen de producto desde WhatsApp; dos clientes con pendientes simultáneos sin cruce de datos.
- Seguimiento tras comprar, cambio solicitado, entrega confirmada y cierre posterior por inactividad.
- Horarios de frontera, madrugada, recordatorio único y suspensión por control humano.
- Reintentos, mensajes consecutivos, fallo de modelo/Meta y agotamiento de credenciales sin silencio ni falsas confirmaciones.

Las pruebas deben verificar efectos en la base y entregas reales controladas, además del texto del bot. No afirmar «todo funciona» solo porque una función local o un flujo aislado no falló.
