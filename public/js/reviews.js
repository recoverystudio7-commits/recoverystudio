/* ==========================================================================
   Reseñas públicas, página de sauna y moderación desde el panel
   ========================================================================== */

import {
  $, $$, state, api, esc, icon, go, toast, pageHead, fmtDate,
} from './core.js';
import { siteHeader, siteFooter } from './landing.js';

const COOLDOWN_KEY = 'recoveryStudio.lastReviewAt';
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

let adminFilter = 'all';

/* ------------------------------- utilidades ------------------------------ */

function starRow(value, size = 15) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  let out = `<span class="rs-stars" aria-label="${rating} de 5 estrellas">`;
  for (let i = 1; i <= 5; i += 1) {
    out += `<span class="rs-star ${i <= Math.round(rating) ? 'is-on' : ''}">${icon('star')}</span>`;
  }
  out += '</span>';
  return out.replace('<span class="rs-stars"', `<span class="rs-stars" style="--star-size:${size}px"`);
}

function timeAgo(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `Hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  }
  return fmtDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || 'RS';
}

function average(items) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / items.length;
}

function cooldownLeft() {
  try {
    const last = Number(localStorage.getItem(COOLDOWN_KEY)) || 0;
    return Math.max(0, last + COOLDOWN_MS - Date.now());
  } catch {
    return 0;
  }
}

function markSent() {
  try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
}

function serviceOptions() {
  const names = [];
  (state.config?.services || []).forEach((service) => {
    if (service?.name) names.push(service.name);
  });
  ['Sauna húmedo + recovery', 'Recovery + movilidad', 'Recovery deportivo', 'Entrenamiento 1:1']
    .forEach((name) => { if (!names.includes(name)) names.push(name); });
  return names;
}

/* ---------------------------- piezas públicas ---------------------------- */

function scoreCard(items) {
  if (!items.length) {
    return `<div class="reviews-score-card is-empty">
      <strong>—</strong>
      <div>
        <div class="reviews-score-label">Aún no hay reseñas publicadas</div>
        <p>Sé la primera persona en contar tu experiencia.</p>
      </div>
    </div>`;
  }
  const avg = average(items);
  return `<div class="reviews-score-card">
    <strong>${avg.toFixed(1)}</strong>
    <div>
      <div class="reviews-score-line">${starRow(avg, 17)} <span>${items.length} ${items.length === 1 ? 'reseña' : 'reseñas'} de clientes</span></div>
      <p>Calificaciones reales, publicadas después de ser revisadas por el studio.</p>
    </div>
  </div>`;
}

function reviewCard(review) {
  return `<article class="review-card">
    <div class="review-card-top">
      <span class="review-avatar">${esc(initials(review.authorName))}</span>
      <div class="review-author">
        <strong>${esc(review.authorName)}</strong>
        <span>${review.service ? `${esc(review.service)} · ` : ''}${esc(timeAgo(review.createdAt))}</span>
      </div>
      ${starRow(review.rating, 15)}
    </div>
    <p class="review-text">${esc(review.comment || '')}</p>
  </article>`;
}

function reviewForm() {
  const me = state.me;
  const options = serviceOptions();
  return `<div class="card review-form-card" data-review-form id="dejar-resena">
    <div class="card-head">
      <div>
        <h2>Deja tu reseña</h2>
        <p>Cuéntanos cómo fue tu experiencia. Se publicará tras una revisión.</p>
      </div>
    </div>
    <div class="review-form-body">
      <p class="form-error" data-review-msg role="alert"></p>
      <form data-review-form-el novalidate>
        <div class="hp-field" aria-hidden="true"><label>No completar<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="field">
          <label for="review-name">Tu nombre</label>
          <div class="input-icon">${icon('user')}<input class="input" id="review-name" name="name" type="text" maxlength="80" autocomplete="name" placeholder="Nombre y apellido" value="${esc(me?.name || '')}" required></div>
        </div>
        <div class="field">
          <label for="review-service">Servicio</label>
          <select class="input" id="review-service" name="service">
            ${options.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Tu calificación</label>
          <div class="rating-input" data-rating-input data-value="5" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
            <input type="hidden" name="rating" value="5" data-rating-value>
            ${[1, 2, 3, 4, 5].map((value) => `<button type="button" class="rating-star is-on" data-review-rate="${value}" aria-label="${value} ${value === 1 ? 'estrella' : 'estrellas'}" aria-pressed="${value === 5}">${icon('star')}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label for="review-comment">Tu comentario</label>
          <textarea class="input" id="review-comment" name="comment" rows="4" maxlength="1200" minlength="10" placeholder="¿Qué mejoró? ¿Cómo te sentiste después de la sesión?" required></textarea>
          <span class="field-hint">Mínimo 10 caracteres. No incluyas datos médicos sensibles.</span>
        </div>
        <label class="check check-top"><input type="checkbox" name="consent" required><span>Acepto que mi nombre y comentario se publiquen en el sitio.</span></label>
        <button class="btn accent block" type="submit" data-review-submit>${icon('send')} Enviar reseña</button>
        <p class="auth-tip">${icon('info')} Las reseñas pasan por moderación antes de publicarse.</p>
      </form>
    </div>
  </div>`;
}

function saunaPromo() {
  return `<section class="section-tight">
    <div class="container">
      <div class="sauna-promo">
        <div>
          <span class="eyebrow light">${icon('droplet')} Sauna húmedo</span>
          <h2>Suma calor a tu recuperación</h2>
          <p>Conoce cómo el sauna húmedo complementa la movilidad, el descanso y la recuperación post-entrenamiento.</p>
        </div>
        <a class="btn accent" href="#/sauna">Ver beneficios ${icon('arrowRight')}</a>
      </div>
    </div>
  </section>`;
}

function bindChrome() {
  const menuBtn = $('#menu-btn');
  const mobileNav = $('#mobile-nav');
  menuBtn?.addEventListener('click', () => {
    const open = mobileNav?.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(!!open));
  });
  $$('[data-book]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.me) {
        sessionStorage.setItem('rs_next', '#/app/agendar');
        go('/login');
        return;
      }
      if (state.me.role === 'admin') return go('/admin/agenda');
      go('/app/agendar');
    });
  });
}

