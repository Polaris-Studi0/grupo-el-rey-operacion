# Reconstrucción de WhatsApp — estado al 26/09/2026

La conexión nueva está comprobada. El asistente comercial y sus herramientas todavía no están implementados en esta cuenta.

## Diagnóstico publicado

[EL REY · Diagnóstico de conexión](https://intranetelrey.app.n8n.cloud/workflow/9rR5rLK8oW5FLnF0) recibe una petición autenticada, conserva únicamente el identificador de prueba, consulta la intranet con la credencial de gateway y devuelve el resultado. El Worker verifica que el identificador coincida. Aceptar el webhook sin devolver esa evidencia no se considera una prueba aprobada.

- Workflow: `9rR5rLK8oW5FLnF0`; versión publicada `04d9bd27-8bcc-4a28-8c06-a7e402c9c54c`.
- Worker: `0b81162c-9f63-47fe-8e3c-58c3d0f17945`.
- Entrada fija: `POST https://intranetelrey.app.n8n.cloud/webhook/el-rey-rebuild-connection-v1`.
- API del Worker: `GET /api/bot/connection?challenge=<UUIDv4>` y `POST /api/bot/connection/probe`, ambas protegidas por `N8N_REBUILD_GATEWAY_SECRET`.
- El sondeo usa `N8N_REBUILD_WEBHOOK_SECRET` hacia un destino fijo. No permite URLs arbitrarias ni sigue redirecciones.
- Sin consultas a Supabase, envíos a Meta, creación de pedidos o activación de atención comercial.
- n8n no guarda datos de ejecuciones exitosas, fallidas ni manuales, ni progreso. La entrada incluye una cabecera privada. No activar ese guardado para depurar este flujo.

La exportación JSON conserva esos ajustes y se guarda con `active: false` para importar de forma controlada. El archivo TypeScript describe el grafo validado por el SDK; si se recrea desde ese código, aplicar los ajustes de la exportación JSON **antes de ejecutarlo**. Reutilizar el ID existente por MCP en lugar de importar duplicados.

## Comprobaciones reproducibles

```bash
npm run test:bot-connection
npm run check:bot-connection
```

La primera ejecuta 11 pruebas locales de autorización, errores, aislamiento de credenciales, redirecciones y efectos permitidos. La segunda consume una ejecución del diagnóstico publicado; obtiene la clave del archivo privado `~/.config/grupo-el-rey/n8n-rebuild-secrets.json`, o de la ruta indicada por `ELREY_REBUILD_SECRETS_FILE`. No imprime secretos, cabeceras ni respuestas externas completas.

[connection-evidence-20260926.json](connection-evidence-20260926.json) registra 6 comprobaciones reales aprobadas a las 10:12 de Colombia: rechazo sin clave y con clave incorrecta en ambos sentidos, acceso autorizado al gateway y recorrido completo Cloudflare → n8n → intranet. También se comprobó el recorrido con datos sintéticos en workerd/Miniflare.

Estas pruebas solo cubren la conexión. `acceptance-cases.json` conserva 37 escenarios comerciales sin ejecutar y `system-prompt.md` sigue siendo un borrador. No se ha seleccionado ni probado un modelo.

Comprobaciones adicionales del cambio: `npm run check`, `npm run build`, `git diff --check` y `npm run test:whatsapp` aprobados. El último ejecuta regresiones y escenarios de PostgreSQL aislado, sin aplicar migraciones remotas ni probar el agente nuevo. Vite mantiene un aviso por un bundle de más de 500 kB; la compilación terminó correctamente y sus assets locales no se publicaron en esta intervención.

## Siguiente etapa

Verificar esquema y permisos remotos de Supabase; completar el canal durable, historial paginado por conversación, respuesta manual y toma/devolución de control. Después implementar contexto y herramientas limitadas antes de crear el agente comercial. Mantener las URLs comerciales actuales hasta el piloto autorizado y comprobado. Arquitectura vigente: [ARQUITECTURA_BOT_NUEVO.md](../../docs/ARQUITECTURA_BOT_NUEVO.md).

Título sugerido de commit: **Conectar nueva cuenta n8n con diagnóstico autenticado y pruebas reproducibles**. Commit y push pendientes de Samuel en GitHub Desktop.
