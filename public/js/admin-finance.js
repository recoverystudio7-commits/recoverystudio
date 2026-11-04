/* ==========================================================================
   Administración · finanzas y honorarios
   ========================================================================== */

import {
  $, $$, state, api, money, esc, icon, toast, openModal, closeModal, confirmDialog,
  pageHead, fmtDate, percent, todayStr,
} from './core.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

const INCOME_CATEGORIES = ['Planes', 'Sesiones', 'Asesorías', 'Empresas', 'Otros'];
const EXPENSE_CATEGORIES = ['Arriendo', 'Insumos', 'Marketing', 'Servicios básicos', 'Mantención', 'Sueldos', 'Otros'];
const METHODS = ['Transferencia', 'Efectivo', 'Débito', 'Crédito'];

function localMonthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key, short = false) {
  const [year, month] = String(key || '').split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  const label = new Intl.DateTimeFormat('es-CL', {
    month: short ? 'short' : 'long',
    year: 'numeric',
  }).format(date).replace(/\./g, '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function selectedMonth() {
  return state.adminFinanceMonth || localMonthNow();
}

function selectOptions(list, selected) {
  return list.map((value) => `<option ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('');
}

function monthPicker(key) {
  return `<label class="month-picker" title="Mes a revisar"><span class="sr-only">Mes</span><input class="input" id="finance-month" type="month" value="${esc(key)}" /></label>`;
}

function bindMonthPicker(content) {
  const input = $('#finance-month', content);
  if (!input) return;
  input.addEventListener('change', () => {
    state.adminFinanceMonth = input.value || localMonthNow();
    refresh();
  });
}

function changeMonth(key) {
  state.adminFinanceMonth = key;
  refresh();
}

function breakdownRows(rows, total, tone = '') {
  if (!rows.length) return '<p class="small muted">Sin movimientos registrados en este mes.</p>';
  return `<div class="breakdown">
    ${rows.map((row) => `
      <div class="breakdown-row">
        <div class="breakdown-top"><span>${esc(row.category)} <em>${row.count}</em></span><strong>${money(row.amount)}</strong></div>
        <div class="progress ${tone}"><i style="width:${total ? Math.max(2, Math.round((row.amount / total) * 100)) : 0}%"></i></div>
      </div>`).join('')}
  </div>`;
}

function financeChart(months, activeKey) {
  const max = Math.max(...months.flatMap((m) => [m.income, m.expenses]), 1);
  return `<div class="fin-chart">
    ${months.map((m) => `
      <div class="fin-col ${m.key === activeKey ? 'current' : ''}" title="${esc(monthLabel(m.key))}: ingresos ${money(m.income)} · gastos ${money(m.expenses)}">
        <div class="fin-bars">
          <i class="fin-bar income" style="height:${m.income ? Math.max(3, Math.round((m.income / max) * 100)) : 1}%"></i>
          <i class="fin-bar expense" style="height:${m.expenses ? Math.max(3, Math.round((m.expenses / max) * 100)) : 1}%"></i>
        </div>
        <button class="fin-col-label" type="button" data-month="${esc(m.key)}">${esc(monthLabel(m.key, true))}</button>
      </div>`).join('')}
  </div>
  <div class="fin-legend"><span><i class="income"></i>Ingresos</span><span><i class="expense"></i>Gastos</span></div>`;
}

/* ================================ FINANZAS =============================== */

export async function pageAdminFinance(content) {
  const data = await api(`/admin/finance?month=${encodeURIComponent(selectedMonth())}`);
  state.adminFinanceMonth = data.month;
  const fin = data.summary;
  const months = data.months;
  const chartTotal = months.reduce((sum, m) => sum + m.income, 0);

  content.innerHTML = `
    ${pageHead('Finanzas', 'Ingresos, gastos y utilidad mes a mes.', `
      ${monthPicker(data.month)}
      <a class="btn ghost sm" href="/api/admin/export/ingresos.csv?month=${data.month}" download>${icon('download')} CSV</a>
      <button class="btn ghost sm" type="button" data-add-income>${icon('plus')} Ingreso</button>
      <button class="btn sm" type="button" data-add-expense>${icon('plus')} Gasto</button>
    `)}

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Ingresos del mes <span class="kpi-icon">${icon('trendingUp')}</span></div>
        <div class="kpi-value">${money(fin.income)}</div>
        <div class="kpi-foot">${fin.payments.length} pago${fin.payments.length === 1 ? '' : 's'} confirmado${fin.payments.length === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi orange">
        <div class="kpi-label">Gastos del mes <span class="kpi-icon">${icon('wallet')}</span></div>
        <div class="kpi-value">${money(fin.expenses)}</div>
        <div class="kpi-foot">${fin.expenseList.length} movimiento${fin.expenseList.length === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi accent">
        <div class="kpi-label">Utilidad neta <span class="kpi-icon">${icon('checkCircle')}</span></div>
        <div class="kpi-value">${money(fin.profit)}</div>
        <div class="kpi-foot">Margen ${Math.round(fin.margin * 100)}%</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Honorarios netos <span class="kpi-icon">${icon('file')}</span></div>
        <div class="kpi-value">${money(fin.net)}</div>
        <div class="kpi-foot">Retención ${percent(fin.retentionRate)}</div>
      </div>
    </div>

    <div class="finance-cols">
      <section class="card card-pad">
        <div class="card-head">
          <div><h3>Ingresos y gastos</h3><p>Últimos 6 meses hasta ${esc(monthLabel(data.month))}</p></div>
          <span class="badge blue">${money(chartTotal)}</span>
        </div>
        ${financeChart(months, data.month)}
      </section>
      <section class="card card-pad">
        <div class="card-head">
          <div><h3>Ingresos por categoría</h3><p>${esc(monthLabel(data.month))}</p></div>
          <span class="badge">${fin.payments.length} pago${fin.payments.length === 1 ? '' : 's'}</span>
        </div>
        ${breakdownRows(fin.incomeByCategory, fin.income)}
        ${fin.income ? `<div class="breakdown-total"><span>Total ingresos</span><strong>${money(fin.income)}</strong></div>` : ''}
      </section>
    </div>

    <div class="finance-cols">
      <section class="card">
        <div class="card-head">
          <div><h3>Comparativo mensual</h3><p>Ingresos, gastos, utilidad y honorarios</p></div>
          <a class="link-btn" href="#/admin/honorarios">Ver honorarios</a>
        </div>
        <div class="table-wrap">
          <table class="data compact">
            <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Utilidad</th><th>Margen</th><th>Honorarios netos</th></tr></thead>
            <tbody>
              ${months.slice().reverse().map((m) => `
                <tr class="${m.key === data.month ? 'row-active' : ''}">
                  <td><button class="link-btn" type="button" data-month="${esc(m.key)}">${esc(monthLabel(m.key, true))}</button></td>
                  <td>${money(m.income)}</td>
                  <td>${money(m.expenses)}</td>
                  <td class="${m.profit >= 0 ? 'text-success' : 'text-danger'}"><b>${money(m.profit)}</b></td>
                  <td>${Math.round(m.margin * 100)}%</td>
                  <td>${money(m.net)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card card-pad">
        <div class="card-head">
          <div><h3>Gastos del mes</h3><p>${money(fin.expenses)}</p></div>
          <button class="link-btn" type="button" data-add-expense>+ Agregar</button>
        </div>
        ${fin.expenseList.length ? `
          <div class="expense-list">
            ${fin.expenseList.map((expense) => `
              <div class="expense-row">
                <span class="expense-cat">${esc(expense.category)}</span>
                <div class="expense-info">
                  <b>${esc(expense.description)}</b>
                  <span>${fmtDate(expense.date, { day: '2-digit', month: 'short' })} · ${esc(expense.method || '')}</span>
                </div>
                <strong class="expense-amount">${money(expense.amount)}</strong>
                <button class="icon-btn danger" type="button" data-del-expense="${esc(expense.id)}" aria-label="Eliminar gasto">${icon('trash')}</button>
              </div>`).join('')}
          </div>` : `
          <div class="empty" style="padding:26px">
            <div class="ei">${icon('wallet')}</div>
            <h3>Sin gastos registrados</h3>
            <p>Agrega los gastos del mes para calcular la utilidad.</p>
            <button class="btn sm ghost" type="button" data-add-expense>Agregar gasto</button>
          </div>`}
        ${fin.expensesByCategory.length ? `
          <div class="expense-breakdown">
            ${fin.expensesByCategory.map((row) => `<span class="breakdown-mini">${esc(row.category)}<b>${money(row.amount)}</b></span>`).join('')}
          </div>` : ''}
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <div><h3>Ingresos registrados</h3><p>${fin.payments.length} pago${fin.payments.length === 1 ? '' : 's'} confirmado${fin.payments.length === 1 ? '' : 's'} en ${esc(monthLabel(data.month))}</p></div>
        <div class="inline-actions">
          <a class="btn ghost sm" href="/api/admin/export/ingresos.csv?month=${data.month}" download>${icon('download')} CSV</a>
          <button class="btn ghost sm" type="button" data-add-income>${icon('plus')} Ingreso manual</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data compact">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Categoría</th><th>Método</th><th>Monto</th></tr></thead>
          <tbody>
            ${fin.payments.length ? fin.payments.map((payment) => `
              <tr>
                <td>${fmtDate(payment.date, { day: '2-digit', month: 'short' })}</td>
                <td>${esc(payment.userName)}</td>
                <td>${esc(payment.concept)}${payment.ref ? `<br><span class="tiny muted">Ref. ${esc(payment.ref)}</span>` : ''}</td>
                <td><span class="tag-soft">${esc(payment.category)}</span></td>
                <td>${esc(payment.method)}</td>
                <td><b>${money(payment.amount)}</b></td>
              </tr>`).join('') : '<tr><td colspan="6" class="muted">Sin ingresos confirmados en este mes.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <div class="alert info" style="margin-top:16px">
      ${icon('info')}
      <div>Los ingresos consideran pagos con estado <b>confirmado</b>. La boleta de honorarios es un cálculo tributario aparte y no se descuenta dos veces de la utilidad.</div>
    </div>
  `;

  bindMonthPicker(content);
  $$('[data-add-expense]', content).forEach((btn) => btn.addEventListener('click', openExpenseModal));
  $$('[data-add-income]', content).forEach((btn) => btn.addEventListener('click', openIncomeModal));
  $$('[data-month]', content).forEach((btn) => btn.addEventListener('click', () => changeMonth(btn.dataset.month)));
  $$('[data-del-expense]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      const expense = fin.expenseList.find((item) => item.id === btn.dataset.delExpense);
      if (!expense) return;
      confirmDialog({
        title: 'Eliminar gasto',
        message: `Se eliminará <b>${esc(expense.description)}</b> por <b>${money(expense.amount)}</b>.`,
        confirmText: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await api(`/admin/expenses/${expense.id}`, { method: 'DELETE' });
          toast('Gasto eliminado.', 'info');
          refresh();
        },
      });
    });
  });
}

/* ============================== HONORARIOS =============================== */

export async function pageAdminHonorarios(content) {
  const data = await api(`/admin/finance?month=${encodeURIComponent(selectedMonth())}`);
  state.adminFinanceMonth = data.month;
  const fin = data.summary;
  const months = data.months;
  const rate = fin.retentionRate;
  const totals = months.reduce((acc, m) => ({
    gross: acc.gross + m.gross,
    retention: acc.retention + m.retention,
    net: acc.net + m.net,
  }), { gross: 0, retention: 0, net: 0 });
  const average = fin.boletas.length ? Math.round(fin.gross / fin.boletas.length) : 0;

  content.innerHTML = `
    ${pageHead('Boletas de honorarios', `Retención del ${percent(rate)} y neto a recibir, mes a mes.`, `
      ${monthPicker(data.month)}
      <a class="btn ghost sm" href="/api/admin/export/honorarios.csv?month=${data.month}" download>${icon('download')} Exportar</a>
      <button class="btn sm" type="button" data-add-boleta>${icon('plus')} Nueva boleta</button>
    `)}

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Honorarios brutos <span class="kpi-icon">${icon('file')}</span></div>
        <div class="kpi-value">${money(fin.gross)}</div>
        <div class="kpi-foot">${fin.boletas.length} boleta${fin.boletas.length === 1 ? '' : 's'} emitida${fin.boletas.length === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi orange">
        <div class="kpi-label">Retención ${percent(rate)} <span class="kpi-icon">${icon('percent')}</span></div>
        <div class="kpi-value">${money(fin.retention)}</div>
        <div class="kpi-foot">Retención de tercera categoría</div>
      </div>
      <div class="kpi accent">
        <div class="kpi-label">Neto a recibir <span class="kpi-icon">${icon('wallet')}</span></div>
        <div class="kpi-value">${money(fin.net)}</div>
        <div class="kpi-foot">Monto líquido estimado</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Promedio por boleta <span class="kpi-icon">${icon('trendingUp')}</span></div>
        <div class="kpi-value">${money(average)}</div>
        <div class="kpi-foot">${esc(monthLabel(data.month))}</div>
      </div>
    </div>

    <div class="alert info" style="margin-bottom:16px">
      ${icon('info')}
      <div><b>Retención vigente ${percent(rate)}.</b> El cálculo es referencial: bruto − retención = neto. Confirma siempre con tu contador según la normativa vigente del SII.</div>
    </div>

    <div class="finance-cols equal">
      <section class="card">
        <div class="card-head">
          <div><h3>Detalle de boletas</h3><p>${esc(monthLabel(data.month))}</p></div>
          <span class="badge ${fin.boletas.length ? 'blue' : 'muted'}">${fin.boletas.length}</span>
        </div>
        <div class="table-wrap">
          <table class="data compact">
            <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Bruto</th><th>Retención</th><th>Neto</th><th></th></tr></thead>
            <tbody>
              ${fin.boletas.length ? fin.boletas.map((boleta) => {
                const retention = Math.round(boleta.gross * boleta.retentionRate);
                return `<tr>
                  <td><span class="mono">${esc(boleta.number)}</span></td>
                  <td>${fmtDate(boleta.date, { day: '2-digit', month: 'short' })}</td>
                  <td>${esc(boleta.client)}</td>
                  <td>${money(boleta.gross)}</td>
                  <td class="text-danger">− ${money(retention)}</td>
                  <td><b>${money(boleta.gross - retention)}</b></td>
                  <td class="row-actions"><button class="icon-btn danger" type="button" data-del-boleta="${esc(boleta.id)}" aria-label="Eliminar boleta">${icon('trash')}</button></td>
                </tr>`;
              }).join('') : '<tr><td colspan="7" class="muted">Sin boletas registradas en este mes.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h3>Resumen semestral</h3><p>Bruto, retención y neto por mes</p></div></div>
        <div class="table-wrap">
          <table class="data compact">
            <thead><tr><th>Mes</th><th>Bruto</th><th>Retención</th><th>Neto</th></tr></thead>
            <tbody>
              ${months.slice().reverse().map((m) => `
                <tr class="${m.key === data.month ? 'row-active' : ''}">
                  <td><button class="link-btn" type="button" data-month="${esc(m.key)}">${esc(monthLabel(m.key, true))}</button></td>
                  <td>${money(m.gross)}</td>
                  <td>${money(m.retention)}</td>
                  <td><b>${money(m.net)}</b></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-pad">
          <div class="honorarios-note">
            <div><span>Total bruto 6 meses</span><strong>${money(totals.gross)}</strong></div>
            <div><span>Total retenido</span><strong>${money(totals.retention)}</strong></div>
            <div><span>Neto acumulado</span><strong>${money(totals.net)}</strong></div>
          </div>
        </div>
      </section>
    </div>

    <section class="card card-pad" style="margin-top:16px">
      <div class="card-head"><div><h3>¿Cómo se calcula?</h3><p>Fórmula aplicada a las boletas del mes</p></div></div>
      <div class="formula">
        <div class="formula-step"><span>Boleta bruta</span><strong>${money(fin.gross)}</strong></div>
        <span class="formula-op">−</span>
        <div class="formula-step accent"><span>Retención ${percent(rate)}</span><strong>${money(fin.retention)}</strong></div>
        <span class="formula-op">=</span>
        <div class="formula-step success"><span>Neto a recibir</span><strong>${money(fin.net)}</strong></div>
      </div>
      <p class="formula-note">${icon('info')} La retención se aplica sobre el monto bruto de cada boleta al momento de registrarla. Si cambia la normativa, actualiza el porcentaje en Configuración.</p>
    </section>
  `;

  bindMonthPicker(content);
  $$('[data-add-boleta]', content).forEach((btn) => btn.addEventListener('click', () => openBoletaModal(data.nextBoletaNumber, rate)));
  $$('[data-month]', content).forEach((btn) => btn.addEventListener('click', () => changeMonth(btn.dataset.month)));
  $$('[data-del-boleta]', content).forEach((btn) => {
    btn.addEventListener('click', () => {
      const boleta = fin.boletas.find((item) => item.id === btn.dataset.delBoleta);
      if (!boleta) return;
      confirmDialog({
        title: 'Eliminar boleta',
        message: `Se eliminará la boleta N° <b>${esc(boleta.number)}</b> por <b>${money(boleta.gross)}</b>.`,
        confirmText: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await api(`/admin/boletas/${boleta.id}`, { method: 'DELETE' });
          toast('Boleta eliminada.', 'info');
          refresh();
        },
      });
    });
  });
}

/* ================================ MODALES =============================== */

function openExpenseModal() {
  openModal({
    title: 'Agregar gasto',
    subtitle: 'Registra un egreso del studio.',
    size: 'sm',
    body: `<form id="expense-form">
      <div class="field-row">
        <div class="field"><label for="ex-date">Fecha</label><input class="input" id="ex-date" name="date" type="date" value="${todayStr()}" required /></div>
        <div class="field"><label for="ex-amount">Monto</label><input class="input" id="ex-amount" name="amount" type="number" min="1" step="1" required placeholder="0" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="ex-cat">Categoría</label><select class="input" id="ex-cat" name="category">${selectOptions(EXPENSE_CATEGORIES, 'Otros')}</select></div>
        <div class="field"><label for="ex-method">Método</label><select class="input" id="ex-method" name="method">${selectOptions(METHODS, 'Transferencia')}</select></div>
      </div>
      <div class="field" style="margin-bottom:0"><label for="ex-desc">Descripción</label><input class="input" id="ex-desc" name="description" placeholder="Ej: arriendo de noviembre" required maxlength="160" /></div>
      <p class="form-error" id="ex-error" role="alert"></p>
    </form>`,
    footer: `<button class="btn ghost sm" type="button" id="ex-cancel">Cancelar</button>
             <button class="btn sm" type="submit" form="expense-form">Guardar gasto</button>`,
    onMount(modal) {
      $('#ex-cancel', modal).onclick = () => closeModal();
      $('#expense-form', modal).addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const error = $('#ex-error', modal);
        const button = modal.querySelector('button[type="submit"]');
        error.classList.add('hidden');
        button.disabled = true;
        try {
          await api('/admin/expenses', {
            method: 'POST',
            body: {
              date: form.date.value,
              amount: Number(form.amount.value),
              category: form.category.value,
              method: form.method.value,
              description: form.description.value.trim(),
            },
          });
          closeModal();
          toast('Gasto registrado.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          button.disabled = false;
        }
      });
    },
  });
}

function openIncomeModal() {
  openModal({
    title: 'Ingreso manual',
    subtitle: 'Registra un pago recibido fuera del flujo online.',
    size: 'sm',
    body: `<form id="income-form">
      <div class="field-row">
        <div class="field"><label for="in-date">Fecha</label><input class="input" id="in-date" name="date" type="date" value="${todayStr()}" required /></div>
        <div class="field"><label for="in-amount">Monto</label><input class="input" id="in-amount" name="amount" type="number" min="1" step="1" required placeholder="0" /></div>
      </div>
      <div class="field"><label for="in-concept">Concepto</label><input class="input" id="in-concept" name="concept" placeholder="Ej: sesión de kinesiología" required maxlength="120" /></div>
      <div class="field"><label for="in-client">Cliente (opcional)</label><input class="input" id="in-client" name="client" placeholder="Nombre de quien paga" maxlength="120" /></div>
      <div class="field-row">
        <div class="field"><label for="in-cat">Categoría</label><select class="input" id="in-cat" name="category">${selectOptions(INCOME_CATEGORIES, 'Sesiones')}</select></div>
        <div class="field"><label for="in-method">Método</label><select class="input" id="in-method" name="method">${selectOptions(METHODS, 'Transferencia')}</select></div>
      </div>
      <div class="field" style="margin-bottom:0"><label for="in-ref">Referencia (opcional)</label><input class="input" id="in-ref" name="reference" placeholder="N° de comprobante" maxlength="120" /></div>
      <p class="form-error" id="in-error" role="alert"></p>
    </form>`,
    footer: `<button class="btn ghost sm" type="button" id="in-cancel">Cancelar</button>
             <button class="btn sm" type="submit" form="income-form">Registrar ingreso</button>`,
    onMount(modal) {
      $('#in-cancel', modal).onclick = () => closeModal();
      $('#income-form', modal).addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const error = $('#in-error', modal);
        const button = modal.querySelector('button[type="submit"]');
        error.classList.add('hidden');
        button.disabled = true;
        try {
          await api('/admin/payments', {
            method: 'POST',
            body: {
              date: form.date.value,
              amount: Number(form.amount.value),
              concept: form.concept.value.trim(),
              client: form.client.value.trim(),
              category: form.category.value,
              method: form.method.value,
              reference: form.reference.value.trim(),
            },
          });
          closeModal();
          toast('Ingreso registrado.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          button.disabled = false;
        }
      });
    },
  });
}

function openBoletaModal(nextNumber, rate) {
  openModal({
    title: 'Nueva boleta de honorarios',
    subtitle: `Retención vigente: ${percent(rate)}`,
    size: 'sm',
    body: `<form id="boleta-form">
      <div class="field-row">
        <div class="field"><label for="bo-number">N° boleta</label><input class="input" id="bo-number" name="number" value="${esc(nextNumber)}" maxlength="40" required /></div>
        <div class="field"><label for="bo-date">Fecha</label><input class="input" id="bo-date" name="date" type="date" value="${todayStr()}" required /></div>
      </div>
      <div class="field"><label for="bo-client">Cliente</label><input class="input" id="bo-client" name="client" value="${esc(state.config?.studioName || 'Recovery Studio')}" maxlength="120" required /></div>
      <div class="field"><label for="bo-gross">Monto bruto</label><input class="input" id="bo-gross" name="gross" type="number" min="1" step="1" required placeholder="0" /></div>
      <div class="boleta-calc">
        <div><span>Retención ${percent(rate)}</span><strong id="boleta-ret">− ${money(0)}</strong></div>
        <div><span>Neto a recibir</span><strong id="boleta-net">${money(0)}</strong></div>
      </div>
      <div class="field" style="margin-bottom:0"><label for="bo-notes">Notas (opcional)</label><input class="input" id="bo-notes" name="notes" placeholder="Detalle opcional" maxlength="300" /></div>
      <p class="form-error" id="bo-error" role="alert"></p>
    </form>`,
    footer: `<button class="btn ghost sm" type="button" id="bo-cancel">Cancelar</button>
             <button class="btn sm" type="submit" form="boleta-form">Registrar boleta</button>`,
    onMount(modal) {
      const grossInput = $('#bo-gross', modal);
      const retentionEl = $('#boleta-ret', modal);
      const netEl = $('#boleta-net', modal);
      const update = () => {
        const gross = Number(grossInput.value) || 0;
        const retention = Math.round(gross * rate);
        retentionEl.textContent = `− ${money(retention)}`;
        netEl.textContent = money(gross - retention);
      };
      grossInput.addEventListener('input', update);
      $('#bo-cancel', modal).onclick = () => closeModal();
      $('#boleta-form', modal).addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const error = $('#bo-error', modal);
        const button = modal.querySelector('button[type="submit"]');
        error.classList.add('hidden');
        button.disabled = true;
        try {
          await api('/admin/boletas', {
            method: 'POST',
            body: {
              number: form.number.value.trim(),
              date: form.date.value,
              client: form.client.value.trim(),
              gross: Number(form.gross.value),
              notes: form.notes.value.trim(),
            },
          });
          closeModal();
          toast('Boleta registrada.');
          refresh();
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
          button.disabled = false;
        }
      });
    },
  });
}
