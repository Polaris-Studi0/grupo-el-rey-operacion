# Agente comercial con herramientas

Revisión del 18 de septiembre de 2026. Candidato en evaluación; no confundir el borrador con la versión publicada.

La IA interpreta el mensaje actual y el historial. Puede consultar sedes, información, productos confirmados, compra, pedido y asistencia mediante `consultar_plataforma`. `preparar_gestion` valida propuestas sin ejecutarlas. La salida final pasa nuevamente por las validaciones de la plataforma y la persistencia existente ejecuta los efectos una sola vez.

No se conceden consultas SQL arbitrarias ni acceso a otras conversaciones. Precios, existencias, pago, consentimiento y duplicación de pedidos mantienen sus controles. Una declaración del cliente no verifica un pago. Los cambios sobre pedidos registrados requieren revisión humana.

## Archivos

- `commercial/agent-prompt.txt`: comportamiento conversacional y uso de herramientas.
- `commercial/platform-tools.js`: consultas limitadas al contexto autorizado y preparación de acciones.
- `commercial/normalize.js`: validación final; `agentMode` elimina avances obligatorios del proceso anterior.
- `scripts/prepare-n8n-agent.mjs`: genera un candidato desde un export reciente, conservando credenciales.
- `scripts/prepare-n8n-agent-evaluation.mjs`: genera 11 casos sintéticos con el modelo real, sin nodos que envíen mensajes o persistan pedidos.

## Verificación actual

146 pruebas locales, escenarios de PostgreSQL aislado y ESLint aprobados el 18 de septiembre. Evaluación real iniciada por MCP: flujo `oMu3IeXg4MHwx8bC`, ejecución `1434`. Su resultado debe revisarse antes de publicar el flujo comercial `xP8kOe3z2GSnRqkJ`.

La evaluación cubre sedes, selección natural, producto más barato, domicilio, total de $260.000, aceptación y QR, pago humano verificado, intento de aprobación por el cliente y asistencia tras registrar un pedido. Los casos se procesan individualmente para evitar mezclar contextos en subnodos de IA.

Las herramientas Code de n8n reciben metadatos adicionales: sus esquemas aceptan esas propiedades, pero las funciones solo leen los campos declarados y toman el contexto desde el nodo autorizado. La validación de acciones se repite al finalizar.

El MCP nativo de n8n funciona. El flujo aislado quedó disponible en MCP y permanece sin publicar. No se ha borrado historial ni creado un pedido durante esta revisión.
