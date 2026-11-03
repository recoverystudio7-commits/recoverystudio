/* ==========================================================================
   Panel de cliente · resumen, agenda de sesiones y reserva
   ========================================================================== */

import {
  $, $$, state, api, money, esc, textHtml, icon, renderShell, pageHead, errorHtml,
  bindRetry, loadingHtml, toast, fmtDate, fmtDateLong, fmtDateTime, greeting, firstName,
  bookingBadge, paymentBadge, canUserModify, cutoffText, paymentForBooking, openTransferModal,
  bankBlock, closeModal, go, addDays, todayStr, dateTime, bindCopyButtons, confirmDialog,
  parseDate,
} from './core.js';
import {
  pagePlans, pageRoutines, pagePayments, pageProfile, openRescheduleModal, openPayModal,
} from './user-extra.js';

const TITLES = {
  '/app': ['Resumen', 'Tu proceso en Recovery Studio'],
  '/app/agendar': ['Agendar sesión', 'Elige servicio, fecha y horario'],
  '/app/sesiones': ['Mis sesiones', 'Reservas, estados y pagos'],
  '/app/planes': ['Mis planes', 'Sesiones disponibles y planes a medida'],
  '/app/rutinas': ['Mis rutinas', 'Ejercicios preparados para ti'],
  '/app/pagos': ['Pagos', 'Transferencias y comprobantes'],
  '/app/perfil': ['Mi perfil', 'Datos y seguridad de tu cuenta'],
};

export function renderUser(path, query) {
  if (!state.me) return go('/login');
  if (state.me.role === 'admin') return go('/admin');
  const [title, subtitle] = TITLES[path] || TITLES['/app'];
  const content = renderShell({ kind: 'user', active: path, title, subtitle });
  document.title = `${title} · Recovery Studio`;

  const run = (fn) => fn().catch((err) => {
    if (err.status === 401) return go('/login');
    content.innerHTML = errorHtml(err.message);
    bindRetry();
  });

  if (path === '/app/agendar') return run(() => pageBook(content, query));
  if (path === '/app/sesiones') return run(() => pageSessions(content));
  if (path === '/app/planes') return run(() => pagePlans(content));
  if (path === '/app/rutinas') return run(() => pageRoutines(content));
  if (path === '/app/pagos') return run(() => pagePayments(content));
  if (path === '/app/perfil') return run(() => pageProfile(content));
  return run(() => pageHome(content));
}

/* ------------------------------- Resumen -------------------------------- */