/* ----------------------------- página pública ---------------------------- */

export function renderReviewsPage() {
  document.title = 'Reseñas · Recovery Studio';
  $('#app').innerHTML = `
    <div class="public-page">
      ${siteHeader('resenas')}
      <main class="public-main">
        <section class="reviews-hero">
          <div class="container">
            <span class="eyebrow">${icon('star')} Comunidad Recovery Studio</span>
            <h1>Lo que dicen <em>nuestros clientes.</em></h1>
            <p class="reviews-lead">Opiniones reales de personas que entrenan, se recuperan y vuelven más fuertes con nosotros. Tu experiencia también ayuda a otros.</p>
            <div data-reviews-score>${scoreCard([])}</div>
          </div>
        </section>

        <section class="section">
          <div class="container reviews-layout">
            <div class="reviews-list" data-reviews-list aria-live="polite">
              <div class="review-card skeleton-card"><span class="skeleton-line w40"></span><span class="skeleton-line"></span><span class="skeleton-line w80"></span></div>
              <div class="review-card skeleton-card"><span class="skeleton-line w40"></span><span class="skeleton-line"></span><span class="skeleton-line w80"></span></div>
            </div>
            ${reviewForm()}
          </div>
        </section>

        ${saunaPromo()}
      </main>
      ${siteFooter()}
    </div>`;

  bindChrome();
  bindReviewForm();
  bindRating();
  hydrateReviews(false);
}

