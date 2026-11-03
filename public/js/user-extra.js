/* ==========================================================================
   Panel de cliente · planes, rutinas, pagos y perfil
   ========================================================================== */

import {
  $, $$, state, api, money, esc, textHtml, icon, openModal, closeModal, toast,
  openTransferModal, bankBlock, orderBadge, paymentBadge, fmtDate, fmtDateTime,
  pageHead, addDays, todayStr, go, bindCopyButtons, loadingHtml,
} from './core.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

/* --------------------------- Reagendar sesión --------------------------- */

export function openRescheduleModal(booking, onDone) {
  let selectedTime = '';
  let currentDate = addDays(todayStr(), 1);
  openModal({
    title: 'Reagendar sesión',
    subtitle: `${booking.serviceName} · actualmente ${fmtDate(booking.date, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${booking.time}`,
    body: `
      <div class="alert info" style="margin-bottom:14px">
        ${icon('clock')}
        <div>Puedes reagendar hasta <b>${state.config.cancellationHours} horas antes</b>. La nueva fecha quedará <b>pendiente de confirmación</b> del studio.</div>
      </div>
      <div class="field">
        <label for="res-date">Nueva fecha</label>
        <input type="date" class="input" id="res-date" min="${todayStr()}" value="${currentDate}" />
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Horario disponible</label>
        <div id="res-slots" class="slots-grid">${loadingHtml('Buscando horarios…')}</div>
        <span class="hint" id="res-note">Selecciona un horario para continuar.</span>
      </div>`,
    footer: `<button class="btn ghost sm" type="button" id="res-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="res-submit" disabled>Confirmar reagenda</button>`,
    onMount(modal) {
      const note = $('#res-note', modal);
      const submit = $('#res-submit', modal);
      $('#res-cancel', modal).onclick = () => closeModal();
      const slotsEl = $('#res-slots', modal);

      async function loadSlots() {
        selectedTime = '';
        submit.disabled = true;
        slotsEl.className = '';
        slotsEl.innerHTML = loadingHtml('Buscando horarios…');
        try {
          const data = await api(`/availability?date=${currentDate}`);
          if (data.closed) {
            slotsEl.className = '';
            slotsEl.innerHTML = '<div class="alert">No hay atención este día. Elige otra fecha.</div>';
            return;
          }
          const available = data.slots.filter((s) => s.available);
          slotsEl.className = 'slots-grid';
          slotsEl.innerHTML = data.slots.map((s) => `
            <button type="button" class="slot" data-time="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}</button>`).join('');
          $$('.slot', slotsEl).forEach((btn) => {
            btn.addEventListener('click', () => {
              selectedTime = btn.dataset.time;
              $$('.slot', slotsEl).forEach((b) => b.classList.remove('selected'));
              btn.classList.add('selected');
              submit.disabled = false;
              note.textContent = `Nuevo horario: ${fmtDate(currentDate, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${selectedTime}.`;
            });
          });
          if (!available.length) slotsEl.innerHTML = '<div class="alert">No quedan horarios disponibles para este día. Prueba con otra fecha.</div>';
        } catch (err) {
          slotsEl.innerHTML = `<div class="alert danger">${esc(err.message)}</div>`;
        }
      }

      $('#res-date', modal).addEventListener('change', (e) => { currentDate = e.target.value; loadSlots(); });
      submit.onclick = async () => {
        if (!selectedTime) return;
        submit.disabled = true;
        submit.textContent = 'Reagendando…';
        try {
          await api(`/bookings/${booking.id}/reschedule`, { method: 'POST', body: { date: currentDate, time: selectedTime } });
          closeModal();
          toast('Solicitud de reagendamiento enviada. Espera la confirmación del studio.');
          if (onDone) onDone();
        } catch (err) {
          toast(err.message, 'error');
          submit.disabled = false;
          submit.textContent = 'Confirmar reagenda';
        }
      };
      loadSlots();
    },
  });
}

