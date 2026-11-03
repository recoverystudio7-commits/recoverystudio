/* ==========================================================================
   Autenticación · login, registro y authenticator (TOTP)
   ========================================================================== */

import {
  $, state, api, toast, esc, icon, qrSvg, bindCopyButtons, go, openModal, closeModal,
} from './core.js';

export function routeAfterLogin() {
  const next = sessionStorage.getItem('rs_next');
  sessionStorage.removeItem('rs_next');
  const fallback = state.me?.role === 'admin' ? '#/admin' : '#/app';
  go(next || fallback);
}

function authAside() {
  return `
    <aside class="auth-aside">
      <a class="brand" href="#/">
        <span class="brand-mark">R</span>
        <span class="brand-name"><b>Recovery Studio</b><span>Kinesiología & movimiento</span></span>
      </a>
      <div class="auth-quote">
        <div class="eyebrow light">Tu proceso, en orden</div>
        <h2 style="margin-top:16px">Un espacio para <span>recuperar</span> tu movimiento.</h2>
        <p>Agenda tus sesiones, revisa tus planes y sigue tus rutinas desde un solo lugar. Atención personalizada, sin complicaciones.</p>
        <div class="auth-points">
          <div>${icon('calendarCheck')}<span>Agenda online con confirmación del studio.</span></div>
          <div>${icon('layers')}<span>Planes de sesiones y planes a tu medida.</span></div>
          <div>${icon('activity')}<span>Rutinas y seguimiento siempre disponibles.</span></div>
          <div>${icon('shield')}<span>Datos privados: cada cliente ve solo lo suyo.</span></div>
        </div>
      </div>
      <div class="auth-foot">© ${new Date().getFullYear()} Recovery Studio · Todos los derechos reservados.</div>
    </aside>`;
}

function mobileBrand() {
  return `<a class="brand mobile-brand" href="#/">
    <span class="brand-mark">R</span>
    <span class="brand-name"><b>Recovery Studio</b><span>Kinesiología & movimiento</span></span>
  </a>`;
}

