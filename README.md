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
- Actualización en tiempo real entre administrador y caja.
- Bitácora automática con estado anterior, estado posterior, usuario y fecha.
- Buscador y filtros por sede y estado.
- Diseño responsive para computador, tableta y celular.
- Logo oficial suministrado por Grupo Almacenes El Rey.
- Modo demostración local cuando Supabase todavía no está conectado.

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

El esquema está en:

```text
supabase/migrations/202609030001_initial.sql
```

El archivo crea las diez sedes, usuarios por perfil, domiciliarios, pedidos, eventos de auditoría, políticas de seguridad y sincronización en tiempo real.

Los datos opcionales para pruebas están en `supabase/demo_seed.sql`. No deben ejecutarse en producción.

## Publicación

Las instrucciones completas para Supabase Free, Cloudflare Pages, GoDaddy y los usuarios por sede están en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Verificación

```bash
npm run check
npm run build
```
