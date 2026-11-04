/* ==========================================================================
   Administración · notificaciones
   ========================================================================== */

import {
  $, $$, api, esc, icon, toast, pageHead, fmtDateTime, refreshNotifyBadge,
} from './core.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

const EVENT_ICONS = {
  booking_created: 'calendarCheck',
  booking_rescheduled: 'calendar',
  booking_cancelled: 'x',
  payment_informed: 'wallet',
  payment_confirmed: 'checkCircle',
  payment_rejected: 'alert',
  order_created: 'layers',
  order_custom: 'layers',
  user_registered: 'users',
  review_received: 'messageSquare',
  admin_login: 'shield',
  admin_password_changed: 'shield',
  test: 'bell',
};

const EVENT_LABELS = {
  booking_created: 'Reserva',
  booking_rescheduled: 'Reagenda',
  booking_cancelled: 'Cancelación',
  payment_informed: 'Pago informado',
  payment_confirmed: 'Pago confirmado',
  payment_rejected: 'Pago rechazado',
  order_created: 'Compra de plan',
  order_custom: 'Plan a medida',
  user_registered: 'Cliente nuevo',
  review_received: 'Reseña',
  admin_login: 'Seguridad',
  admin_password_changed: 'Seguridad',
  test: 'Prueba',
};

function sentBadge(result) {
  if (!result) return '';
  if (result.status === 'sent') return `<span class="badge success">${esc(result.provider || 'enviado')}</span>`;
  if (result.status === 'failed') return `<span class="badge danger" title="${esc(result.reason || '')}">falló</span>`;
  return `<span class="badge muted">sin canal</span>`;
}

function channelCard(key, channel) {
  const isEmail = key === 'email';
  const title = isEmail ? 'Correo electrónico' : 'WhatsApp';
  const provider = channel.provider === 'resend' ? 'Resend'
    : channel.provider === 'callmebot' ? 'CallMeBot'
      : channel.provider === 'twilio' ? 'Twilio' : 'sin proveedor';
  return `<div class="channel-card ${channel.configured ? '' : 'off'}">
    <div class="channel-head">
      <span class="channel-icon">${icon(isEmail ? 'mail' : 'whatsapp')}</span>
      <div>
        <b>${title}</b>
        <span>${channel.configured ? `${esc(provider)} · ${esc(channel.to || 'sin destino')}` : 'Pendiente de configurar'}</span>
      </div>
      <span class="badge ${channel.enabled ? 'success' : 'muted'}">${channel.enabled ? 'Activo' : 'Apagado'}</span>
    </div>
    ${channel.hint ? `<p class="channel-hint">${esc(channel.hint)}</p>` : ''}
  </div>`;
}

export async function pageAdminNotifications(content) {
  const data = await api('/admin/notifications?limit=100');
  let filter = 'all';
  const all = data.notifications || [];

  const render = () => {
    const list = filter === 'unread' ? all.filter((n) => !n.read) : all;
    content.innerHTML = `
      ${pageHead('Notificaciones', 'Reservas, pagos y acciones de la web en un solo lugar.', `
        <button class="btn ghost sm" type="button" data-test>${icon('send')} Enviar prueba</button>
        <button class="btn sm" type="button" data-read-all>${icon('check')} Marcar leídas</button>
      `)}

      <div class="channels-grid">
        ${channelCard('email', data.channels.email)}
        ${channelCard('whatsapp', data.channels.whatsapp)}
      </div>

      ${(!data.channels.email.configured || !data.channels.whatsapp.configured) ? `
        <div class="alert info" style="margin-bottom:16px">
          ${icon('info')}
          <div>Los avisos externos se activan solos cuando agregas las credenciales en Vercel:
            <code>RESEND_API_KEY</code> para correo y <code>CALLMEBOT_PHONE</code> + <code>CALLMEBOT_APIKEY</code> para WhatsApp.
            Mientras tanto, todo queda registrado en esta bandeja.</div>
        </div>` : ''}

      <section class="card">
        <div class="card-head">
          <div class="toolbar" style="gap:8px">
            <div class="tabs">
              <button class="tab ${filter === 'all' ? 'active' : ''}" type="button" data-filter="all">Todas <span class="tab-count">${all.length}</span></button>
              <button class="tab ${filter === 'unread' ? 'active' : ''}" type="button" data-filter="unread">Sin leer <span class="tab-count">${data.unread}</span></button>
            </div>
          </div>
          <span class="tiny muted">Se guardan las últimas 300</span>
        </div>
        ${list.length ? `<div class="notify-list">
          ${list.map((item) => `
            <article class="notify-item ${item.read ? '' : 'unread'}">
              <span class="notify-icon">${icon(EVENT_ICONS[item.event] || 'bell')}</span>
              <div class="notify-body">
                <div class="notify-top">
                  <b>${esc(item.title)}</b>
                  <span class="notify-tag">${esc(EVENT_LABELS[item.event] || item.event)}</span>
                  ${item.read ? '' : '<span class="notify-dot" aria-label="Sin leer"></span>'}
                </div>
                <p>${esc(item.body)}</p>
                <div class="notify-meta">
                  <span>${esc(fmtDateTime(item.createdAt))}</span>
                  ${sentBadge(item.delivery?.email)}
                  ${sentBadge(item.delivery?.whatsapp)}
                </div>
              </div>
              <button class="icon-btn danger" type="button" data-del="${esc(item.id)}" aria-label="Eliminar notificación">${icon('trash')}</button>
            </article>`).join('')}
        </div>` : `<div class="empty" style="padding:34px">
          <div class="ei">${icon('bell')}</div>
          <h3>Sin notificaciones</h3>
          <p>Cuando alguien agende, pague o se registre, aparecerá aquí.</p>
        </div>`}
      </section>
    `;

    $$('[data-filter]', content).forEach((btn) => btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      render();
    }));

    $$('[data-del]', content).forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api(`/admin/notifications/${btn.dataset.del}`, { method: 'DELETE' });
        await refreshList();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    }));

    $('[data-read-all]', content)?.addEventListener('click', async () => {
      try {
        await api('/admin/notifications/read', { method: 'POST', body: {} });
        toast('Notificaciones marcadas como leídas.');
        await refreshList();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    $('[data-test]', content)?.addEventListener('click', async () => {
      const btn = $('[data-test]', content);
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      try {
        const result = await api('/admin/notifications/test', { method: 'POST' });
        const parts = [];
        if (result.delivery?.email) parts.push(`correo: ${result.delivery.email.status === 'sent' ? 'enviado' : result.delivery.email.status === 'failed' ? 'falló' : 'sin configurar'}`);
        if (result.delivery?.whatsapp) parts.push(`WhatsApp: ${result.delivery.whatsapp.status === 'sent' ? 'enviado' : result.delivery.whatsapp.status === 'failed' ? 'falló' : 'sin configurar'}`);
        toast(parts.length ? `Prueba enviada (${parts.join(' · ')}).` : 'Prueba registrada en la bandeja.', 'info');
        await refreshList();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon('send')} Enviar prueba`;
      }
    });
  };

  async function refreshList() {
    const next = await api('/admin/notifications?limit=100');
    all.length = 0;
    all.push(...(next.notifications || []));
    data.unread = next.unread;
    data.channels = next.channels;
    refreshNotifyBadge();
    render();
  }

  render();
}