export function renderSaunaPage() {
  document.title = 'Sauna húmedo · Recovery Studio';
  $('#app').innerHTML = `
    <div class="public-page">
      ${siteHeader('sauna')}
      <main class="public-main">
        <section class="sauna-hero">
          <div class="container sauna-hero-grid">
            <div>
              <span class="eyebrow">${icon('droplet')} Bienestar y recuperación</span>
              <h1>Sauna húmedo:<br><em>calor que recupera.</em></h1>
              <p class="sauna-lead">Una pausa de calor y humedad para bajar el ritmo, soltar la tensión muscular y complementar tu proceso de recuperación. En Recovery Studio lo integramos con movilidad y estiramientos guiados.</p>
              <div class="hero-actions">
                <button class="btn accent" type="button" data-book-sauna>Agendar una sesión ${icon('arrowRight')}</button>
                <a class="btn ghost" href="mailto:${esc(state.config?.email || 'recoverystudio7@gmail.com')}?subject=Consulta%20sauna%20h%C3%BAmedo">${icon('mail')} Preguntar por correo</a>
              </div>
              <p class="sauna-note">${icon('shield')} Complemento de bienestar. No reemplaza una indicación médica.</p>
            </div>
            <div class="sauna-art" aria-hidden="true">
              <div class="sauna-orb one"></div>
              <div class="sauna-orb two"></div>
              <div class="sauna-art-card">
                <span>${icon('thermometer')}</span>
                <strong>10–15 min</strong>
                <small>por sesión</small>
              </div>
              <div class="sauna-art-card alt">
                <span>${icon('waves')}</span>
                <strong>Calor + humedad</strong>
                <small>recuperación profunda</small>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="container">
            <div class="section-head">
              <div class="eyebrow">Beneficios</div>
              <h2>Qué aporta a tu recuperación</h2>
              <p>El sauna húmedo es un complemento, no un atajo. Estos son los beneficios que más valoran nuestros clientes.</p>
            </div>
            <div class="benefit-grid">
              ${benefitCard('heart', 'Relajación y estrés', 'El calor favorece una sensación de calma y bienestar general después de un día exigente.')}
              ${benefitCard('activity', 'Alivio de tensión muscular', 'Ayuda a soltar la musculatura y a preparar el cuerpo para estiramientos y movilidad.')}
              ${benefitCard('waves', 'Apoyo a la circulación', 'La vasodilatación por calor acompaña la respuesta circulatoria natural del cuerpo.')}
              ${benefitCard('zap', 'Recuperación post-entrenamiento', 'Ideal como cierre de una semana de carga, junto con hidratación y descanso.')}
              ${benefitCard('moon', 'Sensación de descanso', 'Muchos clientes lo describen como un reset mental y físico antes de dormir.')}
              ${benefitCard('leaf', 'Complemento de movilidad', 'Con la guía correcta, se combina con estiramientos suaves y respiración.')}
            </div>
          </div>
        </section>

        <section class="section" style="background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
          <div class="container">
            <div class="section-head">
              <div class="eyebrow">Cómo lo trabajamos</div>
              <h2>Un protocolo simple y seguro</h2>
            </div>
            <div class="protocol-grid">
              <article class="protocol-step"><span>01</span><h3>Hidratación previa</h3><p>Llega hidratado y sin alcohol. Revisamos cómo te sientes antes de entrar.</p></article>
              <article class="protocol-step"><span>02</span><h3>Calor controlado</h3><p>Sesiones de 10 a 15 minutos, escuchando tu cuerpo. Si te mareas, sales.</p></article>
              <article class="protocol-step"><span>03</span><h3>Movilidad y descanso</h3><p>Cerramos con estiramientos suaves, respiración e hidratación.</p></article>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="container">
            <div class="sauna-notice">
              <div class="sauna-notice-icon">${icon('alert')}</div>
              <div>
                <h2>Cuándo consultar antes de usarlo</h2>
                <p>No se recomienda sin autorización médica en embarazo, problemas cardiovasculares, presión arterial baja o descontrolada, fiebre, deshidratación o consumo reciente de alcohol. Si tienes alguna condición de salud o tomas medicamentos, consulta a tu médico antes de usar el sauna.</p>
              </div>
            </div>
            <div class="sauna-final">
              <div>
                <span class="eyebrow">${icon('sparkles')} Recovery Studio</span>
                <h2>Recupera mejor, con acompañamiento real</h2>
                <p>Combina sauna húmedo, movilidad y entrenamiento con un plan hecho para ti.</p>
              </div>
              <button class="btn accent" type="button" data-book-sauna>Quiero agendar ${icon('arrowRight')}</button>
            </div>
          </div>
        </section>
      </main>
      ${siteFooter()}
    </div>`;

  bindChrome();
  $$('[data-book-sauna]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.me) {
        sessionStorage.setItem('rs_next', '#/app/agendar');
        go('/login');
        return;
      }
      if (state.me.role === 'admin') return go('/admin/agenda');
      go('/app/agendar');
    });
  });
}

