/* ==========================================================================
   Administración · usuarios, planes/servicios y rutinas
   ========================================================================== */

import {
  $, $$, state, api, money, esc, textHtml, icon, toast, openModal, closeModal,
  confirmDialog, pageHead, fmtDate, fmtDateLong, fmtDateTime, orderBadge, paymentBadge,
  bookingBadge, bindCopyButtons, go, addDays, todayStr, openTransferModal,
} from './core.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

/* ================================ USUARIOS =============================== */

export async function pageAdminUsers(content) {
  const data = await api('/admin/users');
  const users = data.users || [];
  content.innerHTML = `
    ${pageHead('Usuarios', 'Clientes registrados, sus sesiones, planes y pagos.', `
      <button class="btn sm" type="button" id="add-user">${icon('plus')} Nuevo usuario</button>`)}
    <div class="toolbar">
      <div class="search-box">${icon('search')}<input class="input" id="user-search" placeholder="Buscar por nombre, correo o teléfono…" /></div>
      <div class="spacer"></div>
      <span class="tiny muted" id="user-count">${users.length} usuario${users.length === 1 ? '' : 's'}</span>
    </div>
    ${users.length ? `<div class="table-wrap">
      <table class="data users-table">
        <thead><tr><th>Cliente</th><th>Sesiones</th><th>Planes</th><th>Pagado</th><th></th></tr></thead>
        <tbody id="users-body">
          ${users.map((u) => `
            <tr data-search="${esc(`${u.name} ${u.email} ${u.phone || ''}`.toLowerCase())}">
              <td><div class="table-user"><span class="avatar">${esc(initialsOf(u.name))}</span><div class="table-user-meta"><b>${esc(u.name)} ${u.active ? '' : '<span class="badge muted">Inactivo</span>'}</b><span>${esc(u.email)}</span><span>${esc(u.phone || 'Sin teléfono')} · Desde ${fmtDate(u.createdAt, { month: 'short', year: 'numeric' })}</span></div></div></td>
              <td><b>${u.stats.bookings}</b> <span class="tiny muted">${u.stats.bookings === 1 ? 'sesión' : 'sesiones'}</span><br><span class="tiny muted">${u.stats.attended} asist. · ${u.stats.noShow} aus.</span></td>
              <td>${u.stats.activePlans ? `<span class="badge orange">${u.stats.activePlans} activo${u.stats.activePlans === 1 ? '' : 's'}</span><br><span class="tiny muted">${u.stats.remaining} sesiones</span>` : '<span class="tiny muted">Sin plan activo</span>'}</td>
              <td class="amount">${money(u.stats.paid)}</td>
              <td class="row-actions"><button class="btn sm ghost" type="button" data-view-user="${esc(u.id)}">Ver ficha</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `<div class="empty">
      <div class="ei">${icon('users')}</div>
      <h3>Aún no hay clientes registrados</h3>
      <p>Los clientes aparecen aquí cuando crean su cuenta. También puedes crear uno manualmente.</p>
      <button class="btn sm" type="button" id="add-user-empty">${icon('plus')} Crear usuario</button>
    </div>`}
  `;

  $('#add-user')?.addEventListener('click', () => openAddUserModal());
  $('#add-user-empty')?.addEventListener('click', () => openAddUserModal());
  $$('[data-view-user]', content).forEach((btn) => {
    btn.addEventListener('click', () => openUserDetail(btn.dataset.viewUser));
  });

  $('#user-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    let visible = 0;
    $$('#users-body tr').forEach((tr) => {
      const match = tr.dataset.search.includes(q);
      tr.style.display = match ? '' : 'none';
      if (match) visible += 1;
    });
    $('#user-count').textContent = `${visible} usuario${visible === 1 ? '' : 's'}`;
  });
}

function initialsOf(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function openAddUserModal() {
  openModal({
    title: 'Nuevo usuario',
    subtitle: 'Crea una cuenta para un cliente que aún no se registra.',
    body: `
      <div class="form-error hidden" id="nu-error"></div>
      <div class="field"><label for="nu-name">Nombre completo</label><input class="input" id="nu-name" maxlength="80" required /></div>
      <div class="field"><label for="nu-email">Correo</label><input class="input" id="nu-email" type="email" required /></div>
      <div class="field"><label for="nu-phone">Teléfono</label><input class="input" id="nu-phone" maxlength="30" /></div>
      <div class="field" style="margin-bottom:0"><label for="nu-pass">Contraseña o PIN inicial</label><input class="input" id="nu-pass" minlength="4" placeholder="Mínimo 4 caracteres" required /><span class="hint">Compártela con el cliente; puede cambiarla después.</span></div>`,
    footer: `<button class="btn ghost sm" type="button" id="nu-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="nu-save">Crear usuario</button>`,
    onMount(modal) {
      $('#nu-cancel', modal).onclick = () => closeModal();
      $('#nu-save', modal).onclick = async (e) => {
        const error = $('#nu-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Creando…';
        try {
          await api('/admin/users', {
            method: 'POST',
            body: {
              name: $('#nu-name', modal).value.trim(),
              email: $('#nu-email', modal).value.trim(),
              phone: $('#nu-phone', modal).value.trim(),
              password: $('#nu-pass', modal).value,
            },
          });
          closeModal();
          toast('Usuario creado.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Crear usuario';
        }
      };
      setTimeout(() => $('#nu-name', modal)?.focus(), 80);
    },
  });
}

async function openUserDetail(id) {
  const data = await api(`/admin/users/${id}`);
  const u = data.user;
  const activeOrders = data.orders.filter((o) => o.status === 'active');
  const paid = data.payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount || 0), 0);
  openModal({
    title: u.name,
    subtitle: `${u.email}${u.phone ? ` · ${u.phone}` : ''}`,
    size: 'xwide',
    body: `
      <div class="user-detail-head">
        <span class="avatar">${esc(initialsOf(u.name))}</span>
        <div style="flex:1">
          <h3>${esc(u.name)} ${u.active ? '<span class="badge success">Activo</span>' : '<span class="badge muted">Inactivo</span>'}</h3>
          <p>Cliente desde ${fmtDate(u.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
      <div class="mini-stats">
        <div class="mini-stat"><b>${data.bookings.length}</b><span>Sesiones</span></div>
        <div class="mini-stat"><b>${data.bookings.filter((b) => b.status === 'attended').length}</b><span>Asistió</span></div>
        <div class="mini-stat"><b>${activeOrders.length}</b><span>Planes activos</span></div>
        <div class="mini-stat"><b>${money(paid)}</b><span>Pagado</span></div>
      </div>
      <div class="detail-actions">
        <button class="btn sm ghost" type="button" id="ud-edit">${icon('edit')} Editar datos</button>
        <button class="btn sm ghost" type="button" id="ud-pin">${icon('key')} Cambiar PIN</button>
        <button class="btn sm soft" type="button" id="ud-routine">${icon('activity')} Crear rutina</button>
        <button class="btn sm ${u.active ? 'danger-soft' : 'success'}" type="button" id="ud-toggle">${icon(u.active ? 'ban' : 'check')} ${u.active ? 'Desactivar' : 'Activar'}</button>
      </div>

      <div class="detail-section">
        <h4>Sesiones recientes</h4>
        ${data.bookings.length ? `<div class="detail-list">
          ${data.bookings.slice(0, 8).map((b) => `
            <div class="detail-row">
              <div><b>${esc(b.serviceName)}</b><br><span>${fmtDate(b.date)} · ${b.time} hrs</span></div>
              <div style="display:flex;gap:6px;align-items:center">${bookingBadge(b.status)}${b.paymentStatus && b.paymentStatus !== 'none' ? paymentBadge(b.paymentStatus) : ''}</div>
            </div>`).join('')}
        </div>` : '<p class="small muted">Sin sesiones registradas.</p>'}
      </div>

      <div class="detail-section">
        <h4>Planes</h4>
        ${data.orders.length ? `<div class="detail-list">
          ${data.orders.map((o) => `
            <div class="detail-row">
              <div><b>${esc(o.name)}</b><br><span>${o.remaining} de ${o.sessions} sesiones disponibles · ${money(o.price)}</span></div>
              ${orderBadge(o.status)}
            </div>`).join('')}
        </div>` : '<p class="small muted">Sin planes comprados.</p>'}
      </div>

      <div class="detail-section">
        <h4>Pagos</h4>
        ${data.payments.length ? `<div class="detail-list">
          ${data.payments.slice(0, 6).map((p) => `
            <div class="detail-row">
              <div><b>${esc(p.concept)}</b><br><span>${money(p.amount)} · ${fmtDate(p.createdAt, { day: 'numeric', month: 'short' })}${p.reference ? ` · Ref. ${esc(p.reference)}` : ''}</span></div>
              ${paymentBadge(p.status)}
            </div>`).join('')}
        </div>` : '<p class="small muted">Sin pagos registrados.</p>'}
      </div>

      <div class="detail-section">
        <h4>Rutinas</h4>
        ${data.routines.length ? `<div class="detail-list">
          ${data.routines.map((r) => `<div class="detail-row"><div><b>${esc(r.title)}</b><br><span>${r.items.length} ejercicio${r.items.length === 1 ? '' : 's'} · ${fmtDate(r.createdAt)}</span></div><span class="badge blue">Asignada</span></div>`).join('')}
        </div>` : '<p class="small muted">Sin rutinas asignadas.</p>'}
      </div>`,
    footer: `<button class="btn ghost sm" type="button" id="ud-close">Cerrar</button>`,
    onMount(modal) {
      $('#ud-close', modal).onclick = () => closeModal();
      $('#ud-edit', modal).onclick = () => { closeModal(); openEditUserModal(u); };
      $('#ud-pin', modal).onclick = () => { closeModal(); openResetPinModal(u); };
      $('#ud-routine', modal).onclick = () => {
        closeModal();
        openRoutineModal({ userId: u.id, userName: u.name, onDone: refresh });
      };
      $('#ud-toggle', modal).onclick = () => {
        closeModal();
        confirmDialog({
          title: u.active ? 'Desactivar usuario' : 'Activar usuario',
          message: u.active
            ? `El usuario <b>${esc(u.name)}</b> no podrá iniciar sesión ni agendar. Su historial se conserva.`
            : `El usuario <b>${esc(u.name)}</b> podrá volver a iniciar sesión.`,
          confirmText: u.active ? 'Desactivar' : 'Activar',
          danger: u.active,
          onConfirm: async () => {
            await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
            toast(u.active ? 'Usuario desactivado.' : 'Usuario activado.');
            refresh();
          },
        });
      };
    },
  });
}

function openEditUserModal(u) {
  openModal({
    title: 'Editar usuario',
    body: `
      <div class="form-error hidden" id="eu-error"></div>
      <div class="field"><label for="eu-name">Nombre</label><input class="input" id="eu-name" value="${esc(u.name)}" maxlength="80" /></div>
      <div class="field"><label for="eu-email">Correo</label><input class="input" id="eu-email" type="email" value="${esc(u.email)}" /></div>
      <div class="field" style="margin-bottom:0"><label for="eu-phone">Teléfono</label><input class="input" id="eu-phone" value="${esc(u.phone || '')}" maxlength="30" /></div>`,
    footer: `<button class="btn ghost sm" type="button" id="eu-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="eu-save">Guardar cambios</button>`,
    onMount(modal) {
      $('#eu-cancel', modal).onclick = () => closeModal();
      $('#eu-save', modal).onclick = async (e) => {
        const error = $('#eu-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api(`/admin/users/${u.id}`, {
            method: 'PATCH',
            body: {
              name: $('#eu-name', modal).value.trim(),
              email: $('#eu-email', modal).value.trim(),
              phone: $('#eu-phone', modal).value.trim(),
            },
          });
          closeModal();
          toast('Datos actualizados.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
    },
  });
}

function openResetPinModal(u) {
  openModal({
    title: 'Cambiar contraseña o PIN',
    subtitle: u.email,
    body: `
      <div class="form-error hidden" id="rp-error"></div>
      <div class="field" style="margin-bottom:0"><label for="rp-pass">Nueva contraseña o PIN</label><input class="input" id="rp-pass" minlength="4" placeholder="Mínimo 4 caracteres" /><span class="hint">El usuario deberá usar esta clave en su próximo ingreso.</span></div>`,
    footer: `<button class="btn ghost sm" type="button" id="rp-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="rp-save">Actualizar</button>`,
    onMount(modal) {
      $('#rp-cancel', modal).onclick = () => closeModal();
      $('#rp-save', modal).onclick = async (e) => {
        const error = $('#rp-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { newPassword: $('#rp-pass', modal).value } });
          closeModal();
          toast('Contraseña actualizada.');
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
    },
  });
}

/* ================================ PLANES ================================= */

export async function pageAdminPlans(content) {
  const [planData, serviceData, orderData] = await Promise.all([
    api('/admin/plans'),
    api('/admin/services'),
    api('/admin/orders'),
  ]);
  const plans = planData.plans || [];
  const duplicates = planData.duplicates || [];
  const services = serviceData.services || [];
  const customOrders = (orderData.orders || []).filter((o) => o.kind === 'custom');
  const pendingCustom = customOrders.filter((o) => o.status === 'pending_review');
  const tab = state.adminPlanTab || 'plans';

  content.innerHTML = `
    ${pageHead('Planes y servicios', 'Edita sesiones, valores y descripciones. Mantén el catálogo sin duplicados.', `
      <button class="btn ghost sm" type="button" id="new-custom-view">${icon('sparkles')} Solicitudes a medida ${pendingCustom.length ? `<span class="badge orange">${pendingCustom.length}</span>` : ''}</button>
      <button class="btn sm" type="button" id="new-plan">${icon('plus')} Nuevo plan</button>`)}
    <div class="toolbar">
      <div class="tabs">
        <button class="tab ${tab === 'plans' ? 'active' : ''}" type="button" data-ptab="plans">Planes (${plans.length})</button>
        <button class="tab ${tab === 'services' ? 'active' : ''}" type="button" data-ptab="services">Servicios (${services.length})</button>
        <button class="tab ${tab === 'custom' ? 'active' : ''}" type="button" data-ptab="custom">A medida (${pendingCustom.length})</button>
      </div>
      <div class="spacer"></div>
      <span class="tiny muted">Los cambios se reflejan de inmediato en el sitio.</span>
    </div>
    <div id="plans-panel"></div>
  `;

  const panel = $('#plans-panel');
  const draw = () => {
    if (tab === 'plans') drawPlans();
    else if (tab === 'services') drawServices();
    else drawCustom();
  };

  $$('[data-ptab]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPlanTab = btn.dataset.ptab;
      refresh();
    });
  });
  $('#new-plan')?.addEventListener('click', () => {
    if (tab === 'services') openServiceModal();
    else if (tab === 'custom') openApproveOrderModal(pendingCustom[0] || null);
    else openPlanModal();
  });
  $('#new-custom-view')?.addEventListener('click', () => { state.adminPlanTab = 'custom'; refresh(); });

  function drawPlans() {
    panel.innerHTML = `
      ${duplicates.length ? `<div class="alert dup-alert">${icon('alert')}
        <div style="flex:1">
          <b>Se detectaron nombres de planes duplicados.</b> Revisa y elimina los repetidos para mantener el catálogo limpio.
          <div class="dup-list">
            ${duplicates.map((d) => `<div><span><b>${esc(d.name)}</b> · ${d.ids.length} planes</span><button class="btn sm danger-soft" type="button" data-clean-dup="${esc(d.name)}">Dejar uno</button></div>`).join('')}
          </div>
        </div>
      </div>` : ''}
      <div class="admin-grid">
        ${plans.map((p) => `
          <article class="admin-item-card ${p.active === false ? 'inactive' : ''}">
            <div class="oc-head"><h3>${esc(p.name)}</h3><span class="badge ${p.active === false ? 'muted' : 'success'}">${p.active === false ? 'Inactivo' : 'Activo'}</span></div>
            <p>${esc(p.description || 'Sin descripción.')}</p>
            <div class="ai-meta"><span class="ai-price">${money(p.price)}</span><span class="ai-sub">${p.sessions} ${p.sessions === 1 ? 'sesión' : 'sesiones'} · ${money(Math.round(p.price / p.sessions))} c/u</span></div>
            <div class="ai-actions">
              <button class="btn sm ghost" type="button" data-edit-plan="${esc(p.id)}">${icon('edit')} Editar</button>
              <button class="btn sm danger-soft" type="button" data-del-plan="${esc(p.id)}">${icon('trash')} Eliminar</button>
            </div>
          </article>`).join('') || '<div class="empty"><p>No hay planes. Crea el primero.</p></div>'}
      </div>`;

    $$('[data-edit-plan]', panel).forEach((btn) => {
      const plan = plans.find((p) => p.id === btn.dataset.editPlan);
      if (plan) btn.addEventListener('click', () => openPlanModal(plan));
    });
    $$('[data-del-plan]', panel).forEach((btn) => {
      const plan = plans.find((p) => p.id === btn.dataset.delPlan);
      if (!plan) return;
      btn.addEventListener('click', () => {
        confirmDialog({
          title: 'Eliminar plan',
          message: `¿Eliminar <b>${esc(plan.name)}</b>? Las compras ya realizadas conservan su nombre y sesiones. Esta acción no se puede deshacer.`,
          confirmText: 'Eliminar',
          danger: true,
          onConfirm: async () => {
            await api(`/admin/plans/${plan.id}`, { method: 'DELETE' });
            toast('Plan eliminado.');
            refresh();
          },
        });
      });
    });
    $$('[data-clean-dup]', panel).forEach((btn) => {
      const group = duplicates.find((d) => d.name === btn.dataset.cleanDup);
      if (!group) return;
      btn.addEventListener('click', () => {
        confirmDialog({
          title: 'Eliminar duplicados',
          message: `Se eliminarán <b>${group.ids.length - 1}</b> copia(s) de <b>${esc(group.name)}</b> y se conservará el plan más antiguo. Las compras existentes no se ven afectadas.`,
          confirmText: 'Limpiar duplicados',
          danger: true,
          onConfirm: async () => {
            for (const id of group.ids.slice(1)) {
              await api(`/admin/plans/${id}`, { method: 'DELETE' });
            }
            toast('Duplicados eliminados.');
            refresh();
          },
        });
      });
    });
  }

  function drawServices() {
    panel.innerHTML = `
      <div class="alert info" style="margin-bottom:16px">${icon('alert')}<div>Los servicios son las atenciones que los clientes pueden agendar. Cambia precios, duración y descripción cuando lo necesites.</div></div>
      <div class="admin-grid">
        ${services.map((s) => `
          <article class="admin-item-card ${s.active === false ? 'inactive' : ''}">
            <div class="oc-head"><h3>${esc(s.name)}</h3><span class="badge ${s.active === false ? 'muted' : 'success'}">${s.active === false ? 'Inactivo' : 'Activo'}</span></div>
            <p>${esc(s.description || 'Sin descripción.')}</p>
            <div class="ai-meta"><span class="ai-price">${money(s.price)}</span><span class="ai-sub">${s.duration} min · ${s.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span></div>
            <div class="ai-actions">
              <button class="btn sm ghost" type="button" data-edit-service="${esc(s.id)}">${icon('edit')} Editar</button>
              <button class="btn sm danger-soft" type="button" data-del-service="${esc(s.id)}">${icon('trash')} Eliminar</button>
            </div>
          </article>`).join('') || '<div class="empty"><p>No hay servicios.</p></div>'}
      </div>`;
    $$('[data-edit-service]', panel).forEach((btn) => {
      const service = services.find((s) => s.id === btn.dataset.editService);
      if (service) btn.addEventListener('click', () => openServiceModal(service));
    });
    $$('[data-del-service]', panel).forEach((btn) => {
      const service = services.find((s) => s.id === btn.dataset.delService);
      if (!service) return;
      btn.addEventListener('click', () => {
        confirmDialog({
          title: 'Eliminar servicio',
          message: `¿Eliminar <b>${esc(service.name)}</b>? Las reservas existentes mantienen su registro histórico.`,
          confirmText: 'Eliminar',
          danger: true,
          onConfirm: async () => {
            await api(`/admin/services/${service.id}`, { method: 'DELETE' });
            toast('Servicio eliminado.');
            refresh();
          },
        });
      });
    });
  }

  function drawCustom() {
    panel.innerHTML = `
      <div class="alert info" style="margin-bottom:16px">${icon('sparkles')}<div>Revisa las solicitudes de planes a medida, ajusta sesiones y fija el valor. Al aprobar, el cliente podrá transferir y tú confirmar el pago.</div></div>
      ${customOrders.length ? `<div class="admin-grid">
        ${customOrders.map((o) => `
          <article class="admin-item-card">
            <div class="oc-head"><h3>${esc(o.name)}</h3>${orderBadge(o.status)}</div>
            <div class="tiny muted"><b>${esc(o.user?.name || 'Cliente')}</b> · ${esc(o.user?.email || '')}</div>
            <p>${esc(o.description || 'Sin descripción.')}</p>
            <div class="ai-meta"><span class="ai-price">${o.price ? money(o.price) : 'Por definir'}</span><span class="ai-sub">${o.sessions} sesiones · ${o.remaining ?? o.sessions} disp.</span></div>
            <div class="ai-actions">
              ${o.status === 'pending_review' ? `
                <button class="btn sm" type="button" data-approve-order="${esc(o.id)}">${icon('check')} Aprobar</button>
                <button class="btn sm danger-soft" type="button" data-reject-order="${esc(o.id)}">Rechazar</button>` : ''}
              ${['active', 'pending_payment', 'review'].includes(o.status) ? `<button class="btn sm ghost" type="button" data-edit-order="${esc(o.id)}">${icon('edit')} Editar</button>` : ''}
              ${o.payment ? `<a class="btn sm ghost" href="#/admin/pagos">Ver pago</a>` : ''}
            </div>
          </article>`).join('')}
      </div>` : `<div class="empty"><div class="ei">${icon('sparkles')}</div><h3>Sin solicitudes a medida</h3><p>Cuando un cliente cree un plan personalizado, aparecerá aquí.</p></div>`}`;
    $$('[data-approve-order]', panel).forEach((btn) => {
      const o = customOrders.find((x) => x.id === btn.dataset.approveOrder);
      if (o) btn.addEventListener('click', () => openApproveOrderModal(o));
    });
    $$('[data-reject-order]', panel).forEach((btn) => {
      const o = customOrders.find((x) => x.id === btn.dataset.rejectOrder);
      if (!o) return;
      btn.addEventListener('click', () => {
        confirmDialog({
          title: 'Rechazar solicitud',
          message: `¿Rechazar la solicitud <b>${esc(o.name)}</b> de ${esc(o.user?.name || 'este cliente')}?`,
          confirmText: 'Rechazar',
          danger: true,
          onConfirm: async () => {
            await api(`/admin/orders/${o.id}`, { method: 'PATCH', body: { action: 'reject' } });
            toast('Solicitud rechazada.');
            refresh();
          },
        });
      });
    });
    $$('[data-edit-order]', panel).forEach((btn) => {
      const o = customOrders.find((x) => x.id === btn.dataset.editOrder);
      if (o) btn.addEventListener('click', () => openEditOrderModal(o));
    });
  }

  draw();
  bindCopyButtons(content);
}

function openPlanModal(plan = null) {
  const editing = !!plan;
  openModal({
    title: editing ? 'Editar plan' : 'Nuevo plan',
    subtitle: 'Define sesiones, valor y descripción.',
    body: `
      <div class="form-error hidden" id="plan-error"></div>
      <div class="field"><label for="pl-name">Nombre del plan</label><input class="input" id="pl-name" maxlength="100" value="${esc(plan?.name || '')}" placeholder="Ej: Pack Recuperación 4" /></div>
      <div class="field-row">
        <div class="field"><label for="pl-sessions">Número de sesiones</label><input class="input" id="pl-sessions" type="number" min="1" max="100" value="${plan?.sessions || 4}" /></div>
        <div class="field"><label for="pl-price">Valor total (CLP)</label><input class="input" id="pl-price" type="number" min="1" step="100" value="${plan?.price || ''}" placeholder="120000" /></div>
      </div>
      <div class="field"><label for="pl-desc">Descripción</label><textarea class="textarea" id="pl-desc" maxlength="600" placeholder="Describe qué incluye el plan…">${esc(plan?.description || '')}</textarea></div>
      ${editing ? `<div class="check"><input type="checkbox" id="pl-active" ${plan.active === false ? '' : 'checked'} /><label for="pl-active">Plan visible en el sitio</label></div>` : ''}`,
    footer: `<button class="btn ghost sm" type="button" id="pl-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="pl-save">${editing ? 'Guardar cambios' : 'Crear plan'}</button>`,
    onMount(modal) {
      $('#pl-cancel', modal).onclick = () => closeModal();
      $('#pl-save', modal).onclick = async (e) => {
        const error = $('#plan-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        const payload = {
          name: $('#pl-name', modal).value.trim(),
          sessions: Number($('#pl-sessions', modal).value),
          price: Number($('#pl-price', modal).value),
          description: $('#pl-desc', modal).value.trim(),
        };
        if (editing) payload.active = $('#pl-active', modal).checked;
        try {
          await api(editing ? `/admin/plans/${plan.id}` : '/admin/plans', {
            method: editing ? 'PATCH' : 'POST',
            body: payload,
          });
          closeModal();
          toast(editing ? 'Plan actualizado.' : 'Plan creado.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
    },
  });
}

function openServiceModal(service = null) {
  const editing = !!service;
  openModal({
    title: editing ? 'Editar servicio' : 'Nuevo servicio',
    body: `
      <div class="form-error hidden" id="sv-error"></div>
      <div class="field"><label for="sv-name">Nombre</label><input class="input" id="sv-name" maxlength="100" value="${esc(service?.name || '')}" /></div>
      <div class="field-row">
        <div class="field"><label for="sv-price">Valor (CLP)</label><input class="input" id="sv-price" type="number" min="0" step="500" value="${service?.price ?? ''}" /></div>
        <div class="field"><label for="sv-duration">Duración (min)</label><input class="input" id="sv-duration" type="number" min="15" max="240" value="${service?.duration || 60}" /></div>
      </div>
      <div class="field"><label for="sv-modality">Modalidad</label><select class="select" id="sv-modality"><option value="presencial" ${service?.modality !== 'virtual' ? 'selected' : ''}>Presencial</option><option value="virtual" ${service?.modality === 'virtual' ? 'selected' : ''}>Virtual</option></select></div>
      <div class="field"><label for="sv-desc">Descripción</label><textarea class="textarea" id="sv-desc" maxlength="600">${esc(service?.description || '')}</textarea></div>
      ${editing ? `<div class="check"><input type="checkbox" id="sv-active" ${service.active === false ? '' : 'checked'} /><label for="sv-active">Servicio visible en el sitio</label></div>` : ''}`,
    footer: `<button class="btn ghost sm" type="button" id="sv-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="sv-save">${editing ? 'Guardar cambios' : 'Crear servicio'}</button>`,
    onMount(modal) {
      $('#sv-cancel', modal).onclick = () => closeModal();
      $('#sv-save', modal).onclick = async (e) => {
        const error = $('#sv-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        const payload = {
          name: $('#sv-name', modal).value.trim(),
          price: Number($('#sv-price', modal).value),
          duration: Number($('#sv-duration', modal).value),
          modality: $('#sv-modality', modal).value,
          description: $('#sv-desc', modal).value.trim(),
        };
        if (editing) payload.active = $('#sv-active', modal).checked;
        try {
          await api(editing ? `/admin/services/${service.id}` : '/admin/services', {
            method: editing ? 'PATCH' : 'POST',
            body: payload,
          });
          closeModal();
          toast(editing ? 'Servicio actualizado.' : 'Servicio creado.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
    },
  });
}

function openApproveOrderModal(order) {
  if (!order) return toast('No hay solicitudes pendientes.', 'error');
  openModal({
    title: 'Aprobar plan a medida',
    subtitle: `${order.user?.name || 'Cliente'} · ${order.sessions} sesiones solicitadas`,
    body: `
      <div class="form-error hidden" id="ao-error"></div>
      <div class="form-note">Solicitud: “${esc(order.description || 'Sin descripción')}”</div>
      <div class="field-row">
        <div class="field"><label for="ao-sessions">Sesiones aprobadas</label><input class="input" id="ao-sessions" type="number" min="1" max="100" value="${order.sessions}" /></div>
        <div class="field"><label for="ao-price">Valor total (CLP)</label><input class="input" id="ao-price" type="number" min="1" step="500" placeholder="150000" /></div>
      </div>
      <div class="field" style="margin-bottom:0"><label for="ao-notes">Nota para el cliente <span class="muted">(opcional)</span></label><textarea class="textarea" id="ao-notes" maxlength="600" placeholder="Ej: Incluye evaluación inicial y seguimiento…"></textarea></div>`,
    footer: `<button class="btn ghost sm" type="button" id="ao-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="ao-save">Aprobar y solicitar pago</button>`,
    onMount(modal) {
      $('#ao-cancel', modal).onclick = () => closeModal();
      $('#ao-save', modal).onclick = async (e) => {
        const error = $('#ao-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api(`/admin/orders/${order.id}`, {
            method: 'PATCH',
            body: {
              action: 'approve',
              sessions: Number($('#ao-sessions', modal).value),
              price: Number($('#ao-price', modal).value),
              adminNotes: $('#ao-notes', modal).value.trim(),
            },
          });
          closeModal();
          toast('Plan aprobado. El cliente ya puede transferir.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
      setTimeout(() => $('#ao-price', modal)?.focus(), 80);
    },
  });
}

function openEditOrderModal(order) {
  openModal({
    title: 'Editar plan a medida',
    subtitle: order.user?.name || '',
    body: `
      <div class="form-error hidden" id="eo-error"></div>
      <div class="field"><label for="eo-name">Nombre</label><input class="input" id="eo-name" maxlength="90" value="${esc(order.name)}" /></div>
      <div class="field-row">
        <div class="field"><label for="eo-sessions">Sesiones</label><input class="input" id="eo-sessions" type="number" min="1" max="100" value="${order.sessions}" /></div>
        <div class="field"><label for="eo-price">Valor (CLP)</label><input class="input" id="eo-price" type="number" min="0" step="500" value="${order.price || 0}" /></div>
      </div>
      <div class="field" style="margin-bottom:0"><label for="eo-desc">Descripción</label><textarea class="textarea" id="eo-desc" maxlength="800">${esc(order.description || '')}</textarea></div>`,
    footer: `<button class="btn ghost sm" type="button" id="eo-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="eo-save">Guardar</button>`,
    onMount(modal) {
      $('#eo-cancel', modal).onclick = () => closeModal();
      $('#eo-save', modal).onclick = async (e) => {
        const error = $('#eo-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api(`/admin/orders/${order.id}`, {
            method: 'PATCH',
            body: {
              action: 'update',
              name: $('#eo-name', modal).value.trim(),
              sessions: Number($('#eo-sessions', modal).value),
              price: Number($('#eo-price', modal).value),
              description: $('#eo-desc', modal).value.trim(),
            },
          });
          closeModal();
          toast('Plan actualizado.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
    },
  });
}

/* ================================ RUTINAS ================================ */

export async function pageAdminRoutines(content) {
  const [userData, routineData] = await Promise.all([
    api('/admin/users'),
    api('/admin/routines'),
  ]);
  const users = userData.users || [];
  const routines = routineData.routines || [];
  const filter = state.adminRoutineUser || '';
  const visible = filter ? routines.filter((r) => r.userId === filter) : routines;

  content.innerHTML = `
    ${pageHead('Rutinas', 'Crea y edita la rutina de cada cliente. Ellos la ven en su panel.', `
      <button class="btn sm" type="button" id="new-routine">${icon('plus')} Nueva rutina</button>`)}
    <div class="toolbar">
      <select class="select" id="routine-user-filter" style="max-width:280px">
        <option value="">Todos los clientes</option>
        ${users.map((u) => `<option value="${esc(u.id)}" ${filter === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      <span class="tiny muted">${visible.length} rutina${visible.length === 1 ? '' : 's'}</span>
    </div>
    ${visible.length ? `<div class="admin-grid">
      ${visible.map((r) => `
        <article class="admin-item-card">
          <div class="oc-head"><h3>${esc(r.title)}</h3><span class="badge blue">${r.items.length} ejercicio${r.items.length === 1 ? '' : 's'}</span></div>
          <div class="tiny muted"><b>${esc(r.user?.name || 'Cliente')}</b> · ${fmtDate(r.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <p>${esc(r.description || 'Sin indicaciones generales.')}</p>
          <div class="detail-list" style="margin-top:4px">
            ${r.items.slice(0, 3).map((it) => `<div class="detail-row"><span>${esc(it.name)}</span><b class="tiny">${esc(it.sets || '')}${it.sets && it.reps ? ' × ' : ''}${esc(it.reps || '')}</b></div>`).join('')}
            ${r.items.length > 3 ? `<span class="tiny muted">+${r.items.length - 3} ejercicios más</span>` : ''}
          </div>
          <div class="ai-actions">
            <button class="btn sm ghost" type="button" data-edit-routine="${esc(r.id)}">${icon('edit')} Editar</button>
            <button class="btn sm danger-soft" type="button" data-del-routine="${esc(r.id)}">${icon('trash')} Eliminar</button>
          </div>
        </article>`).join('')}
    </div>` : `<div class="empty">
      <div class="ei">${icon('activity')}</div>
      <h3>Sin rutinas</h3>
      <p>Crea una rutina para un cliente y aparecerá en su panel privado.</p>
      <button class="btn sm" type="button" id="new-routine-empty">${icon('plus')} Crear rutina</button>
    </div>`}
  `;

  const openNew = () => openRoutineModal({
    userId: filter || null,
    users,
    onDone: refresh,
  });
  $('#new-routine')?.addEventListener('click', openNew);
  $('#new-routine-empty')?.addEventListener('click', openNew);
  $('#routine-user-filter')?.addEventListener('change', (e) => {
    state.adminRoutineUser = e.target.value;
    refresh();
  });
  $$('[data-edit-routine]', content).forEach((btn) => {
    const r = routines.find((x) => x.id === btn.dataset.editRoutine);
    if (r) btn.addEventListener('click', () => openRoutineModal({ routine: r, userId: r.userId, userName: r.user?.name, users, onDone: refresh }));
  });
  $$('[data-del-routine]', content).forEach((btn) => {
    const r = routines.find((x) => x.id === btn.dataset.delRoutine);
    if (!r) return;
    btn.addEventListener('click', () => {
      confirmDialog({
        title: 'Eliminar rutina',
        message: `¿Eliminar <b>${esc(r.title)}</b> de ${esc(r.user?.name || 'este cliente')}? El cliente dejará de verla.`,
        confirmText: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await api(`/admin/routines/${r.id}`, { method: 'DELETE' });
          toast('Rutina eliminada.');
          refresh();
        },
      });
    });
  });
}

export function openRoutineModal({ userId = null, userName = '', routine = null, users = [], onDone }) {
  const editing = !!routine;
  const fixedUser = userId || routine?.userId;
  const itemRow = (it = {}) => `
    <div class="routine-form-row" style="display:grid;grid-template-columns:1.3fr .5fr .5fr .6fr 1.3fr 32px;gap:6px;margin-bottom:6px">
      <input class="input ri-name" placeholder="Ejercicio" value="${esc(it.name || '')}" />
      <input class="input ri-sets" placeholder="Series" value="${esc(it.sets || '')}" />
      <input class="input ri-reps" placeholder="Reps" value="${esc(it.reps || '')}" />
      <input class="input ri-rest" placeholder="Desc." value="${esc(it.rest || '')}" />
      <input class="input ri-notes" placeholder="Indicación" value="${esc(it.notes || '')}" />
      <button class="btn icon-only danger-soft ri-del" type="button" aria-label="Quitar">${icon('x')}</button>
    </div>`;
  openModal({
    title: editing ? 'Editar rutina' : 'Nueva rutina',
    subtitle: editing ? `${routine.title} · ${routine.user?.name || userName}` : 'Asigna ejercicios a un cliente.',
    size: 'xwide',
    body: `
      <div class="form-error hidden" id="rt-error"></div>
      ${fixedUser ? `<div class="form-note">Cliente: <b>${esc(userName || routine?.user?.name || '')}</b></div>` : `
        <div class="field"><label for="rt-user">Cliente</label><select class="select" id="rt-user">${users.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.email)}</option>`).join('')}</select></div>`}
      <div class="field"><label for="rt-title">Título de la rutina</label><input class="input" id="rt-title" maxlength="100" value="${esc(routine?.title || '')}" placeholder="Ej: Rutina movilidad y fuerza · semana 1" /></div>
      <div class="field"><label for="rt-desc">Indicaciones generales</label><textarea class="textarea" id="rt-desc" maxlength="800" placeholder="Frecuencia, precauciones, calentamiento…">${esc(routine?.description || '')}</textarea></div>
      <div class="field" style="margin-bottom:8px">
        <label>Ejercicios</label>
        <div id="routine-items">${(routine?.items?.length ? routine.items : [{}]).map(itemRow).join('')}</div>
        <button class="btn ghost sm" type="button" id="rt-add" style="width:fit-content">${icon('plus')} Agregar ejercicio</button>
      </div>`,
    footer: `<button class="btn ghost sm" type="button" id="rt-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="rt-save">${editing ? 'Guardar rutina' : 'Crear rutina'}</button>`,
    onMount(modal) {
      const bindRemove = () => {
        $$('.ri-del', modal).forEach((btn) => {
          btn.onclick = () => {
            if ($$('.routine-form-row', modal).length > 1) btn.closest('.routine-form-row').remove();
          };
        });
      };
      bindRemove();
      $('#rt-add', modal).onclick = () => {
        $('#routine-items', modal).insertAdjacentHTML('beforeend', itemRow());
        bindRemove();
      };
      $('#rt-cancel', modal).onclick = () => closeModal();
      $('#rt-save', modal).onclick = async (e) => {
        const error = $('#rt-error', modal);
        error.classList.add('hidden');
        const items = $$('.routine-form-row', modal).map((row) => ({
          name: $('.ri-name', row).value.trim(),
          sets: $('.ri-sets', row).value.trim(),
          reps: $('.ri-reps', row).value.trim(),
          rest: $('.ri-rest', row).value.trim(),
          notes: $('.ri-notes', row).value.trim(),
        })).filter((i) => i.name);
        if (!items.length) {
          error.textContent = 'Agrega al menos un ejercicio con nombre.';
          error.classList.remove('hidden');
          return;
        }
        const btn = e.currentTarget;
        btn.disabled = true;
        const body = {
          title: $('#rt-title', modal).value.trim(),
          description: $('#rt-desc', modal).value.trim(),
          items,
        };
        if (!fixedUser) body.userId = $('#rt-user', modal).value;
        try {
          await api(editing ? `/admin/routines/${routine.id}` : '/admin/routines', {
            method: editing ? 'PATCH' : 'POST',
            body: editing ? { title: body.title, description: body.description, items } : body,
          });
          closeModal();
          toast(editing ? 'Rutina actualizada.' : 'Rutina creada. El cliente ya puede verla.');
          if (onDone) onDone();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
    },
  });
}
