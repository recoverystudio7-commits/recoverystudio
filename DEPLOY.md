# Despliegue en Vercel

Arquitectura: **Vercel** sirve el frontend estático (`public/`) y ejecuta el backend Node como Serverless Function (`api/`). La base de datos vive en **Upstash Redis** (compatible con Vercel KV).

```
Navegador
   │
   ▼
Vercel (CDN + Functions) ──► Upstash Redis (db.json serializado)
```

Sin Redis, Vercel no puede persistir: el sistema de archivos de las Functions es efímero y de solo lectura.

## 1. Crear la base Redis

En el dashboard de Vercel: **Storage → Create Database → Upstash Redis** (plan gratuito), o en [upstash.com](https://upstash.com) creando una base Redis y copiando la **REST URL** y el **REST TOKEN**.

Variables que acepta el proyecto:

| Variable | Uso |
| --- | --- |
| `KV_REST_API_URL` | URL REST de Redis |
| `KV_REST_API_TOKEN` | Token REST |
| `UPSTASH_REDIS_REST_URL` | Alternativa a la URL |
| `UPSTASH_REDIS_REST_TOKEN` | Alternativa al token |
| `DB_KEY` | Clave donde se guarda la base (por defecto `recovery-studio:db`) |

## 2. Variables de entorno en Vercel

```bash
vercel env add KV_REST_API_URL production
vercel env add KV_REST_API_TOKEN production
vercel env add NODE_ENV production        # production
vercel env add ADMIN_EMAIL production     # recoverystudio7@gmail.com
vercel env add ADMIN_PASSWORD production  # contraseña inicial del admin
vercel env add STUDIO_EMAIL production    # recoverystudio7@gmail.com
```

`ADMIN_EMAIL` y `ADMIN_PASSWORD` solo se usan al crear la base por primera vez. Después, la contraseña se cambia desde el panel.

## 3. Desplegar

```bash
vercel link
vercel --prod
```

El primer arranque crea la base con el administrador, los 5 servicios y los 4 planes iniciales.

## 4. Dominio

1. En Vercel: **Settings → Domains → Add** `www.recoverystudio.cl` y `recoverystudio.cl`.
2. Vercel mostrará el registro exacto. En Cloudflare (DNS only / nube gris):
   - `www` → CNAME `cname.vercel-dns.com`.
   - `@` → CNAME `cname.vercel-dns.com` (Cloudflare lo aplana a las IP anycast de Vercel). Alternativa: A `76.76.21.21`.
   - Eliminar los registros A/CNAME de GitHub Pages.
   - **No tocar los MX de Microsoft 365.**
3. Esperar la emisión del certificado. Ambos nombres quedan sirviendo la app (sin redirección canónica todavía).

### Estado verificado

- `https://recoverystudio.cl` y `https://www.recoverystudio.cl` → `200`, certificado válido, API `200`.
- Vercel reporta los dos dominios con `misconfigured: false` (apex `configuredBy: A` por el aplanado del CNAME).
- Si el equipo local no abre el apex justo después del cambio, es caché DNS negativa del router: `ipconfig /flushdns` y esperar la expiración del TTL (5–30 min).

GitHub Pages puede quedarse como respaldo/staging en `recoverystudio7-commits.github.io/Recoverystudionativo/`, pero el dominio debe apuntar solo a un destino.

## 5. Operación

- **Respaldo:** el panel admin permite exportar CSV; para respaldar la base completa, exportar la clave de Redis o usar el respaldo JSON del panel cuando esté implementado.
- **Actualizar:** `git push` a la rama conectada y Vercel redepliega.
- **Rollback:** Vercel → Deployments → Promote to Production.
- **TOTP del admin:** si se pierde el authenticator, con Redis hay que borrar el campo `totpEnabled` del usuario admin en Redis o usar el endpoint de reset con sesión admin (`POST /api/admin/totp/reset`).

## 6. Reseñas, sauna y PWA

- Reseñas: se guardan en `db.reviews` (Redis). Endpoints públicos `GET/POST /api/public/reviews` y de administración `GET/PATCH/DELETE /api/admin/reviews`.
- Moderación: panel admin -> Reseñas. Solo las aprobadas aparecen en el sitio y en la portada.
- Sauna: `/#/sauna` (la ruta `/sauna` redirige).
- PWA: `manifest.webmanifest` + `sw.js`, con íconos en `public/icons/`. Al cambiar assets, subir `VERSION` en `sw.js` para invalidar la caché.

## 7. Notificaciones y seguridad admin

Variables de entorno en Vercel (Production) para activar los avisos externos:

| Variable | Uso |
| --- | --- |
| `RESEND_API_KEY` | Correo vía Resend. Sin ella, el canal de correo queda apagado. |
| `RESEND_FROM` | Remitente verificado (opcional; por defecto `onboarding@resend.dev`). |
| `NOTIFY_EMAIL` | Destino de los avisos (opcional; por defecto el correo del studio). |
| `CALLMEBOT_PHONE` | WhatsApp en formato internacional, ej. `+56912345678`. |
| `CALLMEBOT_APIKEY` | API key que entrega el bot de CallMeBot. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO` | Alternativa a CallMeBot. |

- Sin credenciales, todo queda igualmente registrado en el panel -> **Notificaciones** (últimas 300).
- Botón **Enviar prueba** en Configuración y en Notificaciones para validar los canales.
- CallMeBot: agregar el número del bot a WhatsApp, enviarle `I allow callmebot to send me messages` y guardar el teléfono + apikey recibidos.
- Resend: crear una API key en resend.com; con `onboarding@resend.dev` solo se puede enviar al correo dueño de la cuenta.

### Contraseña del administrador

- La política exige **mínimo 16 caracteres** para el admin (los clientes mantienen 4).
- Reset por consola sobre Redis de producción (detén el tráfico o hazlo en una ventana corta):

```powershell
$env:KV_REST_API_URL="..."
$env:KV_REST_API_TOKEN="..."
npm run set-admin-password -- --email recoverystudio7@gmail.com
npm run set-admin-password -- --email recoverystudio7@gmail.com --reset-totp   # además desactiva TOTP
```

- El script cierra las sesiones anteriores (`tokenVersion + 1`) y permite `--password` para fijar una clave conocida.
- **Datos de prueba:** Configuración -> Zona de riesgo -> Borrar datos de prueba (exige contraseña y escribir `BORRAR`). Conserva catálogo, configuración y admin.
