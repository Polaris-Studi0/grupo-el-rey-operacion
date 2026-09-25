# Traspaso vigente — Grupo Almacenes El Rey

Actualizado el **25 de septiembre de 2026**, hora de Colombia. Este es el punto de entrada para un chat nuevo; reemplaza los estados contradictorios del traspaso anterior, conservado en [el archivo histórico](docs/archivo/HANDOFF_HISTORICO_HASTA_20260920.md).

## Situación al cambiar de chat

### Cambio de cuenta y dirección vigente — 25/09/2026

Samuel decidió **empezar de cero en una nueva cuenta de n8n**, conservando los requisitos y las conexiones con la intranet. La continuación de los flujos anteriores ya no es el plan vigente.

- Nueva cuenta: `https://intranetelrey.app.n8n.cloud`; MCP: `https://intranetelrey.app.n8n.cloud/mcp-server/http`.
- Autenticación completada. MCP nativo `mcp__n8n__*` comprobado: 0 workflows y 0 credenciales listadas. Hay cobertura de Gateway informada por el MCP, sin comprobar saldo/modelo.
- Arquitectura nueva: [ARQUITECTURA_BOT_NUEVO.md](docs/ARQUITECTURA_BOT_NUEVO.md). Incluye responsabilidades, integración, herramientas, control humano, promociones y secuencia de pruebas.
- Samuel confirmó que el stock de promociones se actualizará manualmente en la intranet por sede. Diseñar confirmación de existencias, protección de reservas y descuento de compras del bot sin asumir sincronización con cajas.
- Borrador de instrucciones y casos de aceptación: `n8n/rebuild/`. **Son diseño y especificaciones, no un agente instalado ni pruebas aprobadas.**
- El endpoint de salud público del Worker respondió con configuración presente; no prueba entrega ni que sus rutas apunten a la cuenta nueva. En el archivo local `wrangler.jsonc` la automatización todavía apunta a la cuenta antigua.
- No se han creado/publicado workflows, desplegado código, aplicado migraciones ni cambiado rutas de producción durante este diseño. Mantener el criterio de piloto y mantenimiento antes de activar la atención nueva.
- Al empezar el diseño, HEAD local era `26ad42b` y el árbol estaba limpio. Los nuevos documentos quedan pendientes del commit manual de Samuel.

El resto de este documento conserva el estado de la infraestructura anterior como referencia. Sus IDs **no pertenecen a la cuenta nueva**.

Samuel solicitó actualizar documentación y accesos para continuar en otro chat. Esta actualización es documental: no activa flujos, no despliega código y no borra información.

**Último estado remoto verificado: bot comercial en mantenimiento.** El flujo 01 registra los mensajes y envía el aviso temporal; 03 está bloqueado y 05 despublicado. La reconstrucción está autorizada, pero **no está terminada ni validada de extremo a extremo**. No confundir código guardado, commit, migración aplicada y versión publicada.

El 25/09 se intentó consultar 01 mediante `mcp__codex_apps__n8n_get_workflow_details`; respondió `Mcp error: -32603: Internal error`. No se volvió a verificar producción ese día. Las versiones de mantenimiento documentadas abajo son las últimas comprobadas en este trabajo, no una lectura en vivo del 25/09.

## Leer en este orden

1. [Accesos e identificadores, sin secretos](docs/ACCESOS.md).
2. [Requisitos acordados y arquitectura objetivo](docs/CHATBOT_N8N.md).
3. [Arquitectura de la cuenta nueva](docs/ARQUITECTURA_BOT_NUEVO.md); luego [inventario de trabajo anterior](docs/RECONSTRUCCION_BOT.md) solo para evaluar componentes reutilizables.
4. [Mantenimiento publicado](n8n/MANTENIMIENTO_20260919.md).
5. [Despliegue de la plataforma existente](docs/DESPLIEGUE.md), solo cuando corresponda publicar.

## Carpetas y repositorios

- **Aplicación real:** `/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma`.
- **Landing:** `/Users/samuel/Desktop/Cowork for Grupo El Rey/Landing page`.
- **Carpeta del chat:** `/Users/samuel/Documents/ChatGPT/Grupo El Rey`. Tiene un repositorio separado y respaldos antiguos de n8n; no es el código de la intranet.
- Repositorio de la plataforma: `https://github.com/Polaris-Studi0/grupo-el-rey-operacion.git`.
- Al iniciar esta actualización, la plataforma tenía el árbol limpio y HEAD `edd3788` — `pqrs`. Antes: `4389834` — `new`, con los fundamentos v2, y `19c7720` — `Pausa`.
- No revertir ni sobrescribir el módulo PQRS añadido después del trabajo del bot.

