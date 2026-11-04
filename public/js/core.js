/* ==========================================================================
   Recovery Studio · núcleo de la aplicación
   ========================================================================== */

export const state = {
  me: null,
  config: null,
  bookingService: null,
  pendingPlanId: null,
  adminPlanTab: 'plans',
  adminAgendaStatus: 'pending',
  adminAgendaDate: '',
  adminPayStatus: 'all',
  adminRoutineUser: '',
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const textHtml = (value) => esc(value).replace(/\n/g, '<br>');

const moneyFmt = new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
});
export const money = (n) => moneyFmt.format(Number(n) || 0);

export function parseDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function dateTime(dateStr, time = '00:00') {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtDate(value, options = { day: 'numeric', month: 'short' }) {
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDate(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', options).format(d).replace(/\./g, '');
}
export function fmtDateLong(dateStr) {
  return fmtDate(dateStr, { weekday: 'long', day: 'numeric', month: 'long' });
}
export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso)).replace(/\./g, '');
}
export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
export function firstName(name) {
  return String(name || '').split(/\s+/)[0] || 'hola';
}
export function capital(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
export function percent(rate) {
  return `${(Number(rate) * 100).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
export function pct(rate) {
  return `${(Number(rate) * 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
}

/* --------------------------------- API ---------------------------------- */

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'RecoveryStudio',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* vacío */ }
  if (!res.ok) {
    const error = new Error(data?.error || 'Ocurrió un problema. Intenta nuevamente.');
    error.status = res.status;
    error.code = data?.code;
    error.data = data;
    if (res.status === 401) state.me = null;
    throw error;
  }
  return data;
}

/* -------------------------------- Iconos -------------------------------- */

const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  calendarCheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M17 5.5a3.2 3.2 0 0 1 0 6M18.5 14.6c2.1.8 3.5 2.5 3.5 5.4"/>',
  activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="m15.5 10 5-3v10l-5-3"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.08a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.08a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  alert: '<path d="M10.3 3.5 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9M17 3l4 4M14 6l3 3"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  wallet: '<path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 13h2"/><path d="M20 7V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>',
  sparkles: '<path d="m12 3 1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  trendingUp: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  star: '<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.6l6.5-.9Z"/>',
  droplet: '<path d="M12 2.7s6.5 6.4 6.5 11a6.5 6.5 0 0 1-13 0c0-4.6 6.5-11 6.5-11Z"/>',
  thermometer: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 8v8"/>',
  waves: '<path d="M2 7c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M2 13c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M2 19c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16Z"/><path d="M4 21c1.5-5 4.5-8 9-10"/>',
  messageSquare: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  whatsapp: '<path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.5a8.4 8.4 0 1 1 15.4-4.4Z"/><path d="M8.5 8.4c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .5.4l.8 1.9c.1.2 0 .4-.1.6l-.6.7c-.1.2-.2.3 0 .6.6 1 1.5 1.9 2.6 2.4.3.2.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.4.4v.5c-.1.5-.4 1-.8 1.2-.5.3-1.2.4-1.9.2-1.2-.4-2.4-1-3.4-2a9 9 0 0 1-2.1-3.2c-.3-.8-.2-1.5.1-2Z"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* -------------------------------- Toasts -------------------------------- */

export function toast(message, type = 'success') {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'checkCircle')}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = 'all .2s';
    setTimeout(() => el.remove(), 220);
  }, 4200);
}

/* -------------------------------- Modales ------------------------------- */

let escapeHandler = null;

export function openModal({ title, subtitle = '', body = '', footer = '', size = '', onMount }) {
  closeModal(false);
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button class="modal-close" type="button" aria-label="Cerrar">${icon('x')}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  document.body.classList.add('no-scroll');
  const overlay = root.firstElementChild;
  const close = () => closeModal();
  $('.modal-close', root).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  escapeHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escapeHandler);
  bindCopyButtons(root);
  if (onMount) onMount($('.modal', root));
  return $('.modal', root);
}

