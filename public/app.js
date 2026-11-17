/* ==========================================================================
   Recovery Studio · entrada de la aplicación
   Carga por ruta: la portada solo descarga el núcleo y la landing; el panel,
   el área de clientes y las páginas públicas se importan bajo demanda.
   ========================================================================== */

import {
  $, state, api, go, closeModal, icon,
} from './js/core.js';
import { renderLanding } from './js/landing.js';

let lastPath = null;
let renderSeq = 0;

const CONFIG_CACHE_KEY = 'rs_public_config_v1';
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryString] = raw.split('?');
  return { path: pathPart || '/', query: new URLSearchParams(queryString || '') };
}

function loadingMarkup() {
  return `
    <div style="min-height:100vh;display:grid;place-items:center">
      <div class="loading"><span class="spinner"></span><span>Cargando Recovery Studio…</span></div>
    </div>`;
}

function readConfigCache() {
  try {
    const raw = sessionStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.data || !cached.at || Date.now() - cached.at > CONFIG_CACHE_TTL) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeConfigCache(config) {
  try {
    sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ at: Date.now(), data: config }));
  } catch {
    /* sin almacenamiento disponible */
  }
}

async function render() {
  // Evita que una ruta lenta (por ejemplo, el panel) pinte encima de otra.
  const seq = ++renderSeq;
  const { path, query } = parseHash();
  if (lastPath !== path) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    closeModal();
    lastPath = path;
  }

  if (path === '/login' || path === '/registro') {
    if (state.me) return go(state.me.role === 'admin' ? '#/admin' : '#/app');
    const { renderAuth } = await import('./js/auth.js');
    if (seq !== renderSeq) return;
    renderAuth(path === '/registro' ? 'registro' : 'login');
    return;
  }

  if (path === '/resenas' || path === '/sauna') {
    const mod = await import('./js/reviews.js');
    if (seq !== renderSeq) return;
    if (path === '/resenas') mod.renderReviewsPage();
    else mod.renderSaunaPage();
    return;
  }

  if (path.startsWith('/app')) {
    if (!state.me) {
      sessionStorage.setItem('rs_next', location.hash || '#/app');
      return go('/login');
    }
    if (state.me.role === 'admin') return go('/admin');
    const { renderUser } = await import('./js/user.js');
    if (seq !== renderSeq) return;
    renderUser(path, query);
    return;
  }

  if (path.startsWith('/admin')) {
    if (!state.me) {
      sessionStorage.setItem('rs_next', location.hash || '#/admin');
      return go('/login');
    }
    if (state.me.role !== 'admin') return go('/app');
    const { renderAdmin } = await import('./js/admin.js');
    if (seq !== renderSeq) return;
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
  // Si hay configuración reciente, pinta la portada de inmediato y revalida en
  // segundo plano. Así la primera visita no espera a la API para ver contenido.
  const cached = readConfigCache();
  if (cached) {
    state.config = cached;
    if (!location.hash) history.replaceState(null, '', '#/');
    render();
  } else {
    $('#app').innerHTML = loadingMarkup();
  }

  const [configResult, meResult] = await Promise.allSettled([
    api('/public/config'),
    api('/auth/me'),
  ]);

  if (configResult.status === 'fulfilled') {
    state.config = configResult.value;
    writeConfigCache(configResult.value);
  } else if (!state.config) {
    $('#app').innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;padding:24px">
        <div class="empty" style="max-width:480px">
          <div class="ei">${icon('alert')}</div>
          <h3>No pudimos iniciar el sitio</h3>
          <p>${configResult.reason?.message || 'Revisa que el servidor esté funcionando e intenta nuevamente.'}</p>
          <button class="btn sm" type="button" onclick="location.reload()">Reintentar</button>
        </div>
      </div>`;
    return;
  }

  state.me = meResult.status === 'fulfilled' ? meResult.value.user : null;

  if (!location.hash) history.replaceState(null, '', '#/');
  render();
  window.addEventListener('hashchange', render);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* sin soporte o bloqueado */ });
    });
  }
}

boot();
