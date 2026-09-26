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

**Verificación posterior del 25/09:** el panel de Cloudflare sí tiene Builds conectado al repositorio, con rama de producción `main`, build `npm run build` y deploy `npx wrangler deploy`. Un push a la rama configurada puede desplegar aunque no haya GitHub Actions. Conservar el commit/push manual de Samuel y revisar también esta vía de publicación.

Los workflows de n8n tienen borrador y versión publicada independientes del código Git. Guardar/exportar no publica. La reconstrucción del bot requiere probar la versión nueva antes de conectar su entrada y retirar mantenimiento; restaurar únicamente el filtro viejo de 03 no es una solución.

## Verificar después de publicar

- Intranet y permisos por sede; pedidos, importes, adjuntos y control humano.
- Recepción durable de WhatsApp, estados de Meta, cola de envío e idempotencia.
- Consentimiento, horario y ausencia de envíos inesperados desde flujos secundarios.
- PQRS, correo y demás funciones existentes cuando se haya modificado el Worker compartido.
- Versión publicada de n8n y de Worker, migraciones realmente aplicadas y resultado de la prueba controlada. Registrar esas evidencias en el traspaso.

Mantener una versión anterior identificada para rollback. No borrar datos para conseguir que una prueba pase.

## Referencia histórica

### Publicación de diagnóstico — 26/09/2026

Se publicó solo el código de conexión, conservando los assets remotos mediante `keep_assets` y todos los bindings/secretos existentes. Se usó la API de versiones y después `wrangler versions deploy`, sin sincronizar configuraciones no versionadas ni hacer commit/push. La base local del Worker se compiló y resultó idéntica al script remoto (salvo la referencia al source map); no se publicaron cambios de negocio anteriores sin verificar.

- Versión anterior al avance: `39e09f96-0820-470b-8e57-059d5b6a49fb`.
- Versión final: `0b81162c-9f63-47fe-8e3c-58c3d0f17945`, 100% de tráfico.
- La revisión intermedia `f04c4400-0f0e-42d4-b05e-66154c6995ec` fallaba en la prueba saliente por `redirect: error`, incompatible con workerd. La versión final usa `manual` y rechaza respuestas 3xx; pasó integración local en workerd y prueba real.
- Se compararon todos los bindings y la configuración de runtime antes de promover: idénticos. Se compararon las respuestas de `/`, `/favicon.png`, salud y páginas legales antes/después: idénticas. Esto no sustituye una prueba completa del bot ni del formulario PQRS.
- Respaldos de revisión fuera de Git: `/Users/samuel/.config/grupo-el-rey/rebuild-deploy-20260926/`.
- Método de conservación de assets: [Cloudflare Direct Uploads](https://developers.cloudflare.com/workers/static-assets/direct-upload/).

La propuesta inicial de Pages, precios de planes, creación desde cero y cPanel se conserva en [archivo/DESPLIEGUE_DISENO_INICIAL.md](archivo/DESPLIEGUE_DISENO_INICIAL.md). No describe el alojamiento actual y sus precios no se han revalidado.