export function openPayModal(booking, payment, onDone) {
  if (!payment) {
    toast('Esta sesión no tiene un pago pendiente.', 'error');
    return;
  }
  openTransferModal({
    payment: { ...payment, concept: booking.serviceName },
    onDone,
  });
}

/* ------------------------------ Mis planes ------------------------------ */

export async function pagePlans(content) {
  const { orders } = await api('/orders/mine');
  const plans = state.config?.plans || [];
  const active = orders.filter((o) => o.status === 'active');
  const pending = orders.filter((o) => ['pending_review', 'pending_payment', 'review'].includes(o.status));
  const history = orders.filter((o) => ['completed', 'rejected', 'cancelled'].includes(o.status));
  const pendingPlanId = state.pendingPlanId || sessionStorage.getItem('rs_plan');
  state.pendingPlanId = null;
  sessionStorage.removeItem('rs_plan');

  content.innerHTML = `
    ${pageHead('Mis planes', 'Sesiones compradas, solicitudes y planes disponibles.', `
      <button class="btn ghost sm" type="button" id="new-custom-plan">${icon('plus')} Plan a medida</button>
      <a class="btn sm" href="#/app/agendar">${icon('calendar')} Agendar sesión</a>`)}

    <section class="mb-3">
      <div class="card-head"><div><h3>Mis planes activos</h3><p>Las sesiones se descuentan cuando el studio marca la sesión como asistida.</p></div></div>
      ${active.length ? `<div class="orders-grid">
        ${active.map((o) => orderCard(o, true)).join('')}
      </div>` : `<div class="empty" style="padding:28px">
        <div class="ei">${icon('layers')}</div>
        <h3>Sin planes activos</h3>
        <p>Compra un plan abajo o crea uno a tu medida para comenzar.</p>
      </div>`}
    </section>

    ${pending.length ? `<section class="mb-3">
      <div class="card-head"><div><h3>Compras en proceso</h3><p>Estas compras se activan cuando el studio confirma tu pago.</p></div></div>
      <div class="orders-grid">${pending.map((o) => orderCard(o)).join('')}</div>
    </section>` : ''}

    <section class="mb-3">
      <div class="card-head"><div><h3>Planes disponibles</h3><p>Compra por transferencia; las sesiones quedan en tu cuenta al confirmar el pago.</p></div></div>
      <div class="plans-grid">
        ${plans.map((p, i) => `
          <article class="plan-card ${i === 1 ? 'featured' : ''}">
            <div class="plan-sessions">${p.sessions} ${p.sessions === 1 ? 'sesión' : 'sesiones'}</div>
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.description)}</p>
            <div class="plan-price">${money(p.price)} <small>${money(Math.round(p.price / p.sessions))} por sesión aprox.</small></div>
            <button class="btn ${i === 1 ? '' : 'soft'}" type="button" data-buy="${esc(p.id)}">Comprar plan</button>
          </article>`).join('') || '<div class="empty"><p>No hay planes disponibles por ahora.</p></div>'}
      </div>
    </section>

    <section class="grid-2 mb-3">
      <div class="card card-pad" id="custom-plan-card">
        <div class="card-head" style="margin-bottom:12px">
          <div><h3>Crear un plan a medida</h3><p>Cuéntanos qué necesitas. El studio revisará y fijará el valor.</p></div>
        </div>
        <form id="custom-plan-form" class="custom-plan-form">
          <div class="form-error hidden" id="custom-error"></div>
          <div class="field">
            <label for="custom-name">Nombre del plan</label>
            <input class="input" id="custom-name" maxlength="90" placeholder="Ej: Rehabilitación rodilla · 6 sesiones" required />
          </div>
          <div class="field">
            <label for="custom-sessions">Cantidad de sesiones deseada</label>
            <input class="input" id="custom-sessions" type="number" min="1" max="100" value="6" required />
          </div>
          <div class="field">
            <label for="custom-desc">¿Qué quieres lograr?</label>
            <textarea class="textarea" id="custom-desc" maxlength="800" placeholder="Cuéntanos tu objetivo, tu nivel actual y cualquier detalle que el studio deba considerar." required></textarea>
          </div>
          <button class="btn" type="submit">Enviar solicitud</button>
        </form>
      </div>
      <div class="card panel-dark card-pad">
        <div class="policy-icon" style="width:42px;height:42px;border-radius:12px;background:rgba(249,115,22,.16);color:#ffb27a;display:grid;place-items:center;margin-bottom:14px">${icon('sparkles')}</div>
        <h3>Así funciona un plan a medida</h3>
        <div class="policy-list">
          <div>${icon('check')}<span>Envías tu solicitud con lo que necesitas.</span></div>
          <div>${icon('check')}<span>El studio revisa, ajusta sesiones y fija el valor.</span></div>
          <div>${icon('check')}<span>Transfieres e informas el comprobante en tu panel.</span></div>
          <div>${icon('check')}<span>Al confirmar el pago, tus sesiones quedan disponibles.</span></div>
        </div>
      </div>
    </section>

    ${pending.filter((o) => o.kind === 'custom').length ? `<section class="mb-3">
      <div class="card-head"><div><h3>Solicitudes a medida</h3><p>Seguimiento de las solicitudes enviadas al studio.</p></div></div>
      <div class="orders-grid">${pending.filter((o) => o.kind === 'custom').map((o) => orderCard(o)).join('')}</div>
    </section>` : ''}

    ${history.length ? `<section>
      <div class="card-head"><div><h3>Historial</h3></div></div>
      <div class="orders-grid">${history.map((o) => orderCard(o)).join('')}</div>
    </section>` : ''}
  `;

  content.querySelector('#new-custom-plan')?.addEventListener('click', () => {
    $('#custom-name')?.focus();
    $('#custom-plan-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $$('[data-buy]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = plans.find((p) => p.id === btn.dataset.buy);
      if (plan) openBuyPlanModal(plan);
    });
  });

  $$('[data-order-pay]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = orders.find((o) => o.id === btn.dataset.orderPay);
      const payment = order?.payments?.find((p) => p.status !== 'confirmed') || order?.payments?.[0];
      if (payment) openTransferModal({ payment: { ...payment, concept: order.name }, onDone: refresh });
    });
  });

  $$('[data-order-agendar]', content).forEach((btn) => {
    btn.addEventListener('click', () => go('/app/agendar'));
  });

  $('#custom-plan-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#custom-error');
    error.classList.add('hidden');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      await api('/orders/custom', {
        method: 'POST',
        body: {
          name: $('#custom-name').value.trim(),
          sessions: Number($('#custom-sessions').value),
          description: $('#custom-desc').value.trim(),
        },
      });
      toast('Solicitud enviada. El studio la revisará y te avisará el valor.');
      refresh();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Enviar solicitud';
    }
  });

  if (sessionStorage.getItem('rs_custom')) {
    sessionStorage.removeItem('rs_custom');
    setTimeout(() => $('#custom-name')?.focus(), 100);
  }
  if (pendingPlanId) {
    const plan = plans.find((p) => p.id === pendingPlanId);
    if (plan) openBuyPlanModal(plan);
  }
  bindCopyButtons(content);
}

