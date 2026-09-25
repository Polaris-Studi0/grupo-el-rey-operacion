# Despliegue de la plataforma existente

Actualizado: 25/09/2026. Esta guía se basa en la configuración del repositorio; no certifica un nuevo despliegue ni permisos remotos. Estado del bot: [HANDOFF_N8N_WHATSAPP.md](../HANDOFF_N8N_WHATSAPP.md). Accesos: [ACCESOS.md](ACCESOS.md).

## Configuración existente

- Plataforma local: `/Users/samuel/Desktop/Cowork for Grupo El Rey/Plataforma`.
- Frontend React/Vite y API en `src/worker.js`, alojados mediante el Worker Cloudflare `grupo-el-rey-operacion`.
- `wrangler.jsonc` define assets `dist`, rutas API con Worker primero, conservación de variables y recuperación programada del inbox cada minuto.
- Supabase existente: `xmfltwhgvoaleejatxtg`, con PostgreSQL, Auth, Storage y Realtime.
- Intranet: `https://intranet.almaceneselrey.co`. GoDaddy es registrador; no crear una segunda instalación en Pages/cPanel siguiendo la guía inicial archivada.
- PQRS ya forma parte del código actual; preservar sus rutas, variables y migración al actualizar WhatsApp.

## Preparar cambios

1. Revisar rama, `git status` y cambios existentes. Samuel suele hacer commit y push desde GitHub Desktop; dejarle un título claro.
2. Verificar las variables públicas según `.env.example`. Solo `VITE_SUPABASE_URL` y la clave pública de Supabase se incorporan al frontend. Secretos de backend se administran en Cloudflare/n8n.
3. Ejecutar las comprobaciones adecuadas:

   ```bash
   npm run check
   npm run build
   npm run test:whatsapp
   ```

4. Revisar las migraciones pendientes contra el historial real de Supabase. **No ejecutar todas las migraciones sobre una base existente ni asumir que estar en Git equivale a estar aplicada.** No ejecutar seeds ni limpiezas históricas en producción.
5. Revisar compatibilidad entre SQL, Worker y n8n antes de activar una funcionalidad. Las migraciones v2 deben seguir desactivadas hasta completar la integración y sus pruebas.

## Publicar cuando el cambio esté listo

Con la sesión de Cloudflare correspondiente y artefactos revisados, el comando documentado del proyecto es:

```bash
npx wrangler deploy
```

No se ejecuta como parte de leer este documento. Mantener secretos y variables existentes; comprobar las rutas y el servicio desplegado. El repositorio no contiene `.github/workflows` al 25/09; no dar por configurado un despliegue automático desde GitHub sin revisar Cloudflare.

Los workflows de n8n tienen borrador y versión publicada independientes del código Git. Guardar/exportar no publica. La reconstrucción del bot requiere probar la versión nueva antes de conectar 01 y retirar mantenimiento; restaurar únicamente el filtro viejo de 03 no es una solución.

## Verificar después de publicar

- Intranet y permisos por sede; pedidos, importes, adjuntos y control humano.
- Recepción durable de WhatsApp, estados de Meta, cola de envío e idempotencia.
- Consentimiento, horario y ausencia de envíos inesperados desde flujos secundarios.
- PQRS, correo y demás funciones existentes cuando se haya modificado el Worker compartido.
- Versión publicada de n8n y de Worker, migraciones realmente aplicadas y resultado de la prueba controlada. Registrar esas evidencias en el traspaso.

Mantener una versión anterior identificada para rollback. No borrar datos para conseguir que una prueba pase.

## Referencia histórica

La propuesta inicial de Pages, precios de planes, creación desde cero y cPanel se conserva en [archivo/DESPLIEGUE_DISENO_INICIAL.md](archivo/DESPLIEGUE_DISENO_INICIAL.md). No describe el alojamiento actual y sus precios no se han revalidado.
