import crypto from 'node:crypto';

const BASE = 'http://127.0.0.1:3000';
let cookie = '';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of str.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, ms = Date.now()) {
  const counter = Math.floor(ms / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  return String((((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1000000).padStart(6, '0');
}

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'RecoveryStudio', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length) cookie = setCookie[0].split(';')[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  console.log(method, path, res.status, typeof data === 'string' ? data : JSON.stringify(data).slice(0, 320));
  return { status: res.status, data, headers: res.headers };
}

function assert(cond, message) {
  if (!cond) { console.error('ASSERT FAIL:', message); process.exitCode = 1; }
}

// Landing assets
for (const p of ['/', '/styles.css', '/app.js', '/js/core.js', '/vendor/qrcode.js']) {
  const r = await fetch(BASE + p);
  console.log('GET', p, r.status);
  assert(r.status === 200, p);
}

const cfg = await req('/api/public/config');
assert(cfg.data.services?.length >= 4, 'services seed');
const svc = cfg.data.services[0];
const plan = cfg.data.plans[0];

// Logout stray
await req('/api/auth/logout', { method: 'POST' });

// Register user
const email = `test${Date.now()}@example.com`;
const reg = await req('/api/auth/register', { method: 'POST', body: { name: 'Cliente Prueba', email, password: '1234', phone: '+56911111111' } });
assert(reg.status === 201, 'register');
const me = await req('/api/auth/me');
assert(me.data.user?.email === email, 'me user');

// Availability
const date = new Date(); date.setDate(date.getDate() + 3);
const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const avail = await req(`/api/availability?date=${dateStr}`);
const slot = avail.data.slots?.find((s) => s.available);
assert(slot, 'available slot');

// Booking
const bookingRes = await req('/api/bookings', { method: 'POST', body: { serviceId: svc.id, date: dateStr, time: slot.time, modality: 'presencial', notes: 'Prueba automatizada' } });
assert(bookingRes.status === 201, 'booking created');
const booking = bookingRes.data.booking;
const payment = bookingRes.data.payment;

// Mark transfer
await req(`/api/payments/${payment.id}/transfer`, { method: 'POST', body: { reference: 'COMP-1234' } });

// Patient cannot see admin data
const forbidden = await fetch(BASE + '/api/admin/users', { headers: { Cookie: cookie } });
console.log('GET /api/admin/users as user', forbidden.status);
assert(forbidden.status === 403, 'user forbidden admin');

// User summary, orders
await req('/api/me/summary');
const orderRes = await req('/api/orders', { method: 'POST', body: { planId: plan.id } });
assert(orderRes.status === 201, 'order created');
await req(`/api/payments/${orderRes.data.payment.id}/transfer`, { method: 'POST', body: { reference: 'PLAN-999' } });

const customRes = await req('/api/orders/custom', { method: 'POST', body: { name: 'Plan rodilla', sessions: 6, description: 'Rehabilitación post operatorio' } });
assert(customRes.status === 201, 'custom order');

// Logout, admin login with TOTP setup
await req('/api/auth/logout', { method: 'POST' });
const login1 = await req('/api/auth/login', { method: 'POST', body: { email: 'recoverystudio7@gmail.com', password: 'recoverystudio!!' } });
assert(login1.data.totpSetupRequired, 'totp setup required');
const code = totp(login1.data.secret);
const enabled = await req('/api/auth/totp/enable', { method: 'POST', body: { setupToken: login1.data.setupToken, code } });
assert(enabled.status === 200 && enabled.data.user.role === 'admin', 'admin totp enabled');

// Admin data
const stats = await req('/api/admin/stats');
assert(stats.data.income.total >= 0, 'stats');
const bookings = await req('/api/admin/bookings?status=pending');
const found = bookings.data.bookings.find((b) => b.id === booking.id);
assert(found, 'admin sees booking');

// Confirm payment & booking
await req(`/api/admin/payments/${payment.id}`, { method: 'PATCH', body: { status: 'confirmed' } });
const paymentsData = await req('/api/admin/payments');
const orderPay = paymentsData.data.payments.find((p) => p.reference === 'PLAN-999');
await req(`/api/admin/payments/${orderPay.id}`, { method: 'PATCH', body: { status: 'confirmed' } });

const ordersAdmin = await req('/api/admin/orders');
const custom = ordersAdmin.data.orders.find((o) => o.name === 'Plan rodilla');
const approved = await req(`/api/admin/orders/${custom.id}`, { method: 'PATCH', body: { action: 'approve', sessions: 6, price: 150000, adminNotes: 'Incluye evaluación' } });
assert(approved.status === 200, 'custom approved');
// Approve creates payment; confirm it
const orderPaymentId = approved.data.payment.id;
await req(`/api/admin/payments/${orderPaymentId}`, { method: 'PATCH', body: { status: 'confirmed' } });

// Confirm booking, mark attended
await req(`/api/admin/bookings/${booking.id}`, { method: 'PATCH', body: { status: 'confirmed' } });
await req(`/api/admin/bookings/${booking.id}`, { method: 'PATCH', body: { status: 'attended', adminNotes: 'Todo bien' } });

// Routine
const users = await req('/api/admin/users');
const user = users.data.users.find((u) => u.email === email);
const routine = await req('/api/admin/routines', { method: 'POST', body: { userId: user.id, title: 'Rutina inicial', description: 'Tres veces por semana', items: [{ name: 'Sentadilla', sets: '3', reps: '10', rest: '60s', notes: 'Sin dolor' }] } });
assert(routine.status === 201, 'routine created');

// Admin settings
await req('/api/admin/settings');

// Plan CRUD duplicate check
const createdPlan = await req('/api/admin/plans', { method: 'POST', body: { name: 'Plan test', sessions: 2, price: 50000, description: 'Test' } });
assert(createdPlan.status === 201, 'plan create');
const dupPlan = await req('/api/admin/plans', { method: 'POST', body: { name: 'Plan test', sessions: 2, price: 50000, description: 'Duplicado' } });
assert(dupPlan.status === 409, 'duplicate blocked');

// CSV
const csvRes = await fetch(BASE + '/api/admin/export/boletas.csv', { headers: { Cookie: cookie } });
const csv = await csvRes.text();
console.log('CSV', csvRes.status, csv.slice(0, 80));
assert(csvRes.status === 200 && csv.includes('Retencion'), 'csv');

// Admin logout, user login again
await req('/api/auth/logout', { method: 'POST' });
const userLogin = await req('/api/auth/login', { method: 'POST', body: { email, password: '1234' } });
assert(userLogin.status === 200, 'user login');
const routinesMine = await req('/api/routines/mine');
assert(routinesMine.data.routines.length === 1, 'user sees routine');
const myBookings = await req('/api/bookings');
assert(myBookings.data.bookings.length >= 1, 'user bookings');

// Reschedule policy: create a booking tomorrow, reschedule should be blocked within 12h depending time
const today = new Date();
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
const av2 = await req(`/api/availability?date=${tomorrowStr}`);
const free = av2.data.slots?.filter((s) => s.available) || [];
if (free.length) {
  const b2 = await req('/api/bookings', { method: 'POST', body: { serviceId: svc.id, date: tomorrowStr, time: free[0].time, modality: 'presencial' } });
  const resched = await req(`/api/bookings/${b2.data.booking.id}/reschedule`, { method: 'POST', body: { date: dateStr, time: slot.time } });
  console.log('Reschedule status expected 400 if within 12h:', resched.status, resched.data.error || 'ok');
}
console.log('\nSMOKE TEST DONE');