## Estado de n8n conocido

| Flujo | ID | Último estado comprobado |
|---|---|---|
| 01 Entrada y trazabilidad | `dgAsTSuWoX6mfYOn` | Mantenimiento publicado: `63dcfc1c-c6a6-474d-8b39-5fe296d0f47f` |
| 02 Consentimiento | `SmmZnTB6tvSmtntt` | Camino anterior, desconectado de la entrada de mantenimiento |
| 03 Asistente comercial | `xP8kOe3z2GSnRqkJ` | Publicado pero bloqueado: `64a36633-3b25-4223-8f12-4a3ed64c1884`; `Filtrar autorizados` devuelve `null` |
| 04 Pendientes humanos | `gi0Vdd1W3weL6i4W` | Última versión publicada conocida: `5d624e2d-aecc-4aeb-a831-210fc2818091` |
| 05 Reapertura 9 AM | `dUaIlsHiPpEooFs7` | Despublicado durante mantenimiento |
| Pruebas aisladas | `oMu3IeXg4MHwx8bC` | Sin publicar; último recorrido manual era una validación SQL del aviso, no una prueba completa de v2 |

Un workflow marcado `active=true` no demuestra que la IA atienda: 03 está publicado precisamente con un filtro que impide ejecutarla. Inspeccionar el grafo publicado y diferenciarlo del borrador.

## Cómo retomar sin repetir los errores

- Reconstruir una IA conversacional con herramientas limitadas de la intranet. No añadir otra cadena de palabras clave que sustituya lo que pregunta el cliente.
- Mantener el aviso de mantenimiento hasta tener una versión nueva probada. La autorización para reconstruir ya existe; no solicitarla de nuevo para tareas ordinarias.
- Usar MCP de n8n preferentemente. Si falla, registrar el error; no concluir que las credenciales están agotadas ni inventar acceso. Samuel también autorizó usar la interfaz de su PC cuando sea necesario.
- Conservar transacciones, idempotencia, comprobantes, permisos y continuidad del pedido que sí sirven. Se permite sustituir la arquitectura que no funcione.
- No borrar conversaciones ni pedidos para iniciar otro chat. Las limpiezas anteriores eran puntuales y no se repiten automáticamente.
- Samuel prefiere hacer commit y push desde GitHub Desktop. Preparar un título descriptivo, pero no afirmar que se creó un commit si no se hizo. El botón de commit puede usar ese título.
- Dar avances breves en español, cuidar créditos y ejecuciones, sin sacrificar el funcionamiento. El límite inicial de dos ejecuciones por mensaje dejó de ser una restricción estricta.

## Mensaje para pegar en un chat nuevo

```text
Vamos a construir desde cero el bot de WhatsApp de Grupo Almacenes El Rey en la cuenta nueva de n8n.
Lee primero /Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma/HANDOFF_N8N_WHATSAPP.md y los documentos vigentes que enlaza.
La carpeta /Users/samuel/Documents/ChatGPT/Grupo El Rey es la carpeta del chat, no la aplicación real.
Lee docs/ARQUITECTURA_BOT_NUEVO.md. La cuenta nueva es intranetelrey.app.n8n.cloud; MCP nativo verificado con 0 workflows y 0 credenciales al diseñar la arquitectura. Los IDs antiguos pertenecen a otra cuenta. Revisa el estado actual; usa MCP preferentemente. No reactives el bot anterior, no borres datos ni reviertas PQRS.
Implementa y prueba una IA con herramientas conectadas a la intranet que cumpla los requisitos documentados: autorización, nombre y sede; lenguaje natural; información real; asistencia y aprobación manual por WhatsApp; imágenes, QR y comprobantes; pedidos, seguimiento, horarios y recordatorio único de 30 minutos.
Sigue las etapas de la arquitectura nueva, empezando por canal y control manual. n8n/rebuild contiene un borrador de instrucciones y escenarios todavía no ejecutados. Los componentes anteriores se pueden reutilizar solo tras revisarlos y probarlos. Distingue lo probado localmente de lo realmente desplegado y no declares terminado el bot hasta verificar el recorrido completo. Deja un título descriptivo de commit para usar en GitHub Desktop.
```
