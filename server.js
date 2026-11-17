import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { remoteEnabled, readRemoteDb, writeRemoteDb, acquireLock } from './lib/store.js';
import { channelStatus, deliver, deliverTo, clientEmailStatus } from './lib/notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';
const REMOTE_DB = remoteEnabled;

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

const nowISO = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const round = (n) => Math.round(Number(n) || 0);
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const lower = (v) => clean(v, 200).toLowerCase();

function parseLocal(date, time = '00:00') {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isDateStr(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(parseLocal(v).getTime());
}
function isTimeStr(v) {
  return /^\d{2}:\d{2}$/.test(String(v || ''));
}
function addHours(d, h) {
  return new Date(d.getTime() + h * 3600 * 1000);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}
function signRaw(payload) {
  return crypto.createHmac('sha256', db.settings.sessionSecret).update(payload).digest('base64url');
}
function signToken(payload, ttlMs) {
  const data = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  return `${data}.${signRaw(data)}`;
}
function verifyToken(token) {
  try {
    const [data, sig] = String(token || '').split('.');
    if (!data || !sig) return null;
    const expected = signRaw(data);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Base de datos JSON                                                 */
/* ------------------------------------------------------------------ */

if (!REMOTE_DB) fs.mkdirSync(DATA_DIR, { recursive: true });

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function checkPassword(password, user) {
  if (!user?.salt || !(user?.passHash || user?.hash)) return false;
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.passHash || user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------- Política de contraseñas ------------------ */

const PASSWORD_MIN = { admin: 16, user: 4 };
const COMMON_PASSWORDS = [
  '123456', '12345678', '123456789', 'password', 'contrasena', 'contraseña',
  'qwerty', 'recoverystudio', 'recovery', 'admin123', 'iloveyou', '111111',
  'abc123', '000000', 'dragon', 'letmein',
];

function passwordProblem(password, role = 'user') {
  const value = String(password || '');
  const min = PASSWORD_MIN[role] || PASSWORD_MIN.user;
  if (value.length < min) {
    return role === 'admin'
      ? `La contraseña de administrador debe tener al menos ${min} caracteres.`
      : `La contraseña debe tener al menos ${min} caracteres.`;
  }
  if (value.length > 200) return 'La contraseña es demasiado larga.';
  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.some((item) => lower === item || lower.includes(item))) {
    return 'Esa contraseña es demasiado predecible. Elige una distinta.';
  }
  if (/^(.)\1+$/.test(value)) return 'La contraseña no puede repetir el mismo carácter.';
  return '';
}

const clp = (n) => `$${new Intl.NumberFormat('es-CL').format(round(n))}`;

const SCHEDULE = {
  0: [],
  1: ['08:00', '09:00', '10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  2: ['08:00', '09:00', '10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  3: ['08:00', '09:00', '10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  4: ['08:00', '09:00', '10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  5: ['08:00', '09:00', '10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  6: ['09:00', '10:00', '11:00', '12:00', '13:00'],
};

function defaultSettings() {
  return {
    studioName: 'Recovery Studio',
    email: process.env.STUDIO_EMAIL || 'recoverystudio7@gmail.com',
    bank: {
      holder: 'DANIEL ESTEBAN BARRUETO',
      rut: '17.375.282-2',
      bank: 'Banco Bci',
      accountType: 'Cuenta Corriente',
      accountNumber: '72771619',
    },
    retentionRate: 0.1525,
    cancellationHours: 12,
    notifyEmail: process.env.NOTIFY_EMAIL || process.env.STUDIO_EMAIL || 'recoverystudio7@gmail.com',
    notify: { email: true, whatsapp: true },
    schedule: SCHEDULE,
    sessionSecret: crypto.randomBytes(32).toString('hex'),
  };
}

function seedDb() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'recoverystudio7@gmail.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'recoverystudio!!';
  const admin = {
    id: uid(),
    name: 'Daniel Barrueto',
    email: adminEmail,
    phone: '',
    role: 'admin',
    active: true,
    tokenVersion: 0,
    totpEnabled: false,
    totpSecret: '',
    ...hashPassword(adminPassword),
    passwordUpdatedAt: nowISO(),
    createdAt: nowISO(),
  };

  const services = [
    {
      id: uid(), name: 'Kinesiología presencial', price: 35000, duration: 60, active: true,
      description: 'Evaluación y tratamiento kinésico personalizado en el studio.',
      modality: 'presencial', createdAt: nowISO(),
    },
    {
      id: uid(), name: 'Asesoría 1 a 1', price: 30000, duration: 60, active: true,
      description: 'Sesión individual de entrenamiento y educación en el movimiento.',
      modality: 'presencial', createdAt: nowISO(),
    },
    {
      id: uid(), name: 'Asesoría virtual', price: 22000, duration: 45, active: true,
      description: 'Sesión online por videollamada, desde donde estés.',
      modality: 'virtual', createdAt: nowISO(),
    },
    {
      id: uid(), name: 'Rutina de ejercicios', price: 18000, duration: 30, active: true,
      description: 'Diseño de una rutina personalizada según tu objetivo y nivel.',
      modality: 'virtual', createdAt: nowISO(),
    },
    {
      id: uid(), name: 'Evaluación inicial', price: 40000, duration: 60, active: true,
      description: 'Evaluación funcional completa y plan de trabajo a seguir.',
      modality: 'presencial', createdAt: nowISO(),
    },
  ];

  const plans = [
    {
      id: uid(), name: 'Sesión individual', sessions: 1, price: 35000, active: true,
      description: 'Una sesión presencial de 60 minutos para comenzar.', createdAt: nowISO(),
    },
    {
      id: uid(), name: 'Pack Recuperación 4', sessions: 4, price: 120000, active: true,
      description: '4 sesiones con seguimiento para avanzar en tu recuperación.', createdAt: nowISO(),
    },
    {
      id: uid(), name: 'Pack Recuperación 8', sessions: 8, price: 220000, active: true,
      description: '8 sesiones con ajuste continuo de tu plan de trabajo.', createdAt: nowISO(),
    },
    {
      id: uid(), name: 'Asesoría virtual x4', sessions: 4, price: 70000, active: true,
      description: '4 asesorías online de 45 minutos.', createdAt: nowISO(),
    },
  ];

  return {
    meta: { version: 1, createdAt: nowISO() },
    settings: defaultSettings(),
    users: [admin],
    services,
    plans,
    bookings: [],
    orders: [],
    payments: [],
    routines: [],
    reviews: [],
    expenses: [],
    boletas: [],
    notifications: [],
  };
}

function ensureCollections(next) {
  next.settings = { ...defaultSettings(), ...(next.settings || {}) };
  next.settings.notify = { email: true, whatsapp: true, ...(next.settings.notify || {}) };
  next.users ||= [];
  next.services ||= [];
  next.plans ||= [];
  next.bookings ||= [];
  next.orders ||= [];
  next.payments ||= [];
  next.routines ||= [];
  next.reviews ||= [];
  next.expenses ||= [];
  next.boletas ||= [];
  next.notifications ||= [];
  return next;
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return ensureCollections(db);
    } catch (err) {
      console.error('No se pudo leer la base de datos, se creará una nueva:', err.message);
    }
  }
  const db = seedDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  return db;
}

let db = null;
let dirty = false;

function setDb(next) {
  db = ensureCollections(next);
  dirty = false;
}

function initLocalDb() {
  if (!db) setDb(loadDb());
  return db;
}

let saveTimer = null;
function saveDb() {
  if (REMOTE_DB) { dirty = true; return; }
  const json = JSON.stringify(db, null, 2);
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, DB_FILE);
  dirty = false;
}
function scheduleSave() {
  if (REMOTE_DB) { dirty = true; return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { saveDb(); } catch (e) { console.error('Error guardando base de datos:', e); }
  }, 120);
}

/* ------------------------------------------------------------------ */
/*  TOTP (authenticator)                                               */
/* ------------------------------------------------------------------ */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const cleanStr = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of cleanStr) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totpCode(secret, time = Date.now(), step = 30) {
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24 | hmac[off + 1] << 16 | hmac[off + 2] << 8 | hmac[off + 3]) % 1000000;
  return String(code).padStart(6, '0');
}
function verifyTotp(secret, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  for (const delta of [-1, 0, 1]) {
    if (totpCode(secret, Date.now() + delta * 30000) === c) return true;
  }
  return false;
}
function otpauthUri(secret, email) {
  const issuer = encodeURIComponent(db.settings.studioName);
  const account = encodeURIComponent(`${db.settings.studioName}:${email}`);
  return `otpauth://totp/${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/* ------------------------------------------------------------------ */
/*  Autenticación / sesiones                                           */
/* ------------------------------------------------------------------ */

const COOKIE = 'rs_session';
const SESSION_MS = 7 * 24 * 3600 * 1000;

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** IP real del cliente detrás del proxy de Vercel (x-forwarded-for). */
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || '').trim() || req.socket?.remoteAddress || 'ip';
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  const payload = verifyToken(token);
  if (!payload || payload.purpose === 'totp-setup') return null;
  const user = db.users.find((u) => u.id === payload.uid);
  if (!user || !user.active) return null;
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) return null;
  return user;
}

function sessionCookie(user) {
  const token = signToken({ uid: user.id, tv: user.tokenVersion || 0, purpose: 'session' }, SESSION_MS);
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${IS_PROD ? '; Secure' : ''}`;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    active: user.active !== false,
    totpEnabled: !!user.totpEnabled,
    createdAt: user.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/*  Rate limit (en memoria)                                            */
/* ------------------------------------------------------------------ */

const attemptBuckets = new Map();
function rateLimit(key, max = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  let b = attemptBuckets.get(key);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + windowMs };
    attemptBuckets.set(key, b);
  }
  b.count += 1;
  return b.count <= max;
}
function clearRate(key) {
  attemptBuckets.delete(key);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attemptBuckets) if (v.reset < now) attemptBuckets.delete(k);
}, 5 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/*  HTTP helpers                                                       */
/* ------------------------------------------------------------------ */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(body);
}
function fail(res, status, error, extra = {}) {
  sendJson(res, status, { error, ...extra });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 200 * 1024) {
        reject(Object.assign(new Error('Solicitud demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/*  Reglas de negocio                                                  */
/* ------------------------------------------------------------------ */

function isAdmin(user) { return user?.role === 'admin'; }
function slotsFor(dateStr) {
  if (!isDateStr(dateStr)) return [];
  const day = parseLocal(dateStr).getDay();
  return db.settings.schedule[String(day)] || [];
}
function slotIsOpen(dateStr, time) {
  return slotsFor(dateStr).includes(time);
}
function bookingBlocks(status) {
  return status === 'pending' || status === 'confirmed';
}
function slotTaken(dateStr, time, excludeId = null) {
  return db.bookings.some(
    (b) => b.id !== excludeId && b.date === dateStr && b.time === time && bookingBlocks(b.status),
  );
}
function hoursUntil(dateStr, time) {
  return (parseLocal(dateStr, time).getTime() - Date.now()) / 3600000;
}
function canUserModify(booking) {
  return ['pending', 'confirmed'].includes(booking.status) && hoursUntil(booking.date, booking.time) > Number(db.settings.cancellationHours || 12);
}
function findOrder(orderId) { return db.orders.find((o) => o.id === orderId); }
function orderStatusLabel(order) {
  return {
    pending_review: 'En revisión',
    pending_payment: 'Pendiente de pago',
    review: 'Pago en revisión',
    active: 'Activo',
    completed: 'Completado',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
  }[order.status] || order.status;
}
function syncOrderStatus(order, status) {
  if (!order) return;
  order.status = status;
  order.updatedAt = nowISO();
  if (status === 'active' && !order.activatedAt) order.activatedAt = nowISO();
}
function restingSessions(order) {
  if (!order) return 0;
  return Math.max(0, Number(order.remaining ?? order.sessions ?? 0));
}
function consumePlan(order, booking) {
  if (!order || booking.planCharged) return;
  if (restingSessions(order) <= 0) return;
  order.remaining = restingSessions(order) - 1;
  order.used = (order.used || 0) + 1;
  if (order.remaining === 0) order.status = 'completed';
  booking.planCharged = true;
}
function restorePlan(order, booking) {
  if (!order || !booking.planCharged) return;
  order.remaining = restingSessions(order) + 1;
  order.used = Math.max(0, (order.used || 1) - 1);
  if (order.status === 'completed' && order.remaining > 0) order.status = 'active';
  booking.planCharged = false;
}
function bookingTotal(booking) { return round(booking.amount || 0); }
function paymentConcept(payment) {
  if (payment.concept) return payment.concept;
  if (payment.kind === 'booking') {
    const b = db.bookings.find((x) => x.id === payment.refId);
    return b?.serviceName || 'Sesión';
  }
  const o = db.orders.find((x) => x.id === payment.refId);
  return o?.name || (payment.kind === 'custom' ? 'Plan a medida' : 'Plan');
}
function attachUser(booking) {
  const user = db.users.find((u) => u.id === booking.userId);
  return { ...booking, user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone || '' } : null };
}

/* ------------------------- Finanzas y honorarios ------------------- */

const INCOME_CATEGORIES = ['Planes', 'Sesiones', 'Asesorías', 'Empresas', 'Otros'];
const EXPENSE_CATEGORIES = ['Arriendo', 'Insumos', 'Marketing', 'Servicios básicos', 'Mantención', 'Sueldos', 'Otros'];
const PAYMENT_METHODS = ['Transferencia', 'Efectivo', 'Débito', 'Crédito'];

function currentMonthKey() {
  return localDateStr().slice(0, 7);
}

/** Normaliza fechas ISO o YYYY-MM-DD a la clave YYYY-MM. */
function monthOf(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  if (match) return `${match[1]}-${match[2]}`;
  return monthKey(value);
}

function validMonth(value) {
  const raw = clean(value, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : currentMonthKey();
}

function paymentCategory(payment) {
  if (payment.category) return payment.category;
  if (payment.kind === 'booking') {
    const booking = db.bookings.find((b) => b.id === payment.refId);
    const name = String(booking?.serviceName || '').toLowerCase();
    return /asesor|virtual|rutina|online/.test(name) ? 'Asesorías' : 'Sesiones';
  }
  if (payment.kind === 'plan' || payment.kind === 'custom') return 'Planes';
  return 'Otros';
}

function paymentUser(payment) {
  const user = publicUser(db.users.find((u) => u.id === payment.userId));
  if (user) return user;
  if (payment.payerName) {
    return { id: null, name: payment.payerName, email: '', phone: '', role: 'guest', active: true };
  }
  return null;
}

function confirmedPaymentsInMonth(key) {
  return db.payments.filter((p) => p.status === 'confirmed' && monthOf(p.confirmedAt) === key);
}

function financeSummary(key) {
  const rate = Number(db.settings.retentionRate) || 0.1525;
  const payments = confirmedPaymentsInMonth(key)
    .slice()
    .sort((a, b) => String(b.confirmedAt).localeCompare(String(a.confirmedAt)));
  const expenses = db.expenses
    .filter((e) => monthOf(e.date) === key)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const boletas = db.boletas
    .filter((b) => monthOf(b.date) === key)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const income = payments.reduce((sum, p) => sum + round(p.amount), 0);
  const spent = expenses.reduce((sum, e) => sum + round(e.amount), 0);
  const gross = boletas.reduce((sum, b) => sum + round(b.gross), 0);
  const retention = boletas.reduce((sum, b) => {
    const boletaRate = b.retentionRate === undefined || b.retentionRate === null ? rate : Number(b.retentionRate);
    return sum + Math.round(round(b.gross) * boletaRate);
  }, 0);

  const byCategory = new Map();
  for (const payment of payments) {
    const category = paymentCategory(payment);
    const row = byCategory.get(category) || { category, amount: 0, count: 0 };
    row.amount += round(payment.amount);
    row.count += 1;
    byCategory.set(category, row);
  }

  const byExpense = new Map();
  for (const expense of expenses) {
    const category = expense.category || 'Otros';
    const row = byExpense.get(category) || { category, amount: 0, count: 0 };
    row.amount += round(expense.amount);
    row.count += 1;
    byExpense.set(category, row);
  }

  return {
    key,
    income,
    expenses: spent,
    profit: income - spent,
    margin: income ? (income - spent) / income : 0,
    gross,
    retention,
    net: gross - retention,
    retentionRate: rate,
    payments: payments.map((payment) => ({
      id: payment.id,
      kind: payment.kind,
      ref: payment.reference || '',
      concept: paymentConcept(payment),
      category: paymentCategory(payment),
      method: payment.method || 'Transferencia',
      amount: round(payment.amount),
      date: payment.confirmedAt || payment.createdAt,
      userName: paymentUser(payment)?.name || 'Sin cliente',
    })),
    expenseList: expenses.map((expense) => ({ ...expense, amount: round(expense.amount) })),
    boletas: boletas.map((boleta) => ({
      ...boleta,
      gross: round(boleta.gross),
      retentionRate: boleta.retentionRate === undefined || boleta.retentionRate === null
        ? rate
        : Number(boleta.retentionRate),
    })),
    incomeByCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    expensesByCategory: [...byExpense.values()].sort((a, b) => b.amount - a.amount),
  };
}

function financeMonths(count = 6, endKey = currentMonthKey()) {
  const [year, month] = endKey.split('-').map(Number);
  const list = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(year, month - 1 - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const summary = financeSummary(key);
    list.push({
      key,
      income: summary.income,
      expenses: summary.expenses,
      profit: summary.profit,
      margin: summary.margin,
      gross: summary.gross,
      retention: summary.retention,
      net: summary.net,
    });
  }
  return list;
}

function publicReview(review) {
  return {
    id: review.id,
    authorName: review.authorName,
    rating: review.rating,
    comment: review.comment,
    service: review.service || '',
    createdAt: review.approvedAt || review.createdAt,
  };
}

function reviewsSummary(list) {
  const approved = list.filter((r) => r.status === 'approved');
  const average = approved.length
    ? approved.reduce((sum, r) => sum + Number(r.rating || 0), 0) / approved.length
    : 0;
  return { count: approved.length, average: Math.round(average * 10) / 10 };
}

function publicConfig() {
  return {
    studioName: db.settings.studioName,
    email: db.settings.email,
    bank: db.settings.bank,
    retentionRate: db.settings.retentionRate,
    cancellationHours: db.settings.cancellationHours,
    schedule: db.settings.schedule,
    services: db.services.filter((s) => s.active !== false).map((s) => ({
      id: s.id, name: s.name, price: s.price, duration: s.duration, description: s.description, modality: s.modality || 'presencial',
    })),
    plans: db.plans.filter((p) => p.active !== false).map((p) => ({
      id: p.id, name: p.name, sessions: p.sessions, price: p.price, description: p.description,
    })),
    reviews: reviewsSummary(db.reviews),
  };
}

/* --------------------------- Notificaciones ------------------------- */

const NOTIFICATION_LIMIT = 300;

function notifyPreferences() {
  return channelStatus(db.settings);
}

/**
 * Guarda la notificación en la bandeja del panel y la envía por los canales
 * configurados. Nunca lanza: un fallo de envío no afecta la operación.
 */
async function notifyEvent(event, title, body, meta = {}) {
  const record = {
    id: uid(),
    event,
    title,
    body,
    meta,
    read: false,
    createdAt: nowISO(),
    delivery: {},
  };
  db.notifications.unshift(record);
  if (db.notifications.length > NOTIFICATION_LIMIT) db.notifications.length = NOTIFICATION_LIMIT;
  scheduleSave();

  const channels = notifyPreferences();
  if (channels.email.enabled || channels.whatsapp.enabled) {
    try {
      record.delivery = await deliver({
        subject: `[${db.settings.studioName}] ${title}`,
        text: `${title}\n\n${body}\n\n${new Date().toLocaleString('es-CL')}`,
        settings: db.settings,
      });
    } catch (err) {
      record.delivery = { error: err.message };
    }
    scheduleSave();
  }
  return record;
}

function humanDate(date) {
  const value = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(y, m - 1, d));
}

function addDaysLocal(dateStr, days = 1) {
  const date = parseLocal(dateStr);
  date.setDate(date.getDate() + days);
  return localDateStr(date);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function emailHtml(title, paragraphs = []) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 12px;line-height:1.65">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f4f7fa;font-family:Segoe UI,system-ui,Arial,sans-serif;color:#21384f">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
      <tr><td style="background:#0a2540;padding:22px 26px;color:#fff">
        <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#b9d4ea">Recovery Studio</div>
        <div style="font-size:20px;font-weight:700;margin-top:6px">${escapeHtml(title)}</div>
      </td></tr>
      <tr><td style="padding:24px 26px;font-size:14px">${body}
        <p style="margin:22px 0 0"><a href="https://www.recoverystudio.cl/#/app" style="display:inline-block;background:#1268b5;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600">Ver mi panel</a></p>
      </td></tr>
      <tr><td style="padding:16px 26px;border-top:1px solid #e2e9f1;font-size:11px;color:#5b6f84">
        Recovery Studio · Kinesiología y movimiento · <a href="https://www.recoverystudio.cl" style="color:#1268b5">recoverystudio.cl</a>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Correo transaccional al cliente. Requiere un remitente de dominio verificado
 * (RESEND_CLIENT_FROM). Nunca lanza y no bloquea la operación si falla.
 */
async function notifyClient(user, subject, paragraphs, options = {}) {
  const to = String(user?.email || '').trim();
  if (!to) return { status: 'off', reason: 'El cliente no tiene correo.' };
  const status = clientEmailStatus();
  if (!status.configured) return { status: 'off', reason: status.hint };
  const title = subject;
  return deliverTo({
    to,
    subject: `${db.settings.studioName} · ${subject}`,
    text: `${subject}\n\n${paragraphs.join('\n\n')}\n\nhttps://www.recoverystudio.cl/#/app`,
    html: emailHtml(title, paragraphs),
    attachments: options.attachments,
  });
}

function cronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const header = String(req.headers.authorization || '');
  return header === `Bearer ${secret}`;
}

/* ------------------------------------------------------------------ */
/*  Router                                                             */
/* ------------------------------------------------------------------ */

const routes = [];
function route(method, pathName, access, handler) {
  routes.push({ method, pathName, access, handler });
}

function matchRoute(method, pathname) {
  const got = pathname.split('/');
  for (const r of routes) {
    if (r.method !== method) continue;
    const parts = r.pathName.split('/');
    if (parts.length !== got.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(got[i]);
      else if (parts[i] !== got[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

/* ------------------------- Público / auth ------------------------- */

route('GET', '/api/public/config', 'public', () => publicConfig());

/* ----------------------------- Reseñas ----------------------------- */

route('GET', '/api/public/reviews', 'public', () => {
  const reviews = db.reviews
    .filter((r) => r.status === 'approved')
    .sort((a, b) => String(b.approvedAt || b.createdAt).localeCompare(String(a.approvedAt || a.createdAt)))
    .slice(0, 60)
    .map(publicReview);
  return { reviews, ...reviewsSummary(db.reviews) };
});

route('POST', '/api/public/reviews', 'public', async ({ body, req, user, res }) => {
  const ip = clientIp(req);
  if (!rateLimit(`review:${ip}`, 4, 6 * 60 * 60 * 1000)) {
    return fail(res, 429, 'Ya recibimos una reseña desde este dispositivo. Intenta nuevamente más tarde.');
  }
  // Honeypot: los bots completan este campo oculto.
  if (clean(body.website, 80)) return sendJson(res, 201, { ok: true, pending: true });

  const name = clean(body.name, 80);
  const comment = clean(body.comment, 1200);
  const service = clean(body.service, 90);
  const rating = Math.min(5, Math.max(1, round(body.rating || 5)));
  const consent = body.consent === true || body.consent === 'true';

  if (name.length < 2) return fail(res, 400, 'Escribe tu nombre (mínimo 2 caracteres).');
  if (!consent) return fail(res, 400, 'Debes autorizar la publicación de tu reseña.');
  if (comment.length < 10) return fail(res, 400, 'Cuéntanos un poco más: mínimo 10 caracteres.');
  if (comment.length > 1200) return fail(res, 400, 'El comentario no puede superar los 1200 caracteres.');

  const duplicate = db.reviews.find((r) => lower(r.authorName) === lower(name) && r.comment === comment);
  if (duplicate) return fail(res, 409, 'Esa reseña ya fue recibida. Gracias por compartir tu experiencia.');

  const review = {
    id: uid(),
    userId: user?.id || null,
    authorName: name,
    rating,
    comment,
    service,
    status: 'pending',
    createdAt: nowISO(),
    approvedAt: null,
    moderatedAt: null,
    moderatedBy: null,
  };
  db.reviews.push(review);
  scheduleSave();
  await notifyEvent('review_received', 'Nueva reseña por moderar', `${name} dejó una reseña de ${rating} estrellas${service ? ` sobre ${service}` : ''}.\n\n"${comment.slice(0, 220)}${comment.length > 220 ? '…' : ''}"`, {
    type: 'review', id: review.id, name, rating, service,
  });
  sendJson(res, 201, { ok: true, pending: true, review: publicReview(review) });
});

route('POST', '/api/auth/register', 'public', async ({ body, res, req }) => {
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 6, 30 * 60 * 1000)) return fail(res, 429, 'Demasiados intentos. Intenta más tarde.');

  const name = clean(body.name, 80);
  const email = lower(body.email);
  const password = String(body.password || '');
  const phone = clean(body.phone, 30);

  if (name.length < 2) return fail(res, 400, 'Ingresa tu nombre completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Ingresa un correo válido.');
  if (password.length < 4) return fail(res, 400, 'La contraseña o PIN debe tener al menos 4 caracteres.');
  if (db.users.some((u) => u.email === email)) return fail(res, 409, 'Ya existe una cuenta con ese correo.');

  const user = {
    id: uid(), name, email, phone, role: 'user', active: true, tokenVersion: 0,
    totpEnabled: false, totpSecret: '', ...hashPassword(password), createdAt: nowISO(),
  };
  db.users.push(user);
  scheduleSave();
  await notifyEvent('user_registered', 'Nuevo cliente registrado', `${name} creó su cuenta.\nCorreo: ${email}${phone ? `\nTeléfono: ${phone}` : ''}`, {
    type: 'user', id: user.id, name, email,
  });
  sendJson(res, 201, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
});

route('POST', '/api/auth/login', 'public', async ({ body, res, req }) => {
  const email = lower(body.email);
  const password = String(body.password || '');
  const code = clean(body.code, 10);
  const ip = clientIp(req);
  const key = `login:${ip}:${email}`;
  if (!rateLimit(key, 10, 10 * 60 * 1000)) return fail(res, 429, 'Demasiados intentos. Espera unos minutos e intenta de nuevo.');

  const user = db.users.find((u) => u.email === email);
  if (!user || !user.active || !checkPassword(password, user)) {
    return fail(res, 401, 'Correo o contraseña incorrectos.', { code: 'invalid_credentials' });
  }

  if (user.role === 'admin') {
    if (!user.totpEnabled) {
      const secret = base32Encode(crypto.randomBytes(20));
      const setupToken = signToken({ uid: user.id, purpose: 'totp-setup', secret, tv: user.tokenVersion || 0 }, 10 * 60 * 1000);
      return sendJson(res, 200, {
        totpSetupRequired: true,
        setupToken,
        secret,
        otpauth: otpauthUri(secret, user.email),
      });
    }
    if (!code) return fail(res, 401, 'Ingresa el código de tu authenticator.', { code: 'totp_required' });
    if (!verifyTotp(user.totpSecret, code)) return fail(res, 401, 'Código de authenticator inválido.', { code: 'totp_invalid' });
  }

  clearRate(key);
  user.lastLoginAt = nowISO();
  user.lastLoginIp = ip;
  scheduleSave();
  if (user.role === 'admin') {
    await notifyEvent('admin_login', 'Inicio de sesión de administrador', `Se inició sesión en el panel.\nIP: ${ip}`, {
      type: 'security', id: user.id, email: user.email, ip,
    });
  }
  sendJson(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
});

route('POST', '/api/auth/totp/setup', 'public', ({ body, res }) => {
  const token = verifyToken(body.setupToken);
  if (!token || token.purpose !== 'totp-setup') return fail(res, 401, 'La configuración expiró. Inicia sesión nuevamente.');
  const user = db.users.find((u) => u.id === token.uid && u.role === 'admin');
  if (!user) return fail(res, 401, 'Cuenta no válida.');
  sendJson(res, 200, {
    secret: token.secret,
    otpauth: otpauthUri(token.secret, user.email),
    email: user.email,
  });
});

route('POST', '/api/auth/totp/enable', 'public', ({ body, res }) => {
  const token = verifyToken(body.setupToken);
  if (!token || token.purpose !== 'totp-setup') return fail(res, 401, 'La configuración expiró. Inicia sesión nuevamente.');
  const user = db.users.find((u) => u.id === token.uid && u.role === 'admin');
  if (!user) return fail(res, 401, 'Cuenta no válida.');
  if (!verifyTotp(token.secret, body.code)) return fail(res, 400, 'El código no es válido. Revisa la hora de tu teléfono e intenta otra vez.', { code: 'totp_invalid' });
  user.totpSecret = token.secret;
  user.totpEnabled = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.updatedAt = nowISO();
  scheduleSave();
  sendJson(res, 200, { user: publicUser(user), enabled: true }, { 'Set-Cookie': sessionCookie(user) });
});

route('POST', '/api/auth/logout', 'public', ({ res }) => {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PROD ? '; Secure' : ''}`,
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({ ok: true }));
});

route('GET', '/api/auth/me', 'public', ({ req }) => ({ user: publicUser(currentUser(req)) }));

/* ---------------------------- Usuario ----------------------------- */

route('GET', '/api/me/summary', 'auth', ({ user }) => {
  const bookings = db.bookings
    .filter((b) => b.userId === user.id)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const today = localDateStr();
  const upcoming = bookings.filter((b) => ['pending', 'confirmed'].includes(b.status) && `${b.date} ${b.time}` >= `${today} 00:00`).slice(0, 4);
  const orders = db.orders.filter((o) => o.userId === user.id);
  const activeOrders = orders.filter((o) => o.status === 'active');
  const payments = db.payments.filter((p) => p.userId === user.id);
  const pendingPayments = payments.filter((p) => p.status === 'pending' || p.status === 'review');
  const routines = db.routines.filter((r) => r.userId === user.id);
  return {
    upcoming,
    activeOrders: activeOrders.map((o) => ({ ...o, remaining: restingSessions(o) })),
    pendingPayments: pendingPayments.map((p) => ({ ...p, concept: paymentConcept(p) })),
    routinesCount: routines.length,
    counts: {
      bookings: bookings.length,
      upcoming: upcoming.length,
      sessionsAvailable: activeOrders.reduce((sum, o) => sum + restingSessions(o), 0),
      pendingPayments: pendingPayments.length,
    },
    nextBooking: upcoming[0] || null,
  };
});

route('GET', '/api/availability', 'auth', ({ query, res }) => {
  const date = query.get('date') || '';
  if (!isDateStr(date)) return fail(res, 400, 'Fecha inválida.');
  const slots = slotsFor(date);
  if (!slots.length) return sendJson(res, 200, { date, slots: [], closed: true });
  const data = slots.map((time) => {
    const past = parseLocal(date, time).getTime() <= Date.now();
    return { time, available: !past && !slotTaken(date, time), past };
  });
  sendJson(res, 200, { date, slots: data, closed: false });
});

route('POST', '/api/bookings', 'auth', async ({ body, user, res }) => {
  const service = db.services.find((s) => s.id === body.serviceId && s.active !== false);
  if (!service) return fail(res, 404, 'Servicio no disponible.');
  const date = clean(body.date, 10);
  const time = clean(body.time, 5);
  if (!isDateStr(date) || !isTimeStr(time)) return fail(res, 400, 'Selecciona una fecha y hora válidas.');
  if (!slotIsOpen(date, time)) return fail(res, 400, 'Ese horario no está disponible.');
  if (parseLocal(date, time).getTime() <= Date.now()) return fail(res, 400, 'El horario seleccionado ya pasó.');
  if (slotTaken(date, time)) return fail(res, 409, 'Ese horario acaba de ser tomado. Elige otro.');

  let planOrder = null;
  if (body.planOrderId) {
    planOrder = db.orders.find((o) => o.id === body.planOrderId && o.userId === user.id);
    if (!planOrder || planOrder.status !== 'active' || restingSessions(planOrder) <= 0) {
      return fail(res, 400, 'El plan seleccionado no tiene sesiones disponibles.');
    }
  }

  const modality = service.modality === 'virtual' ? 'virtual' : (body.modality === 'virtual' ? 'virtual' : 'presencial');
  const amount = planOrder ? 0 : round(service.price);
  const booking = {
    id: uid(),
    userId: user.id,
    serviceId: service.id,
    serviceName: service.name,
    duration: service.duration || 60,
    date,
    time,
    modality,
    notes: clean(body.notes, 600),
    status: 'pending',
    amount,
    paymentStatus: planOrder ? 'plan' : (amount > 0 ? 'pending' : 'none'),
    paymentId: null,
    planOrderId: planOrder?.id || null,
    planCharged: false,
    adminNotes: '',
    history: [{ at: nowISO(), action: 'created', by: 'user' }],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  let payment = null;
  if (amount > 0) {
    payment = {
      id: uid(), userId: user.id, kind: 'booking', refId: booking.id,
      concept: service.name, amount, status: 'pending', reference: '',
      createdAt: nowISO(),
    };
    booking.paymentId = payment.id;
    db.payments.push(payment);
  }

  db.bookings.push(booking);
  scheduleSave();
  await notifyEvent('booking_created', 'Nueva reserva agendada', `${user.name} agendó ${service.name}.\n${humanDate(date)} a las ${time} (${modality}).\n${amount > 0 ? `Monto: ${clp(amount)}` : 'Usa sesiones de su plan.'}\nCorreo: ${user.email}`, {
    type: 'booking', id: booking.id, userId: user.id, name: user.name, date, time, service: service.name, amount,
  });
  await notifyClient(user, 'Recibimos tu reserva', [
    `Hola ${user.name.split(' ')[0]}, recibimos tu reserva de ${service.name}.`,
    `Fecha: ${humanDate(date)} a las ${time} (${modality}).`,
    amount > 0
      ? `Monto: ${clp(amount)}. Puedes transferir y avisar el pago desde tu panel.`
      : 'Usaremos las sesiones disponibles de tu plan.',
    'La reserva queda por confirmar por el studio. Te avisaremos por correo cuando esté confirmada.',
  ]);
  sendJson(res, 201, { booking, payment });
});

route('GET', '/api/bookings', 'auth', ({ user }) => {
  const bookings = db.bookings
    .filter((b) => b.userId === user.id)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const payments = db.payments.filter((p) => p.userId === user.id);
  return { bookings, payments };
});

route('POST', '/api/bookings/:id/reschedule', 'auth', async ({ params, body, user, res }) => {
  const booking = db.bookings.find((b) => b.id === params.id && b.userId === user.id);
  if (!booking) return fail(res, 404, 'Sesión no encontrada.');
  if (!canUserModify(booking)) {
    return fail(res, 400, `No puedes reagendar con menos de ${db.settings.cancellationHours} horas de anticipación. Según la política, no se realizan reembolsos ni reagendamientos fuera de plazo.`, { code: 'policy' });
  }
  const date = clean(body.date, 10);
  const time = clean(body.time, 5);
  if (!isDateStr(date) || !isTimeStr(time) || !slotIsOpen(date, time)) return fail(res, 400, 'Selecciona un horario válido.');
  if (parseLocal(date, time).getTime() <= Date.now()) return fail(res, 400, 'El horario seleccionado ya pasó.');
  if (slotTaken(date, time, booking.id)) return fail(res, 409, 'Ese horario no está disponible.');
  const previous = { date: booking.date, time: booking.time, status: booking.status };
  booking.date = date;
  booking.time = time;
  booking.status = 'pending';
  booking.history.push({ at: nowISO(), action: 'rescheduled', by: 'user', previous });
  booking.updatedAt = nowISO();
  scheduleSave();
  await notifyEvent('booking_rescheduled', 'Reserva reagendada', `${user.name} reagendó ${booking.serviceName}.\nAntes: ${humanDate(previous.date)} ${previous.time}.\nAhora: ${humanDate(date)} a las ${time}.`, {
    type: 'booking', id: booking.id, name: user.name, date, time,
  });
  await notifyClient(user, 'Tu reserva fue reagendada', [
    `Hola ${user.name.split(' ')[0]}, actualizamos tu reserva de ${booking.serviceName}.`,
    `Nueva fecha: ${humanDate(date)} a las ${time}.`,
    'La reserva vuelve a quedar por confirmar por el studio.',
  ]);
  sendJson(res, 200, { booking });
});

route('POST', '/api/bookings/:id/cancel', 'auth', async ({ params, user, res }) => {
  const booking = db.bookings.find((b) => b.id === params.id && b.userId === user.id);
  if (!booking) return fail(res, 404, 'Sesión no encontrada.');
  if (['attended', 'no_show', 'cancelled'].includes(booking.status)) return fail(res, 400, 'Esta sesión ya no se puede cancelar.');
  if (!canUserModify(booking)) {
    return fail(res, 400, `La política permite cancelar hasta ${db.settings.cancellationHours} horas antes. No se realizan reembolsos.`, { code: 'policy' });
  }
  booking.status = 'cancelled';
  booking.cancelledBy = 'user';
  booking.history.push({ at: nowISO(), action: 'cancelled', by: 'user' });
  booking.updatedAt = nowISO();
  if (booking.planCharged) restorePlan(findOrder(booking.planOrderId), booking);
  scheduleSave();
  await notifyEvent('booking_cancelled', 'Reserva cancelada', `${user.name} canceló ${booking.serviceName} del ${humanDate(booking.date)} a las ${booking.time}.`, {
    type: 'booking', id: booking.id, name: user.name, date: booking.date, time: booking.time,
  });
  await notifyClient(user, 'Tu reserva fue cancelada', [
    `Hola ${user.name.split(' ')[0]}, cancelamos tu reserva de ${booking.serviceName}.`,
    `Fecha cancelada: ${humanDate(booking.date)} a las ${booking.time}.`,
    'Si quieres agendar nuevamente, puedes hacerlo desde tu panel.',
  ]);
  sendJson(res, 200, { booking });
});

route('GET', '/api/orders/mine', 'auth', ({ user }) => {
  const orders = db.orders
    .filter((o) => o.userId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((o) => ({ ...o, remaining: restingSessions(o), payments: db.payments.filter((p) => p.kind !== 'booking' && p.refId === o.id) }));
  return { orders };
});

route('POST', '/api/orders', 'auth', async ({ body, user, res }) => {
  const plan = db.plans.find((p) => p.id === body.planId && p.active !== false);
  if (!plan) return fail(res, 404, 'Plan no disponible.');
  const existing = db.orders.find((o) => o.userId === user.id && o.planId === plan.id && ['pending_payment', 'review'].includes(o.status));
  if (existing) return fail(res, 409, 'Ya tienes una compra pendiente de este plan. Revisa "Mis planes".');

  const order = {
    id: uid(), userId: user.id, kind: 'plan', planId: plan.id, name: plan.name,
    sessions: plan.sessions, price: plan.price, description: plan.description,
    remaining: plan.sessions, used: 0, status: 'pending_payment', reference: '',
    createdAt: nowISO(), updatedAt: nowISO(),
  };
  const payment = {
    id: uid(), userId: user.id, kind: 'plan', refId: order.id, concept: plan.name,
    amount: plan.price, status: 'pending', reference: '', createdAt: nowISO(),
  };
  order.paymentId = payment.id;
  db.orders.push(order);
  db.payments.push(payment);
  scheduleSave();
  await notifyEvent('order_created', 'Nueva compra de plan', `${user.name} compró ${plan.name}.\nMonto: ${clp(plan.price)}.\nQueda pendiente de confirmar el pago.\nCorreo: ${user.email}`, {
    type: 'order', id: order.id, userId: user.id, name: user.name, plan: plan.name, amount: plan.price,
  });
  const bank = db.settings.bank || {};
  await notifyClient(user, `Recibimos tu compra: ${plan.name}`, [
    `Hola ${user.name.split(' ')[0]}, registramos tu compra de ${plan.name} (${plan.sessions} sesiones).`,
    `Monto a transferir: ${clp(plan.price)}.`,
    `Datos: ${bank.bank || 'Banco'} · ${bank.accountType || 'Cuenta'} N° ${bank.accountNumber || ''} · Titular ${bank.holder || ''} · RUT ${bank.rut || ''}.`,
    'Cuando transfieras, entra a Mi panel → Pagos y usa “Ya transferí” con el número de comprobante. El studio confirmará el pago y activará tus sesiones.',
  ]);
  sendJson(res, 201, { order, payment });
});

route('POST', '/api/orders/custom', 'auth', async ({ body, user, res }) => {
  const name = clean(body.name, 90);
  const sessions = Math.min(100, Math.max(1, round(body.sessions || 1)));
  const description = clean(body.description, 800);
  if (name.length < 3) return fail(res, 400, 'Ponle un nombre a tu plan.');
  if (!description) return fail(res, 400, 'Cuéntanos qué necesitas para armar tu plan.');
  const order = {
    id: uid(), userId: user.id, kind: 'custom', planId: null, name, sessions,
    price: 0, description, remaining: sessions, used: 0, status: 'pending_review',
    reference: '', createdAt: nowISO(), updatedAt: nowISO(),
  };
  db.orders.push(order);
  scheduleSave();
  await notifyEvent('order_custom', 'Solicitud de plan a medida', `${user.name} pidió un plan a medida: ${name} (${sessions} sesiones).\n\n${description.slice(0, 260)}${description.length > 260 ? '…' : ''}\n\nCorreo: ${user.email}`, {
    type: 'order', id: order.id, userId: user.id, name: user.name, sessions,
  });
  sendJson(res, 201, { order });
});

route('GET', '/api/payments/mine', 'auth', ({ user }) => {
  const payments = db.payments
    .filter((p) => p.userId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((p) => ({
      ...p,
      concept: paymentConcept(p),
      booking: p.kind === 'booking' ? db.bookings.find((b) => b.id === p.refId) || null : null,
      order: p.kind !== 'booking' ? db.orders.find((o) => o.id === p.refId) || null : null,
    }));
  return { payments, bank: db.settings.bank, cancellationHours: db.settings.cancellationHours };
});

route('POST', '/api/payments/:id/transfer', 'auth', async ({ params, body, user, res }) => {
  const payment = db.payments.find((p) => p.id === params.id && p.userId === user.id);
  if (!payment) return fail(res, 404, 'Pago no encontrado.');
  if (!['pending', 'rejected'].includes(payment.status)) return fail(res, 400, 'Este pago ya no se puede actualizar.');
  const reference = clean(body.reference, 120);
  if (reference.length < 3) return fail(res, 400, 'Ingresa el número de comprobante o referencia de la transferencia.');
  payment.status = 'review';
  payment.reference = reference;
  payment.transferredAt = nowISO();
  if (payment.kind === 'booking') {
    const booking = db.bookings.find((b) => b.id === payment.refId);
    if (booking) { booking.paymentStatus = 'review'; booking.updatedAt = nowISO(); }
  } else {
    const order = findOrder(payment.refId);
    if (order && ['pending_payment', 'review'].includes(order.status)) syncOrderStatus(order, 'review');
  }
  scheduleSave();
  await notifyEvent('payment_informed', 'Pago informado por transferencia', `${user.name} informó el pago de ${paymentConcept(payment)}.\nMonto: ${clp(payment.amount)}.\nReferencia: ${reference}.\nRevisa y confirma en Pagos e ingresos.`, {
    type: 'payment', id: payment.id, userId: user.id, name: user.name, amount: payment.amount, reference,
  });
  sendJson(res, 200, { payment, message: 'Transferencia informada. El studio la revisará y confirmará.' });
});

route('GET', '/api/routines/mine', 'auth', ({ user }) => {
  const routines = db.routines
    .filter((r) => r.userId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { routines };
});

route('PATCH', '/api/me', 'auth', async ({ body, user, res }) => {
  if (body.name !== undefined) {
    const name = clean(body.name, 80);
    if (name.length < 2) return fail(res, 400, 'Ingresa tu nombre.');
    user.name = name;
  }
  if (body.phone !== undefined) user.phone = clean(body.phone, 30);
  if (body.newPassword) {
    const current = String(body.currentPassword || '');
    const next = String(body.newPassword || '');
    if (!checkPassword(current, user)) return fail(res, 400, 'La contraseña actual no es correcta.');
    const problem = passwordProblem(next, user.role);
    if (problem) return fail(res, 400, problem, { code: 'weak_password' });
    Object.assign(user, hashPassword(next));
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordUpdatedAt = nowISO();
    user.updatedAt = nowISO();
    scheduleSave();
    if (user.role === 'admin') {
      await notifyEvent('admin_password_changed', 'Contraseña de administrador actualizada', 'Se cambió la contraseña del panel y se cerraron las demás sesiones.', {
        type: 'security', id: user.id,
      });
    }
    return sendJson(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(user) });
  }
  user.updatedAt = nowISO();
  scheduleSave();
  sendJson(res, 200, { user: publicUser(user) });
});

/* ----------------------------- Admin ------------------------------ */

route('GET', '/api/admin/stats', 'admin', () => {
  const confirmed = db.payments.filter((p) => p.status === 'confirmed');
  const total = confirmed.reduce((sum, p) => sum + round(p.amount), 0);
  const rate = Number(db.settings.retentionRate) || 0.1525;
  const retention = Math.round(total * rate);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const monthTotal = confirmed.filter((p) => monthKey(p.confirmedAt) === thisMonth).reduce((s, p) => s + round(p.amount), 0);
  const prevTotal = confirmed.filter((p) => monthKey(p.confirmedAt) === prevMonth).reduce((s, p) => s + round(p.amount), 0);
  const pendingPayments = db.payments.filter((p) => p.status === 'pending' || p.status === 'review');
  const today = localDateStr();
  const todayBookings = db.bookings.filter((b) => b.date === today && b.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time)).map(attachUser);
  const pendingBookings = db.bookings.filter((b) => b.status === 'pending').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).map(attachUser);
  const monthBookings = db.bookings.filter((b) => monthKey(b.date ? parseLocal(b.date).toISOString() : '') === thisMonth);
  const attended = monthBookings.filter((b) => b.status === 'attended').length;
  const noShow = monthBookings.filter((b) => b.status === 'no_show').length;
  const monthExpenses = db.expenses
    .filter((e) => monthOf(e.date) === thisMonth)
    .reduce((sum, e) => sum + round(e.amount), 0);
  const monthly = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const amount = confirmed.filter((p) => monthKey(p.confirmedAt) === key).reduce((s, p) => s + round(p.amount), 0);
    const spent = db.expenses.filter((e) => monthOf(e.date) === key).reduce((s, e) => s + round(e.amount), 0);
    monthly.push({ key, label: new Intl.DateTimeFormat('es-CL', { month: 'short' }).format(d).replace('.', ''), amount, expenses: spent, profit: amount - spent });
  }
  const activeOrders = db.orders.filter((o) => o.status === 'active');
  const pendingOrders = db.orders.filter((o) => ['pending_review', 'pending_payment', 'review'].includes(o.status));
  const recentPayments = confirmed.slice().sort((a, b) => String(b.confirmedAt).localeCompare(String(a.confirmedAt))).slice(0, 5)
    .map((p) => ({ ...p, concept: paymentConcept(p), user: paymentUser(p) }));
  const pendingPaymentsView = pendingPayments.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6)
    .map((p) => ({ ...p, concept: paymentConcept(p), user: paymentUser(p) }));

  return {
    income: {
      total,
      month: monthTotal,
      prevMonth: prevTotal,
      expenses: monthExpenses,
      profit: monthTotal - monthExpenses,
      retention,
      net: total - retention,
      retentionRate: rate,
      pending: pendingPayments.reduce((s, p) => s + round(p.amount), 0),
    },
    counts: {
      users: db.users.filter((u) => u.role === 'user' && u.active !== false).length,
      bookingsPending: pendingBookings.length,
      bookingsToday: todayBookings.length,
      attended,
      noShow,
      activePlans: activeOrders.length,
      sessionsRemaining: activeOrders.reduce((s, o) => s + restingSessions(o), 0),
      pendingOrders: pendingOrders.length,
      pendingPayments: pendingPayments.length,
    },
    todayBookings,
    pendingBookings: pendingBookings.slice(0, 8),
    recentPayments,
    pendingPayments: pendingPaymentsView,
    monthly,
  };
});

route('GET', '/api/admin/bookings', 'admin', ({ query }) => {
  const status = query.get('status') || '';
  const date = query.get('date') || '';
  const userId = query.get('userId') || '';
  let list = db.bookings.slice();
  if (status && status !== 'all') {
    if (status === 'upcoming') list = list.filter((b) => ['pending', 'confirmed'].includes(b.status));
    else list = list.filter((b) => b.status === status);
  }
  if (date) list = list.filter((b) => b.date === date);
  if (userId) list = list.filter((b) => b.userId === userId);
  list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return { bookings: list.map((b) => ({ ...attachUser(b), payment: db.payments.find((p) => p.id === b.paymentId) || null })) };
});

route('PATCH', '/api/admin/bookings/:id', 'admin', async ({ params, body, res }) => {
  const booking = db.bookings.find((b) => b.id === params.id);
  if (!booking) return fail(res, 404, 'Sesión no encontrada.');
  const allowed = ['pending', 'confirmed', 'attended', 'no_show', 'cancelled'];
  const previousStatus = booking.status;
  if (body.status) {
    if (!allowed.includes(body.status)) return fail(res, 400, 'Estado inválido.');
    const previous = booking.status;
    if (body.status === 'attended' && previous !== 'attended') consumePlan(findOrder(booking.planOrderId), booking);
    if (previous === 'attended' && body.status !== 'attended') restorePlan(findOrder(booking.planOrderId), booking);
    booking.status = body.status;
    booking.history.push({ at: nowISO(), action: `status:${body.status}`, by: 'admin', previous });
    booking.updatedAt = nowISO();
  }
  if (body.adminNotes !== undefined) booking.adminNotes = clean(body.adminNotes, 800);
  if (body.paymentStatus === 'paid' && booking.paymentId) {
    const p = db.payments.find((x) => x.id === booking.paymentId);
    if (p && p.status !== 'confirmed') {
      p.status = 'confirmed';
      p.confirmedAt = nowISO();
      p.confirmedBy = 'admin';
      booking.paymentStatus = 'paid';
    }
  }
  scheduleSave();

  const client = db.users.find((u) => u.id === booking.userId);
  if (body.status && body.status !== previousStatus && client) {
    if (body.status === 'confirmed') {
      await notifyClient(client, 'Tu sesión está confirmada', [
        `Hola ${client.name.split(' ')[0]}, tu sesión de ${booking.serviceName} quedó confirmada.`,
        `Fecha: ${humanDate(booking.date)} a las ${booking.time} (${booking.modality}).`,
        booking.amount > 0 && booking.paymentStatus !== 'paid'
          ? `Recuerda completar el pago de ${clp(booking.amount)} por transferencia y avisarlo en tu panel.`
          : 'Nos vemos en el studio. Si necesitas reagendar, hazlo con anticipación desde tu panel.',
      ]);
    } else if (body.status === 'cancelled') {
      await notifyClient(client, 'Tu sesión fue cancelada', [
        `Hola ${client.name.split(' ')[0]}, cancelamos tu sesión de ${booking.serviceName}.`,
        `Fecha: ${humanDate(booking.date)} a las ${booking.time}.`,
        'Si tienes dudas o quieres agendar nuevamente, responde este correo o entra a tu panel.',
      ]);
    }
  }

  sendJson(res, 200, { booking: attachUser(booking) });
});

route('POST', '/api/admin/bookings/:id/reschedule', 'admin', async ({ params, body, res }) => {
  const booking = db.bookings.find((b) => b.id === params.id);
  if (!booking) return fail(res, 404, 'Sesión no encontrada.');
  if (['cancelled', 'attended'].includes(booking.status)) return fail(res, 400, 'No se puede reagendar una sesión cerrada.');
  const date = clean(body.date, 10);
  const time = clean(body.time, 5);
  if (!isDateStr(date) || !isTimeStr(time) || !slotIsOpen(date, time)) return fail(res, 400, 'Selecciona un horario válido.');
  if (slotTaken(date, time, booking.id)) return fail(res, 409, 'Ese horario no está disponible.');
  const previous = { date: booking.date, time: booking.time, status: booking.status };
  booking.date = date;
  booking.time = time;
  booking.status = 'confirmed';
  booking.history.push({ at: nowISO(), action: 'rescheduled', by: 'admin', previous });
  booking.updatedAt = nowISO();
  scheduleSave();

  const client = db.users.find((u) => u.id === booking.userId);
  if (client) {
    await notifyClient(client, 'Tu sesión fue reagendada', [
      `Hola ${client.name.split(' ')[0]}, movimos tu sesión de ${booking.serviceName}.`,
      `Antes: ${humanDate(previous.date)} a las ${previous.time}.`,
      `Ahora: ${humanDate(date)} a las ${time}.`,
      'Tu reserva quedó confirmada en el nuevo horario.',
    ]);
  }

  sendJson(res, 200, { booking: attachUser(booking) });
});

route('PATCH', '/api/admin/payments/:id', 'admin', async ({ params, body, res }) => {
  const payment = db.payments.find((p) => p.id === params.id);
  if (!payment) return fail(res, 404, 'Pago no encontrado.');
  if (!['pending', 'review', 'confirmed', 'rejected'].includes(body.status)) return fail(res, 400, 'Estado inválido.');
  payment.status = body.status;
  payment.reviewedAt = nowISO();
  if (body.status === 'confirmed') {
    payment.confirmedAt = nowISO();
    payment.confirmedBy = 'admin';
  }
  if (payment.kind === 'booking') {
    const booking = db.bookings.find((b) => b.id === payment.refId);
    if (booking) {
      booking.paymentStatus = body.status === 'confirmed' ? 'paid' : body.status === 'rejected' ? 'rejected' : 'review';
      booking.updatedAt = nowISO();
    }
  } else {
    const order = findOrder(payment.refId);
    if (order) {
      if (body.status === 'confirmed') {
        if (!['active', 'completed'].includes(order.status)) syncOrderStatus(order, 'active');
        order.paidAt = order.paidAt || nowISO();
      } else if (body.status === 'rejected') {
        if (order.status === 'review') syncOrderStatus(order, 'pending_payment');
      } else if (body.status === 'review') {
        if (['pending_payment', 'rejected'].includes(order.status)) syncOrderStatus(order, 'review');
      }
    }
  }
  scheduleSave();
  if (body.status === 'confirmed' || body.status === 'rejected') {
    await notifyEvent(
      body.status === 'confirmed' ? 'payment_confirmed' : 'payment_rejected',
      body.status === 'confirmed' ? 'Pago confirmado' : 'Pago rechazado',
      `${paymentConcept(payment)} · ${clp(payment.amount)}.\nCliente: ${paymentUser(payment)?.name || 'Sin cliente'}.\nEstado: ${body.status === 'confirmed' ? 'confirmado' : 'rechazado'}.`,
      { type: 'payment', id: payment.id, amount: payment.amount },
    );
    const client = paymentUser(payment);
    if (client) {
      await notifyClient(client, body.status === 'confirmed' ? 'Pago confirmado' : 'Pago rechazado', body.status === 'confirmed'
        ? [
          `Hola ${client.name.split(' ')[0]}, confirmamos tu pago de ${clp(payment.amount)} por ${paymentConcept(payment)}.`,
          payment.kind === 'booking'
            ? 'Tu sesión ya cuenta con el pago registrado.'
            : 'Las sesiones de tu plan ya están disponibles en tu panel.',
        ]
        : [
          `Hola ${client.name.split(' ')[0]}, no pudimos confirmar tu pago de ${clp(payment.amount)} por ${paymentConcept(payment)}.`,
          'Revisa el comprobante o la referencia ingresada y vuelve a informarlo desde tu panel. Si tienes dudas, responde este correo.',
        ]);
    }
  }
  sendJson(res, 200, { payment });
});

route('GET', '/api/admin/payments', 'admin', ({ query }) => {
  const status = query.get('status') || '';
  let list = db.payments.slice();
  if (status && status !== 'all') list = list.filter((p) => p.status === status);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const payments = list.map((p) => ({
    ...p,
    concept: paymentConcept(p),
    user: paymentUser(p),
    order: p.kind !== 'booking' ? db.orders.find((o) => o.id === p.refId) || null : null,
    booking: p.kind === 'booking' ? db.bookings.find((b) => b.id === p.refId) || null : null,
  }));
  const confirmed = db.payments.filter((p) => p.status === 'confirmed');
  const total = confirmed.reduce((s, p) => s + round(p.amount), 0);
  const rate = Number(db.settings.retentionRate) || 0.1525;
  return {
    payments,
    totals: { confirmed: total, retention: Math.round(total * rate), net: total - Math.round(total * rate), rate },
  };
});

route('GET', '/api/admin/finance', 'admin', ({ query }) => {
  const key = validMonth(query.get('month'));
  const numbers = db.boletas
    .map((b) => Number(String(b.number || '').replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    month: key,
    nextBoletaNumber: String((numbers.length ? Math.max(...numbers) : 300) + 1),
    categories: {
      income: INCOME_CATEGORIES,
      expenses: EXPENSE_CATEGORIES,
      methods: PAYMENT_METHODS,
    },
    summary: financeSummary(key),
    months: financeMonths(6, key),
  };
});

route('POST', '/api/admin/expenses', 'admin', ({ body, res }) => {
  const amount = round(body.amount);
  if (!Number.isFinite(Number(body.amount)) || amount <= 0) return fail(res, 400, 'Ingresa un monto válido para el gasto.');
  const description = clean(body.description, 160);
  if (description.length < 2) return fail(res, 400, 'Describe el gasto.');
  const expense = {
    id: uid(),
    date: isDateStr(body.date) ? body.date : localDateStr(),
    category: EXPENSE_CATEGORIES.includes(clean(body.category, 40)) ? clean(body.category, 40) : 'Otros',
    description,
    amount,
    method: PAYMENT_METHODS.includes(clean(body.method, 40)) ? clean(body.method, 40) : 'Transferencia',
    createdAt: nowISO(),
  };
  db.expenses.push(expense);
  scheduleSave();
  sendJson(res, 201, { expense });
});

route('DELETE', '/api/admin/expenses/:id', 'admin', ({ params, res }) => {
  const index = db.expenses.findIndex((e) => e.id === params.id);
  if (index < 0) return fail(res, 404, 'Gasto no encontrado.');
  db.expenses.splice(index, 1);
  scheduleSave();
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/admin/boletas', 'admin', ({ body, res }) => {
  const gross = round(body.gross);
  if (!Number.isFinite(Number(body.gross)) || gross <= 0) return fail(res, 400, 'Ingresa un monto bruto válido.');
  const number = clean(body.number, 40) || String(300 + db.boletas.length);
  if (db.boletas.some((b) => b.number === number)) return fail(res, 409, 'Ya existe una boleta con ese número.');
  const rate = Number(db.settings.retentionRate) || 0.1525;
  const boleta = {
    id: uid(),
    number,
    date: isDateStr(body.date) ? body.date : localDateStr(),
    client: clean(body.client, 120) || db.settings.studioName,
    gross,
    retentionRate: rate,
    notes: clean(body.notes, 300),
    createdAt: nowISO(),
  };
  db.boletas.push(boleta);
  scheduleSave();
  sendJson(res, 201, { boleta });
});

route('DELETE', '/api/admin/boletas/:id', 'admin', ({ params, res }) => {
  const index = db.boletas.findIndex((b) => b.id === params.id);
  if (index < 0) return fail(res, 404, 'Boleta no encontrada.');
  db.boletas.splice(index, 1);
  scheduleSave();
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/admin/payments', 'admin', ({ body, res }) => {
  const amount = round(body.amount);
  if (!Number.isFinite(Number(body.amount)) || amount <= 0) return fail(res, 400, 'Ingresa un monto válido.');
  const concept = clean(body.concept, 120);
  if (concept.length < 2) return fail(res, 400, 'Indica el concepto del ingreso.');
  const date = isDateStr(body.date) ? body.date : localDateStr();
  const payment = {
    id: uid(),
    userId: null,
    kind: 'manual',
    refId: null,
    concept,
    category: INCOME_CATEGORIES.includes(clean(body.category, 40)) ? clean(body.category, 40) : 'Otros',
    method: PAYMENT_METHODS.includes(clean(body.method, 40)) ? clean(body.method, 40) : 'Transferencia',
    amount,
    payerName: clean(body.client, 120),
    reference: clean(body.reference, 120),
    status: 'confirmed',
    createdAt: nowISO(),
    confirmedAt: parseLocal(date, '12:00').toISOString(),
    confirmedBy: 'admin',
  };
  db.payments.push(payment);
  scheduleSave();
  sendJson(res, 201, { payment });
});

route('GET', '/api/admin/users', 'admin', ({ query }) => {
  const q = lower(query.get('q') || '');
  let users = db.users.filter((u) => u.role === 'user');
  if (q) users = users.filter((u) => `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q));
  users.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    users: users.map((u) => {
      const bookings = db.bookings.filter((b) => b.userId === u.id);
      const orders = db.orders.filter((o) => o.userId === u.id && o.status === 'active');
      const paid = db.payments.filter((p) => p.userId === u.id && p.status === 'confirmed').reduce((s, p) => s + round(p.amount), 0);
      return {
        ...publicUser(u),
        stats: {
          bookings: bookings.length,
          attended: bookings.filter((b) => b.status === 'attended').length,
          noShow: bookings.filter((b) => b.status === 'no_show').length,
          paid,
          activePlans: orders.length,
          remaining: orders.reduce((s, o) => s + restingSessions(o), 0),
        },
      };
    }),
  };
});

route('POST', '/api/admin/users', 'admin', ({ body, res }) => {
  const name = clean(body.name, 80);
  const email = lower(body.email);
  const password = String(body.password || '');
  const phone = clean(body.phone, 30);
  if (name.length < 2) return fail(res, 400, 'Ingresa el nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Correo inválido.');
  if (password.length < 4) return fail(res, 400, 'La contraseña debe tener al menos 4 caracteres.');
  if (db.users.some((u) => u.email === email)) return fail(res, 409, 'Ese correo ya está registrado.');
  const user = {
    id: uid(), name, email, phone, role: 'user', active: true, tokenVersion: 0,
    totpEnabled: false, totpSecret: '', ...hashPassword(password), createdAt: nowISO(),
  };
  db.users.push(user);
  scheduleSave();
  sendJson(res, 201, { user: publicUser(user) });
});

route('GET', '/api/admin/users/:id', 'admin', ({ params, res }) => {
  const user = db.users.find((u) => u.id === params.id && u.role === 'user');
  if (!user) return fail(res, 404, 'Usuario no encontrado.');
  return {
    user: publicUser(user),
    bookings: db.bookings.filter((b) => b.userId === user.id).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
    orders: db.orders.filter((o) => o.userId === user.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((o) => ({ ...o, remaining: restingSessions(o) })),
    payments: db.payments.filter((p) => p.userId === user.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((p) => ({ ...p, concept: paymentConcept(p) })),
    routines: db.routines.filter((r) => r.userId === user.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
});

route('PATCH', '/api/admin/users/:id', 'admin', ({ params, body, res }) => {
  const user = db.users.find((u) => u.id === params.id && u.role === 'user');
  if (!user) return fail(res, 404, 'Usuario no encontrado.');
  if (body.name !== undefined) {
    const name = clean(body.name, 80);
    if (name.length < 2) return fail(res, 400, 'Nombre inválido.');
    user.name = name;
  }
  if (body.email !== undefined) {
    const email = lower(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Correo inválido.');
    if (db.users.some((u) => u.email === email && u.id !== user.id)) return fail(res, 409, 'Ese correo ya está en uso.');
    user.email = email;
  }
  if (body.phone !== undefined) user.phone = clean(body.phone, 30);
  if (body.active !== undefined) user.active = !!body.active;
  if (body.newPassword) {
    const next = String(body.newPassword);
    if (next.length < 4) return fail(res, 400, 'La contraseña debe tener al menos 4 caracteres.');
    Object.assign(user, hashPassword(next));
    user.tokenVersion = (user.tokenVersion || 0) + 1;
  }
  user.updatedAt = nowISO();
  scheduleSave();
  sendJson(res, 200, { user: publicUser(user) });
});

route('GET', '/api/admin/plans', 'admin', () => {
  const groups = {};
  for (const p of db.plans) {
    const key = p.name.trim().toLowerCase();
    (groups[key] ||= []).push(p.id);
  }
  const duplicates = Object.entries(groups).filter(([, ids]) => ids.length > 1).map(([name, ids]) => ({ name, ids }));
  return {
    plans: db.plans.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    duplicates,
  };
});

route('POST', '/api/admin/plans', 'admin', ({ body, res }) => {
  const name = clean(body.name, 100);
  const sessions = Math.min(100, Math.max(1, round(body.sessions || 1)));
  const price = Math.max(0, round(body.price));
  const description = clean(body.description, 600);
  if (name.length < 3) return fail(res, 400, 'El nombre del plan debe tener al menos 3 caracteres.');
  if (price <= 0) return fail(res, 400, 'Ingresa un valor mayor a 0.');
  const dup = db.plans.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) return fail(res, 409, `Ya existe un plan llamado "${dup.name}". Evita duplicados.`, { code: 'duplicate' });
  const plan = { id: uid(), name, sessions, price, description, active: true, createdAt: nowISO() };
  db.plans.push(plan);
  scheduleSave();
  sendJson(res, 201, { plan });
});

route('PATCH', '/api/admin/plans/:id', 'admin', ({ params, body, res }) => {
  const plan = db.plans.find((p) => p.id === params.id);
  if (!plan) return fail(res, 404, 'Plan no encontrado.');
  if (body.name !== undefined) {
    const name = clean(body.name, 100);
    if (name.length < 3) return fail(res, 400, 'Nombre inválido.');
    const dup = db.plans.find((p) => p.id !== plan.id && p.name.trim().toLowerCase() === name.toLowerCase());
    if (dup) return fail(res, 409, `Ya existe un plan llamado "${dup.name}". Evita duplicados.`, { code: 'duplicate' });
    plan.name = name;
  }
  if (body.sessions !== undefined) plan.sessions = Math.min(100, Math.max(1, round(body.sessions)));
  if (body.price !== undefined) {
    const price = round(body.price);
    if (price <= 0) return fail(res, 400, 'El valor debe ser mayor a 0.');
    plan.price = price;
  }
  if (body.description !== undefined) plan.description = clean(body.description, 600);
  if (body.active !== undefined) plan.active = !!body.active;
  plan.updatedAt = nowISO();
  scheduleSave();
  sendJson(res, 200, { plan });
});

route('DELETE', '/api/admin/plans/:id', 'admin', ({ params, res }) => {
  const idx = db.plans.findIndex((p) => p.id === params.id);
  if (idx < 0) return fail(res, 404, 'Plan no encontrado.');
  db.plans.splice(idx, 1);
  scheduleSave();
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/admin/services', 'admin', () => ({
  services: db.services.slice(),
}));

route('POST', '/api/admin/services', 'admin', ({ body, res }) => {
  const name = clean(body.name, 100);
  const price = round(body.price);
  const duration = Math.min(240, Math.max(15, round(body.duration || 60)));
  const description = clean(body.description, 600);
  if (name.length < 3) return fail(res, 400, 'Nombre inválido.');
  if (price < 0) return fail(res, 400, 'Valor inválido.');
  const service = {
    id: uid(), name, price, duration, description,
    modality: body.modality === 'virtual' ? 'virtual' : 'presencial',
    active: true, createdAt: nowISO(),
  };
  db.services.push(service);
  scheduleSave();
  sendJson(res, 201, { service });
});

route('PATCH', '/api/admin/services/:id', 'admin', ({ params, body, res }) => {
  const service = db.services.find((s) => s.id === params.id);
  if (!service) return fail(res, 404, 'Servicio no encontrado.');
  if (body.name !== undefined) {
    const name = clean(body.name, 100);
    if (name.length < 3) return fail(res, 400, 'Nombre inválido.');
    service.name = name;
  }
  if (body.price !== undefined) service.price = Math.max(0, round(body.price));
  if (body.duration !== undefined) service.duration = Math.min(240, Math.max(15, round(body.duration)));
  if (body.description !== undefined) service.description = clean(body.description, 600);
  if (body.modality !== undefined) service.modality = body.modality === 'virtual' ? 'virtual' : 'presencial';
  if (body.active !== undefined) service.active = !!body.active;
  service.updatedAt = nowISO();
  scheduleSave();
  sendJson(res, 200, { service });
});

route('DELETE', '/api/admin/services/:id', 'admin', ({ params, res }) => {
  const idx = db.services.findIndex((s) => s.id === params.id);
  if (idx < 0) return fail(res, 404, 'Servicio no encontrado.');
  db.services.splice(idx, 1);
  scheduleSave();
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/admin/orders', 'admin', ({ query }) => {
  const kind = query.get('kind') || '';
  let list = db.orders.slice();
  if (kind) list = list.filter((o) => o.kind === kind);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    orders: list.map((o) => ({
      ...o,
      remaining: restingSessions(o),
      user: publicUser(db.users.find((u) => u.id === o.userId)),
      payment: db.payments.find((p) => p.kind !== 'booking' && p.refId === o.id) || null,
    })),
  };
});

route('PATCH', '/api/admin/orders/:id', 'admin', ({ params, body, res }) => {
  const order = db.orders.find((o) => o.id === params.id);
  if (!order) return fail(res, 404, 'Solicitud no encontrada.');
  if (body.action === 'approve') {
    if (order.status !== 'pending_review') return fail(res, 400, 'Esta solicitud ya fue revisada.');
    const price = round(body.price);
    if (price <= 0) return fail(res, 400, 'Ingresa un valor para el plan.');
    const sessions = Math.min(100, Math.max(1, round(body.sessions || order.sessions)));
    order.price = price;
    order.sessions = sessions;
    order.remaining = sessions;
    order.adminNotes = clean(body.adminNotes, 600);
    syncOrderStatus(order, 'pending_payment');
    const payment = {
      id: uid(), userId: order.userId, kind: 'custom', refId: order.id, concept: order.name,
      amount: price, status: 'pending', reference: '', createdAt: nowISO(),
    };
    order.paymentId = payment.id;
    db.payments.push(payment);
    scheduleSave();
    return sendJson(res, 200, { order, payment });
  }
  if (body.action === 'reject') {
    if (!['pending_review', 'pending_payment', 'review'].includes(order.status)) return fail(res, 400, 'No se puede rechazar esta solicitud.');
    order.adminNotes = clean(body.adminNotes, 600);
    syncOrderStatus(order, 'rejected');
    if (order.paymentId) {
      const p = db.payments.find((x) => x.id === order.paymentId);
      if (p && p.status !== 'confirmed') p.status = 'rejected';
    }
    scheduleSave();
    return sendJson(res, 200, { order });
  }
  if (body.action === 'update') {
    if (body.sessions !== undefined) {
      const sessions = Math.min(100, Math.max(1, round(body.sessions)));
      const diff = sessions - order.sessions;
      order.sessions = sessions;
      order.remaining = Math.max(0, restingSessions(order) + diff);
    }
    if (body.name !== undefined) order.name = clean(body.name, 90);
    if (body.description !== undefined) order.description = clean(body.description, 800);
    if (body.price !== undefined) order.price = Math.max(0, round(body.price));
    order.updatedAt = nowISO();
    scheduleSave();
    return sendJson(res, 200, { order });
  }
  return fail(res, 400, 'Acción inválida.');
});

route('GET', '/api/admin/routines', 'admin', ({ query }) => {
  const userId = query.get('userId') || '';
  let list = db.routines.slice();
  if (userId) list = list.filter((r) => r.userId === userId);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    routines: list.map((r) => ({ ...r, user: publicUser(db.users.find((u) => u.id === r.userId)) })),
  };
});

route('POST', '/api/admin/routines', 'admin', ({ body, res }) => {
  const user = db.users.find((u) => u.id === body.userId && u.role === 'user');
  if (!user) return fail(res, 404, 'Usuario no encontrado.');
  const title = clean(body.title, 100);
  if (title.length < 3) return fail(res, 400, 'Ponle un título a la rutina.');
  const items = Array.isArray(body.items)
    ? body.items.slice(0, 40).map((i) => ({
      name: clean(i.name, 100), sets: clean(i.sets, 20), reps: clean(i.reps, 20),
      rest: clean(i.rest, 20), notes: clean(i.notes, 200),
    })).filter((i) => i.name)
    : [];
  if (!items.length) return fail(res, 400, 'Agrega al menos un ejercicio.');
  const routine = {
    id: uid(), userId: user.id, title,
    description: clean(body.description, 800), items,
    createdAt: nowISO(), updatedAt: nowISO(), createdBy: 'admin',
  };
  db.routines.push(routine);
  scheduleSave();
  sendJson(res, 201, { routine });
});

route('PATCH', '/api/admin/routines/:id', 'admin', ({ params, body, res }) => {
  const routine = db.routines.find((r) => r.id === params.id);
  if (!routine) return fail(res, 404, 'Rutina no encontrada.');
  if (body.title !== undefined) {
    const title = clean(body.title, 100);
    if (title.length < 3) return fail(res, 400, 'Título inválido.');
    routine.title = title;
  }
  if (body.description !== undefined) routine.description = clean(body.description, 800);
  if (body.items !== undefined && Array.isArray(body.items)) {
    routine.items = body.items.slice(0, 40).map((i) => ({
      name: clean(i.name, 100), sets: clean(i.sets, 20), reps: clean(i.reps, 20),
      rest: clean(i.rest, 20), notes: clean(i.notes, 200),
    })).filter((i) => i.name);
    if (!routine.items.length) return fail(res, 400, 'Agrega al menos un ejercicio.');
  }
  routine.updatedAt = nowISO();
  scheduleSave();
  sendJson(res, 200, { routine });
});

route('DELETE', '/api/admin/routines/:id', 'admin', ({ params, res }) => {
  const idx = db.routines.findIndex((r) => r.id === params.id);
  if (idx < 0) return fail(res, 404, 'Rutina no encontrada.');
  db.routines.splice(idx, 1);
  scheduleSave();
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/admin/reviews', 'admin', ({ query }) => {
  const status = query.get('status') || '';
  let list = db.reviews.slice();
  if (status && status !== 'all') list = list.filter((r) => r.status === status);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const counts = {
    pending: db.reviews.filter((r) => r.status === 'pending').length,
    approved: db.reviews.filter((r) => r.status === 'approved').length,
    rejected: db.reviews.filter((r) => r.status === 'rejected').length,
    total: db.reviews.length,
  };
  return {
    reviews: list.map((r) => ({
      ...r,
      user: db.users.find((u) => u.id === r.userId)
        ? publicUser(db.users.find((u) => u.id === r.userId))
        : null,
    })),
    counts,
    ...reviewsSummary(db.reviews),
  };
});

route('PATCH', '/api/admin/reviews/:id', 'admin', ({ params, body, res }) => {
  const review = db.reviews.find((r) => r.id === params.id);
  if (!review) return fail(res, 404, 'Reseña no encontrada.');
  if (body.status !== undefined) {
    if (!['pending', 'approved', 'rejected'].includes(body.status)) return fail(res, 400, 'Estado inválido.');
    review.status = body.status;
    review.moderatedAt = nowISO();
    review.moderatedBy = 'admin';
    if (body.status === 'approved') review.approvedAt = nowISO();
    else if (body.status !== 'approved' && !review.approvedAt) review.approvedAt = null;
  }
  if (body.authorName !== undefined) {
    const name = clean(body.authorName, 80);
    if (name.length < 2) return fail(res, 400, 'El nombre es demasiado corto.');
    review.authorName = name;
  }
  if (body.comment !== undefined) {
    const comment = clean(body.comment, 1200);
    if (comment.length < 10) return fail(res, 400, 'El comentario es demasiado corto.');
    review.comment = comment;
  }
  if (body.rating !== undefined) review.rating = Math.min(5, Math.max(1, round(body.rating)));
  if (body.service !== undefined) review.service = clean(body.service, 90);
  scheduleSave();
  sendJson(res, 200, { review });
});

route('DELETE', '/api/admin/reviews/:id', 'admin', ({ params, res }) => {
  const idx = db.reviews.findIndex((r) => r.id === params.id);
  if (idx < 0) return fail(res, 404, 'Reseña no encontrada.');
  db.reviews.splice(idx, 1);
  scheduleSave();
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/admin/settings', 'admin', ({ user }) => {
  const { sessionSecret, ...safe } = db.settings;
  return {
    settings: safe,
    totpEnabled: !!user.totpEnabled,
    channels: notifyPreferences(),
    clientEmail: clientEmailStatus(),
    security: {
      email: user.email,
      lastLoginAt: user.lastLoginAt || null,
      lastLoginIp: user.lastLoginIp || null,
      passwordUpdatedAt: user.passwordUpdatedAt || null,
      minPassword: PASSWORD_MIN.admin,
      sessionsActive: (user.tokenVersion || 0) + 1,
    },
  };
});

route('PATCH', '/api/admin/settings', 'admin', ({ body, res }) => {
  if (body.studioName !== undefined) db.settings.studioName = clean(body.studioName, 80) || db.settings.studioName;
  if (body.email !== undefined) db.settings.email = lower(body.email) || db.settings.email;
  if (body.notifyEmail !== undefined) {
    const value = lower(body.notifyEmail);
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail(res, 400, 'El correo de avisos no es válido.');
    db.settings.notifyEmail = value || db.settings.email;
  }
  if (body.notify && typeof body.notify === 'object') {
    db.settings.notify = {
      email: body.notify.email !== false,
      whatsapp: body.notify.whatsapp !== false,
    };
  }
  if (body.retentionRate !== undefined) {
    const rate = Number(body.retentionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 0.5) return fail(res, 400, 'La retención debe estar entre 0% y 50%.');
    db.settings.retentionRate = rate;
  }
  if (body.cancellationHours !== undefined) {
    const h = round(body.cancellationHours);
    if (h < 0 || h > 168) return fail(res, 400, 'Las horas de cancelación deben estar entre 0 y 168.');
    db.settings.cancellationHours = h;
  }
  if (body.bank && typeof body.bank === 'object') {
    for (const key of ['holder', 'rut', 'bank', 'accountType', 'accountNumber']) {
      if (body.bank[key] !== undefined) db.settings.bank[key] = clean(body.bank[key], 120);
    }
  }
  scheduleSave();
  const { sessionSecret, ...safe } = db.settings;
  sendJson(res, 200, { settings: safe, channels: notifyPreferences(), clientEmail: clientEmailStatus() });
});

/* ------------------------ Bandeja de notificaciones ----------------- */

route('GET', '/api/admin/notifications', 'admin', ({ query }) => {
  const limit = Math.min(100, Math.max(1, round(query.get('limit') || 60)));
  const unread = db.notifications.filter((n) => !n.read).length;
  return {
    notifications: db.notifications.slice(0, limit),
    unread,
    total: db.notifications.length,
    channels: notifyPreferences(),
  };
});

route('POST', '/api/admin/notifications/read', 'admin', ({ body, res }) => {
  const ids = Array.isArray(body.ids) ? body.ids : null;
  for (const item of db.notifications) {
    if (!ids || ids.includes(item.id)) item.read = true;
  }
  scheduleSave();
  sendJson(res, 200, { ok: true, unread: db.notifications.filter((n) => !n.read).length });
});

route('DELETE', '/api/admin/notifications/:id', 'admin', ({ params, res }) => {
  const index = db.notifications.findIndex((n) => n.id === params.id);
  if (index < 0) return fail(res, 404, 'Notificación no encontrada.');
  db.notifications.splice(index, 1);
  scheduleSave();
  sendJson(res, 200, { ok: true, unread: db.notifications.filter((n) => !n.read).length });
});

route('POST', '/api/admin/notifications/test', 'admin', async ({ res }) => {
  const record = await notifyEvent(
    'test',
    'Prueba de notificaciones',
    'Si recibiste este mensaje, los avisos del panel están funcionando correctamente.',
    { type: 'test' },
  );
  sendJson(res, 200, { ok: true, delivery: record.delivery, channels: notifyPreferences() });
});

/* ---------------------- Mantenimiento y datos demo ------------------ */

route('POST', '/api/admin/maintenance/reset-data', 'admin', ({ body, user, res }) => {
  if (!checkPassword(body.password, user)) return fail(res, 400, 'Contraseña incorrecta.');
  if (clean(body.confirm, 20).toUpperCase() !== 'BORRAR') {
    return fail(res, 400, 'Escribe BORRAR para confirmar la limpieza.');
  }
  const removed = {
    clientes: db.users.filter((u) => u.role !== 'admin').length,
    reservas: db.bookings.length,
    planes: db.orders.length,
    pagos: db.payments.length,
    rutinas: db.routines.length,
    resenas: db.reviews.length,
    gastos: db.expenses.length,
    boletas: db.boletas.length,
    notificaciones: db.notifications.length,
  };
  db.users = db.users.filter((u) => u.role === 'admin');
  db.bookings = [];
  db.orders = [];
  db.payments = [];
  db.routines = [];
  db.reviews = [];
  db.expenses = [];
  db.boletas = [];
  db.notifications = [];
  scheduleSave();
  sendJson(res, 200, { ok: true, removed, message: 'Datos de clientes y movimientos eliminados. El catálogo y la configuración se mantienen.' });
});

route('POST', '/api/admin/totp/reset', 'admin', ({ body, user, res }) => {
  if (!checkPassword(body.password, user)) return fail(res, 400, 'Contraseña incorrecta.');
  const secret = base32Encode(crypto.randomBytes(20));
  const setupToken = signToken({ uid: user.id, purpose: 'totp-setup', secret, tv: user.tokenVersion || 0 }, 10 * 60 * 1000);
  sendJson(res, 200, { setupToken, secret, otpauth: otpauthUri(secret, user.email) });
});

function sendCsv(res, filename, rows) {
  const body = `\uFEFF${rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

route('GET', '/api/admin/export/boletas.csv', 'admin', ({ res }) => {
  const rate = Number(db.settings.retentionRate) || 0.1525;
  const rows = db.payments
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => String(a.confirmedAt).localeCompare(String(b.confirmedAt)));
  const csv = [
    ['Fecha', 'Cliente', 'Correo', 'Concepto', 'Monto bruto', 'Retencion 15,25%', 'Neto'],
    ...rows.map((p) => {
      const u = db.users.find((x) => x.id === p.userId);
      const gross = round(p.amount);
      const ret = Math.round(gross * rate);
      return [
        p.confirmedAt ? localDateStr(new Date(p.confirmedAt)) : '',
        u?.name || '', u?.email || '', paymentConcept(p),
        gross, ret, gross - ret,
      ];
    }),
  ];
  const body = `\uFEFF${csv.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="boletas-recovery-studio-${localDateStr()}.csv"`,
    ...SECURITY_HEADERS, 'Cache-Control': 'no-store',
  });
  res.end(body);
});

route('GET', '/api/admin/export/pagos.csv', 'admin', ({ res }) => {
  const rows = db.payments.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const csv = [
    ['Fecha', 'Cliente', 'Correo', 'Concepto', 'Monto', 'Estado', 'Referencia'],
    ...rows.map((p) => {
      const u = db.users.find((x) => x.id === p.userId);
      return [p.createdAt ? localDateStr(new Date(p.createdAt)) : '', u?.name || '', u?.email || '', paymentConcept(p), round(p.amount), p.status, p.reference || ''];
    }),
  ];
  const body = `\uFEFF${csv.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pagos-recovery-studio-${localDateStr()}.csv"`,
    ...SECURITY_HEADERS, 'Cache-Control': 'no-store',
  });
  res.end(body);
});

route('GET', '/api/admin/export/ingresos.csv', 'admin', ({ query, res }) => {
  const key = validMonth(query.get('month'));
  const rows = confirmedPaymentsInMonth(key)
    .slice()
    .sort((a, b) => String(a.confirmedAt).localeCompare(String(b.confirmedAt)))
    .map((p) => [
      localDateStr(new Date(p.confirmedAt)),
      p.reference || '',
      paymentUser(p)?.name || '',
      paymentConcept(p),
      paymentCategory(p),
      p.method || 'Transferencia',
      round(p.amount),
    ]);
  sendCsv(res, `ingresos-${key}.csv`, [['Fecha', 'Referencia', 'Cliente', 'Concepto', 'Categoría', 'Método', 'Monto'], ...rows]);
});

route('GET', '/api/admin/export/gastos.csv', 'admin', ({ query, res }) => {
  const key = validMonth(query.get('month'));
  const rows = db.expenses
    .filter((e) => monthOf(e.date) === key)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((e) => [e.date, e.category, e.description, e.method, round(e.amount)]);
  sendCsv(res, `gastos-${key}.csv`, [['Fecha', 'Categoría', 'Descripción', 'Método', 'Monto'], ...rows]);
});

route('GET', '/api/admin/export/honorarios.csv', 'admin', ({ query, res }) => {
  const key = validMonth(query.get('month'));
  const fallback = Number(db.settings.retentionRate) || 0.1525;
  const rows = db.boletas
    .filter((b) => monthOf(b.date) === key)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((b) => {
      const rate = b.retentionRate === undefined || b.retentionRate === null ? fallback : Number(b.retentionRate);
      const gross = round(b.gross);
      const retention = Math.round(gross * rate);
      return [b.number, b.date, b.client, gross, retention, gross - retention, b.notes || ''];
    });
  sendCsv(res, `honorarios-${key}.csv`, [['N°', 'Fecha', 'Cliente', 'Monto bruto', 'Retención', 'Neto', 'Notas'], ...rows]);
});

/* ------------------------------ Respaldos -------------------------- */

route('GET', '/api/admin/export/db.json', 'admin', ({ res }) => {
  const body = JSON.stringify(db, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="recovery-studio-backup-${localDateStr()}.json"`,
    ...SECURITY_HEADERS, 'Cache-Control': 'no-store',
  });
  res.end(body);
});

/* ------------------------------- Crons ----------------------------- */

route('GET', '/api/cron/reminders', 'public', async ({ req, res }) => {
  if (!cronAuthorized(req)) return fail(res, 401, 'No autorizado.');

  const tomorrow = addDaysLocal(localDateStr(), 1);
  const list = db.bookings
    .filter((b) => b.date === tomorrow && ['pending', 'confirmed'].includes(b.status))
    .sort((a, b) => `${a.time}`.localeCompare(`${b.time}`));

  const summary = list.length
    ? list.map((b) => {
      const client = db.users.find((u) => u.id === b.userId);
      return `· ${b.time} — ${client?.name || 'Cliente'} · ${b.serviceName} (${b.status === 'confirmed' ? 'confirmada' : 'por confirmar'})`;
    }).join('\n')
    : 'No hay sesiones agendadas para mañana.';

  await notifyEvent(
    'reminder_daily',
    `Agenda de mañana · ${humanDate(tomorrow)}`,
    `${list.length} ${list.length === 1 ? 'sesión' : 'sesiones'} para mañana.\n\n${summary}`,
    { type: 'reminder', date: tomorrow, total: list.length },
  );

  let sent = 0;
  let off = 0;
  let skipped = 0;
  for (const booking of list) {
    const slot = `${booking.date} ${booking.time}`;
    if (booking.reminderSentFor === slot) { skipped += 1; continue; }
    const client = db.users.find((u) => u.id === booking.userId);
    if (!client) { skipped += 1; continue; }
    const result = await notifyClient(client, 'Recordatorio de tu sesión', [
      `Hola ${client.name.split(' ')[0]}, te recordamos tu sesión de ${booking.serviceName}.`,
      `Fecha: ${humanDate(booking.date)} a las ${booking.time} (${booking.modality}).`,
      booking.status === 'confirmed'
        ? 'Tu sesión está confirmada. Si no puedes asistir, revisa la política de cancelación en tu panel.'
        : 'Tu sesión está por confirmar por el studio. Te avisaremos si cambia algo.',
    ]);
    booking.reminderSentFor = slot;
    booking.reminderSentAt = nowISO();
    if (result.status === 'sent') sent += 1;
    else if (result.status === 'off') off += 1;
    else skipped += 1;
  }
  scheduleSave();

  sendJson(res, 200, { ok: true, date: tomorrow, total: list.length, sent, off, skipped });
});

route('GET', '/api/cron/backup', 'public', async ({ req, res }) => {
  if (!cronAuthorized(req)) return fail(res, 401, 'No autorizado.');

  const json = JSON.stringify(db, null, 2);
  const filename = `recovery-studio-backup-${localDateStr()}.json`;
  const result = await deliver({
    subject: `[${db.settings.studioName}] Respaldo diario ${localDateStr()}`,
    text: `Respaldo diario de la base de datos.\n\nArchivo: ${filename}\nTamaño: ${json.length} bytes\nUsuarios: ${db.users.length}\nReservas: ${db.bookings.length}\nPagos: ${db.payments.length}`,
    attachments: [{ filename, content: Buffer.from(json, 'utf8').toString('base64') }],
    settings: db.settings,
  });

  if (result.email.status !== 'sent') {
    return fail(res, 503, `No se pudo enviar el respaldo: ${result.email.reason || result.email.status}`);
  }
  sendJson(res, 200, { ok: true, filename, bytes: json.length, email: result.email.status });
});


/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, SECURITY_HEADERS); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (!pathname.startsWith('/api')) {
        const index = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(index, (e, data) => {
          if (e) { res.writeHead(404, SECURITY_HEADERS); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
          res.end(data);
        });
        return;
      }
      res.writeHead(404, SECURITY_HEADERS); res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const cache = ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600';
    fs.readFile(filePath, (e, data) => {
      if (e) { res.writeHead(500, SECURITY_HEADERS); res.end('Error'); return; }
      const noCache = ['/sw.js', '/manifest.webmanifest'].includes(pathname);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : cache, ...SECURITY_HEADERS });
      res.end(data);
    });
  });
}

async function handleRequest(req, res) {
  const started = Date.now();
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (!pathname.startsWith('/api')) {
      if (pathname === '/resenas' || pathname === '/sauna') {
        res.writeHead(302, { Location: `/#${pathname}`, ...SECURITY_HEADERS });
        res.end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, SECURITY_HEADERS); res.end('Method not allowed'); return;
      }
      serveStatic(req, res, pathname);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin) {
        try {
          if (new URL(origin).host !== req.headers.host) return fail(res, 403, 'Origen no permitido.');
        } catch { return fail(res, 403, 'Origen no permitido.'); }
      }
    }

    const found = matchRoute(req.method, pathname);
    if (!found) return fail(res, 404, 'Ruta no encontrada.');

    const user = currentUser(req);
    if (found.route.access === 'auth' && !user) return fail(res, 401, 'Debes iniciar sesión.', { code: 'auth_required' });
    if (found.route.access === 'admin' && !isAdmin(user)) {
      return fail(res, user ? 403 : 401, user ? 'Solo el administrador puede acceder.' : 'Debes iniciar sesión.', { code: 'admin_required' });
    }

    let body = {};
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) body = await readBody(req);

    const ctx = { req, res, params: found.params, query: url.searchParams, body, user, ip: clientIp(req) };
    const result = await found.route.handler(ctx);
    if (!res.writableEnded) {
      if (result !== undefined) sendJson(res, 200, result);
      else { res.writeHead(204, SECURITY_HEADERS); res.end(); }
    }
  } catch (err) {
    console.error(`[${req.method} ${req.url}]`, err);
    if (!res.headersSent) fail(res, err.status || 500, err.status ? err.message : 'Error interno del servidor.');
    else res.end();
  } finally {
    if (pathnameSafe(req.url).startsWith('/api')) {
      const ms = Date.now() - started;
      if (ms > 800) console.log(`slow ${req.method} ${req.url} ${ms}ms`);
    }
  }
}