export function closeModal(resetScroll = true) {
  const root = $('#modal-root');
  if (!root) return;
  root.innerHTML = '';
  if (escapeHandler) { document.removeEventListener('keydown', escapeHandler); escapeHandler = null; }
  if (resetScroll) document.body.classList.remove('no-scroll');
}

export function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false, onConfirm }) {
  openModal({
    title,
    body: `<p class="small" style="color:var(--muted);line-height:1.65">${message}</p>`,
    footer: `<button class="btn ghost sm" type="button" id="confirm-cancel">Cancelar</button>
             <button class="btn ${danger ? 'danger' : ''} sm" type="button" id="confirm-ok">${esc(confirmText)}</button>`,
    onMount(modal) {
      $('#confirm-cancel', modal).onclick = () => closeModal();
      $('#confirm-ok', modal).onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await onConfirm();
          closeModal();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    },
  });
}

/* --------------------------------- QR ----------------------------------- */

export function qrSvg(text) {
  try {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  } catch {
    return '';
  }
}

/* ------------------------------- Estados -------------------------------- */

const BOOKING_STATUS = {
  pending: ['Por confirmar', 'warn'],
  confirmed: ['Confirmada', 'success'],
  attended: ['Asistió', 'blue'],
  no_show: ['No asistió', 'danger'],
  cancelled: ['Cancelada', 'muted'],
};
const PAYMENT_STATUS = {
  pending: ['Pago pendiente', 'warn'],
  review: ['Pago en revisión', 'blue'],
  confirmed: ['Pagado', 'success'],
  rejected: ['Pago rechazado', 'danger'],
  none: ['Sin pago', 'muted'],
  plan: ['Con plan', 'orange'],
};
const ORDER_STATUS = {
  pending_review: ['Por revisar', 'warn'],
  pending_payment: ['Pago pendiente', 'warn'],
  review: ['Pago en revisión', 'blue'],
  active: ['Activo', 'success'],
  completed: ['Completado', 'muted'],
  rejected: ['Rechazado', 'danger'],
  cancelled: ['Cancelado', 'muted'],
};

export function bookingBadge(status) {
  const [label, cls] = BOOKING_STATUS[status] || [status, 'muted'];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
export function paymentBadge(status) {
  const [label, cls] = PAYMENT_STATUS[status] || [status, 'muted'];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
export function orderBadge(status) {
  const [label, cls] = ORDER_STATUS[status] || [status, 'muted'];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
export function bookingStatusLabel(status) {
  return (BOOKING_STATUS[status] || [status])[0];
}
export function orderStatusLabel(status) {
  return (ORDER_STATUS[status] || [status])[0];
}

export function paymentForBooking(booking, payments = []) {
  return payments.find((p) => p.id === booking.paymentId) || null;
}

export function canUserModify(booking) {
  if (!['pending', 'confirmed'].includes(booking.status)) return false;
  const hours = (dateTime(booking.date, booking.time).getTime() - Date.now()) / 3600000;
  const limit = Number(state.config?.cancellationHours ?? 12);
  return hours > limit;
}

export function cutoffText(booking) {
  const limit = Number(state.config?.cancellationHours ?? 12);
  const d = dateTime(booking.date, booking.time);
  d.setHours(d.getHours() - limit);
  return fmtDateTime(d.toISOString());
}

/* ---------------------------- Banco / pagos ----------------------------- */

export function bankBlock(bank, amount = null) {
  if (!bank) return '';
  return `
    <div class="bank-inline">
      ${amount !== null ? `<div><span>Monto a transferir</span><b class="amount">${money(amount)}</b></div>` : ''}
      <div><span>Titular</span><b>${esc(bank.holder)}</b></div>
      <div><span>RUT</span><b>${esc(bank.rut)}</b></div>
      <div><span>Banco</span><b>${esc(bank.bank)}</b></div>
      <div><span>Cuenta</span><b>${esc(bank.accountType)}</b></div>
      <div><span>Número</span><b>${esc(bank.accountNumber)} <button type="button" class="copy-btn" data-copy="${esc(bank.accountNumber)}">${icon('copy')} Copiar</button></b></div>
    </div>`;
}

export function bindCopyButtons(root = document) {
  $$('[data-copy]', root).forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const value = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(value);
        toast('Copiado al portapapeles.');
      } catch {
        toast('No se pudo copiar. Anota el dato manualmente.', 'error');
      }
    });
  });
}

