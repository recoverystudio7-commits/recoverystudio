/* ==========================================================================
   Recovery Studio · entrada de la aplicación
   ========================================================================== */

import {
  $, state, api, go, closeModal, icon,
} from './js/core.js';
import { renderLanding } from './js/landing.js';
import { renderAuth } from './js/auth.js';
import { renderUser } from './js/user.js';
import { renderAdmin } from './js/admin.js';

let lastPath = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryString] = raw.split('?');
  return { path: pathPart || '/', query: new URLSearchParams(queryString || '') };
}

function render() {
  const { path, query } = parseHash();
  if (lastPath !== path) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    closeModal();
    lastPath = path;
  }

  if (path === '/login' || path === '/registro') {
    if (state.me) return go(state.me.role === 'admin' ? '#/admin' : '#/app');
    renderAuth(path === '/registro' ? 'registro' : 'login');
    return;
  }

  if (path.startsWith('/app')) {
    if (!state.me) {
      sessionStorage.setItem('rs_next', location.hash || '#/app');
      return go('/login');
    }
    if (state.me.role === 'admin') return go('/admin');
    renderUser(path, query);
    return;
  }

  if (path.startsWith('/admin')) {
    if (!state.me) {
      sessionStorage.setItem('rs_next', location.hash || '#/admin');
      return go('/login');
    }
    if (state.me.role !== 'admin') return go('/app');
    renderAdmin(path);
    return;
  }

  if (path !== '/') {
    // Ruta desconocida → inicio
    return go('/');
  }
  renderLanding();
}

async function boot() {
  $('#app').innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center">
      <div class="loading"><span class="spinner"></span><span>Cargando Recovery Studio…</span></div>
    </div>`;

  try {
    state.config = await api('/public/config');
  } catch (err) {
    $('#app').innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;padding:24px">
        <div class="empty" style="max-width:480px">
          <div class="ei">${icon('alert')}</div>
          <h3>No pudimos iniciar el sitio</h3>
          <p>${err.message || 'Revisa que el servidor esté funcionando e intenta nuevamente.'}</p>
          <button class="btn sm" type="button" onclick="location.reload()">Reintentar</button>
        </div>
      </div>`;
    return;
  }

  try {
    const me = await api('/auth/me');
    state.me = me.user;
  } catch {
    state.me = null;
  }

  if (!location.hash) history.replaceState(null, '', '#/');
  render();
  window.addEventListener('hashchange', render);
}

boot();