function orderCard(order, activeCard = false) {
  const p = order.payments?.find((x) => x.status === 'confirmed') || order.payments?.[0] || null;
  const remaining = Number(order.remaining ?? order.sessions ?? 0);
  const sessions = Number(order.sessions || 0);
  const used = Math.max(0, sessions - remaining);
  const progress = sessions ? Math.round((remaining / sessions) * 100) : 0;
  const paymentPending = p && ['pending', 'rejected'].includes(p.status);
  const paymentReview = p && p.status === 'review';
  return `
    <article class="order-card">
      <div class="oc-head">
        <div>
          <h4>${esc(order.name)}</h4>
          <span class="tiny muted">${order.kind === 'custom' ? 'Plan a medida' : 'Plan de sesiones'}</span>
        </div>
        ${orderBadge(order.status)}
      </div>
      ${order.description ? `<p class="desc">${esc(order.description)}</p>` : ''}
      ${order.status === 'active' || order.status === 'completed' ? `
        <div class="progress ${activeCard ? '' : 'orange'}"><i style="width:${progress}%"></i></div>
        <div class="plan-stats" style="margin-top:7px">
          <span><b>${remaining}</b> de ${sessions} sesiones disponibles</span>
          <span>${used} usadas</span>
        </div>` : ''}
      ${order.status === 'pending_review' ? `<div class="alert" style="padding:9px 11px">${icon('clock')}<div>El studio está revisando tu solicitud y fijará el valor.</div></div>` : ''}
      ${order.status === 'review' ? `<div class="alert info" style="padding:9px 11px">${icon('clock')}<div>Transferencia informada. El studio confirmará el pago para activar tus sesiones.</div></div>` : ''}
      ${order.price > 0 ? `<div class="summary-row" style="margin-top:8px"><span>Valor del plan</span><b>${money(order.price)}</b></div>` : ''}
      ${paymentReview && p ? `<div class="summary-row"><span>Referencia informada</span><b>${esc(p.reference || '—')}</b></div>` : ''}
      <div class="oc-foot">
        <span class="tiny muted">${fmtDate(order.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        ${paymentPending && order.status !== 'rejected' ? `<button class="btn sm accent" type="button" data-order-pay="${esc(order.id)}">Informar transferencia</button>`
          : order.status === 'active' ? `<button class="btn sm soft" type="button" data-order-agendar="${esc(order.id)}">Agendar sesión</button>`
          : ''}
      </div>
    </article>`;
}

