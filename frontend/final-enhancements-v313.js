(() => {
  'use strict';
  const VERSION = 'V313';
  const API = (path, options) => window.api(path, options);
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const num = (value) => Number(String(value ?? 0).replace(/,/g, '').replace(/원/g, '')) || 0;
  const money = (value) => new Intl.NumberFormat('ko-KR').format(Math.trunc(num(value)));
  const date10 = (value) => value ? String(value).slice(0, 10) : '';
  const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const monthStart = () => today().slice(0, 7) + '-01';
  const stampUrl = () => new URL('/assets/mt_stamp.png?v=313', window.location.origin).href;
  let currentReport = null;
  let reportManagers = null;

  function injectStyle() {
    if (document.getElementById('mtf-v313-style')) return;
    const style = document.createElement('style');
    style.id = 'mtf-v313-style';
    style.textContent = `
      .mtf-v313-report-page{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:20px;margin:18px 0;box-shadow:0 8px 22px rgba(15,23,42,.04)}
      .mtf-v313-report-filters{display:grid;grid-template-columns:1.1fr 160px 160px 180px auto;gap:12px;align-items:end}.mtf-v313-report-actions{display:flex;gap:8px;flex-wrap:wrap}.mtf-v313-report-actions button{white-space:nowrap}.mtf-v313-report-paper{background:#fff;border:1px solid #cbd5e1;margin-top:18px;padding:18px;min-height:180px}.mtf-v313-report-paper h2{text-align:center;margin:0 0 6px;font-size:22px}.mtf-v313-report-paper .period{text-align:center;color:#475569;margin-bottom:14px}.mtf-v313-report-table{width:100%;border-collapse:collapse;font-size:13px}.mtf-v313-report-table th,.mtf-v313-report-table td{border:1px solid #94a3b8;padding:6px 8px}.mtf-v313-report-table th{background:#f1f5f9;text-align:center}.mtf-v313-report-table .num{text-align:right}.mtf-v313-report-empty{padding:40px;text-align:center;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px}.mtf-v313-note{font-size:12px;color:#64748b;margin-top:8px}
      @media print{.mtf-v313-no-print,.nav,.sidebar,header,.topbar,.mtf-head .mtf-actions{display:none!important}.mtf-v313-report-page{box-shadow:none;border:0;margin:0;padding:0}.mtf-v313-report-paper{border:0;margin:0;padding:0}.mtf-v313-report-table th,.mtf-v313-report-table td{font-size:11px;padding:4px}}
    `;
    document.head.appendChild(style);
  }

  function statementCss() {
    return `
      @page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif}.statement-toolbar{position:fixed;right:10mm;top:6mm;z-index:99999;display:flex;gap:8px}.statement-toolbar button{border:0;border-radius:8px;padding:9px 15px;font-weight:800;cursor:pointer}.statement-toolbar .print{background:#2563eb;color:#fff}.statement-toolbar .close{background:#e5e7eb;color:#111}.sheet{width:198mm;height:287mm;margin:0 auto;padding:5mm 6mm 4mm 6mm;overflow:hidden}.copy{position:relative;height:135mm;margin:0}.copy-label{position:absolute;right:0;top:-2.5mm;font-size:12px}.cut{height:7mm;border-top:1px dashed #555;margin:3mm 0 0 0}.head-table,.items-table{width:100%;border-collapse:collapse;table-layout:fixed}.head-table td,.items-table td,.items-table th{border:1px solid #111;vertical-align:middle}.head-table td{height:8mm;padding:1.2mm 2mm;font-size:12px}.items-table td,.items-table th{height:7.3mm;padding:1mm 1.5mm;font-size:12px}.title{font-size:25px!important;font-weight:900;text-align:center;letter-spacing:10mm;height:14mm!important}.no{font-weight:800}.to{text-align:right}.side{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:800;letter-spacing:3px;background:#f3f4f6}.label{font-weight:800;text-align:center;background:#f8fafc}.center{text-align:center}.right{text-align:right}.claim{text-align:center;font-weight:800;height:6.5mm!important}.items-table th{background:#e5e7eb;text-align:center;font-weight:800}.item-name{text-align:left;white-space:normal;word-break:keep-all;line-height:1.2}.summary td{height:7.2mm;font-weight:800}.stamp-img{position:absolute;right:34mm;top:30mm;width:21mm;height:auto;opacity:.92;z-index:10;transform:rotate(-8deg)}@media print{.statement-toolbar{display:none}.sheet{margin:0;width:210mm;height:297mm;padding:5mm 6mm 4mm 6mm}.copy{page-break-inside:avoid}.cut{page-break-after:avoid}}
    `;
  }

  function calcLineAmount(item) {
    const amount = num(item.amount);
    const qty = num(item.quantity);
    const unit = num(item.unit_price);
    return amount || qty * unit;
  }

  function statementRows(items, orderDate) {
    const rows = (items || []).slice(0, 7).map((item) => {
      const qty = num(item.quantity);
      const unit = num(item.unit_price);
      return `<tr><td class="center">${esc(String(orderDate || '').slice(5, 7))}</td><td class="center">${esc(String(orderDate || '').slice(8, 10))}</td><td class="item-name">${esc(item.item_name || '')}${item.spec ? '<br><span style="font-size:10px;color:#444">' + esc(item.spec) + '</span>' : ''}</td><td class="right">${money(qty)}</td><td class="right">${money(unit)}</td><td class="right">${money(calcLineAmount(item))}</td></tr>`;
    });
    while (rows.length < 7) rows.push('<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    return rows.join('');
  }

  function statementCopy(data, label) {
    const order = data.order || {};
    const customer = data.customer || {};
    const d = date10(order.order_date) || today();
    const itemTotal = (data.items || []).reduce((sum, item) => sum + calcLineAmount(item), 0);
    const saleAmount = num(data.today_sale_amount) || itemTotal;
    const previousBalance = num(data.previous_balance);
    const totalBalance = previousBalance + saleAmount;
    return `<section class="copy"><div class="copy-label">(${esc(label)})</div><table class="head-table"><colgroup><col style="width:12mm"><col style="width:20mm"><col style="width:74mm"><col style="width:12mm"><col style="width:20mm"><col style="width:50mm"></colgroup><tr><td colspan="3" class="no">No. ${esc(order.order_no || '')}</td><td colspan="3" class="title">거래명세표</td></tr><tr><td rowspan="5" class="side">공급받는자</td><td class="label">등록번호</td><td>${esc(customer.business_no || '000-00-00000')}</td><td rowspan="5" class="side">공급자</td><td class="label">등록번호</td><td class="center">514-04-79741</td></tr><tr><td class="label">상호(법인명)</td><td>${esc(customer.name || '')}</td><td class="label">상호(법인명)</td><td class="center">MT옵틱스</td></tr><tr><td class="label">성 명</td><td>${esc(customer.owner_name || '')}</td><td class="label">성 명</td><td class="center"><b>오 희 숙</b></td></tr><tr><td class="label">사업장주소</td><td>${esc(customer.address || '')}</td><td class="label">사업장주소</td><td>대구·북구 노원동3가 1149-1 1층</td></tr><tr><td class="label">전화/FAX</td><td>${esc(customer.phone || '')}</td><td class="label">전화/FAX</td><td>T.053-351-6915 / 053-353-2469<br>F.053-351-2469</td></tr><tr><td colspan="2" class="label">작성년월일</td><td class="center">${esc(d)}</td><td colspan="2" class="label">공급대가총액</td><td class="right">${money(saleAmount)}원</td></tr><tr><td colspan="6" class="claim">위 금액을 정히 청구(영수) 함.</td></tr></table><table class="items-table"><colgroup><col style="width:10mm"><col style="width:10mm"><col style="width:96mm"><col style="width:18mm"><col style="width:27mm"><col style="width:27mm"></colgroup><thead><tr><th>월</th><th>일</th><th>품 목</th><th>수량</th><th>단가</th><th>공급가액</th></tr></thead><tbody>${statementRows(data.items, d)}<tr class="summary"><td colspan="2" class="center">판매금액</td><td class="right">${money(saleAmount)}</td><td colspan="2" class="center">전잔액</td><td class="right">${money(previousBalance)}</td></tr><tr class="summary"><td colspan="5" class="right">합계금액</td><td class="right">${money(totalBalance)}</td></tr></tbody></table><img class="stamp-img" src="${stampUrl()}" alt="직인"></section>`;
  }

  function statementHtml(data) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>거래명세서</title><style>${statementCss()}</style></head><body><div class="statement-toolbar"><button type="button" class="print" id="printBtn">인쇄</button><button type="button" class="close" id="closeBtn">닫기</button></div><main class="sheet">${statementCopy(data, '공급받는자용')}<div class="cut"></div>${statementCopy(data, '공급자용')}</main><script>document.getElementById('printBtn').addEventListener('click',function(){window.focus();setTimeout(function(){window.print();},50);});document.getElementById('closeBtn').addEventListener('click',function(){window.close();});<\/script></body></html>`;
  }

  async function printStatement(orderId) {
    const data = await API(`/final/orders/${orderId}/statement`);
    const win = window.open('', '_blank', 'width=980,height=920');
    if (!win) return alert('팝업이 차단되었습니다. 팝업 차단을 해제한 뒤 다시 시도하세요.');
    win.document.open();
    win.document.write(statementHtml(data));
    win.document.close();
    win.focus();
  }

  window.addEventListener('click', (event) => {
    const btn = event.target.closest?.('[data-order-action="statement"], [data-statement-print], [data-order-statement]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    const id = btn.dataset.orderId || btn.dataset.id || btn.getAttribute('data-order-statement');
    if (id) printStatement(id).catch((error) => alert(error.message || '거래명세서 출력 오류'));
  }, true);

  function reorderPaymentSections() {
    const root = document.querySelector('[data-mtf-view^="payments"]');
    if (!root) return;
    const registerCard = root.querySelector('#mtf-payment-register-card');
    const toolbar = root.querySelector('.mtf-toolbar');
    const cards = Array.from(root.querySelectorAll('.mtf-card'));
    const recentCard = cards.find((card) => /최근\s*수금/.test(card.querySelector('h2')?.textContent || ''));
    const receivableCard = cards.find((card) => /발송구분별\s*미수금/.test(card.querySelector('h2')?.textContent || ''));
    if (registerCard && toolbar && registerCard.nextElementSibling !== toolbar) registerCard.after(toolbar);
    if (toolbar && recentCard && toolbar.nextElementSibling !== recentCard) toolbar.after(recentCard);
    if (recentCard && receivableCard && recentCard.nextElementSibling !== receivableCard) recentCard.after(receivableCard);
  }

  async function managers() {
    if (!reportManagers) reportManagers = await API('/final/sales-managers');
    return reportManagers || [];
  }

  function table(headers, rows) {
    return `<table class="mtf-v313-report-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}" class="mtf-v313-report-empty">조회된 자료가 없습니다.</td></tr>`}</tbody></table>`;
  }

  function reportTitle(type) {
    if (type === 'payments') return '기간별 거래처별 수금현황';
    if (type === 'monthly') return '월별 판매현황';
    return '기간별 거래처별 판매현황';
  }

  function exportExcel(filename, html) {
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function loadReport(root) {
    const type = root.querySelector('#v313-report-type').value;
    const from = root.querySelector('#v313-from').value || monthStart();
    const to = root.querySelector('#v313-to').value || today();
    const manager = root.querySelector('#v313-manager').value;
    const preview = root.querySelector('#v313-preview');
    preview.innerHTML = '<div class="mtf-v313-report-empty">보고서를 불러오는 중입니다...</div>';
    let reportHtml = '';
    if (type === 'payments') {
      const q = `date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}${manager ? `&sales_manager_name=${encodeURIComponent(manager)}` : ''}`;
      const data = await API(`/final/reports/customer-payments?${q}`);
      const rows = (data.rows || []).map((r) => `<tr><td>${esc(r.sales_manager_name || '미지정')}</td><td>${esc(r.customer_name || '')}</td><td>${esc(r.site_name || '')}</td><td class="num">${money(r.payment_count)}</td><td class="num">${money(r.payment_amount)}</td><td>${esc(r.methods || '')}</td></tr>`);
      reportHtml = table(['영업담당자', '거래처', '납품처/지역', '수금건수', '수금금액', '수금방법'], rows);
    } else if (type === 'monthly') {
      const data = await API(`/final/reports/monthly-sales-matrix?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
      let mgrs = Array.from(new Set([...(data.sales || []).map((r) => r.sales_manager_name || '미지정'), ...(data.payments || []).map((r) => r.sales_manager_name || '미지정'), ...(data.receivables || []).map((r) => r.sales_manager_name || '미지정')])).filter(Boolean);
      if (manager) mgrs = mgrs.filter((m) => m === manager);
      const products = Array.from(new Set((data.sales || []).map((r) => r.product_name || '미지정'))).filter(Boolean);
      const pay = Object.fromEntries((data.payments || []).map((r) => [r.sales_manager_name || '미지정', num(r.payment_amount)]));
      const recv = Object.fromEntries((data.receivables || []).map((r) => [r.sales_manager_name || '미지정', num(r.receivable_amount)]));
      const salesTotal = {};
      (data.sales || []).forEach((r) => { const m = r.sales_manager_name || '미지정'; salesTotal[m] = (salesTotal[m] || 0) + num(r.sales_amount); });
      const headers = ['제품명', ...mgrs.map((m) => `${m}\n판매수량 / 판매금액 / 수금금액 / 미수금`)];
      const rows = products.map((prod) => `<tr><td>${esc(prod)}</td>${mgrs.map((m) => { const r = (data.sales || []).find((x) => (x.product_name || '미지정') === prod && (x.sales_manager_name || '미지정') === m) || {}; const ratio = salesTotal[m] ? num(r.sales_amount) / salesTotal[m] : 0; return `<td class="num">${money(r.sales_qty || 0)} / ${money(r.sales_amount || 0)} / ${money((pay[m] || 0) * ratio)} / ${money((recv[m] || 0) * ratio)}</td>`; }).join('')}</tr>`);
      reportHtml = table(headers, rows);
    } else {
      const data = await API(`/final/reports/customer-sales?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
      let rowsData = data.rows || [];
      if (manager) rowsData = rowsData.filter((r) => (r.sales_manager_name || '미지정') === manager);
      const rows = rowsData.map((r) => `<tr><td>${esc(r.sales_manager_name || '미지정')}</td><td>${esc(r.customer_name || '')}</td><td>${esc(r.site_name || '')}</td><td class="num">${money(r.order_count)}</td><td class="num">${money(r.sales_qty)}</td><td class="num">${money(r.sales_amount)}</td></tr>`);
      reportHtml = table(['영업담당자', '거래처', '납품처/지역', '주문건수', '판매수량', '판매금액'], rows);
    }
    currentReport = { type, from, to, title: reportTitle(type), html: reportHtml };
    preview.innerHTML = `<article class="mtf-v313-report-paper"><h2>${esc(currentReport.title)}</h2><div class="period">기간: ${esc(from)} ~ ${esc(to)}${manager ? ' / 영업담당자: ' + esc(manager) : ''}</div>${reportHtml}</article>`;
  }

  function printCurrentReport() {
    if (!currentReport?.html) return alert('먼저 조회 버튼을 눌러 보고서를 조회하세요.');
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(currentReport.title)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:'Malgun Gothic',Arial,sans-serif;color:#111}h1{text-align:center;margin:0 0 6px}.period{text-align:center;margin-bottom:12px;color:#555}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #777;padding:5px}th{background:#eee}.num{text-align:right}.toolbar{position:fixed;right:10px;top:10px}button{padding:8px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:800}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">인쇄</button></div><h1>${esc(currentReport.title)}</h1><div class="period">기간: ${esc(currentReport.from)} ~ ${esc(currentReport.to)}</div>${currentReport.html}</body></html>`;
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) return alert('팝업이 차단되었습니다.');
    win.document.open(); win.document.write(html); win.document.close(); win.focus();
  }

  function excelCurrentReport() {
    if (!currentReport?.html) return alert('먼저 조회 버튼을 눌러 보고서를 조회하세요.');
    exportExcel(`${currentReport.title}_${currentReport.from}_${currentReport.to}.xls`, currentReport.html);
  }


  async function openManagerModal() {
    const rows = await managers();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal large"><div class="modal-head"><h2>영업담당자 관리</h2><button class="secondary small" data-close>닫기</button></div><div class="mtf-v313-report-page"><input type="hidden" id="v313-mgr-id"><div class="mtf-v313-report-filters" style="grid-template-columns:1fr 1fr 1fr 100px auto"><div><label>이름</label><input class="mtf-input" id="v313-mgr-name"></div><div><label>은행명</label><input class="mtf-input" id="v313-mgr-bank"></div><div><label>계좌번호</label><input class="mtf-input" id="v313-mgr-account"></div><div><label>순서</label><input class="mtf-input" id="v313-mgr-sort" value="0"></div><div class="mtf-v313-report-actions"><button class="mtf-btn primary" id="v313-mgr-save">저장</button><button class="mtf-btn" id="v313-mgr-new">신규</button></div></div><table class="mtf-v313-report-table" style="margin-top:14px"><thead><tr><th>이름</th><th>은행명</th><th>계좌번호</th><th>관리</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.bank_name || '')}</td><td>${esc(r.account_no || '')}</td><td><button class="mtf-btn small" data-edit="${esc(r.id)}" data-name="${esc(r.name)}" data-bank="${esc(r.bank_name || '')}" data-account="${esc(r.account_no || '')}" data-sort="${esc(r.sort_order || 0)}">수정</button></td></tr>`).join('')}</tbody></table></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-close]').onclick = () => wrap.remove();
    wrap.querySelectorAll('[data-edit]').forEach((btn) => btn.onclick = () => {
      wrap.querySelector('#v313-mgr-id').value = btn.dataset.edit || '';
      wrap.querySelector('#v313-mgr-name').value = btn.dataset.name || '';
      wrap.querySelector('#v313-mgr-bank').value = btn.dataset.bank || '';
      wrap.querySelector('#v313-mgr-account').value = btn.dataset.account || '';
      wrap.querySelector('#v313-mgr-sort').value = btn.dataset.sort || '0';
    });
    wrap.querySelector('#v313-mgr-new').onclick = () => {
      ['id','name','bank','account'].forEach((k) => { const el = wrap.querySelector('#v313-mgr-' + k); if (el) el.value = ''; });
      wrap.querySelector('#v313-mgr-sort').value = '0';
    };
    wrap.querySelector('#v313-mgr-save').onclick = async () => {
      const payload = {
        id: wrap.querySelector('#v313-mgr-id').value,
        name: wrap.querySelector('#v313-mgr-name').value,
        bank_name: wrap.querySelector('#v313-mgr-bank').value,
        account_no: wrap.querySelector('#v313-mgr-account').value,
        sort_order: wrap.querySelector('#v313-mgr-sort').value,
        is_active: 1
      };
      if (!payload.name.trim()) return alert('이름을 입력하세요.');
      await API('/final/sales-managers', { method: 'POST', body: JSON.stringify(payload) });
      reportManagers = null;
      alert('저장했습니다.');
      wrap.remove();
      openManagerModal().catch((e) => alert(e.message || '영업담당자 관리 오류'));
    };
  }

  async function renderReports() {
    injectStyle();
    const content = document.getElementById('content');
    if (!content) return;
    const mgrs = await managers();
    content.innerHTML = `<div class="mtf-root" data-mtf-view="reports-v313"><div class="mtf-head"><div><h1>출력보고서</h1><p>보고서를 화면에서 먼저 조회한 뒤 인쇄 또는 엑셀 다운로드를 실행합니다.</p></div><div class="mtf-actions"><button class="mtf-btn" id="v313-manager-admin">영업담당자 관리</button></div></div><section class="mtf-v313-report-page"><div class="mtf-v313-report-filters"><div><label>보고서 종류</label><select class="mtf-select" id="v313-report-type"><option value="sales">기간별 거래처별 판매현황</option><option value="payments">기간별 거래처별 수금현황</option><option value="monthly">월별 판매현황</option></select></div><div><label>시작일</label><input class="mtf-input" type="date" id="v313-from" value="${monthStart()}"></div><div><label>종료일</label><input class="mtf-input" type="date" id="v313-to" value="${today()}"></div><div><label>영업담당자</label><select class="mtf-select" id="v313-manager"><option value="">전체</option>${mgrs.map((m) => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select></div><div class="mtf-v313-report-actions"><button class="mtf-btn primary" id="v313-load">조회</button><button class="mtf-btn" id="v313-print">인쇄</button><button class="mtf-btn" id="v313-excel">엑셀 다운로드</button></div></div><div class="mtf-v313-note">대량자료도 먼저 화면에 보고서 형태로 표시한 후 필요한 경우 인쇄·엑셀 저장합니다.</div><div id="v313-preview"><div class="mtf-v313-report-empty">조회 조건을 확인한 뒤 [조회]를 누르세요.</div></div></section></div>`;
    const oldManagerBtn = content.querySelector('#v313-manager-admin');
    oldManagerBtn.onclick = () => openManagerModal().catch((e) => alert(e.message || '영업담당자 관리 오류'));
    content.querySelector('#v313-load').onclick = () => loadReport(content).catch((e) => alert(e.message || '보고서 조회 오류'));
    content.querySelector('#v313-print').onclick = printCurrentReport;
    content.querySelector('#v313-excel').onclick = excelCurrentReport;
  }

  function hookReportsMenu() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const btn = nav.querySelector('[data-v312-reports], [data-v313-reports]') || Array.from(nav.querySelectorAll('button')).find((b) => b.textContent.trim() === '출력보고서');
    if (!btn || btn.dataset.v313Reports === '1') return;
    btn.dataset.v313Reports = '1';
    btn.textContent = '출력보고서';
    btn.onclick = () => {
      document.querySelectorAll('.nav button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderReports().catch((e) => alert(e.message || '출력보고서 화면 오류'));
    };
  }

  function tick() {
    injectStyle();
    hookReportsMenu();
    reorderPaymentSections();
  }

  const observer = new MutationObserver(() => tick());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', tick);
  setTimeout(tick, 200);
  setTimeout(tick, 800);
  console.info('MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V313 loaded');
})();
