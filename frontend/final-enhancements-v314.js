(() => {
  'use strict';
  const VERSION = 'V314';
  const API = (path, options) => window.api(path, options);
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const num = (value) => Number(String(value ?? 0).replace(/,/g, '').replace(/원/g, '').trim()) || 0;
  const money = (value) => new Intl.NumberFormat('ko-KR').format(Math.trunc(num(value)));
  const date10 = (value) => value ? String(value).slice(0, 10) : '';
  const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const monthStart = () => today().slice(0, 7) + '-01';
  const stampUrl = () => new URL('/assets/mt-stamp-v313.png?v=314', window.location.origin).href;

  let managerCache = null;
  let currentReport = null;

  async function managers(force = false) {
    if (!managerCache || force) managerCache = await API('/final/sales-managers');
    return managerCache || [];
  }

  function toast(msg, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(msg, type);
    alert(msg);
  }

  function injectStyle() {
    if (document.getElementById('mtf-v314-style')) return;
    const style = document.createElement('style');
    style.id = 'mtf-v314-style';
    style.textContent = `
      .mtf-v314-sales-manager-field{display:block!important;visibility:visible!important;opacity:1!important;min-height:60px!important}
      .mtf-v314-manager-note{font-size:12px;color:#64748b;margin-top:4px}
      .mtf-v314-report-page{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:20px;margin:18px 0;box-shadow:0 8px 22px rgba(15,23,42,.04)}
      .mtf-v314-report-filters{display:grid;grid-template-columns:1.15fr 160px 160px 180px auto;gap:12px;align-items:end}
      .mtf-v314-report-actions{display:flex;gap:8px;flex-wrap:wrap}.mtf-v314-report-actions button{white-space:nowrap}
      .mtf-v314-report-paper{background:#fff;border:1px solid #cbd5e1;margin-top:18px;padding:18px;min-height:180px}.mtf-v314-report-paper h2{text-align:center;margin:0 0 6px;font-size:22px}.mtf-v314-report-paper .period{text-align:center;color:#475569;margin-bottom:14px}.mtf-v314-report-table{width:100%;border-collapse:collapse;font-size:13px}.mtf-v314-report-table th,.mtf-v314-report-table td{border:1px solid #94a3b8;padding:6px 8px}.mtf-v314-report-table th{background:#f1f5f9;text-align:center}.mtf-v314-report-table .num{text-align:right}.mtf-v314-report-empty{padding:40px;text-align:center;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px}.mtf-v314-note{font-size:12px;color:#64748b;margin-top:8px}
      @media print{.mtf-v314-no-print,.nav,.sidebar,header,.topbar,.mtf-head .mtf-actions{display:none!important}.mtf-v314-report-page{box-shadow:none;border:0;margin:0;padding:0}.mtf-v314-report-paper{border:0;margin:0;padding:0}.mtf-v314-report-table th,.mtf-v314-report-table td{font-size:11px;padding:4px}}
    `;
    document.head.appendChild(style);
  }

  function managerOptions(rows, selectedId = '', selectedName = '') {
    return '<option value="">선택</option>' + rows
      .filter((r) => Number(r.is_active) !== 0)
      .map((r) => `<option value="${esc(r.id)}" data-name="${esc(r.name)}" data-bank="${esc(r.bank_name || '')}" data-account="${esc(r.account_no || '')}" ${(String(selectedId || '') === String(r.id) || (!selectedId && selectedName === r.name)) ? 'selected' : ''}>${esc(r.name)}${r.bank_name ? ' · ' + esc(r.bank_name) : ''}${r.account_no ? ' · ' + esc(r.account_no) : ''}</option>`)
      .join('');
  }

  function syncManagerFields(form, select) {
    let name = form.querySelector('input[name="sales_manager_name"]');
    let bank = form.querySelector('input[name="sales_manager_bank"]');
    let account = form.querySelector('input[name="sales_manager_account"]');
    if (!name) { name = document.createElement('input'); name.type = 'hidden'; name.name = 'sales_manager_name'; form.appendChild(name); }
    if (!bank) { bank = document.createElement('input'); bank.type = 'hidden'; bank.name = 'sales_manager_bank'; form.appendChild(bank); }
    if (!account) { account = document.createElement('input'); account.type = 'hidden'; account.name = 'sales_manager_account'; form.appendChild(account); }
    const opt = select?.selectedOptions?.[0];
    name.value = opt?.dataset.name || '';
    bank.value = opt?.dataset.bank || '';
    account.value = opt?.dataset.account || '';
    const note = form.querySelector('.mtf-v314-manager-note');
    if (note) note.textContent = [opt?.dataset.bank, opt?.dataset.account].filter(Boolean).join(' ');
  }

  async function ensureManagerField(form) {
    if (!form || form.dataset.mtfV314Manager === '1') return;
    const isCustomerForm = form.querySelector('input[name="name"]') && (form.querySelector('input[name="business_no"]') || form.querySelector('input[name="phone"]'));
    const isSiteForm = form.querySelector('input[name="site_name"]') && form.querySelector('input[name="customer_id"]');
    if (!isCustomerForm && !isSiteForm) return;
    form.dataset.mtfV314Manager = '1';
    const rows = await managers();
    const selectedId = form.querySelector('[name="sales_manager_id"]')?.value || '';
    const selectedName = form.querySelector('[name="sales_manager_name"]')?.value || '';
    const wrap = document.createElement('div');
    wrap.className = 'mtf-field mtf-v314-sales-manager-field';
    wrap.innerHTML = `<label>영업담당자</label><select class="mtf-select" name="sales_manager_id">${managerOptions(rows, selectedId, selectedName)}</select><div class="mtf-v314-manager-note"></div>`;
    const grid = form.querySelector('.mtf-form-grid, .form-grid') || form;
    const memo = form.querySelector('textarea[name="memo"]')?.closest('.mtf-field, div');
    grid.insertBefore(wrap, memo || null);
    const select = wrap.querySelector('select');
    select.addEventListener('change', () => syncManagerFields(form, select));
    syncManagerFields(form, select);
  }

  async function enhanceManagerFields() {
    const forms = Array.from(document.querySelectorAll('#modal-root form, .modal form, #mtf-payment-form'));
    for (const form of forms) {
      await ensureManagerField(form).catch(() => {});
    }
    await enhancePaymentForm().catch(() => {});
  }

  async function enhancePaymentForm() {
    const form = document.querySelector('#mtf-payment-form');
    if (!form) return;
    if (!form.querySelector('.mtf-v314-payment-manager-field')) {
      const rows = await managers();
      const field = document.createElement('div');
      field.className = 'mtf-field mtf-v314-payment-manager-field mtf-v314-sales-manager-field';
      field.innerHTML = `<label>영업담당자</label><select class="mtf-select" name="sales_manager_id" id="mtf-v314-payment-manager">${managerOptions(rows)}</select><div class="mtf-v314-manager-note"></div>`;
      const memo = form.querySelector('#mtf-payment-memo')?.closest('.mtf-field');
      (memo?.parentElement || form).insertBefore(field, memo || null);
      const select = field.querySelector('select');
      select.addEventListener('change', () => syncManagerFields(form, select));
      syncManagerFields(form, select);
    }
    if (form.dataset.mtfV314PaymentHook !== '1') {
      form.dataset.mtfV314PaymentHook = '1';
      const wrapper = form.querySelector('[data-mtf-ac="mtf-payment-form-customer"]');
      wrapper?.addEventListener('mtf-customer-selected', async (event) => {
        const customer = event.detail;
        if (!customer?.id) return;
        try {
          const m = await API(`/final/customers/${customer.id}/sales-manager`);
          const select = form.querySelector('#mtf-v314-payment-manager');
          if (!select) return;
          if (m.sales_manager_id) select.value = m.sales_manager_id;
          else if (m.sales_manager_name) {
            const option = Array.from(select.options).find((o) => o.dataset.name === m.sales_manager_name);
            if (option) select.value = option.value;
          }
          syncManagerFields(form, select);
        } catch (_) {}
      });
    }
  }

  function formObject(form) {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) data[k] = String(v ?? '').trim();
    form.querySelectorAll('[data-mtf-number-format]').forEach((input) => {
      if (input.name) data[input.name] = String(input.value || '').replace(/,/g, '').replace(/원/g, '').trim();
    });
    return data;
  }

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('#mtf-payment-form');
    if (!form) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    const data = formObject(form);
    if (!data.customer_id) return toast('거래처를 선택하세요.', 'error');
    if (!num(data.amount)) return toast('수금 금액을 입력하세요.', 'error');
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '수금 저장 중...'; }
    try {
      await API('/final/payments-v312', { method: 'POST', body: JSON.stringify(data) });
      toast('수금을 등록했습니다.');
      if (typeof window.showPage === 'function') await window.showPage('payments', true);
      else location.reload();
    } catch (e) {
      toast(e.message || '수금 등록 오류', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '수금 저장'; }
    }
  }, true);

  function lineAmount(item) {
    const qty = num(item.quantity);
    const unit = num(item.unit_price);
    return num(item.amount) || qty * unit;
  }

  function statementRows(items, orderDate) {
    const d = date10(orderDate);
    const mm = d.slice(5, 7);
    const dd = d.slice(8, 10);
    const rows = (items || []).slice(0, 6).map((item, index) => `
      <tr>
        <td class="c">${index === 0 ? esc(mm) : ''}</td>
        <td class="c">${index === 0 ? esc(dd) : ''}</td>
        <td class="item">${esc(item.item_name || '')}${item.spec ? `<span class="spec"> ${esc(item.spec)}</span>` : ''}</td>
        <td class="r">${item.quantity ? money(item.quantity) : ''}</td>
        <td class="r">${item.unit_price ? money(item.unit_price) : ''}</td>
        <td class="r">${lineAmount(item) ? money(lineAmount(item)) : ''}</td>
      </tr>`);
    while (rows.length < 6) rows.push('<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    return rows.join('');
  }

  function statementCss() {
    return `
      @page{size:A4 portrait;margin:4mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif}.toolbar{position:fixed;right:8mm;top:5mm;z-index:9999;display:flex;gap:8px}.toolbar button{border:0;border-radius:8px;padding:8px 14px;font-weight:800;cursor:pointer}.toolbar .print{background:#2563eb;color:#fff}.toolbar .close{background:#e5e7eb;color:#111}.sheet{width:198mm;height:289mm;margin:0 auto;padding:3mm 4mm;overflow:hidden}.copy{position:relative;width:190mm;height:135mm;margin:0 auto}.copy + .copy{margin-top:5mm}.copy-label{position:absolute;right:0;top:-3.5mm;font-size:11px}.cutline{height:5mm;border-top:1px dashed #555;margin:2mm auto;width:190mm}.head,.items{width:190mm;border-collapse:collapse;table-layout:fixed}.head td,.head th,.items td,.items th{border:1px solid #111;vertical-align:middle}.head td,.head th{height:7.2mm;padding:1mm 1.5mm;font-size:10.8px}.items td,.items th{height:7.1mm;padding:.8mm 1.2mm;font-size:11px}.title{font-size:23px!important;font-weight:900;text-align:center;letter-spacing:7.5mm;line-height:1.05}.no{font-weight:800}.side{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:800;letter-spacing:2.5px;background:#f3f4f6}.label{font-weight:800;text-align:center;background:#f8fafc}.c{text-align:center}.r{text-align:right}.claim{text-align:center;font-weight:800;height:5.8mm!important}.items th{background:#e5e7eb;text-align:center;font-weight:800}.item{text-align:left;white-space:normal;word-break:keep-all;line-height:1.2}.spec{font-size:9px;color:#444}.summary td{height:6.6mm;font-weight:800}.stamp{position:absolute;right:33mm;top:25mm;width:21mm;height:auto;opacity:.9;z-index:3;transform:rotate(-8deg)}@media print{.toolbar{display:none}.sheet{width:202mm;height:289mm;padding:0 2mm;margin:0 auto}.copy{height:134mm;page-break-inside:avoid}.copy + .copy{margin-top:5mm}.cutline{height:5mm;margin:1.5mm auto 2mm auto}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    `;
  }

  function statementCopy(data, label) {
    const order = data.order || {};
    const customer = data.customer || {};
    const items = data.items || [];
    const orderDate = date10(order.order_date || today());
    const saleAmount = num(data.today_sale_amount) || num(order.total_amount) || items.reduce((s, item) => s + lineAmount(item), 0);
    const previous = num(data.previous_balance);
    const total = data.total_balance === undefined || data.total_balance === null ? previous + saleAmount : num(data.total_balance);
    return `<section class="copy"><div class="copy-label">(${esc(label)})</div><table class="head"><colgroup><col style="width:12mm"><col style="width:22mm"><col style="width:70mm"><col style="width:12mm"><col style="width:22mm"><col style="width:52mm"></colgroup><tr><td colspan="3" class="no">No. ${esc(order.order_no || '')}</td><th colspan="3" class="title">거 래 명 세 표</th></tr><tr><td rowspan="5" class="side">공급받는자</td><td class="label">등록번호</td><td>${esc(customer.business_no || '')}</td><td rowspan="5" class="side">공급자</td><td class="label">등록번호</td><td class="c">514-04-79741</td></tr><tr><td class="label">상호(법인명)</td><td>${esc(customer.name || '')}</td><td class="label">상호(법인명)</td><td class="c">MT옵틱스</td></tr><tr><td class="label">성 명</td><td>${esc(customer.owner_name || '')}</td><td class="label">성 명</td><td class="c"><b>오 희 숙</b></td></tr><tr><td class="label">사업장주소</td><td>${esc(customer.address || '')}</td><td class="label">사업장주소</td><td>대구·북구 노원동3가 1149-1 1층</td></tr><tr><td class="label">전화/FAX</td><td>${esc(customer.phone || '')}</td><td class="label">전화/FAX</td><td>T.053-351-6915 / 053-353-2469<br>F.053-351-2469</td></tr><tr><td colspan="2" class="label">작성년월일</td><td class="c">${esc(orderDate)}</td><td colspan="2" class="label">공급대가총액</td><td class="r">${money(saleAmount)}원</td></tr><tr><td colspan="6" class="claim">위 금액을 정히 청구(영수) 함.</td></tr></table><table class="items"><colgroup><col style="width:9mm"><col style="width:9mm"><col style="width:100mm"><col style="width:18mm"><col style="width:25mm"><col style="width:29mm"></colgroup><thead><tr><th>월</th><th>일</th><th>품 목</th><th>수량</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${statementRows(items, orderDate)}<tr class="summary"><td colspan="2" class="c">판매금액</td><td class="r">${money(saleAmount)}</td><td colspan="2" class="c">전잔액</td><td class="r">${money(previous)}</td></tr><tr class="summary"><td colspan="5" class="r">합계금액</td><td class="r">${money(total)}</td></tr></tbody></table><img class="stamp" src="${stampUrl()}" alt="직인"></section>`;
  }

  function statementHtml(data) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>거래명세서</title><style>${statementCss()}</style></head><body><div class="toolbar"><button class="print" id="printBtn">인쇄</button><button class="close" id="closeBtn">닫기</button></div><main class="sheet">${statementCopy(data, '공급받는자용')}<div class="cutline"></div>${statementCopy(data, '공급자용')}</main><script>document.getElementById('printBtn').onclick=function(){window.focus();setTimeout(function(){window.print();},80)};document.getElementById('closeBtn').onclick=function(){window.close()};<\/script></body></html>`;
  }

  async function printStatement(orderId) {
    const data = await API(`/final/orders/${orderId}/statement`);
    const win = window.open('', '_blank', 'width=980,height=1120');
    if (!win) return alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.');
    win.document.open();
    win.document.write(statementHtml(data));
    win.document.close();
    win.focus();
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest?.('[data-order-action="statement"], [data-order-statement], [data-statement-print]');
    if (!btn) return;
    const id = btn.dataset.orderId || btn.dataset.id || btn.getAttribute('data-order-statement');
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    printStatement(id).catch((e) => alert(e.message || '거래명세서 출력 오류'));
  }, true);

  function tableHtml(headers, rows) {
    return `<table class="mtf-v314-report-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" style="text-align:center;color:#64748b;padding:24px">자료가 없습니다.</td></tr>`}</tbody></table>`;
  }

  function reportTitle(type) {
    return type === 'payments' ? '기간별 거래처별 수금현황' : type === 'monthly' ? '월별 판매현황' : '기간별 거래처별 판매현황';
  }

  async function buildReport(type, from, to, manager) {
    if (type === 'payments') {
      const qs = new URLSearchParams({ date_from: from, date_to: to });
      if (manager) qs.set('sales_manager_name', manager);
      const data = await API(`/final/reports/customer-payments?${qs.toString()}`);
      const rows = (data.rows || []).map((r) => `<tr><td>${esc(r.sales_manager_name || '미지정')}</td><td>${esc(r.customer_name || '')}</td><td>${esc(r.site_name || '')}</td><td class="num">${money(r.payment_count)}</td><td class="num">${money(r.payment_amount)}</td><td>${esc(r.methods || '')}</td></tr>`);
      return tableHtml(['영업담당자', '거래처', '납품처/지역', '수금건수', '수금금액', '방법'], rows);
    }
    if (type === 'monthly') {
      const data = await API(`/final/reports/monthly-sales-matrix?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
      let mgrs = Array.from(new Set([...(data.sales || []).map((r) => r.sales_manager_name || '미지정'), ...(data.payments || []).map((r) => r.sales_manager_name || '미지정'), ...(data.receivables || []).map((r) => r.sales_manager_name || '미지정')])).filter(Boolean);
      if (manager) mgrs = mgrs.filter((m) => m === manager);
      const products = Array.from(new Set((data.sales || []).map((r) => r.product_name || '미지정'))).filter(Boolean);
      const pay = Object.fromEntries((data.payments || []).map((r) => [r.sales_manager_name || '미지정', num(r.payment_amount)]));
      const recv = Object.fromEntries((data.receivables || []).map((r) => [r.sales_manager_name || '미지정', num(r.receivable_amount)]));
      const salesTotal = {};
      (data.sales || []).forEach((r) => { const m = r.sales_manager_name || '미지정'; salesTotal[m] = (salesTotal[m] || 0) + num(r.sales_amount); });
      const rows = products.map((prod) => `<tr><td>${esc(prod)}</td>${mgrs.map((m) => { const r = (data.sales || []).find((x) => (x.product_name || '미지정') === prod && (x.sales_manager_name || '미지정') === m) || {}; const ratio = salesTotal[m] ? num(r.sales_amount) / salesTotal[m] : 0; return `<td class="num">${money(r.sales_qty || 0)} / ${money(r.sales_amount || 0)} / ${money((pay[m] || 0) * ratio)} / ${money((recv[m] || 0) * ratio)}</td>`; }).join('')}</tr>`);
      return tableHtml(['제품명', ...mgrs.map((m) => `${m}<br>판매수량 / 판매금액 / 수금금액 / 미수금`)], rows);
    }
    const data = await API(`/final/reports/customer-sales?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
    let rowsData = data.rows || [];
    if (manager) rowsData = rowsData.filter((r) => (r.sales_manager_name || '미지정') === manager);
    const rows = rowsData.map((r) => `<tr><td>${esc(r.sales_manager_name || '미지정')}</td><td>${esc(r.customer_name || '')}</td><td>${esc(r.site_name || '')}</td><td class="num">${money(r.order_count)}</td><td class="num">${money(r.sales_qty)}</td><td class="num">${money(r.sales_amount)}</td></tr>`);
    return tableHtml(['영업담당자', '거래처', '납품처/지역', '주문건수', '판매수량', '판매금액'], rows);
  }

  function exportExcel(filename, html) {
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function printReport() {
    if (!currentReport?.html) return alert('먼저 조회 버튼을 눌러 보고서를 조회하세요.');
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) return alert('팝업이 차단되었습니다.');
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(currentReport.title)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:'Malgun Gothic',Arial,sans-serif;color:#111}h1{text-align:center;margin:0 0 6px}.period{text-align:center;margin-bottom:12px;color:#555}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #777;padding:5px}th{background:#eee}.num{text-align:right}.toolbar{position:fixed;right:10px;top:10px}button{padding:8px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:800}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">인쇄</button></div><h1>${esc(currentReport.title)}</h1><div class="period">기간: ${esc(currentReport.from)} ~ ${esc(currentReport.to)}${currentReport.manager ? ' / 영업담당자: ' + esc(currentReport.manager) : ''}</div>${currentReport.html}</body></html>`;
    win.document.open(); win.document.write(html); win.document.close(); win.focus();
  }

  function excelReport() {
    if (!currentReport?.html) return alert('먼저 조회 버튼을 눌러 보고서를 조회하세요.');
    exportExcel(`${currentReport.title}_${currentReport.from}_${currentReport.to}.xls`, `<meta charset="utf-8"><h2>${esc(currentReport.title)}</h2><p>기간: ${esc(currentReport.from)} ~ ${esc(currentReport.to)}</p>${currentReport.html}`);
  }

  async function openManagerModal() {
    const rows = await managers(true);
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.style.zIndex = 200000;
    wrap.innerHTML = `<div class="modal large"><div class="modal-head"><h2>영업담당자 관리</h2><button class="secondary small" data-close>닫기</button></div><div class="mtf-v314-report-page"><input type="hidden" id="v314-mgr-id"><div class="mtf-v314-report-filters" style="grid-template-columns:1fr 1fr 1fr 100px auto"><div><label>이름</label><input class="mtf-input" id="v314-mgr-name"></div><div><label>은행명</label><input class="mtf-input" id="v314-mgr-bank"></div><div><label>계좌번호</label><input class="mtf-input" id="v314-mgr-account"></div><div><label>순서</label><input class="mtf-input" id="v314-mgr-sort" value="0"></div><div class="mtf-v314-report-actions"><button class="mtf-btn primary" id="v314-mgr-save">저장</button><button class="mtf-btn" id="v314-mgr-new">신규</button></div></div><table class="mtf-v314-report-table" style="margin-top:14px"><thead><tr><th>이름</th><th>은행명</th><th>계좌번호</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.bank_name || '')}</td><td>${esc(r.account_no || '')}</td><td>${Number(r.is_active) === 0 ? '중지' : '사용'}</td><td><button class="mtf-btn small" data-edit="${esc(r.id)}" data-name="${esc(r.name)}" data-bank="${esc(r.bank_name || '')}" data-account="${esc(r.account_no || '')}" data-sort="${esc(r.sort_order || 0)}" data-active="${esc(r.is_active)}">수정</button></td></tr>`).join('')}</tbody></table></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-close]').onclick = () => wrap.remove();
    wrap.querySelectorAll('[data-edit]').forEach((btn) => btn.onclick = () => {
      wrap.querySelector('#v314-mgr-id').value = btn.dataset.edit || '';
      wrap.querySelector('#v314-mgr-name').value = btn.dataset.name || '';
      wrap.querySelector('#v314-mgr-bank').value = btn.dataset.bank || '';
      wrap.querySelector('#v314-mgr-account').value = btn.dataset.account || '';
      wrap.querySelector('#v314-mgr-sort').value = btn.dataset.sort || '0';
    });
    wrap.querySelector('#v314-mgr-new').onclick = () => {
      ['id','name','bank','account'].forEach((k) => { const el = wrap.querySelector('#v314-mgr-' + k); if (el) el.value = ''; });
      wrap.querySelector('#v314-mgr-sort').value = '0';
    };
    wrap.querySelector('#v314-mgr-save').onclick = async () => {
      const payload = {
        id: wrap.querySelector('#v314-mgr-id').value,
        name: wrap.querySelector('#v314-mgr-name').value,
        bank_name: wrap.querySelector('#v314-mgr-bank').value,
        account_no: wrap.querySelector('#v314-mgr-account').value,
        sort_order: wrap.querySelector('#v314-mgr-sort').value,
        is_active: 1
      };
      if (!payload.name.trim()) return alert('이름을 입력하세요.');
      await API('/final/sales-managers', { method: 'POST', body: JSON.stringify(payload) });
      managerCache = null;
      toast('저장했습니다.');
      wrap.remove();
      openManagerModal().catch((e) => alert(e.message || '영업담당자 관리 오류'));
    };
  }

  async function renderReports() {
    injectStyle();
    const content = document.getElementById('content');
    if (!content) return;
    const mgrs = await managers();
    content.innerHTML = `<div class="mtf-root" data-mtf-view="reports-v314"><div class="mtf-head"><div><h1>출력보고서</h1><p>보고서를 화면에서 먼저 조회한 뒤 인쇄 또는 엑셀 다운로드합니다.</p></div><div class="mtf-actions"><button class="mtf-btn" id="v314-manager-admin">영업담당자 관리</button></div></div><section class="mtf-v314-report-page"><div class="mtf-v314-report-filters"><div><label>보고서 종류</label><select class="mtf-select" id="v314-report-type"><option value="sales">기간별 거래처별 판매현황</option><option value="payments">기간별 거래처별 수금현황</option><option value="monthly">월별 판매현황</option></select></div><div><label>시작일</label><input class="mtf-input" type="date" id="v314-from" value="${monthStart()}"></div><div><label>종료일</label><input class="mtf-input" type="date" id="v314-to" value="${today()}"></div><div><label>영업담당자</label><select class="mtf-select" id="v314-manager"><option value="">전체</option>${mgrs.map((m) => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select></div><div class="mtf-v314-report-actions"><button class="mtf-btn primary" id="v314-load">조회</button><button class="mtf-btn" id="v314-print">인쇄</button><button class="mtf-btn" id="v314-excel">엑셀 다운로드</button></div></div><div class="mtf-v314-note">대량자료도 먼저 화면에 보고서 형태로 표시한 후 필요한 경우 인쇄·엑셀 저장합니다.</div><div id="v314-preview"><div class="mtf-v314-report-empty">조회 조건을 확인한 뒤 [조회]를 누르세요.</div></div></section></div>`;
    content.querySelector('#v314-manager-admin').onclick = () => openManagerModal().catch((e) => alert(e.message || '영업담당자 관리 오류'));
    content.querySelector('#v314-load').onclick = async () => {
      const type = content.querySelector('#v314-report-type').value;
      const from = content.querySelector('#v314-from').value || monthStart();
      const to = content.querySelector('#v314-to').value || today();
      const manager = content.querySelector('#v314-manager').value;
      const btn = content.querySelector('#v314-load');
      const old = btn.textContent;
      btn.disabled = true; btn.textContent = '조회 중...';
      try {
        const html = await buildReport(type, from, to, manager);
        currentReport = { type, from, to, manager, title: reportTitle(type), html };
        content.querySelector('#v314-preview').innerHTML = `<article class="mtf-v314-report-paper"><h2>${esc(currentReport.title)}</h2><div class="period">기간: ${esc(from)} ~ ${esc(to)}${manager ? ' / 영업담당자: ' + esc(manager) : ''}</div>${html}</article>`;
      } finally { btn.disabled = false; btn.textContent = old; }
    };
    content.querySelector('#v314-print').onclick = printReport;
    content.querySelector('#v314-excel').onclick = excelReport;
  }

  function hookReportsMenu() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    let btn = Array.from(nav.querySelectorAll('button')).find((b) => b.textContent.trim() === '출력보고서');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '출력보고서';
      btn.dataset.v314Reports = '1';
      nav.appendChild(btn);
    }
    if (btn.dataset.boundV314Reports === '1') return;
    btn.dataset.boundV314Reports = '1';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      document.querySelectorAll('.nav button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderReports().catch((e) => alert(e.message || '출력보고서 화면 오류'));
    });
  }

  function tick() {
    injectStyle();
    hookReportsMenu();
    enhanceManagerFields();
  }

  const observer = new MutationObserver(() => tick());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', tick);
  setTimeout(tick, 200);
  setTimeout(tick, 800);
  setTimeout(tick, 1600);
  console.info('MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V314 loaded');
})();