function benefitCard(name, title, text) {
  return `<article class="benefit-card">
    <span class="benefit-icon">${icon(name)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
  </article>`;
}

/* ------------------------------ hidratación ------------------------------ */

export async function hydrateTeaser() {
  const el = document.querySelector('[data-reviews-teaser]');
  if (!el) return;
  try {
    const data = await api('/public/reviews');
    const items = data.reviews || [];
    if (!items.length) { el.hidden = true; return; }
    const first = items[0];
    el.innerHTML = `
      <span class="reviews-teaser-top">${starRow(data.average, 13)} <strong>${Number(data.average).toFixed(1)}</strong> <span>· ${data.count} ${data.count === 1 ? 'reseña' : 'reseñas'}</span></span>
      <p>“${esc((first.comment || '').slice(0, 115))}${(first.comment || '').length > 115 ? '…' : ''}”</p>
      <span class="reviews-teaser-bottom"><span>— ${esc(first.authorName)}</span><a href="#/resenas">Ver todas ${icon('arrowRight')}</a></span>`;
    el.hidden = false;
  } catch {
    el.hidden = true;
  }
}

async function hydrateReviews(force) {
  const list = document.querySelector('[data-reviews-list]');
  if (!list) return;
  const score = document.querySelector('[data-reviews-score]');
  if (force) list.innerHTML = '<div class="loading"><span class="spinner"></span><span>Cargando reseñas…</span></div>';
  try {
    const data = await api('/public/reviews');
    const items = data.reviews || [];
    if (score) score.innerHTML = scoreCard(items);
    const current = document.querySelector('[data-reviews-list]');
    if (!current) return;
    if (!items.length) {
      current.innerHTML = `<div class="review-empty">${icon('messageSquare')}<h3>Aún no hay reseñas publicadas</h3><p>Las primeras opiniones aparecerán aquí después de la moderación.</p></div>`;
      return;
    }
    current.innerHTML = items.map(reviewCard).join('');
  } catch {
    const current = document.querySelector('[data-reviews-list]');
    if (current) {
      current.innerHTML = `<div class="review-empty">${icon('alert')}<h3>No pudimos cargar las reseñas</h3><p>Revisa tu conexión e inténtalo de nuevo.</p><button class="btn ghost sm" type="button" data-reviews-retry>${icon('refresh')} Reintentar</button></div>`;
      current.querySelector('[data-reviews-retry]')?.addEventListener('click', () => hydrateReviews(true));
    }
  }
}

/* ------------------------------- formulario ------------------------------ */

function bindRating() {
  $$('[data-rating-input]').forEach((wrap) => {
    wrap.querySelectorAll('[data-review-rate]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = Number(button.dataset.reviewRate) || 5;
        wrap.dataset.value = String(value);
        const hidden = wrap.querySelector('[data-rating-value]');
        if (hidden) hidden.value = String(value);
        wrap.querySelectorAll('[data-review-rate]').forEach((star) => {
          star.classList.toggle('is-on', Number(star.dataset.reviewRate) <= value);
          star.setAttribute('aria-pressed', String(Number(star.dataset.reviewRate) === value));
        });
      });
    });
  });
}

