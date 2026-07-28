(() => {
  'use strict';

  const VERSION = '315';
  const API_BASE = localStorage.getItem('mt_api_base') || '/api';
  const token = () => sessionStorage.getItem('mt_token') || localStorage.getItem('mt_token') || '';
  const fmt = new Intl.NumberFormat('ko-KR');
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const num = (v) => { const n = Number(String(v ?? 0).replace(/,/g,'').replace(/원/g,'').trim()); return Number.isFinite(n) ? n : 0; };
  const money = (v) => fmt.format(Math.trunc(num(v)));
  const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const monthStart = () => `${today().slice(0, 7)}-01`;

  async function API(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const tk = token();
    if (tk) headers.Authorization = `Bearer ${tk}`;
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) throw new Error(json.error || `요청 실패: ${response.status}`);
    return json.data;
  }

  function toast(message, type = 'info') {
    let el = document.getElementById('mt-v315-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mt-v315-toast';
      el.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:420px;padding:13px 16px;border-radius:12px;background:#111827;color:#fff;font-weight:800;box-shadow:0 16px 36px rgba(0,0,0,.25);';
      document.body.appendChild(el);
    }
    el.style.background = type === 'error' ? '#991b1b' : type === 'success' ? '#065f46' : '#111827';
    el.textContent = message;
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => el.remove(), 3200);
  }

  // Prevent accidental modal form submission by Enter except explicit search fields and textareas.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    if (event.isComposing) return;
    const target = event.target;
    if (!target || !(target instanceof HTMLElement)) return;
    if (target.tagName === 'TEXTAREA') return;
    if (target.closest('#customer-search, #order-search, [data-v315-enter-search]')) return;
    if (target.closest('#modal-root form')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  // Number formatting on blur, while preserving server numeric payload via submit cleanup.
  function formatNumberInput(input) {
    if (!input || input.dataset.v315NumberBound) return;
    const label = (input.closest('div')?.querySelector('label')?.textContent || '').trim();
    const name = input.name || '';
    const likely = /amount|price|qty|quantity|total|subtotal|vat|receivable|limit|stock|수량|금액|단가|미수|재고/i.test(`${name} ${label}`);
    if (!likely) return;
    input.dataset.v315NumberBound = '1';
    input.addEventListener('blur', () => {
      const raw = String(input.value || '').replace(/,/g,'').replace(/원/g,'').trim();
      if (raw === '' || !/^-?\d+(\.\d+)?$/.test(raw)) return;
      input.value = money(raw);
    });
    const form = input.form;
    if (form && !form.dataset.v315NumberSubmitBound) {
      form.dataset.v315NumberSubmitBound = '1';
      form.addEventListener('submit', () => {
        form.querySelectorAll('input').forEach((el) => {
          const l = (el.closest('div')?.querySelector('label')?.textContent || '').trim();
          if (/amount|price|qty|quantity|total|subtotal|vat|receivable|limit|stock|수량|금액|단가|미수|재고/i.test(`${el.name || ''} ${l}`)) {
            el.value = String(el.value || '').replace(/,/g,'').replace(/원/g,'').trim();
          }
        });
      }, true);
    }
  }

  let managers = null;
  async function salesManagers() {
    if (managers) return managers;
    try {
      managers = await API('/final/sales-managers');
    } catch (e) {
      managers = [
        { id: '', name: '김안구', bank_name: '', account_no: '' },
        { id: '', name: '김동열', bank_name: '', account_no: '' },
        { id: '', name: '이영성', bank_name: '', account_no: '' },
        { id: '', name: '사무실', bank_name: '', account_no: '' }
      ];
    }
    return managers;
  }

  function managerOptionHtml(list, selectedId = '', selectedName = '') {
    return '<option value="">선택</option>' + list.map((m) => {
      const sel = (selectedId && String(m.id) === String(selectedId)) || (!selectedId && selectedName && String(m.name) === String(selectedName)) ? ' selected' : '';
      return `<option value="${esc(m.id || '')}" data-name="${esc(m.name || '')}" data-bank="${esc(m.bank_name || '')}" data-account="${esc(m.account_no || '')}"${sel}>${esc(m.name || '')}</option>`;
    }).join('');
  }

  function syncManagerHidden(wrap) {
    const select = wrap.querySelector('select[name="sales_manager_id"]');
    if (!select) return;
    const opt = select.selectedOptions[0];
    const form = select.form || wrap.closest('form');
    if (!form) return;
    for (const name of ['sales_manager_name','sales_manager_bank','sales_manager_account']) {
      let input = form.querySelector(`input[name="${name}"]`);
      if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = name; form.appendChild(input); }
    }
    form.querySelector('input[name="sales_manager_name"]').value = opt?.dataset.name || '';
    form.querySelector('input[name="sales_manager_bank"]').value = opt?.dataset.bank || '';
    form.querySelector('input[name="sales_manager_account"]').value = opt?.dataset.account || '';
  }

  async function insertManagerField(form, markerName = '') {
    if (!form || form.querySelector('[data-v315-sales-manager-field]')) return;
    const list = await salesManagers();
    const block = document.createElement('div');
    block.dataset.v315SalesManagerField = '1';
    block.innerHTML = `<label>영업담당자</label><select name="sales_manager_id">${managerOptionHtml(list)}</select><input type="hidden" name="sales_manager_name"><input type="hidden" name="sales_manager_bank"><input type="hidden" name="sales_manager_account">`;
    const target = markerName ? form.querySelector(`[name="${markerName}"]`)?.closest('div') : null;
    if (target && target.nextSibling) target.parentNode.insertBefore(block, target.nextSibling); else form.prepend(block);
    block.querySelector('select').addEventListener('change', () => syncManagerHidden(block));
    syncManagerHidden(block);
  }

  async function applyManagerToForms(root = document) {
    root.querySelectorAll('form').forEach((form) => {
      const hasCustomerFields = form.querySelector('input[name="name"], input[name="business_no"], input[name="payment_terms"]') && form.querySelector('input[name="opening_receivable"]');
      const hasSiteFields = form.querySelector('select[name="customer_id"]') && form.querySelector('input[name="site_name"]');
      const hasPaymentForm = form.id === 'payment-form' || form.querySelector('input[name="approval_no"], select[name="method"]') && form.querySelector('input[name="amount"]');
      if (hasCustomerFields) insertManagerField(form, 'payment_terms');
      if (hasSiteFields) insertManagerField(form, 'default_delivery_type');
      if (hasPaymentForm) insertManagerField(form, 'amount');
    });
  }

  document.addEventListener('change', async (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    if (!['payment-customer','edit-payment-customer'].includes(select.id)) return;
    const form = select.form || select.closest('form');
    const mgrSelect = form?.querySelector('select[name="sales_manager_id"]');
    if (!mgrSelect || !select.value) return;
    try {
      const data = await API(`/final/customers/${encodeURIComponent(select.value)}/sales-manager`);
      const list = await salesManagers();
      if (data.sales_manager_id || data.sales_manager_name) {
        mgrSelect.innerHTML = managerOptionHtml(list, data.sales_manager_id, data.sales_manager_name);
        syncManagerHidden(mgrSelect.closest('[data-v315-sales-manager-field]') || form);
      }
    } catch (e) { /* ignore */ }
  }, true);

  function patchSideNavReports() {
    const nav = document.querySelector('.sidebar nav, .sidebar, aside, #app nav');
    if (!nav || nav.querySelector('[data-v315-reports-menu]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.v315ReportsMenu = '1';
    btn.textContent = '출력보고서';
    btn.className = 'nav-item';
    btn.style.cssText = 'width:100%;text-align:left;margin-top:4px;';
    const anchor = Array.from(nav.querySelectorAll('button, a')).find((x) => /수정이력/.test(x.textContent || ''));
    if (anchor?.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling); else nav.appendChild(btn);
    btn.addEventListener('click', renderReportsPage);
  }

  function reportStyles() {
    if (document.getElementById('v315-report-style')) return;
    const style = document.createElement('style');
    style.id = 'v315-report-style';
    style.textContent = `
      .v315-page{padding:28px}.v315-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}.v315-head h1{margin:0;font-size:28px}.v315-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.04)}.v315-filters{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr auto;gap:12px;align-items:end}.v315-filters label{display:block;font-weight:800;margin-bottom:6px}.v315-filters input,.v315-filters select{width:100%;height:42px;border:1px solid #cbd5e1;border-radius:10px;padding:0 11px}.v315-btn{border:0;border-radius:10px;padding:12px 16px;font-weight:900;cursor:pointer;background:#e2e8f0}.v315-btn.primary{background:#2563eb;color:white}.v315-btn.green{background:#059669;color:white}.v315-table-wrap{margin-top:18px;overflow:auto}.v315-table{width:100%;border-collapse:collapse;background:white}.v315-table th,.v315-table td{border:1px solid #d1d5db;padding:8px 10px;font-size:13px}.v315-table th{background:#f1f5f9}.v315-num{text-align:right}.v315-empty{text-align:center;color:#64748b;padding:48px}.v315-manager-admin{display:none;margin-top:14px;border-top:1px dashed #cbd5e1;padding-top:14px}.v315-manager-admin.open{display:block}@media print{body>*:not(.v315-print-window){display:none!important}.v315-page{padding:0}.v315-card{box-shadow:none;border:0}.v315-filters,.v315-actions,.sidebar,.topbar{display:none!important}.v315-table th,.v315-table td{font-size:11px;padding:5px}.v315-table-wrap{overflow:visible}}`;
    document.head.appendChild(style);
  }

  async function renderReportsPage() {
    reportStyles();
    const app = document.getElementById('app');
    if (!app) return;
    const list = await salesManagers();
    app.innerHTML = `<div class="v315-page"><div class="v315-head"><div><h1>출력보고서</h1><p>보고서를 화면에서 먼저 조회한 뒤 인쇄 또는 엑셀 다운로드합니다.</p></div><button class="v315-btn" id="v315-manager-toggle">영업담당자 관리</button></div><div class="v315-card"><div class="v315-filters"><div><label>보고서 종류</label><select id="v315-report-type"><option value="sales">기간별 거래처별 판매현황</option><option value="payments">기간별 거래처별 수금현황</option><option value="monthly">월별 판매현황</option></select></div><div><label>시작일</label><input type="date" id="v315-date-from" value="${monthStart()}"></div><div><label>종료일</label><input type="date" id="v315-date-to" value="${today()}"></div><div><label>영업담당자</label><select id="v315-manager"><option value="">전체</option>${list.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select></div><div class="v315-actions"><button class="v315-btn primary" id="v315-report-load">조회</button> <button class="v315-btn" id="v315-report-print">인쇄</button> <button class="v315-btn green" id="v315-report-excel">엑셀</button></div></div><div id="v315-manager-admin" class="v315-manager-admin">${managerAdminHtml(list)}</div><div id="v315-report-preview" class="v315-table-wrap"><div class="v315-empty">조회 조건을 선택한 후 [조회]를 누르세요.</div></div></div></div>`;
    document.getElementById('v315-manager-toggle').onclick = () => document.getElementById('v315-manager-admin').classList.toggle('open');
    document.getElementById('v315-report-load').onclick = loadReport;
    document.getElementById('v315-report-print').onclick = () => window.print();
    document.getElementById('v315-report-excel').onclick = downloadReportExcel;
    app.querySelectorAll('[data-v315-manager-save]').forEach((btn) => btn.addEventListener('click', saveManagerFromRow));
  }

  function managerAdminHtml(list) {
    const rows = [...list, { id:'', name:'', bank_name:'', account_no:'', sort_order: (list.length + 1) * 10, is_active: 1 }].map((m) => `<tr><td><input data-field="id" type="hidden" value="${esc(m.id || '')}"><input data-field="name" value="${esc(m.name || '')}"></td><td><input data-field="bank_name" value="${esc(m.bank_name || '')}"></td><td><input data-field="account_no" value="${esc(m.account_no || '')}"></td><td><input data-field="sort_order" value="${esc(m.sort_order || '')}" style="width:70px"></td><td><select data-field="is_active"><option value="1" ${m.is_active !== 0 ? 'selected':''}>사용</option><option value="0" ${m.is_active === 0 ? 'selected':''}>중지</option></select></td><td><button class="v315-btn" data-v315-manager-save>저장</button></td></tr>`).join('');
    return `<h3>영업담당자 관리</h3><table class="v315-table"><thead><tr><th>이름</th><th>은행명</th><th>계좌번호</th><th>정렬</th><th>사용</th><th>관리</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function saveManagerFromRow(event) {
    const tr = event.target.closest('tr');
    const payload = {};
    tr.querySelectorAll('[data-field]').forEach((el) => { payload[el.dataset.field] = el.value; });
    if (!payload.name) return toast('영업담당자명을 입력하세요.', 'error');
    await API('/final/sales-managers', { method: 'POST', body: JSON.stringify(payload) });
    managers = null;
    toast('영업담당자를 저장했습니다.', 'success');
    renderReportsPage();
  }

  let lastReport = null;
  async function loadReport() {
    const type = document.getElementById('v315-report-type').value;
    const from = document.getElementById('v315-date-from').value || monthStart();
    const to = document.getElementById('v315-date-to').value || today();
    const manager = document.getElementById('v315-manager').value;
    const preview = document.getElementById('v315-report-preview');
    preview.innerHTML = '<div class="v315-empty">조회 중입니다...</div>';
    try {
      let html = '';
      if (type === 'payments') {
        const q = `date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}${manager ? `&sales_manager_name=${encodeURIComponent(manager)}` : ''}`;
        const data = await API(`/final/reports/customer-payments?${q}`);
        const rows = (data.rows || []).map(r => `<tr><td>${esc(r.sales_manager_name || '미지정')}</td><td>${esc(r.customer_name || '')}</td><td>${esc(r.site_name || '')}</td><td class="v315-num">${money(r.payment_count)}</td><td class="v315-num">${money(r.payment_amount)}</td><td>${esc(r.methods || '')}</td></tr>`).join('');
        html = reportTable(`기간별 거래처별 수금현황 (${from} ~ ${to})`, ['영업담당자','거래처','납품처/지역','수금건수','수금금액','방법'], rows);
      } else if (type === 'monthly') {
        const data = await API(`/final/reports/monthly-sales-matrix?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
        let mgrs = Array.from(new Set([...(data.sales || []).map(r => r.sales_manager_name || '미지정'), ...(data.payments || []).map(r => r.sales_manager_name || '미지정'), ...(data.receivables || []).map(r => r.sales_manager_name || '미지정')])).filter(Boolean);
        if (manager) mgrs = mgrs.filter(m => m === manager);
        if (!mgrs.length) mgrs = [manager || '미지정'];
        const products = Array.from(new Set((data.sales || []).map(r => r.product_name || '미지정'))).filter(Boolean);
        const pay = Object.fromEntries((data.payments || []).map(r => [r.sales_manager_name || '미지정', num(r.payment_amount)]));
        const recv = Object.fromEntries((data.receivables || []).map(r => [r.sales_manager_name || '미지정', num(r.receivable_amount)]));
        const totalByMgr = {};
        (data.sales || []).forEach(r => { const m = r.sales_manager_name || '미지정'; totalByMgr[m] = (totalByMgr[m] || 0) + num(r.sales_amount); });
        const rows = products.map(prod => `<tr><td>${esc(prod)}</td>${mgrs.map(m => { const r = (data.sales || []).find(x => (x.product_name || '미지정') === prod && (x.sales_manager_name || '미지정') === m) || {}; const ratio = totalByMgr[m] ? num(r.sales_amount) / totalByMgr[m] : 0; return `<td class="v315-num">${money(r.sales_qty || 0)} / ${money(r.sales_amount || 0)} / ${money((pay[m] || 0) * ratio)} / ${money((recv[m] || 0) * ratio)}</td>`; }).join('')}</tr>`).join('');
        html = `<h2>월별 판매현황 (${from} ~ ${to})</h2><div class="muted">각 셀: 판매수량 / 판매금액 / 수금금액 / 미수금</div><table class="v315-table"><thead><tr><th>제품명</th>${mgrs.map(m => `<th>${esc(m)}</th>`).join('')}</tr></thead><tbody>${rows || '<tr><td colspan="99" class="v315-empty">자료가 없습니다.</td></tr>'}</tbody></table>`;
      } else {
        const data = await API(`/final/reports/customer-sales?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
        let rowsData = data.rows || [];
        if (manager) rowsData = rowsData.filter(r => (r.sales_manager_name || '미지정') === manager);
        const rows = rowsData.map(r => `<tr><td>${esc(r.sales_manager_name || '미지정')}</td><td>${esc(r.customer_name || '')}</td><td>${esc(r.site_name || '')}</td><td class="v315-num">${money(r.order_count)}</td><td class="v315-num">${money(r.sales_qty)}</td><td class="v315-num">${money(r.sales_amount)}</td></tr>`).join('');
        html = reportTable(`기간별 거래처별 판매현황 (${from} ~ ${to})`, ['영업담당자','거래처','납품처/지역','주문건수','판매수량','판매금액'], rows);
      }
      preview.innerHTML = html;
      lastReport = { type, html: preview.innerHTML, date: `${from}_${to}` };
    } catch (e) {
      preview.innerHTML = `<div class="v315-empty">${esc(e.message || e)}</div>`;
    }
  }

  function reportTable(title, headers, rows) {
    return `<h2>${esc(title)}</h2><table class="v315-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="v315-empty">자료가 없습니다.</td></tr>`}</tbody></table>`;
  }

  function downloadReportExcel() {
    const preview = document.getElementById('v315-report-preview');
    if (!preview || !preview.querySelector('table')) return toast('먼저 보고서를 조회하세요.', 'error');
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${preview.innerHTML}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `MT옵틱스_출력보고서_${lastReport?.date || today()}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function statementCss() {
    return `@page{size:A4 portrait;margin:4mm}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif}.toolbar{position:fixed;right:8mm;top:6mm;z-index:99999;display:flex;gap:8px}.toolbar button{border:0;border-radius:8px;padding:9px 15px;font-weight:900;cursor:pointer}.toolbar .print{background:#2563eb;color:white}.toolbar .close{background:#e5e7eb}.sheet{width:202mm;height:289mm;margin:0 auto;padding:2mm 3mm;overflow:hidden}.copy{position:relative;height:139mm;overflow:hidden}.copy+.copy{margin-top:4mm}.copy-label{position:absolute;right:0;top:0;font-size:11px}.cut{height:3mm;border-top:1px dashed #444;margin:1mm 0}.head,.items{width:100%;border-collapse:collapse;table-layout:fixed}.head td,.items td,.items th{border:1px solid #111;vertical-align:middle}.head td{height:6.5mm;padding:.7mm 1.2mm;font-size:10.5px}.items td,.items th{height:6.2mm;padding:.6mm 1mm;font-size:10.5px}.title{font-size:22px!important;font-weight:900;text-align:center;letter-spacing:7px}.no{font-weight:900}.side{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:900;letter-spacing:2px;background:#f8fafc}.label{font-weight:900;text-align:center;background:#f8fafc}.center{text-align:center}.right{text-align:right}.claim{text-align:center;font-weight:900;height:5.5mm!important}.items th{background:#e5e7eb;text-align:center}.item-name{text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.summary td{height:6.1mm;font-weight:900}.stamp{position:absolute;right:44mm;top:28mm;width:25mm;height:25mm;border:2px solid #d33;border-radius:50%;color:#d33;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:11px;opacity:.78;transform:rotate(-13deg);z-index:3}@media print{.toolbar{display:none}.sheet{width:202mm;height:289mm;margin:0;padding:0;overflow:hidden}.copy{break-inside:avoid;page-break-inside:avoid}body{overflow:hidden}}`;
  }

  function itemAmount(item) {
    const amount = num(item.amount);
    if (amount) return amount;
    return num(item.quantity) * num(item.unit_price);
  }

  function statementRows(items, dateText) {
    const d = String(dateText || today()).slice(5,10).split('-');
    const rows = (items || []).slice(0, 7).map((item, idx) => `<tr><td class="center">${idx === 0 ? esc(d[0]) : ''}</td><td class="center">${idx === 0 ? esc(d[1]) : ''}</td><td class="item-name">${esc(item.item_name || item.name || '')}</td><td class="right">${money(item.quantity || 0)}</td><td class="right">${money(item.unit_price || 0)}</td><td class="right">${money(itemAmount(item))}</td></tr>`);
    while (rows.length < 7) rows.push('<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    return rows.join('');
  }

  function statementCopy(data, label) {
    const order = data.order || {};
    const customer = data.customer || {};
    const d = String(order.order_date || today()).slice(0,10);
    const sale = (data.items || []).reduce((sum, item) => sum + itemAmount(item), 0) || num(data.today_sale_amount || order.total_amount);
    const prev = num(data.previous_balance);
    const total = prev + sale;
    return `<section class="copy"><div class="copy-label">(${esc(label)})</div><table class="head"><colgroup><col style="width:10mm"><col style="width:25mm"><col style="width:75mm"><col style="width:10mm"><col style="width:25mm"><col style="width:57mm"></colgroup><tr><td colspan="3" class="no">No. ${esc(order.order_no || '')}</td><td colspan="3" class="title">거 래 명 세 표</td></tr><tr><td rowspan="5" class="side">공급받는자</td><td class="label">등록번호</td><td>${esc(customer.business_no || '000-00-00000')}</td><td rowspan="5" class="side">공급자</td><td class="label">등록번호</td><td class="center">514-04-79741</td></tr><tr><td class="label">상호(법인명)</td><td>${esc(customer.name || '')}</td><td class="label">상호(법인명)</td><td class="center">MT옵틱스</td></tr><tr><td class="label">성 명</td><td>${esc(customer.owner_name || '')}</td><td class="label">성 명</td><td class="center"><b>오 희 숙</b></td></tr><tr><td class="label">사업장주소</td><td>${esc(customer.address || '')}</td><td class="label">사업장주소</td><td>대구·북구 노원동3가 1149-1 1층</td></tr><tr><td class="label">전화/FAX</td><td>${esc(customer.phone || '')}</td><td class="label">전화/FAX</td><td>T.053-351-6915 / 053-353-2469<br>F.053-351-2469</td></tr><tr><td colspan="2" class="label">작성년월일</td><td class="center">${esc(d)}</td><td colspan="2" class="label">공급대가총액</td><td class="right">${money(sale)}원</td></tr><tr><td colspan="6" class="claim">위 금액을 정히 청구(영수) 함.</td></tr></table><table class="items"><colgroup><col style="width:10mm"><col style="width:10mm"><col style="width:118mm"><col style="width:18mm"><col style="width:23mm"><col style="width:23mm"></colgroup><thead><tr><th>월</th><th>일</th><th>품 목</th><th>수량</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${statementRows(data.items, d)}<tr class="summary"><td colspan="2" class="center">판매금액</td><td class="right">${money(sale)}</td><td colspan="2" class="center">전잔액</td><td class="right">${money(prev)}</td></tr><tr class="summary"><td colspan="5" class="right">합계금액</td><td class="right">${money(total)}</td></tr></tbody></table><div class="stamp">직인</div></section>`;
  }

  function statementHtml(data) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>거래명세서</title><style>${statementCss()}</style></head><body><div class="toolbar"><button class="print" id="printBtn">인쇄</button><button class="close" id="closeBtn">닫기</button></div><main class="sheet">${statementCopy(data, '공급받는자용')}<div class="cut"></div>${statementCopy(data, '공급자용')}</main><script>document.getElementById('printBtn').onclick=function(){window.focus();setTimeout(function(){window.print();},80)};document.getElementById('closeBtn').onclick=function(){window.close()};<\/script></body></html>`;
  }

  async function openStatement(orderId) {
    if (!orderId) return;
    try {
      const data = await API(`/final/orders/${encodeURIComponent(orderId)}/statement`);
      const win = window.open('', 'mt_statement', 'width=980,height=900,scrollbars=yes');
      if (!win) return toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'error');
      win.document.open();
      win.document.write(statementHtml(data));
      win.document.close();
    } catch (e) { toast(e.message || '거래명세서를 열 수 없습니다.', 'error'); }
  }

  function patchOrderStatementButtons(root = document) {
    root.querySelectorAll('td.action-cell, .action-cell').forEach((cell) => {
      if (cell.querySelector('[data-v315-statement]')) return;
      const id = cell.querySelector('[data-view], [data-edit-order], [data-ship], [data-delete-order]')?.dataset.view
        || cell.querySelector('[data-edit-order]')?.dataset.editOrder
        || cell.querySelector('[data-ship]')?.dataset.ship
        || cell.querySelector('[data-delete-order]')?.dataset.deleteOrder;
      if (!id) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small secondary';
      btn.dataset.v315Statement = id;
      btn.textContent = '거래명세서';
      cell.appendChild(document.createTextNode(' '));
      cell.appendChild(btn);
    });
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest?.('[data-v315-statement], [data-order-action="statement"], [data-statement-print], [data-order-statement]');
    if (btn) {
      event.preventDefault(); event.stopPropagation();
      openStatement(btn.dataset.v315Statement || btn.dataset.orderId || btn.dataset.id || btn.getAttribute('data-order-statement'));
    }
  }, true);

  function patchPaymentsOrder() {
    const page = document.querySelector('.page h1, main h1, .content h1');
    if (!page || !/수금\/미수금/.test(page.textContent || '')) return;
    const panels = Array.from(document.querySelectorAll('.panel'));
    const register = panels.find(p => /수금 등록/.test(p.textContent || ''));
    const recent = panels.find(p => /최근 수금/.test(p.textContent || ''));
    if (register && recent && register.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_PRECEDING) {
      register.after(recent);
    }
  }

  function initMutation() {
    const mo = new MutationObserver((muts) => {
      patchSideNavReports();
      applyManagerToForms(document);
      patchOrderStatementButtons(document);
      patchPaymentsOrder();
      document.querySelectorAll('input').forEach(formatNumberInput);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    patchSideNavReports();
    applyManagerToForms(document);
    patchOrderStatementButtons(document);
    patchPaymentsOrder();
    document.querySelectorAll('input').forEach(formatNumberInput);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMutation); else initMutation();
})();
