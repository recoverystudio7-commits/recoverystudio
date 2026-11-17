-- Alineación de esquema de reservas/citas al flujo actual (slots 30 min, duración por servicio,
-- solapamientos prevenidos por exclusion constraints tstzrange en sessions/blocked_slots).
-- Aplica conceptos de modelado SQL (PK/FK, 1:1/1:N, índices para JOIN/agenda/agregaciones).
-- Seguro y aditivo: solo índices y comentarios, sin cambios destructivos.

begin;

-- Agenda: listado por rango temporal y filtros por estado (día/semana, panel admin)
create index if not exists sessions_starts_at_idx
  on public.sessions (starts_at);

create index if not exists sessions_status_starts_at_idx
  on public.sessions (status, starts_at);

-- Historial del cliente y consultas "mis reservas" (JOIN profiles/sessions, ORDER BY recientes)
create index if not exists sessions_user_starts_at_idx
  on public.sessions (user_id, starts_at desc);

-- Agenda por servicio (reportes/capacidad por tipo de servicio)
create index if not exists sessions_service_starts_at_idx
  on public.sessions (service_id, starts_at desc);

-- Disponibilidad/bloqueos por rango
create index if not exists blocked_slots_starts_at_idx
  on public.blocked_slots (starts_at);

-- Finanzas e historial de pagos por cliente
create index if not exists payments_user_payment_date_idx
  on public.payments (user_id, payment_date desc);

create index if not exists payments_status_payment_date_idx
  on public.payments (status, payment_date desc);

-- Cotizaciones empresa: seguimiento por estado/recientes
create index if not exists company_quotes_status_created_at_idx
  on public.company_quotes (status, created_at desc);

comment on table public.sessions is
  'Reservas/citas. Rango [starts_at, ends_at) en during (tstzrange); exclusion gist impide solapes entre citas no canceladas. duration efectiva = servicio o tramo reservado.';
comment on table public.blocked_slots is
  'Bloqueos de agenda (rangos no reservables), con exclusion gist para evitar solapes entre bloqueos.';
comment on column public.services.duration is
  'Duración en minutos; una reserva ocupa N slots base (studio_settings.config.slot) según esta duración.';
comment on table public.client_accounts is
  'Relación 1:1 con profiles: créditos y plan vigente del cliente.';

commit;