export function openTransferModal({ payment, bank, onDone }) {
  if (!payment) return;
  const bankData = bank || state.config?.bank;
  openModal({
    title: 'Informar transferencia',
    subtitle: `${payment.concept || 'Pago'} · ${money(payment.amount)}`,
    body: `
      <div class="alert info" style="margin-bottom:14px">
        ${icon('shield')}
        <div>Realiza la transferencia y luego ingresa el número de comprobante. El studio revisará y confirmará tu pago manualmente.</div>
      </div>
      ${bankBlock(bankData, payment.amount)}
      <div class="field" style="margin-bottom:0">
        <label for="transfer-ref">Número de comprobante o referencia</label>
        <input class="input" id="transfer-ref" maxlength="120" placeholder="Ej: 12345678" autocomplete="off" />
        <span class="hint">Puedes escribir el número de operación o una breve referencia.</span>
      </div>`,
    footer: `<button class="btn ghost sm" type="button" id="transfer-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="transfer-submit">Ya transferí</button>`,
    onMount(modal) {
      $('#transfer-cancel', modal).onclick = () => closeModal();
      const submit = async () => {
        const ref = $('#transfer-ref', modal).value.trim();
        if (ref.length < 3) return toast('Ingresa el comprobante o referencia.', 'error');
        const btn = $('#transfer-submit', modal);
        btn.disabled = true;
        btn.textContent = 'Enviando…';
        try {
          await api(`/payments/${payment.id}/transfer`, { method: 'POST', body: { reference: ref } });
          closeModal();
          toast('Transferencia informada. Quedará en revisión del studio.');
          if (onDone) onDone();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Ya transferí';
        }
      };
      $('#transfer-submit', modal).onclick = submit;
      $('#transfer-ref', modal).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      setTimeout(() => $('#transfer-ref', modal)?.focus(), 80);
    },
  });
}

/* ----------------------------- Navegación ------------------------------- */

export function go(path) {
  const target = path.startsWith('#') ? path : `#/${String(path).replace(/^\//, '')}`;
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function beginBooking(serviceId = null) {
  if (!state.me) {
    sessionStorage.setItem('rs_next', '#/app/agendar');
    if (serviceId) sessionStorage.setItem('rs_service', serviceId);
    go('/login');
    return;
  }
  if (state.me.role === 'admin') return go('/admin/agenda');
  state.bookingService = serviceId;
  go('/app/agendar');
}

export function beginPlan(planId = null) {
  if (!state.me) {
    sessionStorage.setItem('rs_next', '#/app/planes');
    if (planId) sessionStorage.setItem('rs_plan', planId);
    go('/login');
    return;
  }
  if (state.me.role === 'admin') return go('/admin/planes');
  state.pendingPlanId = planId;
  go('/app/planes');
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* noop */ }
  state.me = null;
  closeModal();
  go('/');
  toast('Sesión cerrada.');
}

/* ------------------------------- Shell ---------------------------------- */

const USER_NAV = [
  ['/app', 'Resumen', 'grid'],
  ['/app/agendar', 'Agendar sesión', 'calendar'],
  ['/app/sesiones', 'Mis sesiones', 'calendarCheck'],
  ['/app/planes', 'Mis planes', 'layers'],
  ['/app/rutinas', 'Mis rutinas', 'activity'],
  ['/app/pagos', 'Pagos', 'card'],
  ['/app/perfil', 'Mi perfil', 'user'],
];
const ADMIN_NAV = [
  ['/admin', 'Dashboard', 'grid'],
  ['/admin/agenda', 'Agenda', 'calendarCheck'],
  ['/admin/usuarios', 'Usuarios', 'users'],
  ['/admin/planes', 'Planes y servicios', 'layers'],
  ['/admin/pagos', 'Pagos e ingresos', 'wallet'],
  ['/admin/rutinas', 'Rutinas', 'activity'],
  ['/admin/resenas', 'Reseñas', 'messageSquare'],
  ['/admin/config', 'Configuración', 'settings'],
];

