# Recovery Studio

Aplicación web de reservas y gestión para **Recovery Studio**. Incluye sitio público, área de clientes y panel de administración, con estética minimalista en azul y naranja.

Construida en **Node.js sin dependencias externas**: el servidor usa únicamente módulos nativos y los datos se guardan en un archivo JSON.

---

## Contenido

- [Requisitos](#requisitos)
- [Inicio rápido](#inicio-rápido)
- [Acceso de administrador](#acceso-de-administrador)
- [Funcionalidades](#funcionalidades)
- [Reglas del negocio](#reglas-del-negocio)
- [Datos de transferencia](#datos-de-transferencia)
- [Configuración](#configuración)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Respaldo y recuperación](#respaldo-y-recuperación)
- [Seguridad](#seguridad)

---

## Requisitos

- Node.js **18.17 o superior** (recomendado: LTS actual).
- No requiere `npm install`: el proyecto no tiene dependencias.

## Inicio rápido

En Windows puedes hacer doble clic en **`start.cmd`**.

O desde una terminal:

```bash
npm start
# equivalente a: node server.js
```

Abre `http://localhost:3000`.

La primera vez se crea automáticamente `data/db.json` con:

- El usuario administrador.
- Los 5 servicios iniciales.
- Los 4 planes iniciales.
- La configuración del studio y los datos de transferencia.

## Acceso de administrador

| Campo | Valor inicial |
| --- | --- |
| Correo | `recoverystudio7@gmail.com` |
| Contraseña | `recoverystudio!!` |

En el **primer ingreso** el sistema exige configurar un authenticator TOTP:

1. Abre Google Authenticator, Authy, Microsoft Authenticator u otra app compatible.
2. Escanea el código QR o ingresa la clave manual.
3. Escribe el código de 6 dígitos para activar el acceso.

> Cambia la contraseña desde **Configuración → Mi contraseña de administrador** después del primer ingreso.

### Recuperar el acceso si se pierde el authenticator

Detén el servidor y ejecuta:

```bash
npm run reset-totp
```

Luego inicia el servidor de nuevo. El próximo ingreso pedirá configurar un authenticator nuevo. La contraseña no cambia.

## Funcionalidades

### Sitio público

- Presentación de servicios, planes y proceso de trabajo.
- Datos bancarios y política de cancelación visibles.
- Acceso a registro e ingreso.
- Botones de reserva que llevan al flujo de agenda.

### Área de clientes

- **Resumen:** próxima sesión, sesiones disponibles, pagos pendientes y rutinas.
- **Agendar:** selección de servicio, fecha, horario y modalidad.
- **Mis sesiones:** estado de cada reserva, pago, reagendamiento y cancelación.
- **Mis planes:** planes activos, compra de planes y solicitud de plan a medida.
- **Mis rutinas:** ejercicios asignados por el studio.
- **Pagos:** datos de transferencia, historial e informe de comprobantes.
- **Mi perfil:** datos personales y cambio de contraseña/PIN.

Cada cliente ve únicamente su propia información.

### Panel de administración

- **Dashboard:** ingresos confirmados, retención de boleta (15,25 %), neto a recibir, agenda y pagos por revisar.
- **Agenda:** confirmar reservas, reagendar, marcar asistencia o inasistencia, cancelar y agregar notas.
- **Usuarios:** crear clientes, ver ficha, sesiones, planes y pagos.
- **Planes y servicios:** crear, editar y eliminar; control de duplicados y solicitudes a medida.
- **Pagos e ingresos:** confirmar o rechazar transferencias, ver retención y exportar CSV.
- **Rutinas:** crear y asignar rutinas con ejercicios, series y repeticiones.
- **Configuración:** datos del studio, datos bancarios, retención, horas de cancelación, contraseña y authenticator.

## Reglas del negocio

- Toda reserva queda **pendiente hasta que el administrador la confirme**.
- Los pagos son por **transferencia** y se confirman manualmente.
- Los ingresos del dashboard consideran solo **pagos confirmados**.
- La retención de boleta de honorarios es **15,25 %** por defecto y es configurable.
- Se puede cancelar o reagendar hasta **12 horas antes** de la sesión.
- **No hay reembolsos** ni reagendamientos dentro de las 12 horas previas.
- Si una reserva usa un plan, la sesión se descuenta cuando el administrador marca **asistencia**.
- Los planes a medida siguen el flujo: solicitud → aprobación con sesiones y precio → transferencia → confirmación → plan activo.
- Los nombres de planes duplicados se bloquean en el servidor.

## Datos de transferencia

| Campo | Valor |
| --- | --- |
| Titular | DANIEL ESTEBAN BARRUETO |
| RUT | 17.375.282-2 |
| Banco | Banco Bci |
| Tipo de cuenta | Cuenta Corriente |
| Número | 72771619 |

Estos datos se pueden editar en **Configuración → Datos de transferencia**.

## Configuración

Variables de entorno opcionales:

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. Usa `127.0.0.1` para acceso solo local. |
| `DATA_DIR` | `./data` | Carpeta donde se guarda `db.json`. |
| `NODE_ENV` | — | Usa `production` para cookies `Secure` detrás de HTTPS. |
| `ADMIN_EMAIL` | `recoverystudio7@gmail.com` | Correo del admin al crear una base nueva. |
| `ADMIN_PASSWORD` | `recoverystudio!!` | Contraseña inicial del admin al crear una base nueva. |
| `STUDIO_EMAIL` | `recoverystudio7@gmail.com` | Correo de contacto inicial. |

Ejemplo en PowerShell:

```powershell
$env:PORT=8080
$env:HOST="127.0.0.1"
node server.js
```

## Estructura del proyecto

```
.
├── server.js                 Servidor HTTP, API, autenticación y persistencia
├── package.json
├── start.cmd                 Inicio rápido en Windows
├── data/
│   └── db.json               Base de datos (se crea automáticamente)
├── public/
│   ├── index.html
│   ├── app.js                Arranque y router del SPA
│   ├── styles.css            Sistema visual completo
│   ├── favicon.svg
│   ├── js/
│   │   ├── core.js           Estado, API, componentes y utilidades
│   │   ├── landing.js        Sitio público
│   │   ├── auth.js           Login, registro y TOTP
│   │   ├── user.js           Panel de cliente y agenda
│   │   ├── user-extra.js     Planes, rutinas, pagos y perfil
│   │   ├── admin.js          Dashboard y agenda del admin
│   │   ├── admin-catalog.js  Usuarios, planes y rutinas
│   │   └── admin-ops.js      Pagos y configuración
│   └── vendor/
│       └── qrcode.js         Generador de QR para el authenticator
└── scripts/
    ├── reset-totp.mjs        Recuperación del authenticator
    └── smoke.mjs             Prueba de humo de la API
```

## Respaldo y recuperación

Toda la información vive en `data/db.json`.

- Para respaldar: copia ese archivo.
- Para restaurar: detén el servidor, reemplaza `db.json` y vuelve a iniciar.
- Para empezar de cero: detén el servidor, elimina `data/db.json` y vuelve a iniciarlo. Se creará una base nueva con el admin y el catálogo inicial.

No edites `db.json` con el servidor en ejecución: los cambios en memoria pueden sobrescribir el archivo.

## Seguridad

- Contraseñas con **scrypt** y salt individual.
- Sesiones con cookies **HttpOnly**, firmadas con HMAC y `SameSite=Strict`.
- Invalidación de sesiones al cambiar contraseña o token.
- **TOTP obligatorio** para el administrador.
- Límite de intentos de ingreso.
- Cabeceras de seguridad y CSP estricta.
- Validación y sanitización de datos en el servidor.
- El cliente nunca recibe datos de otros clientes.

Para producción:

1. Publica detrás de **HTTPS** (por ejemplo, con un proxy inverso).
2. Define `NODE_ENV=production`.
3. Cambia la contraseña inicial del administrador.
4. Activa el authenticator y guarda la clave de respaldo.
5. Programa copias de seguridad de `data/db.json`.
6. No expongas `data/db.json` ni el puerto del servidor sin protección.

---

© 2026 Recovery Studio.
