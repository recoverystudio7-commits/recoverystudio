/* ==========================================================================
   Landing pública · Recovery Studio
   ========================================================================== */

import {
  $, $$, state, esc, money, icon, beginBooking, beginPlan, bindCopyButtons, go, toast,
} from './core.js';

function serviceIcon(name) {
  const n = String(name).toLowerCase();
  if (n.includes('virtual')) return { icon: 'video', cls: 'orange' };
  if (n.includes('rutina') || n.includes('ejercicio')) return { icon: 'dumbbell', cls: 'orange' };
  if (n.includes('evaluaci')) return { icon: 'clipboard', cls: '' };
  if (n.includes('asesor')) return { icon: 'user', cls: '' };
  return { icon: 'activity', cls: '' };
}

export function siteHeader(active = 'inicio') {
  const me = state.me;
  const panel = me?.role === 'admin' ? '#/admin' : '#/app';
  const onLanding = active === 'inicio';
  const sectionLink = (id, label) => (onLanding
    ? `<button type="button" data-scroll="${id}">${label}</button>`
    : `<a href="#/">${label}</a>`);

  return `
    <header class="site-header">
      <div class="container">
        <a class="brand" href="#/">
          <span class="brand-mark">R</span>
          <span class="brand-name"><b>Recovery Studio</b><span>Kinesiología & movimiento</span></span>
        </a>
        <nav class="site-nav" aria-label="Navegación principal">
          ${sectionLink('servicios', 'Servicios')}
          ${sectionLink('planes', 'Planes')}
          <a href="#/resenas" class="${active === 'resenas' ? 'active' : ''}">Reseñas</a>
          <a href="#/sauna" class="${active === 'sauna' ? 'active' : ''}">Sauna húmedo</a>
          ${sectionLink('pagos', 'Pagos')}
        </nav>
        <div class="header-actions">
          ${me
            ? `<a class="btn ghost sm" href="${panel}">${me.role === 'admin' ? 'Panel admin' : 'Mi panel'}</a>
               <button class="btn sm" type="button" data-book="">${icon('calendar')} Agendar</button>`
            : `<a class="btn ghost sm" href="#/login">Ingresar</a>
               <button class="btn sm" type="button" data-book="">${icon('calendar')} Agendar</button>`}
          <button class="menu-btn" type="button" id="menu-btn" aria-label="Abrir menú" aria-expanded="false">${icon('menu')}</button>
        </div>
      </div>
      <div class="mobile-nav" id="mobile-nav">
        ${sectionLink('servicios', 'Servicios')}
        ${sectionLink('planes', 'Planes')}
        <a href="#/resenas">Reseñas</a>
        <a href="#/sauna">Sauna húmedo</a>
        ${sectionLink('pagos', 'Pagos')}
        ${me
          ? `<a class="btn primary sm" href="${panel}" style="margin-top:8px">Ir a mi panel</a>`
          : `<a class="btn primary sm" href="#/login" style="margin-top:8px">Ingresar</a>
             <a class="btn ghost sm" href="#/registro" style="margin-top:6px">Crear cuenta</a>`}
      </div>
    </header>`;
}

export function siteFooter(landing = false) {
  const cfg = state.config;
  const me = state.me;
  const explore = (id, label) => (landing
    ? `<button type="button" data-scroll="${id}">${label}</button>`
    : `<a href="#/">${label}</a>`);
  return `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="brand" href="#/">
              <span class="brand-mark">R</span>
              <span class="brand-name"><b>Recovery Studio</b><span>Kinesiología & movimiento</span></span>
            </a>
            <p>Kinesiología, asesorías y planes de ejercicio para recuperar tu movimiento con acompañamiento cercano y profesional.</p>
          </div>
          <div class="footer-col">
            <h4>Explorar</h4>
            ${explore('servicios', 'Servicios')}
            ${explore('planes', 'Planes')}
            <a href="#/resenas">Reseñas</a>
            <a href="#/sauna">Sauna húmedo</a>
            ${explore('pagos', 'Pagos y política')}
          </div>
          <div class="footer-col">
            <h4>Contacto</h4>
            <a href="mailto:${esc(cfg?.email || 'recoverystudio7@gmail.com')}">${esc(cfg?.email || 'recoverystudio7@gmail.com')}</a>
            ${me ? `<a href="${me.role === 'admin' ? '#/admin' : '#/app'}">Mi panel</a>` : '<a href="#/login">Ingresar</a><a href="#/registro">Crear cuenta</a>'}
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Recovery Studio. Todos los derechos reservados.</span>
          <span>Agenda online · Transferencia bancaria · Confirmación manual</span>
        </div>
      </div>
    </footer>`;
}

