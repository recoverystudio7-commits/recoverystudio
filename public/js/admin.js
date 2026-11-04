/* ==========================================================================
   Panel de administración · dashboard y agenda
   ========================================================================== */

import {
  $, $$, state, api, money, esc, icon, toast, openModal, closeModal, confirmDialog,
  renderShell, pageHead, errorHtml, bindRetry, loadingHtml, fmtDate, fmtDateLong,
  fmtDateTime, bookingBadge, paymentBadge, orderBadge, percent, go, addDays, todayStr,
  openTransferModal, bindCopyButtons, capital,
} from './core.js';
import {
  pageAdminUsers, pageAdminPlans, pageAdminRoutines,
} from './admin-catalog.js';
import { pageAdminPayments, pageAdminConfig } from './admin-ops.js';
import { pageAdminReviews } from './reviews.js';

const TITLES = {
  '/admin': ['Dashboard', 'Ingresos, retención y agenda del studio'],
  '/admin/agenda': ['Agenda', 'Confirma, reagenda y registra asistencia'],
  '/admin/usuarios': ['Usuarios', 'Clientes y su historial'],
  '/admin/planes': ['Planes y servicios', 'Catálogo, valores y solicitudes'],
  '/admin/pagos': ['Pagos e ingresos', 'Transferencias y boletas'],
  '/admin/rutinas': ['Rutinas', 'Ejercicios asignados a clientes'],
  '/admin/resenas': ['Reseñas', 'Moderación de opiniones de clientes'],
  '/admin/config': ['Configuración', 'Datos del studio y seguridad'],
};

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export function renderAdmin(path) {
  if (!state.me) return go('/login');
  if (state.me.role !== 'admin') return go('/app');
  const [title, subtitle] = TITLES[path] || TITLES['/admin'];
  const content = renderShell({ kind: 'admin', active: path, title, subtitle });
  document.title = `${title} · Admin · Recovery Studio`;

  const run = (fn) => fn().catch((err) => {
    if (err.status === 401) return go('/login');
    if (err.status === 403) return go('/app');
    content.innerHTML = errorHtml(err.message);
    bindRetry();
  });

  if (path === '/admin/agenda') return run(() => pageAgenda(content));
  if (path === '/admin/usuarios') return run(() => pageAdminUsers(content));
  if (path === '/admin/planes') return run(() => pageAdminPlans(content));
  if (path === '/admin/pagos') return run(() => pageAdminPayments(content));
  if (path === '/admin/rutinas') return run(() => pageAdminRoutines(content));
  if (path === '/admin/resenas') return run(() => pageAdminReviews(content));
  if (path === '/admin/config') return run(() => pageAdminConfig(content));
  return run(() => pageDashboard(content));
}

/* ================================ DASHBOARD ============================== */