function pathnameSafe(u) {
  try { return new URL(u, 'http://x').pathname; } catch { return ''; }
}

/**
 * Punto de entrada único: sirve tanto para el servidor Node local como para
 * Vercel Functions. En Vercel la base de datos vive en Redis (ver lib/store.js).
 */
export async function requestHandler(req, res) {
  if (!REMOTE_DB) {
    initLocalDb();
    await handleRequest(req, res);
    return;
  }

  const method = String(req.method || 'GET').toUpperCase();
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  let release = null;

  try {
    // Serializa escrituras entre instancias y evita pisar cambios.
    if (mutating || !db) release = await acquireLock();

    const remote = await readRemoteDb();
    if (remote) {
      setDb(remote);
    } else if (!db) {
      setDb(seedDb());
      dirty = true; // primera puesta en marcha: persistir la semilla
    }

    await handleRequest(req, res);
  } catch (err) {
    console.error('Error en la petición:', err);
    if (!res.headersSent) fail(res, err.status || 500, err.status ? err.message : 'Error interno del servidor.');
    else if (!res.writableEnded) res.end();
  } finally {
    try {
      if (dirty && db) {
        await writeRemoteDb(db);
        dirty = false;
      }
    } catch (err) {
      console.error('No se pudo guardar la base de datos remota:', err);
    }
    if (release) await release();
  }
}

const server = http.createServer(async (req, res) => {
  if (!REMOTE_DB) initLocalDb();
  await handleRequest(req, res);
});

if (!process.env.VERCEL) {
  initLocalDb();
  server.listen(PORT, HOST, () => {
    console.log('==========================================');
    console.log(`  ${db.settings.studioName}`);
    console.log(`  Servidor: http://localhost:${PORT}`);
    console.log(`  Datos:    ${REMOTE_DB ? 'Redis remoto' : DB_FILE}`);
    console.log('==========================================');
    if (db.users.find((u) => u.role === 'admin' && !u.totpEnabled)) {
      console.log('  Admin sin authenticator: se pedirá configurarlo al ingresar.');
    }
  });
}
