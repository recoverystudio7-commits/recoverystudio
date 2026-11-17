# Esquema de reservas/citas en Supabase (Recovery Studio)

Documento que aterriza el modelo de **reservas/citas** al flujo actual del proyecto, usando los conceptos de SQL de las semanas 17–20 del material de referencia (`referencia/full-stack-dev-1910/week_17`–`week_20`).

## 1. Conceptos de semanas 17–20 aplicados

| Concepto (semanas) | Aplicación en este proyecto |
|---|---|
| **PK / FK e integridad referencial** (w19–w20) | Cada tabla de negocio tiene `id`/PK y referencia a otras por FK: `sessions.user_id -> profiles.id`, `sessions.service_id -> services.id`, `payments.session_id -> sessions.id`, `client_accounts.user_id -> profiles.id`. Evita citas huérfanas. |
| **Relación 1:1** (w19 d4, `users`↔`profile`) | `profiles (auth.users)` ↔ `client_accounts`: un perfil tiene exactamente una cuenta de créditos/plan (`client_accounts.user_id` es PK y FK). |
| **Relaciones 1:N** (w19 d5, `users`→`blogs`, `blogs`→`comments`) | `profiles` → `sessions` (un cliente, muchas citas), `services` → `sessions`, `profiles` → `payments`, `profiles` → `client_maxes`. `company_quotes` es independiente pero podría vincularse a servicios vía `service_ids` (jsonb). |
| **JOINs** (w19 d5, w20 d1) | Agenda/admin: `sessions JOIN profiles` (cliente) `JOIN services` (nombre, duración, precio). Finanzas: `payments LEFT JOIN sessions`. Reportes por cliente: `profiles LEFT JOIN sessions` / `LEFT JOIN payments`. |
| **Agregaciones + GROUP BY** (w18 d1, w19 d5) | Conteos y totales: sesiones por estado/mes, ingresos por mes (`payments` aprobados), asistencia por cliente (`count` de `sessions` completadas), cupos usados. |
| **Restricciones de dominio** (w17–w20, CHECK/UNIQUE) | `status`, `payment_status`, montos `>= 0`, `credits >= 0`, `company_quotes.people > 0`, rangos de fechas válidos en descuentos. |
| **Integridad temporal / solapamiento** (extensión práctica sobre w17) | `sessions.during` y `blocked_slots.during` como `tstzrange` con `EXCLUDE USING gist (... WITH &&)` impiden que dos reservas activas (o bloqueos) se pisen en el tiempo. Es la forma correcta de modelar agenda frente a solo validar en app. |

## 2. Modelo actual (fuente: `supabase/migrations/20261104225000_backend_core.sql`)

### Núcleo de identidad y catálogo
- **`profiles`** (1 por usuario auth): `id (PK, FK auth.users)`, `email`, `full_name`, `phone`, `goal`, `role (client|admin)`, `active`.
- **`client_accounts`** (1:1 con profile): `user_id (PK/FK)`, `credits`, `plan_label`.
- **`services`**: `id`, `name`, `kind (Sesión|Plan|Asesoría|Empresa)`, `price`, `duration` (min), `sessions` (créditos/sesiones del plan), `company_price`, `active`, `popular`.
- **`studio_settings`** (singleton `id='studio'`): `config jsonb` con horarios por día, `slot` base, `leadHours`, `policyHours`, `horizonDays`, etc.

### Agenda / reservas (citas)
- **`sessions`** = reserva/cita agendada.
  - `id (text PK)`, `user_id -> profiles`, `service_id -> services`
  - `starts_at`, `ends_at` (`timestamptz`)
  - `during tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED`
  - `status`: `pendiente | confirmada | completada | cancelada | no_asistio`
  - `payment_status`: `pendiente | pagado | plan | rechazado`
  - `coach`, `notes`, `created_at`, `created_by`
  - **Constraint clave:** `EXCLUDE USING gist (during WITH &&) WHERE (status <> 'cancelada')` → no permite solapamientos entre citas no canceladas.
- **`blocked_slots`**: rangos no reservables (`starts_at/end_at/during`, `reason`), también con exclusión gist para evitar solapes entre bloqueos.

### Flujo comercial y seguimiento
- **`payments`**: referencia, `user_id`, `session_id` (nullable, `ON DELETE SET NULL`), `concept`, `amount`, `status (pendiente|aprobado|rechazado)`, `method`, comprobante, `credits_to_add/credits_added`.
- **`company_quotes`**: cotizaciones empresa (`service_ids jsonb`, `people`, montos, estado).
- **`client_maxes`**, **`client_routines`**: seguimiento 1:N por cliente.
- **`expenses`**, **`boletas`**: finanzas/admin.
- **`audit_log`**, **`notification_outbox`**: trazabilidad y notificaciones.

### Seguridad (RLS)
- Clientes leen lo propio (`user_id = auth.uid()`); admins (`is_studio_admin()`) gestionan. Catálogo/config/bloqueos legibles para agenda pública según políticas.

