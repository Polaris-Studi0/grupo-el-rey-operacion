# Despliegue de la plataforma

## Arquitectura recomendada

- **Código fuente:** repositorio privado de GitHub.
- **Frontend para iniciar:** Cloudflare Pages Free, con dominio sugerido `operacion.tudominio.com`.
- **Backend para el piloto:** Supabase Free en la región South America (São Paulo).
- **Autenticación:** usuarios de Supabase Auth con correo y contraseña.

Esta separación permite publicar cambios del frontend sin tocar la base de datos y mantener los permisos dentro de PostgreSQL.

## Costos de referencia

Precios y límites consultados en septiembre de 2026:

- Cloudflare Pages Free: USD 0; hasta 500 compilaciones mensuales y solicitudes estáticas sin costo.
- Supabase Free: USD 0; 500 MB de base de datos, 50.000 usuarios activos mensuales y hasta dos proyectos activos.
- Supabase Pro, cuando la operación lo justifique: desde USD 25/mes e incluye copias de seguridad diarias con siete días de retención.
- GoDaddy Web Hosting: desde USD 5,99/mes como precio promocional publicado; requiere contratar hosting además del dominio y las renovaciones pueden costar más.
- Dominio: depende del registrador. Un subdominio del dominio actual normalmente no implica comprar otro dominio.

**Decisión recomendada:** comenzar el piloto con Cloudflare Pages Free + Supabase Free. Si la aplicación se usa todos los días, el proyecto de Supabase no debería quedar inactivo; aun así, el plan gratuito puede ser pausado cuando detecta baja actividad durante siete días y no ofrece las mismas copias de seguridad descargables. Mientras esté en Free se debe generar una copia manual frecuente. Al convertir el sistema en el registro oficial de pedidos, conviene subir únicamente Supabase a Pro; el frontend puede seguir gratis en Cloudflare.

