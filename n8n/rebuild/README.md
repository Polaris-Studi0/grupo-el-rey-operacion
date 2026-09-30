# Piloto de WhatsApp — 29/09/2026

Estado vigente y límites: [HANDOFF_N8N_WHATSAPP.md](../../HANDOFF_N8N_WHATSAPP.md).

[Motor de atención](https://intranetelrey.app.n8n.cloud/workflow/pGxqUgjYE6NCyiwZ) publicado en `c0d66b23-aaa8-465a-8693-cdee2d054f05`; Worker `238cf6fc-3a52-48de-a1eb-e20333987f14`. Solo el teléfono piloto autorizado; no activar al público automáticamente.

## Contrato y responsabilidades

Meta → Worker (firma, inbox durable y adjuntos) → contexto verificado de Supabase → n8n → propuesta validada → transacción comercial → cola → Meta.

n8n usa gpt-5-mini y seis herramientas acotadas. Entrada privada `el-rey.bot.turn.v1`: modos test/synthetic, preview/intranet o pilot/intranet. Contexto real exige huella, versiones, consentimiento, sede y control automático. Salida `el-rey.bot.decision.v1`, siempre `send_allowed=false`, sin mutaciones; propone información, productos, cotización, QR, pendiente humano o parche checkout/aceptación/cancelación.

El Worker y Supabase validan las acciones: carrito, stock confirmado hasta el cierre del día, tarifa humana, resumen entregado/aceptado, reserva, QR exacto, comprobante y aprobación humana explícita. El bot nunca aprueba pagos. Un pedido solo se anuncia después de insertarlo de forma idempotente. Las aclaraciones humanas se incorporan naturalmente, sin atribuciones internas.

`attention-core.workflow.json` es la exportación vigente con `active:false` para evitar activación al importar. Actualizar el ID existente por MCP. **No guardar ejecuciones**: las cabeceras y el contexto incluyen información privada.

## Corrección de sedes y envíos

«muéstrame todas las sedes» y «qué sedes son» usan el directorio activo directamente desde el Worker, sin IA ni tareas humanas. Nombres y numeración normal; sin b1/b10. Cambiar sede actualiza la conversación real y respeta compras activas.

Se reprodujo `missing_tool_evidence` en la IA y se corrigió la obligación de consultar información. Se redujeron las consultas por turno mediante `bot_context_snapshot`; respuesta al cliente primero y aviso privado después. Prueba integrada de derivación: 33 consultas, debajo del presupuesto de 50 usado por la regresión. La misma prueba con el Worker anterior supera ese presupuesto. Recuperación cron de un trabajo por ejecución.

**Entrega real confirmada el 29/09 a las 20:29 Colombia**: lista recibida por Samuel, estado Meta read, un intento, evento completo en 4,3 segundos. El ciclo humano anterior también tiene evidencia real (09:03). No confundirlo con aceptación comercial completa.

## Pruebas

```bash
npm run test:bot-commerce
node --test tests/whatsapp-ingress.test.mjs
npm run check
npm run build
npm run check:bot-commerce
```

El último comando consume modelo/n8n con datos sintéticos y no envía mensajes a clientes. Claves leídas fuera del repositorio, sin imprimir valores. 42 pruebas Node comerciales y 10 grupos PostgreSQL aislados aprobados; cinco propuestas comerciales HTTP con modelo real aprobadas. Las pruebas del webhook simulan Meta/base, mientras que la confirmación real de sedes está documentada por separado.

Otros casos/evidencia: `acceptance-cases.json` (no todos ejecutados), `attention-fixtures.mjs`, `pilot-evidence-20260929.json`, `clarification-evidence-20260929.json`, `commerce-evidence-20260929.json`, `sedes-evidence-20260929.json`. Los archivos anteriores conservan la versión/hora a la que corresponden.

## Pendientes

Samuel no quiere cargar promociones todavía; las subirá a la intranet cuando existan. No crear catálogo ficticio. Faltan compra real completa y QR por sede, horarios/recordatorios, lectura de medios, respuesta humana por WhatsApp citado y plantillas fuera de ventana. La ruta de otros números sigue heredada y presenta 404; resolverla antes de público, sin restaurar el bot antiguo.

Migraciones 202609290001 a 202609290004 aplicadas; v2 del 20/09 no aplicada. Limpieza manual de Samuel terminada: no repetirla. No commit/push automático. Información detallada, accesos y versiones en el traspaso principal.