function openBuyPlanModal(plan) {
  openModal({
    title: `Comprar ${plan.name}`,
    subtitle: `${plan.sessions} ${plan.sessions === 1 ? 'sesión' : 'sesiones'} · ${money(plan.price)}`,
    body: `
      <div class="summary-box" style="margin-bottom:14px">
        <div class="summary-row"><span>Plan</span><b>${esc(plan.name)}</b></div>
        <div class="summary-row"><span>Sesiones</span><b>${plan.sessions}</b></div>
        <div class="summary-row summary-total"><span>Total a transferir</span><b>${money(plan.price)}</b></div>
      </div>
      ${bankBlock(state.config?.bank, plan.price)}
      <div class="alert info" style="margin-top:12px">${icon('alert')}<div>Al continuar se crea tu solicitud de compra. Luego podrás informar la transferencia y el studio activará tus sesiones al confirmar el pago.</div></div>`,
    footer: `<button class="btn ghost sm" type="button" id="buy-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="buy-confirm">Crear solicitud de compra</button>`,
    onMount(modal) {
      $('#buy-cancel', modal).onclick = () => closeModal();
      $('#buy-confirm', modal).onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Creando…';
        try {
          const result = await api('/orders', { method: 'POST', body: { planId: plan.id } });
          closeModal();
          toast('Solicitud creada. Ahora informa tu transferencia.');
          if (result.payment) {
            openTransferModal({
              payment: { ...result.payment, concept: plan.name },
              onDone: refresh,
            });
          } else {
            refresh();
          }
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Crear solicitud de compra';
        }
      };
    },
  });
}

/* ------------------------------- Rutinas -------------------------------- */

