(() => {
  'use strict';

  const VERSION = '317';
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
    let el = document.getElementById('mt-v317-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mt-v317-toast';
      el.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:460px;padding:13px 16px;border-radius:12px;background:#111827;color:#fff;font-weight:800;box-shadow:0 16px 36px rgba(0,0,0,.25);';
      document.body.appendChild(el);
    }
    el.style.background = type === 'error' ? '#991b1b' : type === 'success' ? '#065f46' : '#111827';
    el.textContent = message;
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => el.remove(), 3600);
  }

  function injectStyle() {
    if (document.getElementById('mt-v317-style')) return;
    const style = document.createElement('style');
    style.id = 'mt-v317-style';
    style.textContent = `
      .mt-v317-num, input.mt-v317-num{text-align:right!important;font-variant-numeric:tabular-nums}.mt-v317-hidden{display:none!important}.page-subtitle,.topbar .muted,header .muted{display:none!important}.money,.num,td.money,td.num{text-align:right!important;font-variant-numeric:tabular-nums}
      .mt-v317-report-page{padding:28px}.mt-v317-report-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px}.mt-v317-report-head h1{margin:0;font-size:28px}.mt-v317-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.mt-v317-tabs button{border:0;border-radius:999px;padding:10px 16px;font-weight:900;cursor:pointer;background:#e2e8f0}.mt-v317-tabs button.active{background:#2563eb;color:#fff}.mt-v317-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.04);margin-bottom:14px}.mt-v317-filters{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr)) auto auto auto;gap:12px;align-items:end}.mt-v317-filters label{display:block;font-weight:800;margin-bottom:6px}.mt-v317-filters input,.mt-v317-filters select{width:100%;height:42px;border:1px solid #cbd5e1;border-radius:10px;padding:0 11px}.mt-v317-btn{border:0;border-radius:10px;padding:12px 16px;font-weight:900;cursor:pointer;background:#e2e8f0}.mt-v317-btn.primary{background:#2563eb;color:white}.mt-v317-btn.green{background:#059669;color:white}.mt-v317-paper{background:#fff;border:1px solid #cbd5e1;margin-top:14px;padding:18px;min-height:220px}.mt-v317-paper h2{text-align:center;margin:0 0 5px}.mt-v317-paper .period{text-align:center;color:#475569;margin-bottom:14px}.mt-v317-table{width:100%;border-collapse:collapse;font-size:13px}.mt-v317-table th,.mt-v317-table td{border:1px solid #94a3b8;padding:6px 8px}.mt-v317-table th{background:#f1f5f9;text-align:center;cursor:grab;user-select:none}.mt-v317-table .num{text-align:right}.mt-v317-table tr.subtotal{background:#fff7ed;font-weight:900}.mt-v317-table tr.grand{background:#e0f2fe;font-weight:900}.mt-v317-empty{text-align:center;color:#64748b;padding:38px}.mt-v317-muted{font-size:12px;color:#64748b;margin-top:8px}
      @media print{.nav,.sidebar,header,.topbar,.mt-v317-no-print,.mt-v317-report-head,.mt-v317-tabs,.mt-v317-filters{display:none!important}.mt-v317-report-page{padding:0}.mt-v317-card{box-shadow:none;border:0}.mt-v317-paper{border:0;margin:0;padding:0}.mt-v317-table th,.mt-v317-table td{font-size:11px;padding:4px}}
    `;
    document.head.appendChild(style);
  }

  // Enter key: only explicit searches may submit. Modal editing never closes on Enter accidentally.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const t = event.target;
    if (!t || !(t instanceof HTMLElement) || t.tagName === 'TEXTAREA') return;
    const id = t.id || '';
    if (/customer-search|order-search|product-search/.test(id)) {
      event.preventDefault();
      const btn = t.closest('.panel, .toolbar, form')?.querySelector('button[id$="search-btn"], button.primary, button.secondary');
      btn?.click();
      return;
    }
    if (t.closest('#modal-root form')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  function numericInputCandidate(input) {
    const label = (input.closest('div')?.querySelector('label')?.textContent || '').trim();
    const name = input.name || '';
    return /amount|price|qty|quantity|total|subtotal|vat|receivable|limit|stock|opening|수량|금액|단가|미수|재고|합계/i.test(`${name} ${label}`);
  }

  function formatNumberInput(input) {
    if (!input || input.dataset.v317NumberBound || !numericInputCandidate(input)) return;
    input.dataset.v317NumberBound = '1';
    input.classList.add('mt-v317-num');
    try { input.type = 'text'; } catch (_) {}
    const cleanToInteger = () => {
      const raw = String(input.value || '').replace(/,/g,'').replace(/원/g,'').trim();
      if (raw === '') return '';
      const n = Number(raw);
      return Number.isFinite(n) ? String(Math.trunc(n)) : raw;
    };
    const paint = () => {
      const v = cleanToInteger();
      if (v === '') return;
      if (/^-?\d+$/.test(v)) input.value = fmt.format(Number(v));
    };
    input.value = cleanToInteger();
    input.style.textAlign = 'right';
    input.addEventListener('focus', () => { input.value = cleanToInteger(); });
    input.addEventListener('blur', paint);
    const form = input.form;
    if (form && !form.dataset.v317NumberSubmitBound) {
      form.dataset.v317NumberSubmitBound = '1';
      form.addEventListener('submit', () => {
        form.querySelectorAll('input').forEach((el) => {
          if (numericInputCandidate(el)) el.value = String(el.value || '').replace(/,/g,'').replace(/원/g,'').trim();
        });
      }, true);
    }
  }

  let managerCache = null;
  async function salesManagers(force = false) {
    if (managerCache && !force) return managerCache;
    try { managerCache = await API('/final/sales-managers'); } catch (_) { managerCache = []; }
    if (!managerCache.length) managerCache = [{id:'',name:'김안구'},{id:'',name:'김동열'},{id:'',name:'이영성'},{id:'',name:'사무실'}];
    return managerCache;
  }
  const officeManager = (list) => list.find(m => m.name === '사무실') || list[0] || {id:'', name:'사무실'};
  function managerOptions(list, selectedId = '', selectedName = '') {
    const defaultMgr = officeManager(list);
    const effectiveId = selectedId || defaultMgr.id || '';
    const effectiveName = selectedName || defaultMgr.name || '사무실';
    return list.filter(m => m.is_active !== 0).map(m => {
      const sel = (effectiveId && String(m.id) === String(effectiveId)) || (!effectiveId && String(m.name) === String(effectiveName)) ? ' selected' : '';
      const caption = [m.name, m.bank_name, m.account_no].filter(Boolean).join(' · ');
      return `<option value="${esc(m.id || '')}" data-name="${esc(m.name || '')}" data-bank="${esc(m.bank_name || '')}" data-account="${esc(m.account_no || '')}"${sel}>${esc(caption)}</option>`;
    }).join('');
  }
  function syncManager(form) {
    const sel = form?.querySelector('select[name="sales_manager_id"]');
    if (!sel) return;
    const opt = sel.selectedOptions[0];
    for (const name of ['sales_manager_name','sales_manager_bank','sales_manager_account']) {
      let input = form.querySelector(`input[name="${name}"]`);
      if (!input) { input = document.createElement('input'); input.type='hidden'; input.name=name; form.appendChild(input); }
    }
    form.querySelector('input[name="sales_manager_name"]').value = opt?.dataset.name || '사무실';
    form.querySelector('input[name="sales_manager_bank"]').value = opt?.dataset.bank || '';
    form.querySelector('input[name="sales_manager_account"]').value = opt?.dataset.account || '';
  }
  async function ensureManagerField(form) {
    if (!form || form.querySelector('[data-v317-sales-manager]')) return;
    const isCustomer = form.querySelector('input[name="name"]') && form.querySelector('input[name="opening_receivable"]');
    const isSite = form.querySelector('input[name="site_name"]') && form.querySelector('select[name="customer_id"]');
    const isPayment = form.querySelector('input[name="amount"]') && (form.querySelector('select[name="method"]') || form.querySelector('input[name="approval_no"]'));
    if (!isCustomer && !isSite && !isPayment) return;
    const list = await salesManagers();
    const existingId = form.querySelector('input[name="sales_manager_id"]')?.value || form.querySelector('select[name="sales_manager_id"]')?.value || '';
    const existingName = form.querySelector('input[name="sales_manager_name"]')?.value || '';
    const div = document.createElement('div');
    div.dataset.v317SalesManager = '1';
    div.innerHTML = `<label>영업담당자</label><select name="sales_manager_id">${managerOptions(list, existingId, existingName)}</select><input type="hidden" name="sales_manager_name"><input type="hidden" name="sales_manager_bank"><input type="hidden" name="sales_manager_account">`;
    const anchor = form.querySelector('input[name="payment_terms"], input[name="amount"], select[name="default_delivery_type"], input[name="opening_receivable"]')?.closest('div');
    if (anchor?.parentNode) anchor.parentNode.insertBefore(div, anchor.nextSibling); else form.prepend(div);
    div.querySelector('select').addEventListener('change', () => syncManager(form));
    syncManager(form);
  }

  // Hide obsolete 납품처 action: list already treats customer+site separately.
  function hideUnnecessarySiteButtons(root = document) {
    root.querySelectorAll('button').forEach(btn => {
      if ((btn.textContent || '').trim() === '납품처') btn.classList.add('mt-v317-hidden');
    });
  }

  function addReportsMenu() {
    const nav = document.querySelector('.sidebar nav, .sidebar, aside, #app nav');
    if (!nav || nav.querySelector('[data-v317-report-menu]')) return;
    const btn = document.createElement('button');
    btn.type='button'; btn.dataset.v317ReportMenu='1'; btn.className='nav-item'; btn.textContent='출력보고서'; btn.style.cssText='width:100%;text-align:left;margin-top:4px;';
    const anchor = Array.from(nav.querySelectorAll('button,a')).find(x => /수정이력/.test(x.textContent || ''));
    if (anchor?.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling); else nav.appendChild(btn);
    btn.addEventListener('click', () => renderReports('sales'));
  }

  const REPORTS = {
    sales: { title:'기간별 거래처별 판매현황', api:'/final/reports-v317/customer-sales' },
    payments: { title:'기간별 거래처별 수금현황', api:'/final/reports-v317/customer-payments' },
    monthly: { title:'월별 판매현황', api:'/final/reports-v317/monthly-sales-matrix' }
  };
  let currentReportType = 'sales';
  let currentReportData = null;
  let currentReportColumns = null;

  async function renderReports(type = currentReportType) {
    currentReportType = type;
    injectStyle();
    const app = document.getElementById('app');
    if (!app) return;
    const list = await salesManagers();
    app.innerHTML = `<main class="mt-v317-report-page"><div class="mt-v317-report-head"><div><h1>출력보고서</h1><p>보고서별 화면 조회 후 인쇄 또는 엑셀 다운로드합니다. 표 머리글은 드래그하여 컬럼 순서를 바꿀 수 있습니다.</p></div><button type="button" class="mt-v317-btn" id="v317-manager-admin">영업담당자 관리</button></div><div class="mt-v317-tabs mt-v317-no-print"><button data-report="sales" class="${type==='sales'?'active':''}">기간별 거래처별 판매현황</button><button data-report="payments" class="${type==='payments'?'active':''}">기간별 거래처별 수금현황</button><button data-report="monthly" class="${type==='monthly'?'active':''}">월별 판매현황</button></div><section class="mt-v317-card mt-v317-no-print"><div class="mt-v317-filters"><div><label>시작일</label><input id="v317-from" type="date" value="${monthStart()}"></div><div><label>종료일</label><input id="v317-to" type="date" value="${today()}"></div><div><label>영업담당자</label><select id="v317-manager"><option value="">전체</option>${list.map(m=>`<option>${esc(m.name)}</option>`).join('')}</select></div><button class="mt-v317-btn primary" id="v317-query">조회</button><button class="mt-v317-btn" id="v317-print">인쇄</button><button class="mt-v317-btn green" id="v317-excel">엑셀</button></div></section><section class="mt-v317-paper" id="v317-result"><div class="mt-v317-empty">보고서를 선택하고 조회하세요.</div></section></main>`;
    document.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => renderReports(b.dataset.report)));
    document.getElementById('v317-query')?.addEventListener('click', queryReport);
    document.getElementById('v317-print')?.addEventListener('click', () => window.print());
    document.getElementById('v317-excel')?.addEventListener('click', exportReportExcel);
    document.getElementById('v317-manager-admin')?.addEventListener('click', openManagerAdmin);
    await queryReport();
  }

  function tableHtml(columns, rows) {
    currentReportColumns = columns.slice();
    const header = columns.map(c => `<th draggable="true" data-key="${esc(c.key)}">${esc(c.label)}</th>`).join('');
    const body = rows.map(row => `<tr class="${esc(row.__class || '')}">${columns.map(c => `<td class="${c.num ? 'num' : ''}">${c.num ? money(row[c.key]) : esc(row[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
    return `<table class="mt-v317-table" id="v317-table"><thead><tr>${header}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="mt-v317-empty">조회된 자료가 없습니다.</td></tr>`}</tbody></table>`;
  }
  function makeTotals(rows, keys) {
    const total = {};
    keys.forEach(k => total[k]=rows.reduce((s,r)=>s+num(r[k]),0));
    return total;
  }
  function withSubtotals(rows, groupKey, numKeys, labelKey) {
    const out = [];
    let cur = null; let bucket = [];
    const flush = () => {
      if (!bucket.length) return;
      out.push(...bucket);
      const t = makeTotals(bucket, numKeys);
      out.push({ ...t, [labelKey]:'소계', [groupKey]:cur, __class:'subtotal' });
      bucket = [];
    };
    for (const r of rows) { if (cur !== null && r[groupKey] !== cur) flush(); cur = r[groupKey]; bucket.push(r); }
    flush();
    const grand = makeTotals(rows, numKeys); out.push({ ...grand, [labelKey]:'합계', __class:'grand' });
    return out;
  }

  async function queryReport() {
    const type = currentReportType;
    const cfg = REPORTS[type];
    const from = document.getElementById('v317-from')?.value || monthStart();
    const to = document.getElementById('v317-to')?.value || today();
    const manager = document.getElementById('v317-manager')?.value || '';
    const result = document.getElementById('v317-result');
    if (!result) return;
    result.innerHTML = '<div class="mt-v317-empty">조회 중...</div>';
    try {
      const qs = new URLSearchParams({ date_from: from, date_to: to }); if (manager) qs.set('sales_manager_name', manager);
      currentReportData = await API(`${cfg.api}?${qs.toString()}`);
      let columns, rows;
      if (type === 'payments') {
        columns = [{key:'row_type',label:'구분'},{key:'sales_manager_name',label:'영업담당자'},{key:'customer_name',label:'거래처'},{key:'site_name',label:'구분/지역'},{key:'payment_count',label:'수금건수',num:true},{key:'payment_amount',label:'수금금액',num:true},{key:'methods',label:'수금방법'}];
        rows = withSubtotals((currentReportData.rows||[]).map(r=>({row_type:'내역',...r})), 'sales_manager_name', ['payment_count','payment_amount'], 'row_type');
      } else if (type === 'monthly') {
        const managers = currentReportData.managers || [];
        columns = [{key:'row_type',label:'구분'},{key:'product_name',label:'제품명'}];
        for (const m of managers) {
          columns.push({key:`${m}__qty`,label:`${m} 판매수량`,num:true},{key:`${m}__sales`,label:`${m} 판매금액`,num:true},{key:`${m}__pay`,label:`${m} 수금금액`,num:true},{key:`${m}__recv`,label:`${m} 미수금액`,num:true});
        }
        rows = (currentReportData.rows||[]).map(r=>({row_type:'내역',...r}));
        const numKeys = columns.filter(c=>c.num).map(c=>c.key); const grand = makeTotals(rows, numKeys); rows.push({row_type:'합계', product_name:'합계', ...grand, __class:'grand'});
      } else {
        columns = [{key:'row_type',label:'구분'},{key:'sales_manager_name',label:'영업담당자'},{key:'customer_name',label:'거래처'},{key:'site_name',label:'구분/지역'},{key:'order_count',label:'주문건수',num:true},{key:'sales_qty',label:'판매수량',num:true},{key:'sales_amount',label:'판매금액',num:true},{key:'receivable_amount',label:'미수금액',num:true}];
        rows = withSubtotals((currentReportData.rows||[]).map(r=>({row_type:'내역',...r})), 'sales_manager_name', ['order_count','sales_qty','sales_amount','receivable_amount'], 'row_type');
      }
      result.innerHTML = `<h2>${esc(cfg.title)}</h2><div class="period">${esc(from)} ~ ${esc(to)}${manager ? ' · '+esc(manager) : ''}</div>${tableHtml(columns, rows)}<div class="mt-v317-muted">머리글을 드래그하면 컬럼 순서를 바꿀 수 있습니다. 맨 아래 합계 행이 표시됩니다.</div>`;
      bindColumnDrag(result.querySelector('#v317-table'));
    } catch (e) { result.innerHTML = `<div class="mt-v317-empty" style="color:#b91c1c">${esc(e.message)}</div>`; }
  }
  function bindColumnDrag(table) {
    if (!table) return; let dragKey = null;
    table.querySelectorAll('th').forEach(th => {
      th.addEventListener('dragstart', e => { dragKey = th.dataset.key; e.dataTransfer.effectAllowed = 'move'; });
      th.addEventListener('dragover', e => e.preventDefault());
      th.addEventListener('drop', e => {
        e.preventDefault(); const target = th.dataset.key; if (!dragKey || dragKey === target || !currentReportColumns) return;
        const from = currentReportColumns.findIndex(c => c.key === dragKey); const to = currentReportColumns.findIndex(c => c.key === target);
        const [col] = currentReportColumns.splice(from,1); currentReportColumns.splice(to,0,col);
        // Re-render current visible body with existing text not practical; user can re-query. Quick: trigger query preserving current data by not doing async? Use current data and table rows extraction is unnecessary. Re-query for accuracy.
        queryReport();
      });
    });
  }
  function exportReportExcel() {
    const table = document.getElementById('v317-table');
    if (!table) return toast('먼저 조회하세요.', 'error');
    const html = `<html><head><meta charset="utf-8"></head><body>${table.outerHTML}</body></html>`;
    const blob = new Blob(['\ufeff' + html], { type:'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${REPORTS[currentReportType].title}_${today()}.xls`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function openManagerAdmin() {
    const list = await salesManagers(true);
    const rows = list.map(m => `<tr><td><input data-mid="${esc(m.id)}" data-field="name" value="${esc(m.name)}"></td><td><input data-mid="${esc(m.id)}" data-field="bank_name" value="${esc(m.bank_name||'')}"></td><td><input data-mid="${esc(m.id)}" data-field="account_no" value="${esc(m.account_no||'')}"></td><td><input data-mid="${esc(m.id)}" data-field="sort_order" value="${esc(m.sort_order||0)}" class="mt-v317-num"></td><td><button data-save-manager="${esc(m.id)}">저장</button></td></tr>`).join('');
    const win = window.open('', 'sales_manager_admin', 'width=860,height=520');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>영업담당자 관리</title><style>body{font-family:Malgun Gothic;padding:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}input{width:100%;box-sizing:border-box;padding:8px}button{padding:8px 14px}</style></head><body><h2>영업담당자 관리</h2><table><thead><tr><th>이름</th><th>은행명</th><th>계좌번호</th><th>순서</th><th>저장</th></tr></thead><tbody>${rows}</tbody></table><p>신규 등록은 기준정보/관리 화면에서 추가하거나 기존 이름을 수정해 사용하세요.</p><script>const API_BASE='${API_BASE}';const token='${token()}';async function api(p,o={}){o.headers={...(o.headers||{}),'Content-Type':'application/json'};if(token)o.headers.Authorization='Bearer '+token;const r=await fetch(API_BASE+p,o);const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.error||'오류');return j.data}document.addEventListener('click',async e=>{const b=e.target.closest('[data-save-manager]');if(!b)return;const id=b.dataset.saveManager;const data={id};document.querySelectorAll('[data-mid="'+id+'"]').forEach(i=>data[i.dataset.field]=i.value);try{await api('/final/sales-managers',{method:'POST',body:JSON.stringify(data)});alert('저장되었습니다.');}catch(err){alert(err.message)}})<\/script></body></html>`); win.document.close();
  }



  async function deleteCustomerRecord(id) {
    if (!id) return;
    try {
      let summary = null;
      try { summary = await API(`/final/customers/${encodeURIComponent(id)}/delete-check`); } catch (_) {}
      const blocked = summary && !summary.can_delete;
      const lines = summary ? [
        `거래처 삭제 확인`,
        `주문: ${money(summary.orders||0)}건 / 출고: ${money(summary.shipments||0)}건`,
        `수금: ${money(summary.payments||0)}건 / 원장: ${money(summary.receivable_transactions||0)}건`,
        summary.closed_business ? `폐업 표시 자료이므로 삭제 가능` : (blocked ? `관련 자료가 있어 삭제할 수 없습니다.` : `삭제 가능`)
      ] : ['거래처를 삭제하시겠습니까?'];
      if (blocked) { alert(lines.join('\n')); return; }
      const reason = prompt(lines.join('\n') + '\n\n삭제 사유를 입력하세요.', summary?.closed_business ? '폐업자료 정리' : '거래처 삭제');
      if (!reason) return;
      await API(`/final/customers/${encodeURIComponent(id)}`, {method:'DELETE', body:JSON.stringify({delete_reason:reason})});
      toast('거래처가 삭제 처리되었습니다.', 'success');
      const searchBtn = document.getElementById('customer-search-btn');
      if (searchBtn) searchBtn.click(); else location.reload();
    } catch (e) { toast(e.message || '거래처 삭제 오류', 'error'); }
  }

  async function deleteCustomerSiteRecord(id) {
    if (!id) return;
    try {
      let summary = null;
      try { summary = await API(`/final/customer-sites/${encodeURIComponent(id)}/delete-check`); } catch (_) {}
      const blocked = summary && !summary.can_delete;
      const lines = summary ? [
        `거래처 구분자료 삭제 확인`,
        `주문: ${money(summary.orders||0)}건 / 출고: ${money(summary.shipments||0)}건`,
        `수금: ${money(summary.payments||0)}건 / 원장: ${money(summary.receivable_transactions||0)}건`,
        summary.closed_business ? `폐업 표시 자료이므로 삭제 가능` : (blocked ? `관련 자료가 있어 삭제할 수 없습니다.` : `삭제 가능`)
      ] : ['거래처 구분자료를 삭제하시겠습니까?'];
      if (blocked) { alert(lines.join('\n')); return; }
      const reason = prompt(lines.join('\n') + '\n\n삭제 사유를 입력하세요.', summary?.closed_business ? '폐업자료 정리' : '거래처 구분자료 삭제');
      if (!reason) return;
      await API(`/final/customer-sites/${encodeURIComponent(id)}`, {method:'DELETE', body:JSON.stringify({delete_reason:reason})});
      toast('삭제 처리되었습니다.', 'success');
      location.reload();
    } catch (e) { toast(e.message || '삭제 오류', 'error'); }
  }

  function patchCustomerDeleteButtons(root=document) {
    root.querySelectorAll('td, .action-cell').forEach(cell => {
      if (cell.querySelector('[data-v317-customer-delete], [data-v317-site-delete]')) return;
      const edit = cell.querySelector('[data-edit]');
      if (edit && !cell.querySelector('[data-sites]')) {
        const id = edit.dataset.edit;
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'small danger'; btn.dataset.v317CustomerDelete = id; btn.textContent = '삭제';
        cell.append(' ', btn);
      }
      const editSite = cell.querySelector('[data-edit-site]');
      if (editSite) {
        const id = editSite.dataset.editSite;
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'small danger'; btn.dataset.v317SiteDelete = id; btn.textContent = '삭제';
        cell.append(' ', btn);
      }
    });
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest?.('[data-v317-customer-delete]');
    if (c) { e.preventDefault(); e.stopPropagation(); deleteCustomerRecord(c.dataset.v317CustomerDelete); return; }
    const s = e.target.closest?.('[data-v317-site-delete]');
    if (s) { e.preventDefault(); e.stopPropagation(); deleteCustomerSiteRecord(s.dataset.v317SiteDelete); }
  }, true);

  function paymentPageDates() {
    const dates = Array.from(document.querySelectorAll('input[type="date"]')).map(i => i.value).filter(Boolean);
    return { from: dates[0] || monthStart(), to: dates[1] || today() };
  }
  async function renderPaymentDetailPanel(kind, page=1) {
    const box = document.getElementById(`v317-${kind}-box`);
    if (!box) return;
    const {from, to} = paymentPageDates();
    const limit = Number(document.getElementById(`v317-${kind}-limit`)?.value || 10);
    box.innerHTML = '<div class="mt-v317-empty">조회 중...</div>';
    try {
      const data = await API(`/final/${kind === 'payments' ? 'payments-page' : 'receivables-page'}?` + new URLSearchParams({date_from:from,date_to:to,page:String(page),limit:String(limit)}));
      const rows = data.rows || [];
      if (kind === 'payments') {
        box.innerHTML = `<div class="mt-v317-muted">총 ${money(data.total_count)}건 / 수금합계 ${money(data.total_amount)}원</div>`+
          tableHtml([{key:'payment_date',label:'일자'},{key:'payment_no',label:'수금번호'},{key:'customer_name',label:'거래처'},{key:'site_name',label:'구분'},{key:'method',label:'방법'},{key:'amount',label:'금액',num:true},{key:'memo',label:'비고'}], rows)+pagerHtml(kind,data,page,limit);
      } else {
        box.innerHTML = `<div class="mt-v317-muted">총 ${money(data.total_count)}건 / 미수합계 ${money(data.total_receivable)}원</div>`+
          tableHtml([{key:'customer_name',label:'거래처'},{key:'site_name',label:'구분'},{key:'delivery_type',label:'발송구분'},{key:'sales_amount',label:'매출',num:true},{key:'payment_amount',label:'수금',num:true},{key:'receivable_balance',label:'미수',num:true}], rows)+pagerHtml(kind,data,page,limit);
      }
    } catch (e) { box.innerHTML = `<div class="mt-v317-empty" style="color:#b91c1c">${esc(e.message)}</div>`; }
  }
  function pagerHtml(kind, data, page, limit) {
    const totalPages = Math.max(1, Math.ceil(Number(data.total_count||0) / limit));
    const pages = [];
    for (let p=Math.max(1,page-2); p<=Math.min(totalPages,page+2); p++) pages.push(`<button class="mt-v317-btn ${p===page?'primary':''}" data-v317-page="${p}" data-kind="${kind}">${p}</button>`);
    return `<div class="mt-v317-no-print" style="display:flex;gap:6px;align-items:center;justify-content:flex-end;margin-top:10px"><button class="mt-v317-btn" data-v317-page="${Math.max(1,page-1)}" data-kind="${kind}">이전</button>${pages.join('')}<button class="mt-v317-btn" data-v317-page="${Math.min(totalPages,page+1)}" data-kind="${kind}">다음</button></div>`;
  }
  function patchPaymentDetails(root=document) {
    const title = root.querySelector?.('.page-title, h1');
    if (!title || !/수금\/미수금/.test(title.textContent || '')) return;
    if (document.getElementById('v317-payment-details')) return;
    const formPanel = document.getElementById('payment-form')?.closest('.panel');
    if (!formPanel) return;
    const panel = document.createElement('section');
    panel.id = 'v317-payment-details';
    panel.className = 'panel';
    panel.innerHTML = `<h3>수금내역 및 미수금내역 조회</h3><div class="toolbar mt-v317-no-print" style="margin-bottom:10px"><div class="left"><label>수금내역 표시건수 <select id="v317-payments-limit"><option>10</option><option>20</option><option>50</option></select></label><label style="margin-left:12px">미수금 표시건수 <select id="v317-receivables-limit"><option>10</option><option>20</option><option>50</option></select></label></div><div class="right"><button class="secondary" id="v317-refresh-payment-details">내역 조회</button></div></div><div class="mt-v317-card"><h3>조회구간 수금내역</h3><div id="v317-payments-box"></div></div><div class="mt-v317-card"><h3>조회구간 미수금내역</h3><div id="v317-receivables-box"></div></div>`;
    formPanel.insertAdjacentElement('afterend', panel);
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-v317-page]');
      if (b) renderPaymentDetailPanel(b.dataset.kind, Number(b.dataset.v317Page || 1));
    });
    document.getElementById('v317-refresh-payment-details')?.addEventListener('click', () => { renderPaymentDetailPanel('payments',1); renderPaymentDetailPanel('receivables',1); });
    renderPaymentDetailPanel('payments',1); renderPaymentDetailPanel('receivables',1);
  }

  function stampUrl() { return new URL('/assets/mt_stamp.png?v=317', location.origin).href; }
  function statementCss() { return `@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111;font-family:'Malgun Gothic',Arial,sans-serif}.toolbar{position:fixed;right:8mm;top:6mm;z-index:99999;display:flex;gap:8px}.toolbar button{border:0;border-radius:8px;padding:9px 15px;font-weight:900;cursor:pointer}.toolbar .print{background:#2563eb;color:#fff}.toolbar .close{background:#e5e7eb}.sheet{width:200mm;height:287mm;margin:0 auto;overflow:hidden}.copy{position:relative;height:138mm;margin:0}.copy-label{position:absolute;right:0;top:0;font-size:11px}.cut{height:5mm;border-top:1px dashed #777;margin:1.2mm 0}.head,.items{width:100%;border-collapse:collapse;table-layout:fixed}.head td,.items td,.items th{border:1px solid #111;vertical-align:middle}.head td{height:6.6mm;padding:.7mm 1.3mm;font-size:10.5px}.items td,.items th{height:6.4mm;padding:.6mm 1.1mm;font-size:10.5px}.title{font-size:22px!important;font-weight:900;text-align:center;letter-spacing:8mm;height:12mm!important;padding-left:8mm!important}.no{font-weight:900}.side{writing-mode:vertical-rl;text-align:center;font-weight:800;letter-spacing:2px;background:#f3f4f6}.label{font-weight:800;text-align:center;background:#f8fafc}.center{text-align:center}.right{text-align:right}.claim{text-align:center;font-weight:800;height:5.5mm!important}.items th{background:#e5e7eb;text-align:center}.name{text-align:left;word-break:keep-all}.summary td{height:6.2mm;font-weight:800}.stamp{position:absolute;right:34mm;top:30mm;width:14mm;height:14mm;object-fit:contain;opacity:.9;z-index:4;transform:rotate(-8deg)}@media print{html,body{width:210mm;height:297mm}.toolbar{display:none}.sheet{width:200mm;height:287mm}.copy{page-break-inside:avoid}}`; }
  function lineAmount(item) { return num(item.amount) || num(item.quantity) * num(item.unit_price); }
  function statementRows(items, d) { const rows=(items||[]).slice(0,7).map(i=>`<tr><td class="center">${esc(String(d).slice(5,7))}</td><td class="center">${esc(String(d).slice(8,10))}</td><td class="name">${esc(i.item_name||'')}${i.spec?'<br><span style="font-size:9px">'+esc(i.spec)+'</span>':''}</td><td class="right">${money(i.quantity)}</td><td class="right">${money(i.unit_price)}</td><td class="right">${money(lineAmount(i))}</td></tr>`); while(rows.length<7)rows.push('<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>'); return rows.join(''); }
  function statementCopy(data, label) { const o=data.order||{}, c=data.customer||{}, d=String(o.order_date||today()).slice(0,10); const itemTotal=(data.items||[]).reduce((s,i)=>s+lineAmount(i),0); const sale=num(data.today_sale_amount)||num(o.total_amount)||itemTotal; const prev=num(data.previous_balance); const total=prev+sale; return `<section class="copy"><div class="copy-label">(${esc(label)})</div><table class="head"><colgroup><col style="width:11mm"><col style="width:21mm"><col style="width:74mm"><col style="width:11mm"><col style="width:21mm"><col style="width:52mm"></colgroup><tr><td colspan="3" class="no">No. ${esc(o.order_no||'')}</td><td colspan="3" class="title">거래명세표</td></tr><tr><td rowspan="5" class="side">공급받는자</td><td class="label">등록번호</td><td>${esc(c.business_no||'000-00-00000')}</td><td rowspan="5" class="side">공급자</td><td class="label">등록번호</td><td class="center">514-04-79741</td></tr><tr><td class="label">상호(법인명)</td><td>${esc(c.name||'')}</td><td class="label">상호(법인명)</td><td class="center">MT옵틱스</td></tr><tr><td class="label">성 명</td><td>${esc(c.owner_name||'')}</td><td class="label">성 명</td><td class="center"><b>오 희 숙</b></td></tr><tr><td class="label">사업장주소</td><td>${esc(c.address||'')}</td><td class="label">사업장주소</td><td>대구·북구 노원동3가 1149-1 1층</td></tr><tr><td class="label">전화/FAX</td><td>${esc(c.phone||'')}</td><td class="label">전화/FAX</td><td>T.053-351-6915 / 053-353-2469<br>F.053-351-2469</td></tr><tr><td colspan="2" class="label">작성년월일</td><td class="center">${esc(d)}</td><td colspan="2" class="label">공급대가총액</td><td class="right">${money(sale)}원</td></tr><tr><td colspan="6" class="claim">위 금액을 정히 청구(영수) 함.</td></tr></table><table class="items"><colgroup><col style="width:10mm"><col style="width:10mm"><col style="width:100mm"><col style="width:17mm"><col style="width:25mm"><col style="width:28mm"></colgroup><thead><tr><th>월</th><th>일</th><th>품 목</th><th>수량</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${statementRows(data.items,d)}<tr class="summary"><td colspan="2" class="center">전잔액</td><td class="right">${money(prev)}</td><td colspan="2" class="center">판매금액</td><td class="right">${money(sale)}</td></tr><tr class="summary"><td colspan="5" class="right">합계금액</td><td class="right">${money(total)}</td></tr></tbody></table><img class="stamp" src="${stampUrl()}"></section>`; }
  async function openStatement(id) { if(!id) return; try{ const data=await API(`/final/orders/${encodeURIComponent(id)}/statement`); const w=window.open('', 'mt_statement', 'width=980,height=900,scrollbars=yes'); if(!w)return toast('팝업 차단을 해제하세요.','error'); w.document.open(); w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>거래명세서</title><style>${statementCss()}</style></head><body><div class="toolbar"><button class="print" id="p">인쇄</button><button class="close" id="c">닫기</button></div><main class="sheet">${statementCopy(data,'공급받는자용')}<div class="cut"></div>${statementCopy(data,'공급자용')}</main><script>document.getElementById('p').onclick=()=>{window.focus();setTimeout(()=>window.print(),60)};document.getElementById('c').onclick=()=>window.close();<\/script></body></html>`); w.document.close(); w.focus(); }catch(e){toast(e.message||'거래명세서 오류','error')} }
  function patchStatementButtons(root=document){ root.querySelectorAll('.action-cell, td').forEach(cell=>{ if(cell.querySelector('[data-v317-statement]'))return; const src=cell.querySelector('[data-view], [data-edit-order], [data-ship], [data-delete-order]'); const id=src?.dataset.view||src?.dataset.editOrder||src?.dataset.ship||src?.dataset.deleteOrder; if(!id)return; const b=document.createElement('button'); b.type='button'; b.className='small secondary'; b.dataset.v317Statement=id; b.textContent='거래명세서'; cell.append(' ', b); }); }
  document.addEventListener('click', e=>{ const b=e.target.closest?.('[data-v317-statement], [data-order-action="statement"], [data-statement-print], [data-order-statement]'); if(!b)return; e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation)e.stopImmediatePropagation(); openStatement(b.dataset.v317Statement||b.dataset.orderId||b.dataset.id||b.getAttribute('data-order-statement')); }, true);

  function runPatches() { injectStyle(); addReportsMenu(); hideUnnecessarySiteButtons(document); patchCustomerDeleteButtons(document); patchStatementButtons(document); patchPaymentDetails(document); document.querySelectorAll('input').forEach(formatNumberInput); document.querySelectorAll('form').forEach(ensureManagerField); }
  const mo = new MutationObserver(() => runPatches());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { runPatches(); mo.observe(document.body,{childList:true,subtree:true}); });
  else { runPatches(); mo.observe(document.body,{childList:true,subtree:true}); }
})();