async function pageDashboard(content) {
  const s = await api('/admin/stats');
  const inc = s.income;
  const c = s.counts;
  const max = Math.max(...s.monthly.map((m) => m.amount), 1);
  const delta = inc.prevMonth > 0 ? Math.round(((inc.month - inc.prevMonth) / inc.prevMonth) * 100) : null;

  content.innerHTML = `
    ${pageHead('Dashboard', `Resumen de ${state.config?.studioName || 'Recovery Studio'} · ${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}`, `
      <a class="btn ghost sm" href="#/admin/pagos">${icon('wallet')} Ver pagos</a>
      <a class="btn sm" href="#/admin/agenda">${icon('calendarCheck')} Revisar agenda</a>`)}

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Ingresos totales <span class="kpi-icon">${icon('wallet')}</span></div>
        <div class="kpi-value">${money(inc.total)}</div>
        <div class="kpi-foot">Pagos confirmados históricos</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Ingresos del mes <span class="kpi-icon">${icon('trendingUp')}</span></div>
        <div class="kpi-value">${money(inc.month)}</div>
        <div class="kpi-foot ${delta !== null && delta >= 0 ? 'up' : ''}">${delta === null ? 'Sin comparación mes anterior' : `${delta >= 0 ? '+' : ''}${delta}% vs mes anterior`}</div>
      </div>
      <div class="kpi orange">
        <div class="kpi-label">Retención boleta <span class="kpi-icon">${icon('file')}</span></div>
        <div class="kpi-value">${money(inc.retention)}</div>
        <div class="kpi-foot">${percent(inc.retentionRate)} sobre ingresos totales</div>
      </div>
      <div class="kpi accent">
        <div class="kpi-label">Neto a recibir <span class="kpi-icon">${icon('checkCircle')}</span></div>
        <div class="kpi-value">${money(inc.net)}</div>
        <div class="kpi-foot">Después de retención de boleta</div>
      </div>
    </div>

    <div class="metric-row">
      <div class="metric"><span class="mi">${icon('users')}</span><div><b>${c.users}</b><span>Clientes activos</span></div></div>
      <div class="metric"><span class="mi">${icon('calendarCheck')}</span><div><b>${c.bookingsToday}</b><span>Sesiones hoy</span></div></div>
      <div class="metric"><span class="mi">${icon('clock')}</span><div><b>${c.bookingsPending}</b><span>Por confirmar</span></div></div>
      <div class="metric"><span class="mi">${icon('layers')}</span><div><b>${c.sessionsRemaining}</b><span>Sesiones en planes</span></div></div>
    </div>

    <div class="dash-grid">
      <div style="display:grid;gap:16px">
        <div class="card chart-card">
          <div class="card-head" style="margin-bottom:2px">
            <div><h3>Ingresos últimos 6 meses</h3><p>Pagos confirmados por mes.</p></div>
            <span class="badge blue">${money(s.monthly.reduce((sum, m) => sum + m.amount, 0))}</span>
          </div>
          <div class="chart">
            ${s.monthly.map((m, i) => `
              <div class="chart-col" title="${esc(m.label)}: ${money(m.amount)}">
                <div class="chart-bar-wrap"><div class="chart-bar ${i === s.monthly.length - 1 ? 'current' : ''}" style="height:${m.amount ? Math.max(4, Math.round((m.amount / max) * 100)) : 2}%"></div></div>
                <span class="chart-value">${m.amount ? money(m.amount).replace('$', '') : '—'}</span>
                <span class="chart-label">${esc(m.label)}</span>
              </div>`).join('')}
          </div>
          <div class="chart-legend"><span>Retención estimada: ${money(inc.retention)}</span><span>Neto: ${money(inc.net)}</span></div>
        </div>

        <div class="card card-pad">
          <div class="card-head">
            <div><h3>Agenda de hoy</h3><p>${s.todayBookings.length ? `${s.todayBookings.length} sesión${s.todayBookings.length === 1 ? '' : 'es'} programada${s.todayBookings.length === 1 ? '' : 's'}` : 'Sin sesiones para hoy'}</p></div>
            <a class="link-btn" href="#/admin/agenda">Ver agenda</a>
          </div>
          ${s.todayBookings.length ? `<div class="agenda-list">
            ${s.todayBookings.map((b) => `
              <div class="agenda-item">
                <div class="agenda-time"><b>${b.time}</b><span>${b.duration || 60} min</span></div>
                <div class="agenda-body">
                  <b>${esc(b.user?.name || 'Cliente')}</b>
                  <span>${esc(b.serviceName)} · ${b.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span>
                  <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">${bookingBadge(b.status)} ${b.paymentStatus && b.paymentStatus !== 'none' ? paymentBadge(b.paymentStatus) : ''}</div>
                </div>
                <div class="agenda-actions">
                  ${b.status === 'pending' ? `<button class="btn sm success" type="button" data-confirm-booking="${esc(b.id)}">Confirmar</button>` : ''}
                  ${['pending', 'confirmed'].includes(b.status) ? `<button class="btn sm ghost" type="button" data-attend="${esc(b.id)}">Asistió</button><button class="btn sm danger-soft" type="button" data-noshow="${esc(b.id)}">No vino</button>` : ''}
                  <button class="btn sm ghost" type="button" data-admin-reschedule="${esc(b.id)}">Reagendar</button>
                </div>
              </div>`).join('')}
          </div>` : `<div class="empty" style="padding:26px">
            <div class="ei">${icon('calendar')}</div>
            <h3>No hay sesiones hoy</h3>
            <p>Revisa las reservas pendientes o comparte tu agenda.</p>
            <a class="btn sm ghost" href="#/admin/agenda">Ver pendientes</a>
          </div>`}
        </div>

        <div class="card card-pad">
          <div class="card-head">
            <div><h3>Reservas por confirmar</h3><p>Las sesiones no se confirman solas.</p></div>
            <span class="badge ${s.pendingBookings.length ? 'warn' : 'success'}">${s.pendingBookings.length} pendientes</span>
          </div>
          ${s.pendingBookings.length ? `<div class="agenda-list">
            ${s.pendingBookings.slice(0, 5).map((b) => `
              <div class="agenda-item">
                <span class="dot-line" style="margin-top:9px"></span>
                <div class="agenda-body">
                  <b>${esc(b.user?.name || 'Cliente')} · ${esc(b.serviceName)}</b>
                  <span>${fmtDate(b.date)} · ${b.time} hrs · ${b.user?.email || ''}</span>
                </div>
                <div class="agenda-actions">
                  <button class="btn sm success" type="button" data-confirm-booking="${esc(b.id)}">Confirmar</button>
                </div>
              </div>`).join('')}
          </div>` : `<div class="alert success" style="padding:11px">${icon('checkCircle')}<div>No hay reservas pendientes de confirmación.</div></div>`}
        </div>
      </div>

      <div style="display:grid;gap:16px">
        <div class="card retention-card">
          <div class="card-head" style="margin-bottom:0"><div><h3>Boleta de honorarios</h3><p>Reserva estimada del ${percent(inc.retentionRate)}.</p></div><span class="badge orange">15,25%</span></div>
          <div class="retention-visual">
            <div class="retention-ring"><b>15,25%</b></div>
            <div class="retention-lines">
              <div><span>Bruto confirmado</span><b>${money(inc.total)}</b></div>
              <div><span>Retención</span><b>${money(inc.retention)}</b></div>
              <div><span>Neto estimado</span><b>${money(inc.net)}</b></div>
            </div>
          </div>
          <p class="tiny muted">Cálculo referencial sobre todos los pagos confirmados. Ajusta la tasa en Configuración si cambia la normativa.</p>
          <a class="btn ghost sm block" href="#/admin/pagos" style="margin-top:12px">Ver detalle de pagos</a>
        </div>

        <div class="card card-pad">
          <div class="card-head"><div><h3>Pagos por revisar</h3><p>Transferencias informadas por clientes.</p></div><span class="badge ${s.pendingPayments.length ? 'warn' : 'success'}">${c.pendingPayments}</span></div>
          ${s.pendingPayments.length ? `<div class="agenda-list">
            ${s.pendingPayments.map((p) => `
              <div class="agenda-item">
                <div class="agenda-body">
                  <b>${esc(p.user?.name || 'Cliente')}</b>
                  <span>${esc(p.concept)} · ${money(p.amount)}${p.reference ? ` · Ref. ${esc(p.reference)}` : ''}</span>
                  <div style="margin-top:5px">${paymentBadge(p.status)}</div>
                </div>
                <div class="agenda-actions">
                  <button class="btn sm success" type="button" data-confirm-payment="${esc(p.id)}">Confirmar</button>
                </div>
              </div>`).join('')}
          </div>` : `<div class="alert success" style="padding:11px">${icon('checkCircle')}<div>No hay pagos pendientes.</div></div>`}
          <a class="btn ghost sm block" href="#/admin/pagos" style="margin-top:10px">Ver todos los pagos</a>
        </div>

        <div class="card card-pad">
          <div class="card-head"><div><h3>Pagos recientes</h3><p>Últimos ingresos confirmados.</p></div></div>
          ${s.recentPayments.length ? `<div class="agenda-list">
            ${s.recentPayments.map((p) => `
              <div class="agenda-item">
                <span class="dot-line" style="background:var(--success);margin-top:9px"></span>
                <div class="agenda-body">
                  <b>${esc(p.user?.name || 'Cliente')}</b>
                  <span>${esc(p.concept)} · ${fmtDate(p.confirmedAt, { day: 'numeric', month: 'short' })}</span>
                </div>
                <div class="amount" style="font-size:12px">${money(p.amount)}</div>
              </div>`).join('')}
          </div>` : '<p class="small muted">Aún no hay ingresos confirmados.</p>'}
        </div>

        <div class="card panel-dark card-pad">
          <div class="eyebrow light">Accesos rápidos</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
            <a class="btn ghost-light sm" href="#/admin/usuarios">Usuarios</a>
            <a class="btn ghost-light sm" href="#/admin/planes">Planes</a>
            <a class="btn ghost-light sm" href="#/admin/rutinas">Rutinas</a>
            <a class="btn ghost-light sm" href="#/admin/config">Ajustes</a>
          </div>
        </div>
      </div>
    </div>
  `;

  // Acciones rápidas del dashboard
  const allBookings = [...s.todayBookings, ...s.pendingBookings];
  $$('[data-confirm-booking]', content).forEach((btn) => {
    btn.addEventListener('click', () => adminBookingStatus(btn.dataset.confirmBooking, 'confirmed'));
  });
  $$('[data-attend]', content).forEach((btn) => {
    btn.addEventListener('click', () => adminBookingStatus(btn.dataset.attend, 'attended'));
  });
  $$('[data-noshow]', content).forEach((btn) => {
    btn.addEventListener('click', () => adminBookingStatus(btn.dataset.noshow, 'no_show'));
  });
  $$('[data-admin-reschedule]', content).forEach((btn) => {
    const b = allBookings.find((x) => x.id === btn.dataset.adminReschedule);
    if (b) btn.addEventListener('click', () => openAdminReschedule(b));
  });
  $$('[data-confirm-payment]', content).forEach((btn) => {
    const p = s.pendingPayments.find((x) => x.id === btn.dataset.confirmPayment);
    if (!p) return;
    btn.addEventListener('click', () => {
      confirmDialog({
        title: 'Confirmar pago',
        message: `¿Confirmar la transferencia de <b>${money(p.amount)}</b> de ${esc(p.user?.name || 'este cliente')} por <b>${esc(p.concept)}</b>?`,
        confirmText: 'Confirmar pago',
        onConfirm: async () => {
          await api(`/admin/payments/${p.id}`, { method: 'PATCH', body: { status: 'confirmed' } });
          toast('Pago confirmado.');
          refresh();
        },
      });
    });
  });
  bindCopyButtons(content);
}