function bindReviewForm() {
  const form = document.querySelector('[data-review-form-el]');
  if (!form) return;
  const msg = document.querySelector('[data-review-msg]');
  const button = form.querySelector('[data-review-submit]');

  const showError = (text) => {
    if (msg) {
      msg.textContent = text;
      msg.classList.add('show');
      msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      toast(text, 'error');
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (msg) { msg.textContent = ''; msg.classList.remove('show'); }

    const field = (key) => form.elements.namedItem(key);
    if (field('website')?.value) return;

    const name = String(field('name')?.value || '').trim();
    const comment = String(field('comment')?.value || '').trim();
    const service = String(field('service')?.value || '').trim();
    const rating = Math.max(1, Math.min(5, Number(field('rating')?.value) || 5));
    const consent = !!field('consent')?.checked;

    if (name.length < 2) return showError('Escribe tu nombre (mínimo 2 caracteres).');
    if (!consent) return showError('Debes autorizar la publicación de tu reseña.');
    if (comment.length < 10) return showError('Cuéntanos un poco más: mínimo 10 caracteres.');
    if (comment.length > 1200) return showError('El comentario no puede superar los 1200 caracteres.');

    const left = cooldownLeft();
    if (left > 0) {
      const hours = Math.max(1, Math.ceil(left / 3600000));
      return showError(`Ya enviamos una reseña desde este dispositivo. Puedes enviar otra en ${hours} ${hours === 1 ? 'hora' : 'horas'}.`);
    }

    const original = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>Enviando…';
    }

    try {
      await api('/public/reviews', {
        method: 'POST',
        body: { name, comment, service, rating, consent, website: '' },
      });
      markSent();
      const card = form.closest('[data-review-form]');
      if (card) {
        card.innerHTML = `<div class="review-success">
          ${icon('checkCircle')}
          <h2>¡Gracias por tu reseña!</h2>
          <p>Quedó en revisión y se publicará pronto. Tu experiencia ayuda a que más personas conozcan Recovery Studio.</p>
          <a class="btn ghost sm" href="#/resenas">Ver las reseñas publicadas</a>
        </div>`;
      }
      toast('Reseña enviada. Gracias por compartir tu experiencia.', 'success');
    } catch (err) {
      showError(err.message || 'No pudimos enviar tu reseña. Inténtalo de nuevo.');
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  });
}

/* -------------------------------- admin ---------------------------------- */

const STATUS_LABEL = { pending: 'Pendiente', approved: 'Publicada', rejected: 'Rechazada' };
const STATUS_CLASS = { pending: 'warn', approved: 'success', rejected: 'danger' };

