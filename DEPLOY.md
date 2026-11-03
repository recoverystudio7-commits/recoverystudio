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
   - `www` → CNAME al valor que entrega Vercel (por ejemplo `xxxx.vercel-dns-017.com`).
   - `@` → A `76.76.21.21` (o el valor que muestre Vercel).
   - Eliminar los registros A/CNAME de GitHub Pages.
   - **No tocar los MX de Microsoft 365.**
3. Esperar la emisión del certificado y activar la redirección `recoverystudio.cl → www.recoverystudio.cl`.

GitHub Pages puede quedarse como respaldo/staging en `recoverystudio7-commits.github.io/Recoverystudionativo/`, pero el dominio debe apuntar solo a un destino.

## 5. Operación

- **Respaldo:** el panel admin permite exportar CSV; para respaldar la base completa, exportar la clave de Redis o usar el respaldo JSON del panel cuando esté implementado.
- **Actualizar:** `git push` a la rama conectada y Vercel redepliega.
- **Rollback:** Vercel → Deployments → Promote to Production.
- **TOTP del admin:** si se pierde el authenticator, con Redis hay que borrar el campo `totpEnabled` del usuario admin en Redis o usar el endpoint de reset con sesión admin (`POST /api/admin/totp/reset`).