async function adminBookingStatus(id, status) {
  try {
    await api(`/admin/bookings/${id}`, { method: 'PATCH', body: { status } });
    toast(
      status === 'confirmed' ? 'Sesión confirmada.'
        : status === 'attended' ? 'Asistencia registrada.'
          : status === 'no_show' ? 'Inasistencia registrada.'
            : 'Estado actualizado.',
    );
    refresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ================================= AGENDA ================================ */

async function pageAgenda(content) {
  const status = state.adminAgendaStatus;
  const date = state.adminAgendaDate;
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (date) params.set('date', date);
  const data = await api(`/admin/bookings${params.toString() ? `?${params.toString()}` : ''}`);
  const bookings = data.bookings || [];
  const grouped = {};
  bookings.forEach((b) => { (grouped[b.date] ||= []).push(b); });

  content.innerHTML = `
    ${pageHead('Agenda', 'Solo el administrador puede confirmar, reagendar y registrar asistencia.', `
      <a class="btn ghost sm" href="#/admin/usuarios">${icon('users')} Usuarios</a>`)}
    <div class="toolbar">
      <div class="tabs">
        ${[['pending', 'Pendientes'], ['confirmed', 'Confirmadas'], ['all', 'Todas'], ['attended', 'Asistieron'], ['no_show', 'No asistieron'], ['cancelled', 'Canceladas']].map(([key, label]) => `
          <button class="tab ${status === key ? 'active' : ''}" type="button" data-astatus="${key}">${label}</button>`).join('')}
      </div>
      <div class="spacer"></div>
      <input type="date" class="input" id="agenda-date" value="${date}" style="max-width:170px" aria-label="Filtrar por fecha" />
      <button class="btn ghost sm" type="button" id="agenda-today">Hoy</button>
      ${date ? '<button class="btn ghost sm" type="button" id="agenda-clear">Limpiar fecha</button>' : ''}
    </div>
    ${bookings.length ? Object.keys(grouped).sort().map((day) => `
      <div class="mb-3">
        <div class="card-head" style="margin-bottom:10px">
          <div><h3>${capital(fmtDateLong(day))} ${day === todayStr() ? '<span class="badge orange">Hoy</span>' : ''}</h3><p>${grouped[day].length} sesión${grouped[day].length === 1 ? '' : 'es'}</p></div>
        </div>
        <div class="booking-list">
          ${grouped[day].map((b) => agendaCard(b)).join('')}
        </div>
      </div>`).join('') : `<div class="empty">
        <div class="ei">${icon('calendarCheck')}</div>
        <h3>Sin sesiones en esta vista</h3>
        <p>${date ? 'No hay reservas para la fecha seleccionada.' : 'No hay reservas con este estado por ahora.'}</p>
        <button class="btn sm ghost" type="button" id="agenda-see-all">Ver todas</button>
      </div>`}
  `;

  $$('[data-astatus]', content).forEach((btn) => {
    btn.addEventListener('click', () => { state.adminAgendaStatus = btn.dataset.astatus; refresh(); });
  });
  $('#agenda-date')?.addEventListener('change', (e) => {
    state.adminAgendaDate = e.target.value;
    refresh();
  });
  $('#agenda-today')?.addEventListener('click', () => {
    state.adminAgendaDate = todayStr();
    state.adminAgendaStatus = 'all';
    refresh();
  });
  $('#agenda-clear')?.addEventListener('click', () => {
    state.adminAgendaDate = '';
    refresh();
  });
  $('#agenda-see-all')?.addEventListener('click', () => {
    state.adminAgendaStatus = 'all';
    state.adminAgendaDate = '';
    refresh();
  });

  const map = new Map(bookings.map((b) => [b.id, b]));
  $$('[data-a-confirm]', content).forEach((btn) => btn.addEventListener('click', () => adminBookingStatus(btn.dataset.aConfirm, 'confirmed')));
  $$('[data-a-attend]', content).forEach((btn) => btn.addEventListener('click', () => adminBookingStatus(btn.dataset.aAttend, 'attended')));
  $$('[data-a-noshow]', content).forEach((btn) => btn.addEventListener('click', () => adminBookingStatus(btn.dataset.aNoshow, 'no_show')));
  $$('[data-a-reopen]', content).forEach((btn) => btn.addEventListener('click', () => adminBookingStatus(btn.dataset.aReopen, 'confirmed')));
  $$('[data-a-pay]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      const b = map.get(btn.dataset.aPay);
      if (!b?.payment) return;
      confirmDialog({
        title: 'Confirmar pago de la sesión',
        message: `Confirma el pago de <b>${money(b.payment.amount)}</b> de <b>${esc(b.user?.name || 'cliente')}</b> por <b>${esc(b.serviceName)}</b>.`,
        confirmText: 'Confirmar pago',
        onConfirm: async () => {
          await api(`/admin/payments/${b.payment.id}`, { method: 'PATCH', body: { status: 'confirmed' } });
          toast('Pago confirmado.');
          refresh();
        },
      });
    });
  });
  $$('[data-a-reschedule]', content).forEach((btn) => {
    const b = map.get(btn.dataset.aReschedule);
    if (b) btn.addEventListener('click', () => openAdminReschedule(b));
  });
  $$('[data-a-cancel]', content).forEach((btn) => {
    const b = map.get(btn.dataset.aCancel);
    if (!b) return;
    btn.addEventListener('click', () => {
      confirmDialog({
        title: 'Cancelar sesión',
        message: `¿Cancelar la sesión de <b>${esc(b.user?.name || 'cliente')}</b> (${esc(b.serviceName)}) del ${fmtDateLong(b.date)} a las ${b.time}?<br><br>La política del studio indica que no se realizan reembolsos.`,
        confirmText: 'Cancelar sesión',
        danger: true,
        onConfirm: async () => {
          await api(`/admin/bookings/${b.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
          toast('Sesión cancelada.');
          refresh();
        },
      });
    });
  });
  $$('[data-a-notes]', content).forEach((btn) => {
    const b = map.get(btn.dataset.aNotes);
    if (b) btn.addEventListener('click', () => openNotesModal(b));
  });
}

function agendaCard(b) {
  const isClosed = ['cancelled', 'attended', 'no_show'].includes(b.status);
  return `
    <article class="booking-card">
      <div class="booking-date">
        <div class="d">${b.time.split(':')[0]}</div>
        <div class="m">${b.time.split(':')[1]} hrs</div>
        <div class="t">${b.duration || 60} min</div>
      </div>
      <div class="booking-main">
        <h3>${esc(b.user?.name || 'Cliente')} · ${esc(b.serviceName)} ${bookingBadge(b.status)}</h3>
        <div class="meta">
          <span>${icon('mail')} ${esc(b.user?.email || '')}</span>
          ${b.user?.phone ? `<span>${icon('smartphone')} ${esc(b.user.phone)}</span>` : ''}
          <span>${icon(b.modality === 'virtual' ? 'video' : 'mapPin')} ${b.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span>
          ${b.payment ? `<span>${paymentBadge(b.payment.status)} · ${money(b.amount)}${b.payment.reference ? ` · Ref. ${esc(b.payment.reference)}` : ''}</span>` : '<span class="badge orange">Plan</span>'}
        </div>
        ${b.notes ? `<div class="notes"><b>Cliente:</b> ${esc(b.notes)}</div>` : ''}
        ${b.adminNotes ? `<div class="notes" style="background:var(--orange-soft);color:#7a4b08"><b>Nota interna:</b> ${esc(b.adminNotes)}</div>` : ''}
      </div>
      <div class="booking-actions">
        ${b.status === 'pending' ? `<button class="btn sm success" type="button" data-a-confirm="${esc(b.id)}">Confirmar</button>` : ''}
        ${['pending', 'confirmed'].includes(b.status) ? `
          <button class="btn sm ghost" type="button" data-a-attend="${esc(b.id)}">Asistió</button>
          <button class="btn sm danger-soft" type="button" data-a-noshow="${esc(b.id)}">No vino</button>` : ''}
        ${isClosed ? `<button class="btn sm ghost" type="button" data-a-reopen="${esc(b.id)}">Reabrir</button>` : ''}
        ${b.payment && ['pending', 'review'].includes(b.payment.status) ? `<button class="btn sm accent" type="button" data-a-pay="${esc(b.id)}">Confirmar pago</button>` : ''}
        ${!['cancelled', 'attended'].includes(b.status) ? `<button class="btn sm ghost" type="button" data-a-reschedule="${esc(b.id)}">Reagendar</button>` : ''}
        ${!['cancelled', 'attended', 'no_show'].includes(b.status) ? `<button class="link-btn danger" type="button" data-a-cancel="${esc(b.id)}">Cancelar</button>` : ''}
        <button class="link-btn" type="button" data-a-notes="${esc(b.id)}">Nota interna</button>
      </div>
    </article>`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function openAdminReschedule(booking) {
  let selectedTime = '';
  let currentDate = addDays(todayStr(), 1);
  openModal({
    title: 'Reagendar sesión (admin)',
    subtitle: `${booking.user?.name || 'Cliente'} · ${booking.serviceName}`,
    body: `
      <div class="alert info" style="margin-bottom:14px">${icon('shield')}<div>Como administrador puedes reagendar sin la restricción de 12 horas. La sesión quedará <b>confirmada</b> en el nuevo horario.</div></div>
      <div class="field"><label for="ar-date">Nueva fecha</label><input type="date" class="input" id="ar-date" min="${todayStr()}" value="${currentDate}" /></div>
      <div class="field" style="margin-bottom:0"><label>Horario disponible</label><div id="ar-slots" class="slots-grid">${loadingHtml('Buscando horarios…')}</div><span class="hint" id="ar-note">Selecciona un horario.</span></div>`,
    footer: `<button class="btn ghost sm" type="button" id="ar-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="ar-save" disabled>Reagendar y confirmar</button>`,
    onMount(modal) {
      const slotsEl = $('#ar-slots', modal);
      const save = $('#ar-save', modal);
      const note = $('#ar-note', modal);
      $('#ar-cancel', modal).onclick = () => closeModal();
      async function load() {
        selectedTime = '';
        save.disabled = true;
        slotsEl.className = '';
        slotsEl.innerHTML = loadingHtml('Buscando horarios…');
        try {
          const data = await api(`/availability?date=${currentDate}`);
          if (data.closed) {
            slotsEl.innerHTML = '<div class="alert">No hay atención este día.</div>';
            return;
          }
          slotsEl.className = 'slots-grid';
          slotsEl.innerHTML = data.slots.map((s) => `<button type="button" class="slot" data-time="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}</button>`).join('');
          $$('.slot', slotsEl).forEach((btn) => {
            btn.addEventListener('click', () => {
              selectedTime = btn.dataset.time;
              $$('.slot', slotsEl).forEach((b) => b.classList.remove('selected'));
              btn.classList.add('selected');
              save.disabled = false;
              note.textContent = `Nuevo horario: ${fmtDate(currentDate, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${selectedTime}.`;
            });
          });
        } catch (err) {
          slotsEl.innerHTML = `<div class="alert danger">${esc(err.message)}</div>`;
        }
      }
      $('#ar-date', modal).addEventListener('change', (e) => { currentDate = e.target.value; load(); });
      save.onclick = async () => {
        if (!selectedTime) return;
        save.disabled = true;
        save.textContent = 'Reagendando…';
        try {
          await api(`/admin/bookings/${booking.id}/reschedule`, { method: 'POST', body: { date: currentDate, time: selectedTime } });
          closeModal();
          toast('Sesión reagendada y confirmada.');
          refresh();
        } catch (err) {
          toast(err.message, 'error');
          save.disabled = false;
          save.textContent = 'Reagendar y confirmar';
        }
      };
      load();
    },
  });
}

function openNotesModal(booking) {
  openModal({
    title: 'Nota interna',
    subtitle: `${booking.user?.name || 'Cliente'} · ${fmtDate(booking.date)} ${booking.time}`,
    body: `
      <div class="field" style="margin-bottom:0">
        <label for="an-note">Nota visible para el cliente en su sesión</label>
        <textarea class="textarea" id="an-note" maxlength="800" placeholder="Ej: Traer ropa cómoda, llegar 10 minutos antes…">${esc(booking.adminNotes || '')}</textarea>
        <span class="hint">El cliente puede ver esta nota en “Mis sesiones”.</span>
      </div>`,
    footer: `<button class="btn ghost sm" type="button" id="an-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="an-save">Guardar nota</button>`,
    onMount(modal) {
      $('#an-cancel', modal).onclick = () => closeModal();
      $('#an-save', modal).onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api(`/admin/bookings/${booking.id}`, { method: 'PATCH', body: { adminNotes: $('#an-note', modal).value.trim() } });
          closeModal();
          toast('Nota guardada.');
          refresh();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    },
  });
}