Referencias: [precios de Supabase](https://supabase.com/pricing), [regiones de Supabase](https://supabase.com/docs/guides/platform/regions), [copias de seguridad](https://supabase.com/docs/guides/platform/backups), [límites de Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/) y [hosting de GoDaddy](https://www.godaddy.com/es/hosting/web-hosting).

## 1. Crear Supabase

1. Crear una organización y un proyecto en Supabase.
2. Seleccionar la región **South America (São Paulo)**.
3. Generar una contraseña fuerte para la base de datos y guardarla en un gestor de contraseñas.
4. Abrir **SQL Editor**.
5. Copiar y ejecutar todo el archivo `supabase/migrations/202609030001_initial.sql`.
6. Copiar y ejecutar después `supabase/migrations/202609040002_operational_traceability.sql`.
7. No ejecutar `demo_seed.sql` en producción.

## 2. Crear los usuarios

En **Authentication → Users**, crear primero el usuario administrador y luego una cuenta independiente para cada sede. Desactivar el registro público: las cuentas deben ser creadas por administración.

Se recomienda utilizar correos operativos reconocibles, por ejemplo:

```text
admin@tudominio.com
caja.aures@tudominio.com
caja.diamante80@tudominio.com
caja.santacruz@tudominio.com
...
```

El correo funciona como nombre de usuario. Cada sede recibe el mismo enlace de la plataforma, su propio correo y una contraseña inicial. El perfil guardado en la base de datos determina automáticamente qué vista y qué sede puede ver; no hay que crear diez enlaces diferentes.

La cuenta de acceso identifica a la sede. Los nombres de las personas que atienden caja se administran desde **Personal de caja** dentro del panel administrador. En el momento de entregar un pedido al domiciliario o al cliente, la sede debe seleccionar quién hizo la entrega; la plataforma registra por separado la cuenta de la sede, la persona responsable, la fecha y la hora.

Después de crear el administrador, ejecutar en SQL Editor, reemplazando el correo:

```sql
update public.profiles
set full_name = 'Samuel Ceballos', role = 'admin', branch_id = null
where id = (select id from auth.users where email = 'TU_CORREO_ADMIN');
```

Para una cajera de Robledo Aures:

```sql
update public.profiles
set full_name = 'Nombre de la responsable', role = 'cashier', branch_id = 'b1'
where id = (select id from auth.users where email = 'CORREO_DE_LA_SEDE');
```

También se puede completar toda la asignación de usuarios editando y ejecutando `supabase/configure_branch_users.sql.example` después de crear las once cuentas en Authentication.

Identificadores de sede:

| ID | Sede |
|---|---|
| b1 | Robledo Aures |
| b2 | Robledo Diamante - Calle 80 |
| b3 | Santa Cruz |
| b4 | San Gabriel, Itagüí |
| b5 | Robledo Diamante - Diagonal 85 |
| b6 | Floresta |
| b7 | La 80 |
| b8 | La Estrella |
| b9 | Campo Valdez |
| b10 | San Antonio de Prado |

No compartas una cuenta entre sedes. Dentro de una misma sede puede usarse su cuenta operativa y seleccionar en cada entrega a la persona de caja correspondiente.

## 3. Obtener variables públicas

En Supabase, abrir **Project Settings → API** y copiar:

- Project URL.
- Publishable/anon key.

Crear localmente `.env` a partir de `.env.example`. Nunca subir `.env` a GitHub.

## 4. Subir a GitHub

Crear un repositorio privado, por ejemplo `grupo-el-rey-operacion`, y subir el contenido de esta carpeta. La rama de producción debe ser `main`.

## 5. Publicar gratis en Cloudflare Pages

1. Crear una cuenta de Cloudflare.
2. Abrir **Workers & Pages → Create application → Pages → Import from an existing Git repository**.
3. Conectar el repositorio privado de GitHub.
4. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para Production y Preview.
5. Usar `npm run build` como **Build command** y `dist` como **Build output directory**.
6. Seleccionar **Save and Deploy**.
7. En **Custom domains**, agregar `operacion.tudominio.com`.
8. Si el DNS continúa administrado en GoDaddy, crear allí el registro CNAME que indique Cloudflare, apuntando el subdominio a `nombre-del-proyecto.pages.dev`.

Cada actualización enviada a `main` generará una nueva versión de producción. Documentación oficial: [Vite en Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/), [integración con Git](https://developers.cloudflare.com/pages/configuration/git-integration/) y [dominios personalizados](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Alternativa: alojar el frontend en GoDaddy

GoDaddy también sirve porque esta interfaz se compila como archivos estáticos, pero comprar solamente el dominio no incluye necesariamente el plan de hosting.

Si ya existe un plan Web Hosting con cPanel:

1. Ejecutar localmente `npm run build`.
2. Comprimir **el contenido** de la carpeta `dist`, no la carpeta completa.
3. Crear el subdominio `operacion` en GoDaddy.
4. Abrir cPanel → File Manager y entrar a la carpeta raíz del subdominio.
5. Subir y descomprimir los archivos de `dist`.
6. Verificar que `index.html` quede directamente en la raíz del subdominio.

Las variables de Supabase quedan incorporadas durante la compilación. Cada actualización exigiría volver a compilar y subir los archivos manualmente. GoDaddy alojaría únicamente la interfaz; Supabase seguiría siendo necesario como base de datos y sistema de usuarios. Referencia: [cargar archivos con cPanel](https://www.godaddy.com/en-uk/help/upload-files-using-my-web-hosting-cpanel-file-manager-3239).

## 6. Configuración de seguridad previa al lanzamiento

- Desactivar el registro público de usuarios.
- Exigir contraseñas únicas y fuertes.
- Crear una cuenta operativa distinta para cada sede y mantener actualizado el listado de personal de caja.
- Revisar que cada cajera tenga la sede correcta.
- Mantener únicamente las variables públicas de Supabase en Cloudflare.
- Mientras se use Supabase Free, programar exportaciones manuales y conservarlas fuera de Supabase.
- Pasar a Supabase Pro cuando la plataforma se convierta en el registro oficial y no sea aceptable perder información desde el último respaldo.
- Definir retención de datos y aviso de tratamiento de datos personales.
- Probar recuperación de copias de seguridad.
- Revisar mensualmente usuarios activos e inactivar accesos de personal retirado.

## 7. Prueba de aceptación

Antes de comenzar la operación real:

1. El administrador crea un pedido para cada sede.
2. Cada cajera confirma que solo ve los pedidos de su sede.
3. Caja marca el pedido como listo.
4. Administración asigna un domiciliario ocasional con nombre, placa y plataforma, agrega el costo del domicilio y adjunta un comprobante de prueba.
5. Caja confirma la entrega al domiciliario y selecciona la persona responsable.
6. Administración confirma la entrega final.
7. Se revisa la bitácora y se confirma que muestra cuenta, responsable, fecha, hora y cambios del pedido.
8. Se prueba un pedido de recogida en tienda.
9. Se asigna un domiciliario frecuente y se confirma que permanece disponible para otros pedidos.
10. Se prueba la visualización desde un celular real.

## Integraciones posteriores

La API de Supabase permite que n8n cree pedidos desde WhatsApp usando una credencial privada guardada exclusivamente en n8n. Esa automatización debe implementarse después de validar el flujo manual y nunca debe exponer la clave privada en el navegador.
