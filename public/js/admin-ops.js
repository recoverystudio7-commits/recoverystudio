/* ==========================================================================
   Administración · pagos, ingresos y configuración
   ========================================================================== */

import {
  $, $$, state, api, money, esc, icon, toast, openModal, closeModal, confirmDialog,
  pageHead, fmtDate, fmtDateTime, paymentBadge, orderBadge, bindCopyButtons, percent,
} from './core.js';
import { showTotpSetupModal } from './auth.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

/* ================================= PAGOS ================================= */

export async function pageAdminPayments(content) {
  const status = state.adminPayStatus || 'all';
  const data = await api(`/admin/payments${status && status !== 'all' ? `?status=${status}` : ''}`);
  const payments = data.payments || [];
  const totals = data.totals || { confirmed: 0, retention: 0, net: 0, rate: 0.1525 };
  const pendingCount = payments.filter((p) => ['pending', 'review'].includes(p.status)).length;

  content.innerHTML = `
    ${pageHead('Pagos e ingresos', 'Confirma transferencias y revisa la retención de boleta de honorarios.', `
      <a class="btn ghost sm" href="/api/admin/export/boletas.csv" download>${icon('download')} Boletas CSV</a>
      <a class="btn ghost sm" href="/api/admin/export/pagos.csv" download>${icon('download')} Pagos CSV</a>`)}
    <div class="finance-strip">
      <div class="finance-box"><span>Ingresos confirmados</span><b>${money(totals.confirmed)}</b></div>
      <div class="finance-box orange"><span>Retención boleta ${percent(totals.rate)}</span><b>${money(totals.retention)}</b></div>
      <div class="finance-box dark"><span>Neto a recibir</span><b>${money(totals.net)}</b></div>
    </div>
    <div class="toolbar">
      <div class="tabs">
        ${[['all', 'Todos'], ['pending', 'Pendientes'], ['review', 'En revisión'], ['confirmed', 'Confirmados'], ['rejected', 'Rechazados']].map(([key, label]) => `
          <button class="tab ${status === key ? 'active' : ''}" type="button" data-pstatus="${key}">${label}${key === 'review' && pendingCount ? '' : ''}</button>`).join('')}
      </div>
      <div class="spacer"></div>
      <span class="tiny muted">${payments.length} pago${payments.length === 1 ? '' : 's'} · retención ${percent(totals.rate)}</span>
    </div>
    ${payments.length ? `<div class="table-wrap">
      <table class="data payments-table">
        <thead><tr><th>Pago</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${payments.map((p) => `
            <tr>
              <td><div class="table-user"><span class="avatar">${esc(initials(p.user?.name))}</span><div class="table-user-meta"><b>${esc(p.user?.name || 'Cliente')}</b><span>${esc(p.concept)}</span><span>${fmtDate(p.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })}${p.reference ? ` · Ref. ${esc(p.reference)}` : ''}</span></div></div></td>
              <td class="amount">${money(p.amount)}</td>
              <td>${paymentBadge(p.status)}</td>
              <td class="row-actions">
                ${['pending', 'review', 'rejected'].includes(p.status) ? `<button class="btn sm success" type="button" data-confirm-pay="${esc(p.id)}">Confirmar</button>` : ''}
                ${['pending', 'review', 'confirmed'].includes(p.status) ? `<button class="btn sm danger-soft" type="button" data-reject-pay="${esc(p.id)}">Rechazar</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `<div class="empty">
      <div class="ei">${icon('wallet')}</div>
      <h3>Sin pagos en esta vista</h3>
      <p>Cuando los clientes informen transferencias o compren planes, aparecerán aquí para confirmar.</p>
    </div>`}
    <p class="footer-note">La retención de ${percent(totals.rate)} se calcula sobre los ingresos confirmados para tu boleta de honorarios. El neto es el monto estimado a recibir después de la retención.</p>
  `;

  $$('[data-pstatus]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPayStatus = btn.dataset.pstatus;
      refresh();
    });
  });

  $$('[data-confirm-pay]', content).forEach((btn) => {
    const p = payments.find((x) => x.id === btn.dataset.confirmPay);
    if (!p) return;
    btn.addEventListener('click', () => {
      confirmDialog({
        title: 'Confirmar pago',
        message: `Confirma la transferencia de <b>${money(p.amount)}</b> de <b>${esc(p.user?.name || 'cliente')}</b> por <b>${esc(p.concept)}</b>.<br><br>Si es un plan, se activarán las sesiones en la cuenta del cliente.`,
        confirmText: 'Sí, confirmar pago',
        onConfirm: async () => {
          await api(`/admin/payments/${p.id}`, { method: 'PATCH', body: { status: 'confirmed' } });
          toast('Pago confirmado.');
          refresh();
        },
      });
    });
  });

  $$('[data-reject-pay]', content).forEach((btn) => {
    const p = payments.find((x) => x.id === btn.dataset.rejectPay);
    if (!p) return;
    btn.addEventListener('click', () => {
      confirmDialog({
        title: 'Rechazar pago',
        message: `¿Marcar como rechazado el pago de <b>${money(p.amount)}</b> de ${esc(p.user?.name || 'este cliente')}? Si es un plan, volverá a quedar pendiente de pago.`,
        confirmText: 'Rechazar',
        danger: true,
        onConfirm: async () => {
          await api(`/admin/payments/${p.id}`, { method: 'PATCH', body: { status: 'rejected' } });
          toast('Pago rechazado.');
          refresh();
        },
      });
    });
  });
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/* ============================== CONFIGURACIÓN ============================ */

export async function pageAdminConfig(content) {
  const data = await api('/admin/settings');
  const s = data.settings;
  const bank = s.bank || {};
  content.innerHTML = `
    ${pageHead('Configuración', 'Datos del studio, transferencias, retención y seguridad.')}
    <form id="settings-form">
      <div class="settings-grid">
        <div class="card settings-card">
          <h3>Datos del studio</h3>
          <p>Información visible para tus clientes.</p>
          <div class="field"><label for="st-name">Nombre del studio</label><input class="input" id="st-name" value="${esc(s.studioName)}" maxlength="80" /></div>
          <div class="field" style="margin-bottom:0"><label for="st-email">Correo de contacto</label><input class="input" id="st-email" type="email" value="${esc(s.email)}" /></div>
        </div>

        <div class="card settings-card">
          <h3>Datos de transferencia</h3>
          <p>Se muestran a los clientes al pagar sesiones o planes.</p>
          <div class="field"><label for="bk-holder">Titular</label><input class="input" id="bk-holder" value="${esc(bank.holder || '')}" maxlength="120" /></div>
          <div class="field-row">
            <div class="field"><label for="bk-rut">RUT</label><input class="input" id="bk-rut" value="${esc(bank.rut || '')}" maxlength="30" /></div>
            <div class="field"><label for="bk-bank">Banco</label><input class="input" id="bk-bank" value="${esc(bank.bank || '')}" maxlength="80" /></div>
          </div>
          <div class="field">
            <label for="bk-type">Tipo de cuenta</label>
            <input class="input" id="bk-type" value="${esc(bank.accountType || '')}" maxlength="60" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="bk-number">Número</label>
            <input class="input" id="bk-number" value="${esc(bank.accountNumber || '')}" maxlength="60" />
          </div>
        </div>

        <div class="card settings-card">
          <h3>Boleta de honorarios y política</h3>
          <p>Estos valores alimentan el dashboard y las reglas de agenda.</p>
          <div class="field">
            <label for="st-retention">Retención de boleta (%)</label>
            <input class="input" id="st-retention" type="number" min="0" max="50" step="0.01" value="${(Number(s.retentionRate) * 100).toFixed(2)}" />
            <span class="hint">Por defecto 15,25%. Solo se usa para el cálculo estimado de retención.</span>
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="st-hours">Horas mínimas para cancelar o reagendar</label>
            <input class="input" id="st-hours" type="number" min="0" max="168" step="1" value="${Number(s.cancellationHours)}" />
            <span class="hint">Actualmente: ${Number(s.cancellationHours)} horas antes de la sesión.</span>
          </div>
        </div>

        <div class="card settings-card">
          <h3>Seguridad</h3>
          <p>Tu cuenta de administrador está protegida con authenticator.</p>
          <div class="security-row">
            <div><b>Authenticator (TOTP)</b><span>${data.totpEnabled ? 'Activado en esta cuenta' : 'Sin configurar'}</span></div>
            <span class="badge ${data.totpEnabled ? 'success' : 'warn'}">${data.totpEnabled ? 'Activo' : 'Pendiente'}</span>
          </div>
          <div class="security-row">
            <div><b>Correo de administrador</b><span>${esc(state.me.email)}</span></div>
            <span class="badge blue">Admin</span>
          </div>
          <button class="btn ghost sm" type="button" id="reset-totp" style="margin-top:14px">${icon('smartphone')} Cambiar authenticator</button>
          <div class="form-note" style="margin-top:14px;margin-bottom:0">Guarda una copia de tu clave secreta en un lugar seguro. Si pierdes el acceso, usa el script de recuperación del servidor.</div>
        </div>

        <div class="card settings-card span-2" style="display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap">
          <div><h3 style="margin-bottom:3px">Guardar configuración</h3><p style="margin:0">Los cambios se aplican de inmediato en el sitio y en el panel.</p></div>
          <button class="btn" type="submit" id="save-settings">Guardar cambios</button>
        </div>
      </div>
    </form>

    <div class="settings-grid" style="margin-top:16px">
      <div class="card settings-card">
        <h3>Mi contraseña de administrador</h3>
        <p>Cambia la contraseña con la que ingresas junto al authenticator.</p>
        <form id="admin-pass-form">
          <div class="form-error hidden" id="ap-error"></div>
          <div class="field"><label for="ap-current">Contraseña actual</label><input class="input" id="ap-current" type="password" autocomplete="current-password" required /></div>
          <div class="field"><label for="ap-new">Nueva contraseña</label><input class="input" id="ap-new" type="password" minlength="4" autocomplete="new-password" required /></div>
          <button class="btn ghost" type="submit">Actualizar contraseña</button>
        </form>
      </div>
      <div class="card settings-card">
        <h3>Respaldo y exportaciones</h3>
        <p>Descarga la información de pagos y boletas para tu contabilidad.</p>
        <div class="inline-actions">
          <a class="btn ghost sm" href="/api/admin/export/boletas.csv" download>${icon('download')} Boletas CSV</a>
          <a class="btn ghost sm" href="/api/admin/export/pagos.csv" download>${icon('download')} Pagos CSV</a>
        </div>
        <div class="alert info" style="margin-top:16px">${icon('shield')}<div>La base de datos se guarda en <b>data/db.json</b>. Realiza copias de seguridad periódicas de ese archivo.</div></div>
        <p class="footer-note">Los CSV usan separador “;” y codificación UTF-8 con BOM para abrir correctamente en Excel.</p>
      </div>
    </div>
  `;

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#save-settings');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const retention = Number($('#st-retention').value);
      const hours = Number($('#st-hours').value);
      const result = await api('/admin/settings', {
        method: 'PATCH',
        body: {
          studioName: $('#st-name').value.trim(),
          email: $('#st-email').value.trim(),
          retentionRate: retention / 100,
          cancellationHours: hours,
          bank: {
            holder: $('#bk-holder').value.trim(),
            rut: $('#bk-rut').value.trim(),
            bank: $('#bk-bank').value.trim(),
            accountType: $('#bk-type').value.trim(),
            accountNumber: $('#bk-number').value.trim(),
          },
        },
      });
      const cfg = await api('/public/config');
      state.config = cfg;
      toast('Configuración guardada.');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  });

  $('#reset-totp')?.addEventListener('click', openTotpResetFlow);

  $('#admin-pass-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#ap-error');
    error.classList.add('hidden');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Actualizando…';
    try {
      const result = await api('/me', {
        method: 'PATCH',
        body: { currentPassword: $('#ap-current').value, newPassword: $('#ap-new').value },
      });
      state.me = result.user;
      toast('Contraseña de administrador actualizada.');
      e.target.reset();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Actualizar contraseña';
    }
  });

  bindCopyButtons(content);
}

function openTotpResetFlow() {
  openModal({
    title: 'Cambiar authenticator',
    subtitle: 'Confirma tu contraseña actual para generar una nueva clave.',
    body: `
      <div class="form-error hidden" id="tr-error"></div>
      <div class="field" style="margin-bottom:0"><label for="tr-pass">Contraseña actual</label><input class="input" id="tr-pass" type="password" autocomplete="current-password" /></div>`,
    footer: `<button class="btn ghost sm" type="button" id="tr-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="tr-next">Continuar</button>`,
    onMount(modal) {
      $('#tr-cancel', modal).onclick = () => closeModal();
      $('#tr-next', modal).onclick = async (e) => {
        const error = $('#tr-error', modal);
        error.classList.add('hidden');
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const result = await api('/admin/totp/reset', { method: 'POST', body: { password: $('#tr-pass', modal).value } });
          closeModal();
          showTotpSetupModal(result, () => {
            toast('Authenticator actualizado. Vuelve a ingresar con el nuevo código.');
            refresh();
          });
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
        }
      };
    },
  });
}