export function renderAuth(mode = 'login') {
  if (state.me) {
    go(state.me.role === 'admin' ? '#/admin' : '#/app');
    return;
  }
  document.body.classList.remove('no-scroll');
  const isLogin = mode === 'login';
  document.title = isLogin ? 'Ingresar · Recovery Studio' : 'Crear cuenta · Recovery Studio';

  $('#app').innerHTML = `
    <div class="auth-shell">
      ${authAside()}
      <main class="auth-main">
        <div class="auth-card" id="auth-card">
          ${mobileBrand()}
          <h1>${isLogin ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</h1>
          <p class="sub">${isLogin
            ? 'Ingresa para agendar, revisar tus sesiones y pagos.'
            : 'Regístrate para agendar tu primera sesión en Recovery Studio.'}</p>
          <div class="card card-pad">
            <div class="form-error hidden" id="auth-error"></div>
            <form id="auth-form" novalidate>
              ${isLogin ? '' : `
                <div class="field">
                  <label for="name">Nombre completo</label>
                  <input class="input" id="name" name="name" autocomplete="name" placeholder="Ej: María González" required />
                </div>
                <div class="field">
                  <label for="phone">Teléfono <span class="muted">(opcional)</span></label>
                  <input class="input" id="phone" name="phone" autocomplete="tel" placeholder="+56 9 1234 5678" />
                </div>`}
              <div class="field">
                <label for="email">Correo electrónico</label>
                <input class="input" id="email" name="email" type="email" autocomplete="email" placeholder="tucorreo@ejemplo.cl" required />
              </div>
              <div class="field">
                <label for="password">${isLogin ? 'Contraseña o PIN' : 'Crea una contraseña o PIN'}</label>
                <input class="input" id="password" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="Mínimo 4 caracteres" required minlength="4" />
                ${isLogin ? '' : '<span class="hint">Puede ser un PIN de 4 dígitos o una contraseña más larga.</span>'}
              </div>
              <div class="field hidden" id="code-group">
                <label for="code">Código del authenticator</label>
                <input class="input code-input" id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" />
                <span class="hint">Abre Google Authenticator, Authy u otra app TOTP e ingresa el código de 6 dígitos.</span>
              </div>
              <button class="btn block lg" type="submit" id="auth-submit">${isLogin ? 'Ingresar' : 'Crear cuenta'}</button>
            </form>
            <p class="auth-switch">${isLogin
              ? '¿Aún no tienes cuenta? <a href="#/registro">Regístrate aquí</a>'
              : '¿Ya tienes cuenta? <a href="#/login">Ingresa aquí</a>'}</p>
          </div>
          <p class="auth-legal">Al continuar aceptas la política de cancelación y reagendamiento de 12 horas. No se realizan reembolsos.<br>El acceso de administrador requiere código de authenticator.</p>
        </div>
      </main>
    </div>`;

  const form = $('#auth-form');
  const errorBox = $('#auth-error');
  const submit = $('#auth-submit');

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    const email = $('#email').value.trim();
    const password = $('#password').value;
    const code = $('#code')?.value.trim() || '';
    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span> Procesando…';
    try {
      if (isLogin) {
        const data = await api('/auth/login', { method: 'POST', body: { email, password, code } });
        if (data.totpSetupRequired) {
          renderTotpSetupCard(data, () => routeAfterLogin());
          return;
        }
        state.me = data.user;
        toast(`Bienvenido, ${data.user.name.split(' ')[0]}.`);
        routeAfterLogin();
      } else {
        const name = $('#name').value.trim();
        const phone = $('#phone').value.trim();
        const data = await api('/auth/register', { method: 'POST', body: { name, email, password, phone } });
        state.me = data.user;
        toast('Tu cuenta fue creada. ¡Bienvenido!');
        routeAfterLogin();
      }
    } catch (err) {
      if (err.code === 'totp_required' || err.code === 'totp_invalid') {
        $('#code-group').classList.remove('hidden');
        setTimeout(() => $('#code')?.focus(), 60);
      }
      showError(err.message);
      submit.disabled = false;
      submit.textContent = isLogin ? 'Ingresar' : 'Crear cuenta';
      if (err.code === 'totp_required') {
        $('#code-group').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  $('#email').focus();
  bindCopyButtons();
}

function renderTotpSetupCard(data, onSuccess) {
  const card = $('#auth-card');
  if (!card) return;
  document.title = 'Configurar authenticator · Recovery Studio';
  card.innerHTML = `
    <div class="card card-pad">
      <div class="success-icon" style="margin:0 0 14px;background:var(--orange-soft);color:var(--orange-dark)">${icon('smartphone')}</div>
      <h1 style="font-size:23px">Activa tu authenticator</h1>
      <p class="sub">Protege el acceso de administrador. Escanea el código con Google Authenticator, Authy o Microsoft Authenticator y luego ingresa el código de 6 dígitos.</p>
      <div class="totp-box">
        <div class="qr-frame" id="qr-frame">${qrSvg(data.otpauth)}</div>
        <div class="secret-chip">
          <span id="secret-text">${esc(data.secret)}</span>
          <button class="copy-btn" type="button" data-copy="${esc(data.secret)}">${icon('copy')}</button>
        </div>
        <ol class="otp-steps">
          <li>Abre tu app de autenticación y agrega una cuenta nueva.</li>
          <li>Escanea el QR o ingresa la clave manualmente.</li>
          <li>Escribe abajo el código de 6 dígitos para confirmar.</li>
        </ol>
        <div class="form-error hidden" id="totp-error"></div>
        <form id="totp-form">
          <div class="field">
            <label for="totp-code">Código de 6 dígitos</label>
            <input class="input code-input" id="totp-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required />
          </div>
          <button class="btn block lg" type="submit" id="totp-submit">Activar authenticator e ingresar</button>
        </form>
      </div>
      <p class="auth-legal">Guarda tu clave de respaldo en un lugar seguro. Si pierdes el acceso, el administrador puede restablecerlo desde el servidor.</p>
    </div>`;
  bindCopyButtons();
  const error = $('#totp-error');
  $('#totp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');
    const btn = $('#totp-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verificando…';
    try {
      const result = await api('/auth/totp/enable', {
        method: 'POST',
        body: { setupToken: data.setupToken, code: $('#totp-code').value.trim() },
      });
      state.me = result.user;
      toast('Authenticator activado correctamente.');
      if (onSuccess) onSuccess();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Activar authenticator e ingresar';
      $('#totp-code').select();
    }
  });
  setTimeout(() => $('#totp-code')?.focus(), 100);
}

export function showTotpSetupModal(data, onDone) {
  openModal({
    title: 'Configurar nuevo authenticator',
    subtitle: 'Escanea el QR y confirma con el código de 6 dígitos.',
    size: 'wide',
    body: `
      <div class="totp-box">
        <div style="display:grid;grid-template-columns:190px 1fr;gap:20px;align-items:center" class="totp-modal-grid">
          <div class="qr-frame">${qrSvg(data.otpauth)}</div>
          <div>
            <p class="small muted" style="margin-bottom:8px">1. Abre Google Authenticator, Authy o Microsoft Authenticator.</p>
            <p class="small muted" style="margin-bottom:12px">2. Escanea el código o agrega esta clave manualmente:</p>
            <div class="secret-chip"><span>${esc(data.secret)}</span><button class="copy-btn" type="button" data-copy="${esc(data.secret)}">${icon('copy')}</button></div>
          </div>
        </div>
        <div class="form-error hidden" id="modal-totp-error"></div>
        <div class="field" style="margin-bottom:0">
          <label for="modal-totp-code">3. Código de verificación</label>
          <input class="input code-input" id="modal-totp-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" />
        </div>
      </div>`,
    footer: `<button class="btn ghost sm" type="button" id="modal-totp-cancel">Cancelar</button>
             <button class="btn sm" type="button" id="modal-totp-submit">Activar authenticator</button>`,
    onMount(modal) {
      bindCopyButtons(modal);
      $('#modal-totp-cancel', modal).onclick = () => closeModal();
      const error = $('#modal-totp-error', modal);
      $('#modal-totp-submit', modal).onclick = async (e) => {
        const btn = e.currentTarget;
        const code = $('#modal-totp-code', modal).value.trim();
        if (!/^\d{6}$/.test(code)) {
          error.textContent = 'Ingresa un código de 6 dígitos.';
          error.classList.remove('hidden');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Verificando…';
        try {
          const result = await api('/auth/totp/enable', { method: 'POST', body: { setupToken: data.setupToken, code } });
          state.me = result.user;
          closeModal();
          toast('Authenticator actualizado.');
          if (onDone) onDone(result.user);
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Activar authenticator';
        }
      };
      setTimeout(() => $('#modal-totp-code', modal)?.focus(), 100);
    },
  });
}