export async function pageRoutines(content) {
  const { routines } = await api('/routines/mine');
  content.innerHTML = `
    ${pageHead('Mis rutinas', 'Rutinas y ejercicios preparados por tu kinesiólogo.')}
    ${routines.length ? `<div style="display:grid;gap:12px">
      ${routines.map((r, i) => `
        <article class="routine-card ${i === 0 ? 'open' : ''}">
          <div class="routine-head" data-routine-toggle>
            <div>
              <h3>${esc(r.title)}</h3>
              <p>${fmtDate(r.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })} · ${r.items.length} ejercicios</p>
            </div>
            <button class="routine-toggle" type="button" aria-label="Ver rutina">${icon('chevronDown')}</button>
          </div>
          <div class="routine-body">
            ${r.description ? `<p class="routine-desc">${textHtml(r.description)}</p>` : ''}
            <div class="routine-items">
              <div class="routine-item head"><span>Ejercicio</span><span>Series</span><span>Reps</span><span>Descanso</span><span>Indicación</span></div>
              ${r.items.map((it) => `
                <div class="routine-item">
                  <b>${esc(it.name)}</b>
                  <span>${esc(it.sets || '—')}</span>
                  <span>${esc(it.reps || '—')}</span>
                  <span>${esc(it.rest || '—')}</span>
                  <span>${esc(it.notes || '—')}</span>
                </div>`).join('')}
            </div>
            <p class="footer-note">Si sientes dolor agudo o molestias durante un ejercicio, detente y contacta al studio.</p>
          </div>
        </article>`).join('')}
    </div>` : `<div class="empty">
      <div class="ei">${icon('activity')}</div>
      <h3>Aún no tienes rutinas</h3>
      <p>Cuando tu kinesiólogo prepare una rutina para ti, aparecerá aquí con todos los ejercicios e indicaciones.</p>
      <a class="btn sm" href="#/app/agendar">Agendar una sesión</a>
    </div>`}
  `;
  $$('[data-routine-toggle]', content).forEach((head) => {
    head.addEventListener('click', () => head.closest('.routine-card').classList.toggle('open'));
  });
}

/* -------------------------------- Pagos --------------------------------- */

export async function pagePayments(content) {
  const data = await api('/payments/mine');
  const payments = data.payments || [];
  const bank = data.bank || state.config?.bank;
  const pending = payments.filter((p) => ['pending', 'rejected'].includes(p.status));
  content.innerHTML = `
    ${pageHead('Pagos', 'Transferencias, comprobantes y estado de cada pago.')}
    <div class="grid-2 mb-3">
      <div class="card card-pad">
        <div class="card-head"><div><h3>Datos para transferir</h3><p>Recuerda informar el comprobante después de pagar.</p></div></div>
        ${bankBlock(bank)}
        <p class="footer-note">Si ya realizaste una transferencia y no aparece, revisa que hayas usado el botón “Ya transferí” en la sesión o plan correspondiente.</p>
      </div>
      <div class="card panel-dark card-pad">
        <h3>Política de pagos</h3>
        <div class="policy-list">
          <div>${icon('check')}<span>Los pagos se confirman manualmente por el studio.</span></div>
          <div>${icon('check')}<span>Una sesión queda agendada, pero pendiente de confirmación hasta validar el pago.</span></div>
          <div>${icon('x')}<span>No se realizan reembolsos por cancelaciones fuera de plazo o inasistencias.</span></div>
          <div>${icon('clock')}<span>Puedes cancelar o reagendar hasta ${state.config?.cancellationHours ?? 12} horas antes.</span></div>
        </div>
      </div>
    </div>

    ${pending.length ? `<div class="alert" style="margin-bottom:14px">${icon('alert')}<div>Tienes <b>${pending.length}</b> pago${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'} de informar o confirmar.</div></div>` : ''}

    ${payments.length ? `<div class="table-wrap">
      <table class="data payments-table">
        <thead><tr><th>Pago</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${payments.map((p) => `
            <tr>
              <td><div class="pay-cell"><b>${esc(p.concept)}</b><span>${p.kind === 'booking' ? 'Sesión' : 'Plan de sesiones'} · ${fmtDate(p.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })}</span>${p.reference ? `<span>Ref. ${esc(p.reference)}</span>` : ''}</div></td>
              <td class="amount">${money(p.amount)}</td>
              <td>${paymentBadge(p.status)}</td>
              <td class="row-actions">
                ${['pending', 'rejected'].includes(p.status) ? `<button class="btn sm accent" type="button" data-pay-transfer="${esc(p.id)}">Ya transferí</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `<div class="empty">
      <div class="ei">${icon('card')}</div>
      <h3>Sin pagos todavía</h3>
      <p>Cuando agendes una sesión o compres un plan, el pago aparecerá aquí.</p>
      <a class="btn sm" href="#/app/agendar">Agendar sesión</a>
    </div>`}
  `;

  $$('[data-pay-transfer]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = payments.find((x) => x.id === btn.dataset.payTransfer);
      if (p) openTransferModal({ payment: p, bank, onDone: refresh });
    });
  });
  bindCopyButtons(content);
}

