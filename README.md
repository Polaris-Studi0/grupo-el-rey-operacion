# Plataforma de operación — Grupo Almacenes El Rey

Aplicación web de pedidos con dos perfiles:

- **Caja:** consulta únicamente los pedidos de su sede, confirma que están listos y registra la entrega al domiciliario o al cliente que recoge.
- **Administrador:** consulta todas las sedes, crea y edita pedidos, asigna domiciliarios, define tiempos, administra el equipo de entrega y revisa la trazabilidad.

## Funcionalidades incluidas

- Inicio de sesión con correo y contraseña.
- Permisos por rol y sede aplicados en PostgreSQL mediante Row Level Security.
- Pedidos de domicilio y recogida en tienda.
- Varios productos por pedido y cálculo automático del total.
- Estados: en preparación, pendiente por despacho, despachado, entregado y cancelado.
- Asignación o reasignación de domiciliario y tiempo estimado.
- Domiciliarios ocasionales de Rappi, DiDi u otra plataforma sin agregarlos al directorio permanente.
- Directorio opcional de domiciliarios frecuentes o de planta.
- Personal de caja administrable por sede y registro de quién entrega físicamente cada pedido.
- Hora exacta de entrega al domiciliario o al cliente que recoge.
- Costo del domicilio separado del subtotal y total cobrado al cliente.
- Comprobantes de transferencia privados (JPG, PNG, WEBP o PDF, máximo 5 MB).
- Actualización en tiempo real entre administrador y caja.
- Bitácora automática con estado anterior, estado posterior, usuario y fecha.
- Buscador y filtros por sede y estado.
- Diseño responsive para computador, tableta y celular.
- Logo oficial suministrado por Grupo Almacenes El Rey.
- Modo demostración local cuando Supabase todavía no está conectado.
- Centro de WhatsApp con conversaciones, consentimiento verificable y pendientes humanos.
- Conocimiento, catálogo, inventario, reservas y movimientos separados por sede.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:4173`.

Si no existe un archivo `.env`, la aplicación muestra accesos de demostración. Para conectarla a datos reales:

```bash
cp .env.example .env
```

Configura:

```text
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_ANON
```

La clave `anon` es pública y está protegida por las políticas de la base de datos. **Nunca** pongas la clave `service_role` en Vercel, GitHub ni en el frontend.

## Base de datos

El esquema inicial y sus ampliaciones están en:

```text
supabase/migrations/202609030001_initial.sql
supabase/migrations/202609040002_operational_traceability.sql
supabase/migrations/202609050003_whatsapp_commerce.sql
```

Ejecuta los archivos en ese orden. La tercera migración prepara el comercio conversacional de WhatsApp, el control humano y el inventario auditable sin borrar los pedidos existentes.

Los datos opcionales para pruebas están en `supabase/demo_seed.sql`. No deben ejecutarse en producción.

## Publicación

Las instrucciones completas para Supabase Free, Cloudflare Pages, GoDaddy y los usuarios por sede están en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

La arquitectura y puesta en marcha del chatbot con n8n están en [docs/CHATBOT_N8N.md](docs/CHATBOT_N8N.md).

## Verificación

```bash
npm run check
npm run build
```
