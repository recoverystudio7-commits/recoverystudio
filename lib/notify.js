/**
 * Notificaciones salientes por correo y WhatsApp.
 *
 * Sin dependencias: usa fetch nativo (Resend, CallMeBot y Twilio).
 * Si no hay credenciales configuradas, el canal queda apagado y la
 * notificación igual se guarda en la bandeja interna del panel.
 *
 * Variables de entorno:
 *   RESEND_API_KEY        API key de resend.com (correo)
 *   RESEND_FROM           Remitente verificado (por defecto onboarding@resend.dev)
 *   NOTIFY_EMAIL          Destino alternativo (por defecto settings.email)
 *   CALLMEBOT_PHONE       Número de WhatsApp, formato internacional (+56...)
 *   CALLMEBOT_APIKEY      API key que entrega el bot de CallMeBot
 *   TWILIO_ACCOUNT_SID    Alternativa a CallMeBot
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM  Ej: whatsapp:+14155238886
 *   TWILIO_WHATSAPP_TO    Ej: whatsapp:+56912345678
 */

const TIMEOUT_MS = 6000;

function env(name) {
  return String(process.env[name] || '').trim();
}

function emailTo(settings = {}) {
  return env('NOTIFY_EMAIL') || String(settings.notifyEmail || settings.email || '').trim();
}

function twilioReady() {
  return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_WHATSAPP_FROM') && env('TWILIO_WHATSAPP_TO'));
}

function callmebotReady() {
  return !!(env('CALLMEBOT_PHONE') && env('CALLMEBOT_APIKEY'));
}

/**
 * Remitente para correos a clientes. Resend solo permite enviar a terceros
 * desde un dominio verificado; onboarding@resend.dev queda limitado al dueño.
 */
function clientFrom() {
  const from = env('RESEND_CLIENT_FROM') || env('RESEND_FROM');
  if (!from) return '';
  if (/@resend\.dev\b/i.test(from)) return '';
  return from;
}

export function clientEmailStatus() {
  const from = clientFrom();
  return {
    configured: !!env('RESEND_API_KEY') && !!from,
    from,
    hint: from ? '' : 'Verifica un dominio en Resend y define RESEND_CLIENT_FROM para escribir a clientes.',
  };
}

/** Estado de cada canal según variables de entorno y preferencias guardadas. */
export function channelStatus(settings = {}) {
  const prefs = settings.notify || {};
  const emailConfigured = !!env('RESEND_API_KEY');
  const whatsappConfigured = callmebotReady() || twilioReady();
  return {
    email: {
      configured: emailConfigured,
      enabled: emailConfigured && prefs.email !== false,
      to: emailTo(settings),
      provider: emailConfigured ? 'resend' : '',
      hint: emailConfigured ? '' : 'Falta RESEND_API_KEY en Vercel.',
    },
    whatsapp: {
      configured: whatsappConfigured,
      enabled: whatsappConfigured && prefs.whatsapp !== false,
      to: twilioReady() ? env('TWILIO_WHATSAPP_TO') : env('CALLMEBOT_PHONE'),
      provider: twilioReady() ? 'twilio' : (callmebotReady() ? 'callmebot' : ''),
      hint: whatsappConfigured ? '' : 'Falta configurar CallMeBot o Twilio en Vercel.',
    },
  };
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail({ subject, text, html, to, from, attachments }, settings) {
  const key = env('RESEND_API_KEY');
  const recipient = to || emailTo(settings);
  if (!key) return { status: 'off', reason: 'Falta RESEND_API_KEY.' };
  if (!recipient) return { status: 'off', reason: 'Falta correo de destino.' };
  try {
    const payload = {
      from: from || env('RESEND_FROM') || 'Recovery Studio <onboarding@resend.dev>',
      to: [recipient],
      subject,
      text,
      html,
    };
    if (Array.isArray(attachments) && attachments.length) payload.attachments = attachments;
    const res = await request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { status: 'failed', reason: `Resend HTTP ${res.status}: ${detail.slice(0, 180)}` };
    }
    const data = await res.json().catch(() => ({}));
    return { status: 'sent', provider: 'resend', to: recipient, id: data.id || '' };
  } catch (err) {
    return { status: 'failed', reason: err.name === 'AbortError' ? 'Resend no respondió a tiempo.' : err.message };
  }
}

async function sendCallMeBot(text) {
  try {
    const params = new URLSearchParams({
      phone: env('CALLMEBOT_PHONE'),
      text,
      apikey: env('CALLMEBOT_APIKEY'),
    });
    const res = await request(`https://api.callmebot.com/whatsapp.php?${params.toString()}`, { method: 'GET' });
    const detail = await res.text().catch(() => '');
    if (!res.ok) return { status: 'failed', reason: `CallMeBot HTTP ${res.status}: ${detail.slice(0, 180)}` };
    return { status: 'sent', provider: 'callmebot', to: env('CALLMEBOT_PHONE') };
  } catch (err) {
    return { status: 'failed', reason: err.name === 'AbortError' ? 'CallMeBot no respondió a tiempo.' : err.message };
  }
}

async function sendTwilio(text) {
  try {
    const sid = env('TWILIO_ACCOUNT_SID');
    const auth = Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64');
    const body = new URLSearchParams({
      From: env('TWILIO_WHATSAPP_FROM'),
      To: env('TWILIO_WHATSAPP_TO'),
      Body: text,
    });
    const res = await request(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { status: 'failed', reason: `Twilio HTTP ${res.status}: ${detail.slice(0, 180)}` };
    }
    return { status: 'sent', provider: 'twilio', to: env('TWILIO_WHATSAPP_TO') };
  } catch (err) {
    return { status: 'failed', reason: err.name === 'AbortError' ? 'Twilio no respondió a tiempo.' : err.message };
  }
}

async function sendWhatsApp(text) {
  if (twilioReady()) return sendTwilio(text);
  if (callmebotReady()) return sendCallMeBot(text);
  return { status: 'off', reason: 'Falta configurar WhatsApp.' };
}

/**
 * Envía la notificación por los canales habilitados.
 * Nunca lanza: devuelve el estado de cada canal.
 */
export async function deliver({ subject, text, html, attachments, settings = {} }) {
  const status = channelStatus(settings);
  const results = {
    email: { status: 'off' },
    whatsapp: { status: 'off' },
  };
  const tasks = [];
  if (status.email.enabled) {
    tasks.push(sendEmail({ subject, text, html: html || text.replace(/\n/g, '<br>'), attachments }, settings)
      .then((r) => { results.email = r; }));
  }
  if (status.whatsapp.enabled) {
    tasks.push(sendWhatsApp(text).then((r) => { results.whatsapp = r; }));
  }
  if (tasks.length) await Promise.all(tasks);
  return results;
}

/**
 * Envía un correo transaccional a un cliente desde un dominio verificado.
 * Si no hay dominio configurado o Resend falla, devuelve el estado sin lanzar.
 */
export async function deliverTo({ to, subject, text, html, attachments }) {
  const key = env('RESEND_API_KEY');
  if (!key) return { status: 'off', reason: 'Falta RESEND_API_KEY.' };
  const from = clientFrom();
  if (!from) return { status: 'off', reason: 'Falta RESEND_CLIENT_FROM con un dominio verificado.' };
  return sendEmail({ subject, text, html: html || text.replace(/\n/g, '<br>'), to, from, attachments }, {});
}