export function renderLanding() {
  const cfg = state.config;
  const services = cfg?.services || [];
  const plans = cfg?.plans || [];
  const bank = cfg?.bank || {};
  const hours = cfg?.cancellationHours ?? 12;
  document.title = 'Recovery Studio · Kinesiología y movimiento';

  $('#app').innerHTML = `
    ${siteHeader('inicio')}

    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <div class="eyebrow">Kinesiología · movimiento · recuperación</div>
          <h1>Vuelve a moverte <em>sin dolor</em>.</h1>
          <p class="hero-lead">Kinesiología, asesorías 1 a 1 y planes de ejercicio diseñados para tu objetivo. Agenda online, sigue tus sesiones y avanza con acompañamiento real.</p>
          <div class="hero-actions">
            <button class="btn lg" type="button" data-book="">${icon('calendar')} Agendar sesión</button>
            <button class="btn ghost lg" type="button" data-scroll="planes">Ver planes ${icon('arrowRight')}</button>
          </div>
          <div class="hero-trust">
            <span>${icon('checkCircle')} Atención personalizada</span>
            <span>${icon('checkCircle')} Agenda online</span>
            <span>${icon('checkCircle')} Planes a medida</span>
          </div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="hero-ring two"></div>
          <div class="hero-ring"></div>
          <div class="hero-glow"></div>
          <div class="hero-card">
            <div class="eyebrow light">Recovery Studio</div>
            <div class="wordmark">Muévete<br><span>con confianza.</span></div>
            <p>Un plan claro, sesiones confirmadas y seguimiento en cada etapa de tu recuperación.</p>
            <div class="mini-rule"></div>
            <div class="mini-row"><span>Evaluación inicial</span><b>60 min</b></div>
            <div class="mini-row"><span>Asesorías 1 a 1</span><b>Presencial / online</b></div>
            <div class="mini-row"><span>Planes de sesiones</span><b>Desde ${plans.length ? money(Math.min(...plans.map((p) => p.price))) : '$35.000'}</b></div>
          </div>
          <div class="float-card fc-1">
            <span class="dot"></span>
            <div><b>Sesión confirmada</b><span>Mañana · 10:00</span></div>
          </div>
          <div class="float-card fc-2">
            <div class="progress-mini"><i></i></div>
            <div><b>Plan activo</b><span>Sesiones disponibles</span></div>
          </div>
          <div class="float-card fc-3">
            <span class="dot orange"></span>
            <div><b>Rutina del día</b><span>Lista en tu panel</span></div>
          </div>
        </div>
      </div>
    </section>

    <div class="strip">
      <div class="container strip-inner">
        <div class="strip-item">${icon('user')}<div><b>Atención 1 a 1</b><span>Siempre contigo</span></div></div>
        <div class="strip-item">${icon('calendarCheck')}<div><b>Agenda online</b><span>Confirma el studio</span></div></div>
        <div class="strip-item">${icon('layers')}<div><b>Planes flexibles</b><span>A tu medida</span></div></div>
        <div class="strip-item">${icon('card')}<div><b>Pago por transferencia</b><span>Simple y seguro</span></div></div>
      </div>
    </div>

    <section class="section" id="servicios">
      <div class="container">
        <div class="section-head">
          <div class="eyebrow">Servicios</div>
          <h2>Un acompañamiento para cada etapa</h2>
          <p>Elige el servicio que necesitas. Cada sesión queda sujeta a la confirmación del studio y a la disponibilidad de horarios.</p>
        </div>
        <div class="services-grid">
          ${services.map((s) => {
            const ico = serviceIcon(s.name);
            return `
              <article class="service-card">
                <div class="service-icon ${ico.cls}">${icon(ico.icon)}</div>
                <h3>${esc(s.name)}</h3>
                <p>${esc(s.description)}</p>
                <div class="service-meta">
                  <div class="service-price">${money(s.price)} <small>/ sesión</small></div>
                  <div class="service-time">${icon('clock')} ${s.duration} min</div>
                </div>
                <button class="btn ghost sm block" type="button" data-book="${esc(s.id)}">Agendar ${icon('arrowRight')}</button>
              </article>`;
          }).join('')}
        </div>
      </div>
    </section>

    <section class="section" id="planes" style="background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
      <div class="container">
        <div class="section-head">
          <div class="eyebrow">Planes</div>
          <h2>Elige un plan y avanza con continuidad</h2>
          <p>Los planes se compran por transferencia. El studio confirma el pago y las sesiones quedan disponibles en tu cuenta.</p>
        </div>
        <div class="plans-grid">
          ${plans.map((p, i) => `
            <article class="plan-card ${i === 1 ? 'featured' : ''}">
              <div class="plan-sessions">${p.sessions} ${p.sessions === 1 ? 'sesión' : 'sesiones'}</div>
              <h3>${esc(p.name)}</h3>
              <p>${esc(p.description)}</p>
              <div class="plan-price">${money(p.price)} <small>${money(Math.round(p.price / p.sessions))} por sesión aprox.</small></div>
              <button class="btn ${i === 1 ? '' : 'soft'}" type="button" data-buy-plan="${esc(p.id)}">Elegir plan</button>
            </article>`).join('')}
        </div>
        <div class="center" style="margin-top:24px">
          <p class="small muted">¿Necesitas otra cantidad de sesiones? <button class="link-btn" type="button" data-custom-plan>Crea tu plan a medida</button>.</p>
        </div>
      </div>
    </section>

    <section class="section" id="proceso">
      <div class="container">
        <div class="section-head">
          <div class="eyebrow">Cómo funciona</div>
          <h2>Agendar es simple</h2>
          <p>Un proceso claro, desde tu primera reserva hasta el seguimiento de tu rutina.</p>
        </div>
        <div class="steps-grid">
          <div class="step"><div class="step-num">1</div><h3>Crea tu cuenta</h3><p>Regístrate con tu nombre, correo y una contraseña o PIN personal.</p></div>
          <div class="step"><div class="step-num">2</div><h3>Elige y agenda</h3><p>Selecciona servicio, fecha y horario disponible. Usa un plan si tienes sesiones.</p></div>
          <div class="step"><div class="step-num">3</div><h3>Transfiere y confirma</h3><p>Paga por transferencia e informa el comprobante. El studio confirma tu hora.</p></div>
          <div class="step"><div class="step-num">4</div><h3>Sigue tu proceso</h3><p>Revisa tus sesiones, planes y la rutina que tu kinesiólogo preparó para ti.</p></div>
        </div>
      </div>
    </section>

    <section class="section-tight">
      <div class="container">
        <div class="custom-banner">
          <div>
            <div class="eyebrow light">Planes a medida</div>
            <h2>Tu objetivo no cabe en un plan estándar. Creamos uno para ti.</h2>
            <p>Cuéntanos cuántas sesiones necesitas y qué quieres lograr. Revisaremos tu caso, fijaremos el valor y podrás transferir cuando esté aprobado.</p>
            <div class="tag-list">
              <span>Rehabilitación</span><span>Fuerza y movimiento</span><span>Asesoría online</span><span>Seguimiento</span>
            </div>
          </div>
          <button class="btn accent lg" type="button" data-custom-plan>${icon('sparkles')} Crear mi plan</button>
        </div>
      </div>
    </section>

    <section class="section" id="pagos">
      <div class="container">
        <div class="section-head">
          <div class="eyebrow">Pagos y política</div>
          <h2>Todo transparente desde el inicio</h2>
          <p>Los pagos se realizan por transferencia bancaria y el studio confirma cada movimiento de forma manual.</p>
        </div>
        <div class="pay-grid">
          <div class="card bank-card">
            <div class="card-head" style="margin-bottom:8px">
              <div><h3>Datos para transferir</h3><p>Usa estos datos para pagar sesiones o planes.</p></div>
              <div class="service-icon" style="margin:0;width:38px;height:38px">${icon('card')}</div>
            </div>
            <div class="bank-row"><span>Titular</span><b>${esc(bank.holder || 'DANIEL ESTEBAN BARRUETO')}</b></div>
            <div class="bank-row"><span>RUT</span><b>${esc(bank.rut || '17.375.282-2')}</b></div>
            <div class="bank-row"><span>Banco</span><b>${esc(bank.bank || 'Banco Bci')}</b></div>
            <div class="bank-row"><span>Tipo de cuenta</span><b>${esc(bank.accountType || 'Cuenta Corriente')}</b></div>
            <div class="bank-row"><span>Número de cuenta</span><b>${esc(bank.accountNumber || '72771619')} <button class="copy-btn" type="button" data-copy="${esc(bank.accountNumber || '72771619')}">${icon('copy')} Copiar</button></b></div>
            <div class="alert info" style="margin-top:16px">${icon('alert')}<div>Después de transferir, entra a tu panel y marca <b>“Ya transferí”</b> con el número de comprobante. Así el studio puede confirmar tu pago.</div></div>
          </div>
          <div class="card panel-dark policy-card">
            <div class="policy-icon">${icon('shield')}</div>
            <h3>Política de cancelación</h3>
            <p class="muted small">Queremos cuidar tu tiempo y el del studio. Estas reglas aplican a todas las reservas.</p>
            <div class="policy-list">
              <div>${icon('check')}<span>Puedes cancelar o reagendar hasta <b>${hours} horas antes</b> del inicio de tu sesión.</span></div>
              <div>${icon('x')}<span>Dentro de las ${hours} horas previas <b>no se reagenda</b> ni se cancela la reserva.</span></div>
              <div>${icon('x')}<span><b>No se realizan reembolsos</b> por sesiones canceladas o no asistidas.</span></div>
              <div>${icon('clock')}<span>Toda reserva y reagendamiento queda sujeto a la <b>confirmación del administrador</b>.</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-tight reviews-home">
      <div class="container">
        <div class="reviews-home-grid">
          <div>
            <div class="eyebrow">Comunidad</div>
            <h2>Lo que dicen nuestros clientes</h2>
            <p class="muted">Opiniones reales de personas que entrenan, se recuperan y vuelven más fuertes con nosotros.</p>
          </div>
          <div class="reviews-teaser" data-reviews-teaser hidden></div>
        </div>
      </div>
    </section>

    <section class="section-tight">
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
    </section>

    ${siteFooter(true)}`;

  // (los iconos se generan con el set compartido)
  bindLanding();
}

function bindLanding() {
  const menuBtn = $('#menu-btn');
  const mobileNav = $('#mobile-nav');
  menuBtn?.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  $$('[data-scroll]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.scroll);
      mobileNav?.classList.remove('open');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $$('[data-book]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const serviceId = btn.dataset.book || null;
      if (!state.me && !serviceId) {
        sessionStorage.setItem('rs_next', '#/app/agendar');
        go('/login');
        return;
      }
      beginBooking(serviceId);
    });
  });

  $$('[data-buy-plan]').forEach((btn) => {
    btn.addEventListener('click', () => beginPlan(btn.dataset.buyPlan));
  });

  $$('[data-custom-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.me) {
        sessionStorage.setItem('rs_next', '#/app/planes');
        sessionStorage.setItem('rs_custom', '1');
        go('/login');
        return;
      }
      if (state.me.role === 'admin') return go('/admin/planes');
      state.adminPlanTab = 'custom';
      go('/app/planes');
    });
  });

  bindCopyButtons();
  import('./reviews.js')
    .then((mod) => mod.hydrateTeaser())
    .catch(() => { /* la portada sigue funcionando sin reseñas */ });
}
