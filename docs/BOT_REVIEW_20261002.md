# Revisión de conversaciones y domicilios — 02/10/2026

Se leyeron las siete conversaciones y sus 155 mensajes guardados al iniciar la revisión. Se excluyeron avisos internos del contexto de cliente. Los textos originales permanecen en respaldo privado, fuera del repositorio; este documento no reproduce datos de clientes.

## Hallazgos y cambios

| Comportamiento observado | Cambio |
| --- | --- |
| Un artículo confirmado desde Operación pedía nombre, dirección, barrio, destinatario y teléfono en turnos separados. | Comparte el formulario de campos faltantes con el carrito de catálogo. La solicitud de domicilio muestra una lista en un solo mensaje. |
| Un nombre repetido o un mensaje con varios datos provocaba otra pregunta o derivación. | Captura directa de listas inequívocas y extracción por IA de frases/listas sin etiquetas. Conserva apartamento e indicaciones, admite respuestas parciales y recuerda solo campos vacíos. |
| Comprador y destinatario eran tratados como si siempre fueran distintos. | La lista permite un nombre cuando es la misma persona; nombres separados siguen siendo independientes. «Lo recibo yo» usa únicamente el nombre confirmado de la compra actual. |
| Al aportar datos, el modelo podía reconstruir la selección ya guardada y fallar su validación. | Conserva pending_selection; descarta propuestas redundantes que coinciden con esa selección antes de validar un nuevo extracto generado. Una selección distinta sigue exigiendo fuente y precio verificables. |
| La consulta de medias pedía numerosas características sin confirmar las opciones reales. | Instrucciones para revisar catálogo/conocimiento antes de pedir variantes. Si no hay datos verificables, consulta al operador una vez; no simula un catálogo. |
| «Me gusta» iniciaba la compra sin una elección explícita. | Separa interés de intención de compra. Pide confirmación; no crea carrito, reserva ni pedido solo por ese comentario. |
| Ante un audio ofrecía transcribirlo sin contar con esa capacidad. | Solicita que lo escriban, sin avanzar la compra ni inventar datos del audio. |

## Experiencia de domicilio

Después de elegir domicilio, solicita solo los campos que aún falten:

- Nombre para la compra y de quien recibe, con la aclaración de que basta un nombre si es la misma persona.
- Número de contacto.
- Dirección completa, apartamento o indicaciones si aplica.
- Barrio o sector.

Se puede contestar con etiquetas, líneas sin etiquetas o una frase. Si ya están nombre, teléfono y dirección, por ejemplo: «Solo me falta: • Barrio o sector». No importa el nombre del perfil ni reutiliza datos de una compra anterior.

El pedido sigue necesitando producto confirmado, conteo vigente, tarifa de domicilio verificada, resumen entregado y aceptado y, cuando corresponde, pago expresamente aprobado por Operación. Capturar todos los datos no confirma un despacho ni aprueba un pago.

## Verificación

- 87 pruebas Node y 20 grupos de PostgreSQL aislado aprobados. Incluyen captura completa/parcial, datos contradictorios, una sola tarea de stock/tarifa, reintentos sin duplicados, consentimiento/control, pagos, QR, reservas y pedidos.
- Ocho decisiones del modelo publicado con datos sintéticos verificadas: lista sin etiquetas, frase con comprador/destinatario distintos, recibo yo con dirección, dato parcial, corrección de dirección, catálogo inexistente, interés sin compra y audio sin transcripción. En los dos casos de parche parcial/corrección se aceptan también valores que repiten exactamente el estado confirmado; no representan una modificación ni justifican volver a pedirlos. Evidencia conserva la fecha original de generación y la fecha de revisión de esas aserciones.
- Lint y build aprobados. Bundle de intranet conservado: no cambios de login, estilos, permisos, chat interno ni manual de marca.
- Migración específica 202610020001 aplicada con comparación de la definición comercial leída previamente; no se aplicó toda la carpeta de migraciones. Helper remoto verificado con valores sintéticos: lista completa, recordatorio solo de barrio, null al completar y sin ejecución para authenticated.
- Estado remoto/publicación y versiones en HANDOFF_N8N_WHATSAPP.md. Se conservaron bindings, runtime y conexiones/credenciales de n8n. El diagnóstico de producción confirma Meta y esquema conectados y bot público habilitado.
- No se enviaron mensajes de prueba a clientes ni se reprodujeron eventos históricos. Falta una nueva compra de prueba por WhatsApp para confirmar la experiencia en el canal real; las ocho pruebas del modelo solo generan decisiones.

## Otros hallazgos pendientes

- Una consulta de horario acabó en derivación aunque existen horarios; no hay datos suficientes de ejecución para afirmar la causa exacta.
- Un saludo procedente de la web mencionó otra sede mientras la conversación todavía conservaba la sede anterior. Revisar el cambio explícito de sede desde enlaces web dentro de una sesión activa; no reducir arbitrariamente el reinicio elegido de 24 horas sin escribir.
- Una aclaración de imagen quedó con una frase incompleta. Se reforzó la instrucción de frases completas, pero falta reproducir el origen exacto.
- Durante una compra el comprobante/QR se pidió de nuevo después de una aclaración humana genérica. Una respuesta de texto como «confirmado» no equivale a aprobar un pago: revisar la experiencia de revisión conservando la aprobación explícita y el comprobante.
- El modelo sigue teniendo fallos intermitentes de generación en pruebas de versiones previas. La captura de listas explícitas funciona directamente y evita esa dependencia; mensajes ambiguos conservan la ruta del modelo y sus controles. No afirmar que todas las interacciones quedaron perfectas.

Sin limpieza de datos, productos ficticios ni commit/push de Codex. Título sugerido para el commit manual: «Mejora captura de domicilios y continuidad del bot».