export async function pageAdminReviews(content) {
  const data = await api('/admin/reviews');
  const items = data.counts ? (adminFilter === 'all'
    ? data.reviews
    : data.reviews.filter((r) => r.status === adminFilter)) : [];

  content.innerHTML = `
    ${pageHead('Reseñas', 'Modera las opiniones que se publican en el sitio', `
      <a class="btn ghost sm" href="#/resenas" target="_blank" rel="noopener">${icon('externalLink')} Ver página pública</a>
      <button class="btn sm" type="button" data-reviews-refresh>${icon('refresh')} Actualizar</button>`)}

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Pendientes <span class="kpi-icon">${icon('clock')}</span></div><div class="kpi-value">${data.counts.pending}</div><div class="kpi-foot">Esperando moderación</div></div>
      <div class="kpi"><div class="kpi-label">Publicadas <span class="kpi-icon">${icon('checkCircle')}</span></div><div class="kpi-value">${data.counts.approved}</div><div class="kpi-foot">Visibles en el sitio</div></div>
      <div class="kpi orange"><div class="kpi-label">Promedio <span class="kpi-icon">${icon('star')}</span></div><div class="kpi-value">${data.count ? Number(data.average).toFixed(1) : '—'}</div><div class="kpi-foot">${data.count} ${data.count === 1 ? 'reseña publicada' : 'reseñas publicadas'}</div></div>
      <div class="kpi"><div class="kpi-label">Rechazadas <span class="kpi-icon">${icon('ban')}</span></div><div class="kpi-value">${data.counts.rejected}</div><div class="kpi-foot">No se muestran</div></div>
    </div>

    <div class="toolbar">
      <div class="tabs">
        ${[['all', 'Todas', data.counts.total], ['pending', 'Pendientes', data.counts.pending], ['approved', 'Publicadas', data.counts.approved], ['rejected', 'Rechazadas', data.counts.rejected]]
          .map(([key, label, count]) => `<button class="tab ${adminFilter === key ? 'active' : ''}" type="button" data-review-filter="${key}">${label}·${count}</button>`).join('')}
      </div>
    </div>

    ${items.length ? `<div class="review-admin-list">${items.map(adminRow).join('')}</div>` : `<div class="empty"><div class="ei">${icon('messageSquare')}</div><h3>Sin reseñas en esta vista</h3><p>Cuando llegue una nueva opinión aparecerá aquí para moderarla.</p></div>`}
  `;

  content.querySelectorAll('[data-review-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      adminFilter = btn.dataset.reviewFilter;
      pageAdminReviews(content).catch((err) => toast(err.message, 'error'));
    });
  });

  content.querySelector('[data-reviews-refresh]')?.addEventListener('click', () => {
    pageAdminReviews(content).catch((err) => toast(err.message, 'error'));
  });

  content.querySelectorAll('[data-review-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { reviewAction, reviewId } = btn.dataset;
      btn.disabled = true;
      try {
        if (reviewAction === 'delete') {
          if (!window.confirm('¿Eliminar esta reseña definitivamente?')) { btn.disabled = false; return; }
          await api(`/admin/reviews/${reviewId}`, { method: 'DELETE' });
          toast('Reseña eliminada.', 'info');
        } else {
          await api(`/admin/reviews/${reviewId}`, { method: 'PATCH', body: { status: reviewAction } });
          toast(reviewAction === 'approved' ? 'Reseña publicada.' : reviewAction === 'rejected' ? 'Reseña rechazada.' : 'Reseña enviada a pendientes.', 'success');
        }
        await pageAdminReviews(content);
      } catch (err) {
        toast(err.message || 'No pudimos actualizar la reseña.', 'error');
        btn.disabled = false;
      }
    });
  });
}

function adminRow(review) {
  return `<article class="review-admin-row">
    <span class="review-avatar">${esc(initials(review.authorName))}</span>
    <div class="review-admin-main">
      <div class="review-admin-top">
        <strong>${esc(review.authorName)}</strong>
        ${starRow(review.rating, 13)}
        <span class="badge ${STATUS_CLASS[review.status] || 'muted'}">${STATUS_LABEL[review.status] || review.status}</span>
      </div>
      <p>${esc(review.comment || '')}</p>
      <span class="review-admin-meta">${review.service ? `${esc(review.service)} · ` : ''}${esc(timeAgo(review.createdAt))}${review.user ? ` · ${esc(review.user.email)}` : ''}</span>
    </div>
    <div class="review-admin-actions">
      ${review.status !== 'approved' ? `<button class="btn success sm" type="button" data-review-action="approved" data-review-id="${esc(review.id)}">${icon('check')} Publicar</button>` : ''}
      ${review.status !== 'rejected' ? `<button class="btn ghost sm" type="button" data-review-action="rejected" data-review-id="${esc(review.id)}">${icon('ban')} Rechazar</button>` : ''}
      ${review.status !== 'pending' ? `<button class="btn ghost sm" type="button" data-review-action="pending" data-review-id="${esc(review.id)}">${icon('clock')} A pendientes</button>` : ''}
      <button class="btn danger-soft sm" type="button" data-review-action="delete" data-review-id="${esc(review.id)}">${icon('trash')} Eliminar</button>
    </div>
  </article>`;
}