async function pageHome(content) {
  const [summary, routinesData] = await Promise.all([
    api('/me/summary'),
    api('/routines/mine'),
  ]);
  const next = summary.nextBooking;
  const plans = summary.activeOrders || [];
  const pending = summary.pendingPayments || [];
  const routines = routinesData.routines || [];
  const counts = summary.counts || {};

  content.innerHTML = `
    ${pageHead(`${greeting()}, ${firstName(state.me.name)}`, 'Este es tu espacio para agendar, revisar tus planes y seguir tu proceso.', `
      <a class="btn ghost sm" href="#/app/sesiones">${icon('calendarCheck')} Mis sesiones</a>
      <a class="btn sm" href="#/app/agendar">${icon('plus')} Agendar</a>`)}

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Próxima sesión <span class="kpi-icon">${icon('calendar')}</span></div>
        <div class="kpi-value" style="font-size:22px">${next ? fmtDate(next.date, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Sin agendar'}</div>
        <div class="kpi-foot">${next ? `${next.time} · ${esc(next.serviceName)}` : 'Agenda tu primera sesión'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Sesiones disponibles <span class="kpi-icon">${icon('layers')}</span></div>
        <div class="kpi-value">${counts.sessionsAvailable ?? 0}</div>
        <div class="kpi-foot">${plans.length ? `${plans.length} plan${plans.length === 1 ? '' : 'es'} activo${plans.length === 1 ? '' : 's'}` : 'Sin planes activos'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Pagos pendientes <span class="kpi-icon">${icon('card')}</span></div>
        <div class="kpi-value">${counts.pendingPayments ?? 0}</div>
        <div class="kpi-foot">${pending.length ? 'Revisa tus pagos' : 'Todo al día'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Rutinas <span class="kpi-icon">${icon('activity')}</span></div>
        <div class="kpi-value">${counts.routinesCount ?? 0}</div>
        <div class="kpi-foot">${routines.length ? esc(routines[0].title) : 'Sin rutinas asignadas'}</div>
      </div>
    </div>

    <div class="dash-grid">
      <div style="display:grid;gap:16px">
        ${next ? `
          <div class="card panel-dark card-pad">
            <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
              <div>
                <div class="eyebrow light">Tu próxima sesión</div>
                <h2 style="font-size:25px;letter-spacing:-.03em;margin:12px 0 5px">${esc(next.serviceName)}</h2>
                <p class="muted" style="font-size:13px">${fmtDateLong(next.date)} · ${next.time} hrs · ${next.modality === 'virtual' ? 'Virtual' : 'Presencial'}</p>
                <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">${bookingBadge(next.status)} ${paymentBadge(next.paymentStatus)}</div>
              </div>
              <div style="text-align:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:14px 18px;min-width:88px">
                <div style="font-size:30px;font-weight:800;line-height:1">${parseDateDay(next.date)}</div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#bcd3e6;margin-top:4px">${fmtDate(next.date, { month: 'short' })}</div>
                <div style="font-size:11px;color:#ffb27a;font-weight:750;margin-top:5px">${next.time}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
              <a class="btn sm ghost-light" href="#/app/sesiones">Ver detalle</a>
              ${next.status === 'pending' ? '<span class="badge warn" style="align-self:center">Esperando confirmación del studio</span>' : ''}
            </div>
          </div>` : `
          <div class="card card-pad" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
            <div class="service-icon" style="margin:0;width:52px;height:52px">${icon('calendar')}</div>
            <div style="flex:1;min-width:200px">
              <h3 style="font-size:18px;color:var(--navy);margin-bottom:4px">Tu próxima sesión te espera</h3>
              <p class="small muted">Elige un servicio, fecha y horario. El studio confirmará tu reserva.</p>
            </div>
            <a class="btn" href="#/app/agendar">${icon('plus')} Agendar ahora</a>
          </div>`}

        <div class="card card-pad">
          <div class="card-head"><div><h3>Mis planes activos</h3><p>Sesiones disponibles para usar al agendar.</p></div><a class="link-btn" href="#/app/planes">Ver todos</a></div>
          ${plans.length ? plans.map((o) => `
            <div style="padding:12px 0;border-bottom:1px solid var(--line)">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:7px">
                <div><b style="font-size:13px;color:var(--navy)">${esc(o.name)}</b><div class="tiny muted">${o.remaining} de ${o.sessions} sesiones disponibles</div></div>
                <span class="badge success">${o.remaining} restantes</span>
              </div>
              <div class="progress"><i style="width:${o.sessions ? Math.round((o.remaining / o.sessions) * 100) : 0}%"></i></div>
            </div>`).join('') : `<p class="small muted" style="padding:8px 0 14px">No tienes planes activos. Puedes comprar uno o crear un plan a medida.</p>
            <a class="btn soft sm" href="#/app/planes">Ver planes</a>`}
        </div>

        <div class="card card-pad">
          <div class="card-head"><div><h3>Accesos rápidos</h3></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
            <a class="option-card" href="#/app/agendar" style="text-decoration:none">${icon('calendar')}<b style="margin-top:8px">Agendar sesión</b><span>Elige día y hora</span></a>
            <a class="option-card" href="#/app/planes" style="text-decoration:none">${icon('layers')}<b style="margin-top:8px">Comprar plan</b><span>Más sesiones</span></a>
            <a class="option-card" href="#/app/rutinas" style="text-decoration:none">${icon('activity')}<b style="margin-top:8px">Mis rutinas</b><span>Ejercicios</span></a>
            <a class="option-card" href="#/app/pagos" style="text-decoration:none">${icon('card')}<b style="margin-top:8px">Mis pagos</b><span>Comprobantes</span></a>
          </div>
        </div>
      </div>

      <div style="display:grid;gap:16px">
        <div class="card card-pad">
          <div class="card-head"><div><h3>Pagos pendientes</h3><p>Informa transferencias o revisa estados.</p></div><a class="link-btn" href="#/app/pagos">Ver pagos</a></div>
          ${pending.length ? pending.map((p) => `
            <div class="agenda-item">
              <span class="dot-line" style="background:${p.status === 'review' ? 'var(--blue)' : 'var(--orange)'}"></span>
              <div class="agenda-body"><b>${esc(p.concept)}</b><span>${money(p.amount)} · ${p.status === 'review' ? 'En revisión del studio' : 'Pendiente de transferencia'}</span></div>
            </div>`).join('') : `<div class="alert success" style="padding:11px">${icon('checkCircle')}<div>No tienes pagos pendientes.</div></div>`}
        </div>

        <div class="card card-pad">
          <div class="card-head"><div><h3>Mi rutina</h3><p>Preparada por el studio.</p></div><a class="link-btn" href="#/app/rutinas">Ver rutinas</a></div>
          ${routines.length ? `
            <div style="display:flex;gap:12px;align-items:center">
              <div class="service-icon orange" style="margin:0">${icon('dumbbell')}</div>
              <div style="min-width:0"><b style="display:block;font-size:13px;color:var(--navy)">${esc(routines[0].title)}</b><span class="tiny muted">${routines[0].items.length} ejercicios · ${fmtDate(routines[0].createdAt, { day: 'numeric', month: 'short' })}</span></div>
            </div>` : `<p class="small muted">Aún no tienes una rutina asignada. Tu kinesiólogo la agregará después de tu evaluación.</p>`}
        </div>

        <div class="card panel-dark card-pad" style="text-align:left">
          <div class="eyebrow light">Recordatorio</div>
          <h3 style="font-size:16px;margin:10px 0 8px">Política de 12 horas</h3>
          <p class="muted" style="font-size:12px;line-height:1.6">Puedes cancelar o reagendar hasta ${state.config?.cancellationHours ?? 12} horas antes de tu sesión. No se realizan reembolsos.</p>
        </div>
      </div>
    </div>
  `;

  bindCopyButtons(content);
}