/* -------------------------------- Perfil -------------------------------- */

export async function pageProfile(content) {
  const me = state.me;
  content.innerHTML = `
    ${pageHead('Mi perfil', 'Tus datos de cuenta y seguridad.')}
    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-head"><div><h3>Datos personales</h3><p>Así te verá el studio en tus reservas.</p></div></div>
        <form id="profile-form">
          <div class="field">
            <label for="p-name">Nombre completo</label>
            <input class="input" id="p-name" value="${esc(me.name)}" maxlength="80" required />
          </div>
          <div class="field">
            <label for="p-email">Correo electrónico</label>
            <input class="input" id="p-email" value="${esc(me.email)}" title="${esc(me.email)}" style="font-size:12px" disabled />
            <span class="hint">Para cambiar tu correo, contacta al studio.</span>
          </div>
          <div class="field">
            <label for="p-phone">Teléfono</label>
            <input class="input" id="p-phone" value="${esc(me.phone || '')}" maxlength="30" placeholder="+56 9 1234 5678" />
          </div>
          <button class="btn" type="submit">Guardar cambios</button>
        </form>
      </div>
      <div>
        <div class="card card-pad mb-2">
          <div class="card-head"><div><h3>Seguridad</h3><p>Cambia tu contraseña o PIN cuando lo necesites.</p></div></div>
          <form id="password-form">
            <div class="form-error hidden" id="pass-error"></div>
            <div class="field">
              <label for="cur-pass">Contraseña o PIN actual</label>
              <input class="input" id="cur-pass" type="password" autocomplete="current-password" required />
            </div>
            <div class="field">
              <label for="new-pass">Nueva contraseña o PIN</label>
              <input class="input" id="new-pass" type="password" autocomplete="new-password" minlength="4" required />
            </div>
            <button class="btn ghost" type="submit">Actualizar contraseña</button>
          </form>
        </div>
        <div class="card card-pad">
          <h3 style="font-size:14px;color:var(--navy);margin-bottom:8px">Información de la cuenta</h3>
          <div class="summary-row"><span>Miembro desde</span><b>${fmtDate(me.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
          <div class="summary-row"><span>Rol</span><b>Cliente</b></div>
          <div class="summary-row"><span>Privacidad</span><b>Solo tú y el studio</b></div>
          <p class="footer-note">Tus sesiones, pagos y rutinas son privados. Ningún otro cliente puede ver tu información.</p>
        </div>
      </div>
    </div>
  `;

  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const data = await api('/me', {
        method: 'PATCH',
        body: { name: $('#p-name').value.trim(), phone: $('#p-phone').value.trim() },
      });
      state.me = data.user;
      toast('Datos actualizados.');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  });

  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#pass-error');
    error.classList.add('hidden');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Actualizando…';
    try {
      const data = await api('/me', {
        method: 'PATCH',
        body: { currentPassword: $('#cur-pass').value, newPassword: $('#new-pass').value },
      });
      state.me = data.user;
      toast('Contraseña actualizada.');
      e.target.reset();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Actualizar contraseña';
    }
  });
}