## 3. Alineación con el flujo real (previews + `assets/js/data.js`)

- **Slot base 30 min** (`studio_settings.config.slot` / `RS.DATA.settings.slot`): la grilla ofrece inicios cada 30'. 
- **Duración por servicio** (`services.duration`): una "Sesión Recovery" de 60' ocupa 2 slots consecutivos; una asesoría de 30' ocupa 1. El sistema debe reservar `[start, start + duration)` completo.
- **Disponibilidad**: un inicio es válido solo si ningún tramo del rango choca con `sessions` activas (`status <> 'cancelada'`) ni con `blocked_slots`. La exclusión `gist &&` en BD es la garantía final; la UI filtra inicios imposibles.
- **Lead/política**: `leadHours` (anticipación mínima) y `policyHours` (cancelación/reagenda) se aplican en lógica de negocio/agenda.
- **Pago y créditos**: `payment_status` en la cita + `payments` (con `credits_to_add`) reflejan pagado/pendiente/plan; planes consumen créditos de `client_accounts`.
- **Empresa/cotizaciones**: flujo separado (`company_quotes`) que puede derivar en sesiones/pagos.

## 4. Consultas tipo (JOINs y agregaciones, estilo w18–w20)

```sql
-- Agenda del día con cliente y servicio (JOIN 1:N)
select s.id, s.starts_at, s.ends_at, s.status, s.payment_status,
       p.full_name, p.phone, sv.name as service_name, sv.duration
from public.sessions s
join public.profiles p on p.id = s.user_id
join public.services sv on sv.id = s.service_id
where s.starts_at >= $1::date and s.starts_at < ($1::date + interval '1 day')
  and s.status <> 'cancelada'
order by s.starts_at;

-- Ingresos aprobados por mes (agregación + GROUP BY)
select date_trunc('month', payment_date) as month,
       count(*) as pagos, sum(amount) as total
from public.payments
where status = 'aprobado'
group by 1 order by 1;

-- Asistencia/historial por cliente (LEFT JOIN + conteo)
select p.id, p.full_name,
       count(s.id) filter (where s.status = 'completada') as completadas,
       count(s.id) filter (where s.status = 'no_asistio') as no_asistio
from public.profiles p
left join public.sessions s on s.user_id = p.id
where p.role = 'client'
group by p.id, p.full_name;

-- Disponibilidad: ¿choca un rango candidato? (concepto, parametrizado)
select exists (
  select 1 from public.sessions
  where status <> 'cancelada'
    and during && tstzrange($start, $end, '[)')
) or exists (
  select 1 from public.blocked_slots
  where during && tstzrange($start, $end, '[)')
) as ocupado;
```

## 5. Esquema "aterrizado" y mejoras recomendadas

**Mantener (ya correcto para el flujo):**
- `sessions` como entidad de reserva con `during` + exclusión gist (soporta duraciones multi-slot sin tabla de slots física).
- Separación `services.duration` (catálogo) vs `sessions.starts_at/ends_at` (instancia real).
- `blocked_slots` con la misma semántica temporal.
- Relación 1:1 `profiles`↔`client_accounts` y 1:N hacia sesiones/pagos/seguimiento.

**Mejoras incrementales (seguras, ver migración de alineación):**
- Índices de consulta frecuentes: `sessions (user_id, starts_at desc)`, `sessions (starts_at)`/por estado para agenda, `payments (user_id, payment_date desc)`, `blocked_slots (starts_at)` — aceleran agenda, historial y finanzas.
- (Opcional futuro) `sessions.service_duration_min` snapshot si el precio/duración del servicio cambia y quieres preservar lo contratado; hoy `duration` vive en `services`.
- (Opcional futuro) normalizar `company_quotes.service_ids` a tabla puente `company_quote_services(quote_id, service_id)` si necesitas JOIN/analítica por servicio cotizado (hoy jsonb es suficiente para el volumen).

**No recomendado para este flujo:** tabla de "slots" materializados por día; el rango continuo `[start,end)` + `slot` en settings es más simple y evita inconsistencias.

## 6. Diagrama lógico (resumen)

```
auth.users 1--1 profiles 1--1 client_accounts
               1--N sessions N--1 services
               1--N payments  N..1 sessions (nullable)
               1--N client_maxes
               1--N client_routines
studio_settings (singleton config)      blocked_slots (rangos excluyentes)
company_quotes  expenses  boletas  audit_log  notification_outbox
```

## 7. Referencia cruzada

- Migraciones base: `supabase/migrations/20261104225000_backend_core.sql` (+ profile/marketing/auth backfill).
- Alineación/índices: `supabase/migrations/20261114120000_booking_schema_alignment.sql`.
- Material SQL de apoyo: `referencia/full-stack-dev-1910/week_17`–`week_20` (joins, relaciones, agregaciones).