export function renderShell({ kind, active, title, subtitle }) {
  const isAdmin = kind === 'admin';
  const nav = isAdmin ? ADMIN_NAV : USER_NAV;
  const home = isAdmin ? '#/admin' : '#/app';
  const links = nav.map(([path, label, ic]) => {
    const isActive = path === active || (path !== '/app' && path !== '/admin' && active.startsWith(path));
    return `<a class="nav-link ${isActive ? 'active' : ''}" href="#${path}">${icon(ic)}<span>${label}</span></a>`;
  }).join('');
  const topAction = isAdmin
    ? `<a class="btn ghost sm" href="#/">${icon('eye')} Ver sitio</a>`
    : `<a class="btn sm" href="#/app/agendar">${icon('plus')} Agendar</a>`;

  document.getElementById('app').innerHTML = `
    <div class="app-shell" id="app-shell">
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar">
        <a class="brand" href="${home}">
          <span class="brand-mark">R</span>
          <span class="brand-name"><b>Recovery Studio</b><span>${isAdmin ? 'Administración' : 'Área de clientes'}</span></span>
        </a>
        ${isAdmin ? '<div class="admin-badge">Panel administrador</div>' : ''}
        <nav class="sidebar-nav" aria-label="Menú principal">
          <div class="nav-label">${isAdmin ? 'Gestión' : 'Mi espacio'}</div>
          ${links}
        </nav>
        <div class="sidebar-user">
          <div class="user-chip">
            <span class="avatar">${esc(initials(state.me?.name))}</span>
            <span class="user-meta"><span class="u-name">${esc(state.me?.name || '')}</span><span class="u-mail">${esc(state.me?.email || '')}</span></span>
          </div>
          <button class="logout" type="button" id="logout-btn">${icon('logout')} Cerrar sesión</button>
        </div>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <div class="topbar-left">
            <button class="hamburger" type="button" id="menu-toggle" aria-label="Abrir menú">${icon('menu')}</button>
            <div>
              <div class="topbar-title">${esc(title)}</div>
              <div class="topbar-sub">${esc(subtitle || '')}</div>
            </div>
          </div>
          <div class="topbar-actions">${topAction}</div>
        </header>
        <main class="content" id="page-content">
          <div class="loading"><span class="spinner"></span><span>Cargando…</span></div>
        </main>
      </div>
    </div>`;

  const shell = $('#app-shell');
  $('#menu-toggle')?.addEventListener('click', () => shell.classList.add('sidebar-open'));
  $('#sidebar-overlay')?.addEventListener('click', () => shell.classList.remove('sidebar-open'));
  $('#logout-btn')?.addEventListener('click', logout);
  $$('.sidebar-nav .nav-link').forEach((a) => a.addEventListener('click', () => shell.classList.remove('sidebar-open')));
  bindCopyButtons();
  return $('#page-content');
}

export function loadingHtml(text = 'Cargando…') {
  return `<div class="loading"><span class="spinner"></span><span>${esc(text)}</span></div>`;
}

export function errorHtml(message) {
  return `<div class="empty">
    <div class="ei">${icon('alert')}</div>
    <h3>No pudimos cargar la información</h3>
    <p>${esc(message || 'Revisa tu conexión e intenta nuevamente.')}</p>
    <button class="btn sm" type="button" id="retry-btn">Reintentar</button>
  </div>`;
}

export function bindRetry() {
  $('#retry-btn')?.addEventListener('click', () => window.dispatchEvent(new HashChangeEvent('hashchange')));
}

export function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head">
    <div><h1>${esc(title)}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