function parseDateDay(dateStr) {
  return String(Number(String(dateStr).split('-')[2] || 0));
}

/* ------------------------------- Agendar -------------------------------- */

async function pageBook(content, query) {
  const { orders } = await api('/orders/mine');
  const services = state.config?.services || [];
  const activePlans = orders.filter((o) => o.status === 'active' && Number(o.remaining) > 0);
  const initialService = query.get('service') || state.bookingService || sessionStorage.getItem('rs_service') || '';
  state.bookingService = null;
  sessionStorage.removeItem('rs_service');

  const base = {
    step: 1,
    serviceId: services.some((s) => s.id === initialService) ? initialService : '',
    date: addDays(todayStr(), 1),
    time: '',
    modality: 'presencial',
    planOrderId: '',
    notes: '',
    slots: [],
    closed: false,
    loadingSlots: false,
  };
  const form = { ...base };
  const selectedService = () => services.find((s) => s.id === form.serviceId);

  content.innerHTML = `${pageHead('Agendar sesión', 'Selecciona el servicio, la fecha y el horario que prefieras.')}<div class="card card-pad" id="wizard"></div>`;
  const wizard = $('#wizard');

  function draw() {
    const svc = selectedService();
    if (svc && form.modality !== 'virtual' && svc.modality === 'virtual') form.modality = 'virtual';
    wizard.innerHTML = `
      <div class="wizard-steps">
        <div class="wstep ${form.step === 1 ? 'active' : 'done'}"><span class="n">${form.step > 1 ? '✓' : '1'}</span><span>Servicio</span></div>
        <div class="wstep ${form.step === 2 ? 'active' : form.step > 2 ? 'done' : ''}"><span class="n">${form.step > 2 ? '✓' : '2'}</span><span>Fecha y hora</span></div>
        <div class="wstep ${form.step === 3 ? 'active' : ''}"><span class="n">3</span><span>Confirmar</span></div>
      </div>
      ${form.step === 1 ? stepOne() : form.step === 2 ? stepTwo() : stepThree()}
    `;
    bindStep();
    if (form.step === 2) loadSlots();
  }

  function stepOne() {
    return `
      <div class="form-note">Elige el servicio que necesitas. Todos quedan sujetos a confirmación del studio.</div>
      <div class="service-options">
        ${services.map((s) => `
          <button type="button" class="option-card ${form.serviceId === s.id ? 'selected' : ''}" data-service="${esc(s.id)}">
            <span class="check-dot"></span>
            <b>${esc(s.name)}</b>
            <span>${esc(s.description)}</span>
            <div class="price">${money(s.price)} · ${s.duration} min</div>
          </button>`).join('')}
      </div>
      <div class="wizard-actions">
        <span></span>
        <button class="btn" type="button" id="next-1" ${form.serviceId ? '' : 'disabled'}>Continuar ${icon('arrowRight')}</button>
      </div>`;
  }

  function stepTwo() {
    const svc = selectedService();
    return `
      <div class="form-grid">
        <div>
          <div class="field">
            <label for="book-date">Fecha</label>
            <input type="date" class="input" id="book-date" min="${todayStr()}" value="${form.date}" />
          </div>
          <div class="field">
            <label>Horario disponible</label>
            <div id="slots" class="slots-grid">${loadingHtml('Buscando horarios…')}</div>
            <span class="hint">Los horarios ocupados aparecen tachados.</span>
          </div>
        </div>
        <div>
          <div class="field">
            <label>Modalidad</label>
            ${svc?.modality === 'virtual'
              ? `<div class="seg"><button type="button" class="active">Virtual</button></div><span class="hint">Este servicio se realiza por videollamada.</span>`
              : `<div class="seg" id="modality-seg">
                   <button type="button" class="${form.modality === 'presencial' ? 'active' : ''}" data-modality="presencial">Presencial</button>
                   <button type="button" class="${form.modality === 'virtual' ? 'active' : ''}" data-modality="virtual">Virtual</button>
                 </div>`}
          </div>
          ${activePlans.length ? `
            <div class="field">
              <label for="book-plan">¿Cómo quieres pagar?</label>
              <select class="select" id="book-plan">
                <option value="">Pagar sesión (${money(svc?.price || 0)})</option>
                ${activePlans.map((o) => `<option value="${esc(o.id)}" ${form.planOrderId === o.id ? 'selected' : ''}>Usar plan: ${esc(o.name)} (${o.remaining} disp.)</option>`).join('')}
              </select>
              <span class="hint">Si usas un plan, se descontará 1 sesión cuando el studio confirme tu asistencia.</span>
            </div>` : ''}
          <div class="alert info" style="margin-top:12px">${icon('shield')}<div>Tu reserva quedará <b>pendiente hasta la confirmación del studio</b>. Si hay un pago, podrás informar la transferencia al finalizar.</div></div>
        </div>
      </div>
      <div class="wizard-actions">
        <button class="btn ghost" type="button" id="back-2">Atrás</button>
        <button class="btn" type="button" id="next-2" ${form.time ? '' : 'disabled'}>Continuar ${icon('arrowRight')}</button>
      </div>`;
  }

  function stepThree() {
    const svc = selectedService();
    const amount = form.planOrderId ? 0 : (svc?.price || 0);
    const plan = activePlans.find((o) => o.id === form.planOrderId);
    return `
      <div class="summary-box mb-2">
        <div class="summary-row"><span>Servicio</span><b>${esc(svc?.name || '')}</b></div>
        <div class="summary-row"><span>Fecha y hora</span><b>${fmtDateLong(form.date)} · ${form.time} hrs</b></div>
        <div class="summary-row"><span>Modalidad</span><b>${form.modality === 'virtual' ? 'Virtual' : 'Presencial'}</b></div>
        <div class="summary-row"><span>Duración</span><b>${svc?.duration || 60} minutos</b></div>
        ${plan ? `<div class="summary-row"><span>Plan utilizado</span><b>${esc(plan.name)} · 1 sesión</b></div>` : ''}
        <div class="summary-row summary-total"><span>Total a pagar</span><b>${plan ? 'Con plan' : money(amount)}</b></div>
      </div>
      <div class="field">
        <label for="book-notes">Comentarios para el studio <span class="muted">(opcional)</span></label>
        <textarea class="textarea" id="book-notes" maxlength="600" placeholder="Cuéntanos si hay algo que debamos considerar: lesión, objetivo, indicaciones…">${esc(form.notes)}</textarea>
      </div>
      <div class="alert">${icon('alert')}<div>Recuerda la política: puedes cancelar o reagendar hasta <b>${state.config?.cancellationHours ?? 12} horas antes</b>. No se realizan reembolsos.</div></div>
      <div class="wizard-actions">
        <button class="btn ghost" type="button" id="back-3">Atrás</button>
        <button class="btn accent" type="button" id="confirm-book">${icon('calendarCheck')} Solicitar reserva</button>
      </div>`;
  }

  function bindStep() {
    if (form.step === 1) {
      $$('[data-service]', wizard).forEach((btn) => {
        btn.addEventListener('click', () => {
          form.serviceId = btn.dataset.service;
          form.planOrderId = '';
          form.time = '';
          const svc = selectedService();
          if (svc?.modality === 'virtual') form.modality = 'virtual';
          draw();
        });
      });
      $('#next-1', wizard)?.addEventListener('click', () => {
        if (!form.serviceId) return;
        form.step = 2;
        draw();
      });
      return;
    }
    if (form.step === 2) {
      $('#book-date', wizard)?.addEventListener('change', (e) => {
        form.date = e.target.value;
        form.time = '';
        loadSlots();
      });
      $$('[data-modality]', wizard).forEach((btn) => {
        btn.addEventListener('click', () => {
          form.modality = btn.dataset.modality;
          $$('[data-modality]', wizard).forEach((b) => b.classList.toggle('active', b === btn));
        });
      });
      $('#book-plan', wizard)?.addEventListener('change', (e) => { form.planOrderId = e.target.value; });
      $('#back-2', wizard)?.addEventListener('click', () => { form.step = 1; draw(); });
      $('#next-2', wizard)?.addEventListener('click', () => {
        if (!form.time) return toast('Selecciona un horario.', 'error');
        form.step = 3;
        draw();
      });
      return;
    }
    $('#book-notes', wizard)?.addEventListener('input', (e) => { form.notes = e.target.value; });
    $('#back-3', wizard)?.addEventListener('click', () => { form.notes = $('#book-notes', wizard)?.value || form.notes; form.step = 2; draw(); });
    $('#confirm-book', wizard)?.addEventListener('click', submitBooking);
  }

  async function loadSlots() {
    const slotsEl = $('#slots', wizard);
    if (!slotsEl) return;
    form.loadingSlots = true;
    form.time = '';
    const nextBtn = $('#next-2', wizard);
    if (nextBtn) nextBtn.disabled = true;
    slotsEl.className = '';
    slotsEl.innerHTML = loadingHtml('Buscando horarios…');
    try {
      const data = await api(`/availability?date=${form.date}`);
      form.slots = data.slots || [];
      form.closed = data.closed;
      if (data.closed) {
        slotsEl.innerHTML = `<div class="alert">${icon('clock')}<div>No hay atención este día. Elige otra fecha.</div></div>`;
        return;
      }
      const hasAvailable = data.slots.some((s) => s.available);
      slotsEl.className = 'slots-grid';
      slotsEl.innerHTML = data.slots.map((s) => `<button type="button" class="slot" data-time="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}</button>`).join('');
      $$('#slots .slot', wizard).forEach((btn) => {
        btn.addEventListener('click', () => {
          form.time = btn.dataset.time;
          $$('#slots .slot', wizard).forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          const btnNext = $('#next-2', wizard);
          if (btnNext) btnNext.disabled = false;
        });
      });
      if (!hasAvailable) slotsEl.innerHTML = `<div class="alert">${icon('clock')}<div>No quedan horarios libres para este día. Prueba otra fecha.</div></div>`;
    } catch (err) {
      slotsEl.innerHTML = `<div class="alert danger">${esc(err.message)}</div>`;
    } finally {
      form.loadingSlots = false;
    }
  }

  async function submitBooking() {
    const btn = $('#confirm-book', wizard);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Enviando…';
    try {
      const result = await api('/bookings', {
        method: 'POST',
        body: {
          serviceId: form.serviceId,
          date: form.date,
          time: form.time,
          modality: form.modality,
          notes: form.notes,
          planOrderId: form.planOrderId || undefined,
        },
      });
      renderSuccess(result.booking, result.payment);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${icon('calendarCheck')} Solicitar reserva`;
    }
  }

  function renderSuccess(booking, payment) {
    content.innerHTML = `${pageHead('Reserva enviada', 'Tu solicitud fue registrada correctamente.')}
      <div class="card card-pad">
        <div class="success-panel">
          <div class="success-icon">${icon('check')}</div>
          <h2>¡Listo! Tu reserva está pendiente de confirmación</h2>
          <p>El studio revisará la disponibilidad y confirmará tu sesión. Te recomendamos revisar “Mis sesiones” para ver el estado.</p>
        </div>
        <div class="summary-box" style="max-width:560px;margin:22px auto 0">
          <div class="summary-row"><span>Servicio</span><b>${esc(booking.serviceName)}</b></div>
          <div class="summary-row"><span>Fecha y hora</span><b>${fmtDateLong(booking.date)} · ${booking.time} hrs</b></div>
          <div class="summary-row"><span>Modalidad</span><b>${booking.modality === 'virtual' ? 'Virtual' : 'Presencial'}</b></div>
          <div class="summary-row"><span>Estado</span><b>${bookingBadge(booking.status)}</b></div>
          <div class="summary-row summary-total"><span>Total</span><b>${booking.planOrderId ? 'Con plan' : money(booking.amount)}</b></div>
        </div>
        ${payment ? `
          <div style="max-width:560px;margin:18px auto 0">
            <div class="alert">${icon('card')}<div>Para confirmar tu pago, transfiere <b>${money(payment.amount)}</b> con los siguientes datos y luego informa el comprobante.</div></div>
            ${bankBlock(state.config?.bank, payment.amount)}
            <button class="btn accent block" type="button" id="success-transfer">${icon('check')} Ya transferí</button>
          </div>` : `
          <div class="alert info" style="max-width:560px;margin:18px auto 0">${icon('layers')}<div>Usarás 1 sesión de tu plan cuando el studio confirme tu asistencia.</div></div>`}
        <div style="display:flex;gap:9px;justify-content:center;margin-top:22px;flex-wrap:wrap">
          <a class="btn ghost" href="#/app/sesiones">Ver mis sesiones</a>
          <button class="btn" type="button" id="success-again">Agendar otra sesión</button>
        </div>
      </div>`;

    $('#success-again')?.addEventListener('click', () => {
      Object.assign(form, base, { step: 1, serviceId: '', time: '', notes: '', planOrderId: '' });
      go('/app/agendar');
    });
    $('#success-transfer')?.addEventListener('click', () => {
      openTransferModal({
        payment: { ...payment, concept: booking.serviceName },
        onDone: () => {
          const btn = $('#success-transfer');
          if (btn) { btn.disabled = true; btn.textContent = 'Transferencia informada'; }
          toast('El studio revisará tu pago.');
        },
      });
    });
    bindCopyButtons(content);
  }

  draw();
}

/* ------------------------------ Mis sesiones ---------------------------- */

async function pageSessions(content) {
  const data = await api('/bookings');
  const bookings = data.bookings || [];
  const payments = data.payments || [];
  let tab = 'upcoming';

  content.innerHTML = `
    ${pageHead('Mis sesiones', 'Revisa el estado de tus reservas, pagos y reagendamientos.', `
      <a class="btn sm" href="#/app/agendar">${icon('plus')} Agendar sesión</a>`)}
    <div class="toolbar">
      <div class="tabs">
        <button class="tab active" type="button" data-tab="upcoming">Próximas</button>
        <button class="tab" type="button" data-tab="history">Historial</button>
      </div>
      <div class="spacer"></div>
      <span class="tiny muted">Política de ${state.config?.cancellationHours ?? 12} h para cancelar o reagendar</span>
    </div>
    <div id="sessions-list"></div>
  `;

  function renderList() {
    const upcoming = bookings.filter((b) => ['pending', 'confirmed'].includes(b.status));
    const history = bookings.filter((b) => !['pending', 'confirmed'].includes(b.status));
    const list = tab === 'upcoming' ? upcoming : history;
    const wrap = $('#sessions-list');
    if (!list.length) {
      wrap.innerHTML = `<div class="empty">
        <div class="ei">${icon('calendarCheck')}</div>
        <h3>${tab === 'upcoming' ? 'No tienes sesiones próximas' : 'Aún no hay historial'}</h3>
        <p>${tab === 'upcoming' ? 'Agenda una nueva sesión y el studio confirmará tu reserva.' : 'Tus sesiones pasadas aparecerán aquí.'}</p>
        <a class="btn sm" href="#/app/agendar">Agendar sesión</a>
      </div>`;
      return;
    }
    wrap.innerHTML = `<div class="booking-list">${list.map((b) => bookingCard(b, payments)).join('')}</div>`;
    bindActions();
  }

  function bindActions() {
    $$('[data-reschedule]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = bookings.find((x) => x.id === btn.dataset.reschedule);
        if (b) openRescheduleModal(b, () => window.dispatchEvent(new HashChangeEvent('hashchange')));
      });
    });
    $$('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = bookings.find((x) => x.id === btn.dataset.cancel);
        if (!b) return;
        confirmDialog({
          title: 'Cancelar sesión',
          message: `Vas a cancelar <b>${esc(b.serviceName)}</b> del ${fmtDateLong(b.date)} a las ${b.time}.<br><br>Según la política, <b>no se realizan reembolsos</b>. Si ya pagaste, el monto no será devuelto.`,
          confirmText: 'Sí, cancelar',
          danger: true,
          onConfirm: async () => {
            await api(`/bookings/${b.id}/cancel`, { method: 'POST' });
            toast('Sesión cancelada.');
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          },
        });
      });
    });
    $$('[data-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = bookings.find((x) => x.id === btn.dataset.pay);
        const payment = paymentForBooking(b, payments);
        if (b && payment) openPayModal(b, payment, () => window.dispatchEvent(new HashChangeEvent('hashchange')));
      });
    });
  }

  $$('[data-tab]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      $$('[data-tab]', content).forEach((b) => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  renderList();
}

function bookingCard(b, payments) {
  const payment = paymentForBooking(b, payments);
  const date = parseDate(b.date);
  const day = date.getDate();
  const month = fmtDate(b.date, { month: 'short' });
  const modify = canUserModify(b);
  const isPast = ['attended', 'no_show', 'cancelled'].includes(b.status);
  return `
    <article class="booking-card">
      <div class="booking-date">
        <div class="d">${day}</div>
        <div class="m">${month}</div>
        <div class="t">${b.time}</div>
      </div>
      <div class="booking-main">
        <h3>${esc(b.serviceName)} ${bookingBadge(b.status)}</h3>
        <div class="meta">
          <span>${icon('clock')} ${b.duration || 60} min</span>
          <span>${icon(b.modality === 'virtual' ? 'video' : 'mapPin')} ${b.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span>
          <span>${payment ? paymentBadge(payment.status) : paymentBadge(b.paymentStatus)}</span>
          ${b.amount ? `<span class="amount" style="font-size:12px">${money(b.amount)}</span>` : '<span class="badge orange">Plan</span>'}
        </div>
        ${b.notes ? `<div class="notes"><b>Tu comentario:</b> ${esc(b.notes)}</div>` : ''}
        ${b.adminNotes ? `<div class="notes" style="background:var(--orange-soft);color:#7a4b08"><b>Nota del studio:</b> ${esc(b.adminNotes)}</div>` : ''}
        ${!isPast && !modify ? `<div class="tiny muted" style="margin-top:8px">${icon('clock')} Fuera del plazo de ${state.config?.cancellationHours ?? 12} h: ya no se puede reagendar ni cancelar.</div>` : ''}
      </div>
      <div class="booking-actions">
        ${b.amount ? `<div class="booking-price">${money(b.amount)}<small>${payment?.status === 'confirmed' ? 'Pagado' : payment?.status === 'review' ? 'En revisión' : 'Pago pendiente'}</small></div>` : `<div class="booking-price">Plan<small>1 sesión</small></div>`}
        ${!isPast && modify ? `<button class="btn sm ghost" type="button" data-reschedule="${esc(b.id)}">Reagendar</button>` : ''}
        ${payment && ['pending', 'rejected'].includes(payment.status) ? `<button class="btn sm accent" type="button" data-pay="${esc(b.id)}">Pagar / transferir</button>` : ''}
        ${!isPast && modify ? `<button class="link-btn danger" type="button" data-cancel="${esc(b.id)}">Cancelar sesión</button>` : ''}
      </div>
    </article>`;
}
