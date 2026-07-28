(() => {
  'use strict';
  const VERSION = 'V312';
  const API = (path, options) => window.api(path, options);
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money = (v) => {
    const n = Number(String(v ?? 0).replace(/,/g, '').replace(/원/g, '')) || 0;
    return new Intl.NumberFormat('ko-KR').format(Math.trunc(n));
  };
  const date10 = (v) => v ? String(v).slice(0,10) : '';
  const today = () => new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10);
  const monthStart = () => today().slice(0,7) + '-01';
  let salesManagersCache = null;

  function injectStyles() {
    if (document.getElementById('mtf-v312-style')) return;
    const style = document.createElement('style');
    style.id = 'mtf-v312-style';
    style.textContent = `
      .mtf-report-panel{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:20px;margin:20px 0;box-shadow:0 8px 24px rgba(15,23,42,.04)}
      .mtf-report-grid{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px;align-items:end}.mtf-report-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mtf-report-table{width:100%;border-collapse:collapse;font-size:13px}.mtf-report-table th,.mtf-report-table td{border:1px solid #d1d5db;padding:7px;text-align:left}.mtf-report-table th{background:#f3f4f6}.mtf-report-table .num{text-align:right}.mtf-v312-print-root{font-family:'Malgun Gothic',Arial,sans-serif;color:#111}.mtf-v312-sheet{width:190mm;margin:0 auto 8mm auto}.mtf-v312-copy{position:relative;height:132mm;margin:0 0 5mm 0}.mtf-v312-copy .copy-label{position:absolute;right:0;top:0;font-size:12px}.mtf-v312-statement{position:absolute;left:0;right:0;top:5mm;border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px}.mtf-v312-statement td,.mtf-v312-statement th{border:1px solid #111;padding:2px 4px;height:7.2mm;vertical-align:middle}.mtf-v312-title{font-size:26px;font-weight:800;text-align:center;letter-spacing:12px}.mtf-v312-no{font-weight:700}.mtf-v312-side{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:700;letter-spacing:3px;background:#f8f8f8}.mtf-v312-label{font-weight:700;text-align:center;background:#f5f5f5}.mtf-v312-center{text-align:center}.mtf-v312-right{text-align:right}.mtf-v312-items th{background:#eee;text-align:center;font-weight:700}.mtf-v312-summary td{height:7mm}.mtf-v312-claim{text-align:center;font-weight:700;height:6mm!important}.mtf-v312-stamp{position:absolute;right:50mm;top:35mm;border:3px solid rgba(190,0,0,.75);color:rgba(190,0,0,.75);border-radius:50%;width:20mm;height:20mm;display:flex;align-items:center;justify-content:center;font-weight:800;transform:rotate(-14deg);font-size:13px;z-index:5}.mtf-v312-cut{border-top:1px dashed #555;margin:4mm 0}@media print{button.mtf-v312-print-button{display:none}.mtf-v312-sheet{margin:0;width:190mm}.mtf-v312-copy{page-break-inside:avoid}body{margin:7mm}}`;
    document.head.appendChild(style);
  }

  async function salesManagers(force = false) {
    if (!salesManagersCache || force) salesManagersCache = await API('/final/sales-managers');
    return salesManagersCache || [];
  }

  function managerOptions(rows, selectedId = '', selectedName = '') {
    return `<option value="">선택</option>` + rows.filter(r => r.is_active !== 0).map(r => `<option value="${esc(r.id)}" data-name="${esc(r.name)}" data-bank="${esc(r.bank_name || '')}" data-account="${esc(r.account_no || '')}" ${(String(selectedId||'')===String(r.id)||(!selectedId&&selectedName===r.name))?'selected':''}>${esc(r.name)}${r.bank_name ? ' · '+esc(r.bank_name) : ''}${r.account_no ? ' · '+esc(r.account_no) : ''}</option>`).join('');
  }

  async function injectSalesManagerIntoCustomerModal(scope = document) {
    const form = scope.querySelector('#modal-root form, .modal form, form');
    if (!form || form.dataset.mtfV312Manager === '1') return;
    const nameInput = form.querySelector('input[name="name"], input[name="site_name"]');
    if (!nameInput) return;
    form.dataset.mtfV312Manager = '1';
    const rows = await salesManagers();
    const selectedId = form.querySelector('[name="sales_manager_id"]')?.value || '';
    const wrap = document.createElement('div');
    wrap.className = 'mtf-field mtf-v312-sales-manager-field';
    wrap.innerHTML = `<label>영업담당자</label><select class="mtf-select" name="sales_manager_id">${managerOptions(rows, selectedId)}</select><input type="hidden" name="sales_manager_name"><input type="hidden" name="sales_manager_bank"><input type="hidden" name="sales_manager_account">`;
    const grid = form.querySelector('.mtf-form-grid, .form-grid') || nameInput.closest('div')?.parentElement || form;
    grid.appendChild(wrap);
    const select = wrap.querySelector('select');
    const sync = () => {
      const opt = select.selectedOptions[0];
      form.querySelector('[name="sales_manager_name"]').value = opt?.dataset.name || '';
      form.querySelector('[name="sales_manager_bank"]').value = opt?.dataset.bank || '';
      form.querySelector('[name="sales_manager_account"]').value = opt?.dataset.account || '';
    };
    select.addEventListener('change', sync); sync();
  }

  async function enhancePaymentForm(scope = document) {
    const form = scope.querySelector('#mtf-payment-form');
    if (!form || form.dataset.mtfV312Payment === '1') return;
    form.dataset.mtfV312Payment = '1';
    const rows = await salesManagers();
    const field = document.createElement('div');
    field.className = 'mtf-field';
    field.innerHTML = `<label>영업담당자</label><select class="mtf-select" name="sales_manager_id" id="mtf-v312-payment-manager">${managerOptions(rows)}</select><input type="hidden" name="sales_manager_name"><input type="hidden" name="sales_manager_bank"><input type="hidden" name="sales_manager_account"><div class="muted" id="mtf-v312-payment-manager-note"></div>`;
    const memo = form.querySelector('#mtf-payment-memo')?.closest('.mtf-field');
    (memo?.parentElement || form).insertBefore(field, memo || null);
    const select = field.querySelector('select');
    const sync = () => {
      const opt = select.selectedOptions[0];
      form.querySelector('[name="sales_manager_name"]').value = opt?.dataset.name || '';
      form.querySelector('[name="sales_manager_bank"]').value = opt?.dataset.bank || '';
      form.querySelector('[name="sales_manager_account"]').value = opt?.dataset.account || '';
      const note = field.querySelector('#mtf-v312-payment-manager-note');
      note.textContent = opt?.dataset.bank || opt?.dataset.account ? `${opt.dataset.bank || ''} ${opt.dataset.account || ''}`.trim() : '';
    };
    select.addEventListener('change', sync); sync();
    const wrapper = form.querySelector('[data-mtf-ac="mtf-payment-form-customer"]');
    wrapper?.addEventListener('mtf-customer-selected', async (event) => {
      const customer = event.detail;
      if (!customer?.id) return;
      try {
        const m = await API(`/final/customers/${customer.id}/sales-manager`);
        if (m.sales_manager_id) select.value = m.sales_manager_id;
        else if (m.sales_manager_name) {
          const option = Array.from(select.options).find(o => o.dataset.name === m.sales_manager_name);
          if (option) select.value = option.value;
        }
        sync();
      } catch (_) {}
    });
  }

  function formObject(form) {
    const fd = new FormData(form); const o = {};
    for (const [k,v] of fd.entries()) o[k] = String(v).trim();
    form.querySelectorAll('[data-mtf-number-format]').forEach(inp => { if (inp.name) o[inp.name] = String(inp.value || '').replace(/,/g,''); });
    return o;
  }

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('#mtf-payment-form');
    if (!form || form.dataset.mtfV312Intercepted === '1') return;
    event.preventDefault(); event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    const data = formObject(form);
    if (!data.customer_id) return alert('거래처를 선택하세요.');
    if (!Number(String(data.amount||'').replace(/,/g,''))) return alert('수금 금액을 입력하세요.');
    form.dataset.mtfV312Intercepted = '1';
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '수금 저장 중...'; }
    try {
      await API('/final/payments-v312', { method:'POST', body: JSON.stringify(data) });
      alert('수금을 등록했습니다.');
      location.reload();
    } catch (e) {
      alert(e.message || '수금 등록 오류');
      form.dataset.mtfV312Intercepted = '';
      if (btn) { btn.disabled = false; btn.textContent = '수금 저장'; }
    }
  }, true);

  async function printStatement(orderId) {
    const data = await API(`/final/orders/${orderId}/statement`);
    const html = statementHtml(data);
    const win = window.open('', '_blank', 'width=900,height=900');
    if (!win) return alert('팝업이 차단되었습니다.');
    win.document.open(); win.document.write(html); win.document.close();
  }

  function itemRows(items, orderDate) {
    const rows = (items || []).slice(0, 7).map(item => `<tr><td class="mtf-v312-center">${esc(String(orderDate||'').slice(5,7))}</td><td class="mtf-v312-center">${esc(String(orderDate||'').slice(8,10))}</td><td>${esc(item.item_name || '')}${item.spec ? ' / '+esc(item.spec) : ''}</td><td class="mtf-v312-right">${money(item.quantity)}</td><td class="mtf-v312-right">${money(item.unit_price)}</td><td class="mtf-v312-right">${money(item.amount)}</td></tr>`);
    while (rows.length < 7) rows.push('<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    return rows.join('');
  }

  function copyHtml(data, label) {
    const o = data.order || {}, c = data.customer || {};
    const d = date10(o.order_date) || today();
    return `<div class="mtf-v312-copy"><div class="copy-label">(${label})</div><table class="mtf-v312-statement"><colgroup><col style="width:11mm"><col style="width:14mm"><col style="width:48mm"><col style="width:9mm"><col style="width:14mm"><col style="width:34mm"><col style="width:48mm"></colgroup><tr><td colspan="3" class="mtf-v312-no">No. ${esc(o.order_no || '')}</td><td colspan="4" class="mtf-v312-title">거 래 명 세 표</td></tr><tr><td rowspan="5" class="mtf-v312-side">공급받는자</td><td class="mtf-v312-label">등록번호</td><td>${esc(c.business_no || '')}</td><td rowspan="5" class="mtf-v312-side">공급자</td><td class="mtf-v312-label">등록번호</td><td colspan="2" class="mtf-v312-center">514-04-79741</td></tr><tr><td class="mtf-v312-label">상호(법인명)</td><td>${esc(c.name || '')}</td><td class="mtf-v312-label">상호(법인명)</td><td colspan="2" class="mtf-v312-center">MT옵틱스</td></tr><tr><td class="mtf-v312-label">성 명</td><td>${esc(c.owner_name || '')}</td><td class="mtf-v312-label">성 명</td><td colspan="2" class="mtf-v312-center"><b>오 희 숙</b></td></tr><tr><td class="mtf-v312-label">사업장주소</td><td>${esc(c.address || '')}</td><td class="mtf-v312-label">사업장주소</td><td colspan="2">대구·북구 노원동3가 1149-1 1층</td></tr><tr><td class="mtf-v312-label">전화/FAX</td><td>${esc(c.phone || '')}</td><td class="mtf-v312-label">전화/FAX</td><td colspan="2">T.053-351-6915 / 053-353-2469<br>F.053-351-2469</td></tr><tr><td colspan="2" class="mtf-v312-label">작성년월일</td><td class="mtf-v312-center">${esc(d)}</td><td colspan="2" class="mtf-v312-label">공급대가총액</td><td colspan="2" class="mtf-v312-right">${money(data.today_sale_amount)}원</td></tr><tr><td colspan="7" class="mtf-v312-claim">위 금액을 정히 청구(영수) 함.</td></tr><tr class="mtf-v312-items"><th>월</th><th>일</th><th>품 목</th><th colspan="1">수 량</th><th>단 가</th><th colspan="2">공급가액</th></tr>${itemRows(data.items, d)}<tr class="mtf-v312-summary"><td colspan="2" class="mtf-v312-label">판매금액</td><td class="mtf-v312-right">${money(data.today_sale_amount)}</td><td colspan="2" class="mtf-v312-label">전잔액</td><td class="mtf-v312-right">${money(data.previous_balance)}</td><td class="mtf-v312-right"><b>${money(data.total_balance)}</b></td></tr></table><div class="mtf-v312-stamp">직인</div></div>`;
  }

  function statementHtml(data) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>거래명세서</title><style>${document.getElementById('mtf-v312-style')?.textContent || ''}</style></head><body class="mtf-v312-print-root"><button class="mtf-v312-print-button" onclick="window.print()" style="position:fixed;right:16px;top:16px;z-index:9999;padding:10px 18px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-weight:bold">인쇄</button><div class="mtf-v312-sheet">${copyHtml(data,'공급받는자용')}<div class="mtf-v312-cut"></div>${copyHtml(data,'공급자용')}</div></body></html>`;
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-order-action="statement"], [data-statement-print], [data-order-statement]');
    if (!btn) return;
    event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    const id = btn.dataset.orderId || btn.dataset.id || btn.getAttribute('data-order-statement');
    if (id) printStatement(id).catch(e => alert(e.message || '거래명세서 출력 오류'));
  }, true);

  function downloadExcel(filename, html) {
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }

  function tableHtml(headers, rows) {
    return `<table border="1"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  async function openSalesManagerModal() {
    const rows = await salesManagers(true);
    const body = `<div class="mtf-report-panel"><h2>영업담당자 관리</h2><div class="mtf-report-grid"><input id="mgr-id" type="hidden"><div><label>이름</label><input class="mtf-input" id="mgr-name"></div><div><label>은행명</label><input class="mtf-input" id="mgr-bank"></div><div><label>계좌번호</label><input class="mtf-input" id="mgr-account"></div><div><label>순서</label><input class="mtf-input" id="mgr-sort" value="0"></div></div><div class="mtf-report-actions"><button class="mtf-btn primary" id="mgr-save">저장</button><button class="mtf-btn" id="mgr-new">신규</button></div><table class="mtf-report-table" style="margin-top:12px"><thead><tr><th>이름</th><th>은행</th><th>계좌번호</th><th>관리</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.bank_name||'')}</td><td>${esc(r.account_no||'')}</td><td><button class="mtf-btn small" data-mgr-edit="${r.id}" data-name="${esc(r.name)}" data-bank="${esc(r.bank_name||'')}" data-account="${esc(r.account_no||'')}" data-sort="${esc(r.sort_order||0)}">수정</button></td></tr>`).join('')}</tbody></table></div>`;
    const wrap = document.createElement('div'); wrap.className='modal-backdrop'; wrap.innerHTML=`<div class="modal large"><div class="modal-head"><h2>영업담당자</h2><button class="secondary small" data-close>닫기</button></div>${body}</div>`; document.body.appendChild(wrap);
    wrap.querySelector('[data-close]').onclick=()=>wrap.remove();
    wrap.querySelectorAll('[data-mgr-edit]').forEach(b=>b.onclick=()=>{wrap.querySelector('#mgr-id').value=b.dataset.mgrEdit;wrap.querySelector('#mgr-name').value=b.dataset.name;wrap.querySelector('#mgr-bank').value=b.dataset.bank;wrap.querySelector('#mgr-account').value=b.dataset.account;wrap.querySelector('#mgr-sort').value=b.dataset.sort;});
    wrap.querySelector('#mgr-new').onclick=()=>['id','name','bank','account','sort'].forEach(k=>{const el=wrap.querySelector('#mgr-'+k); if(el) el.value=k==='sort'?'0':''});
    wrap.querySelector('#mgr-save').onclick=async()=>{await API('/final/sales-managers',{method:'POST',body:JSON.stringify({id:wrap.querySelector('#mgr-id').value,name:wrap.querySelector('#mgr-name').value,bank_name:wrap.querySelector('#mgr-bank').value,account_no:wrap.querySelector('#mgr-account').value,sort_order:wrap.querySelector('#mgr-sort').value,is_active:1})}); salesManagersCache=null; alert('저장했습니다.'); wrap.remove(); openSalesManagerModal();};
  }

  async function renderReports() {
    injectStyles();
    const content = document.getElementById('content'); if (!content) return;
    const mgrs = await salesManagers();
    content.innerHTML = `<div class="mtf-root" data-mtf-view="reports-v312"><div class="mtf-head"><div><h1>출력보고서</h1><p>기간별 판매·수금·월별 영업담당자 현황을 엑셀로 다운로드합니다.</p></div><div class="mtf-actions"><button class="mtf-btn" id="v312-manager-admin">영업담당자 관리</button></div></div><div class="mtf-report-panel"><div class="mtf-report-grid"><div><label>시작일</label><input class="mtf-input" type="date" id="v312-from" value="${monthStart()}"></div><div><label>종료일</label><input class="mtf-input" type="date" id="v312-to" value="${today()}"></div><div><label>영업담당자</label><select class="mtf-select" id="v312-manager"><option value="">전체</option>${mgrs.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select></div></div><div class="mtf-report-actions"><button class="mtf-btn primary" id="v312-sales">기간별 거래처별 판매현황 Excel</button><button class="mtf-btn primary" id="v312-payments">기간별 거래처별 수금현황 Excel</button><button class="mtf-btn primary" id="v312-monthly">월별 판매현황 Excel</button></div><div id="v312-preview" style="margin-top:16px"></div></div></div>`;
    content.querySelector('#v312-manager-admin').onclick = openSalesManagerModal;
    const period = () => ({from:content.querySelector('#v312-from').value, to:content.querySelector('#v312-to').value, manager:content.querySelector('#v312-manager').value});
    content.querySelector('#v312-sales').onclick = async()=>{const p=period(); const r=await API(`/final/reports/customer-sales?date_from=${p.from}&date_to=${p.to}`); const rows=r.rows.map(x=>`<tr><td>${esc(x.customer_name)}</td><td>${esc(x.site_name||'')}</td><td>${esc(x.sales_manager_name||'')}</td><td>${money(x.order_count)}</td><td>${money(x.sales_qty)}</td><td>${money(x.sales_amount)}</td></tr>`); const html=tableHtml(['거래처','납품처','영업담당자','주문건수','판매수량','판매금액'], rows); content.querySelector('#v312-preview').innerHTML=html; downloadExcel(`기간별_거래처별_판매현황_${p.from}_${p.to}.xls`, html);};
    content.querySelector('#v312-payments').onclick = async()=>{const p=period(); const q=`date_from=${p.from}&date_to=${p.to}${p.manager?`&sales_manager_name=${encodeURIComponent(p.manager)}`:''}`; const r=await API(`/final/reports/customer-payments?${q}`); const rows=r.rows.map(x=>`<tr><td>${esc(x.sales_manager_name||'')}</td><td>${esc(x.customer_name)}</td><td>${esc(x.site_name||'')}</td><td>${money(x.payment_count)}</td><td>${money(x.payment_amount)}</td><td>${esc(x.methods||'')}</td></tr>`); const html=tableHtml(['영업담당자','거래처','납품처','수금건수','수금금액','방법'], rows); content.querySelector('#v312-preview').innerHTML=html; downloadExcel(`기간별_거래처별_수금현황_${p.from}_${p.to}.xls`, html);};
    content.querySelector('#v312-monthly').onclick = async()=>{const p=period(); const r=await API(`/final/reports/monthly-sales-matrix?date_from=${p.from}&date_to=${p.to}`); const managers=[...new Set([...(r.sales||[]).map(x=>x.sales_manager_name), ...(r.payments||[]).map(x=>x.sales_manager_name), ...(r.receivables||[]).map(x=>x.sales_manager_name)])]; const products=[...new Set((r.sales||[]).map(x=>x.product_name))]; const pay=Object.fromEntries((r.payments||[]).map(x=>[x.sales_manager_name,Number(x.payment_amount||0)])); const recv=Object.fromEntries((r.receivables||[]).map(x=>[x.sales_manager_name,Number(x.receivable_amount||0)])); const salesTotal={}; (r.sales||[]).forEach(x=>salesTotal[x.sales_manager_name]=(salesTotal[x.sales_manager_name]||0)+Number(x.sales_amount||0)); const headers=['제품명',...managers.map(m=>`${m} 판매수량/판매금액/수금금액/미수금`)]; const rows=products.map(prod=>`<tr><td>${esc(prod)}</td>${managers.map(m=>{const x=(r.sales||[]).find(a=>a.product_name===prod&&a.sales_manager_name===m)||{}; const ratio=salesTotal[m]?Number(x.sales_amount||0)/salesTotal[m]:0; return `<td>${money(x.sales_qty||0)} / ${money(x.sales_amount||0)} / ${money((pay[m]||0)*ratio)} / ${money((recv[m]||0)*ratio)}</td>`;}).join('')}</tr>`); const html=tableHtml(headers, rows); content.querySelector('#v312-preview').innerHTML=html; downloadExcel(`월별_판매현황_${p.from}_${p.to}.xls`, html);};
  }

  function addReportsMenu() {
    const nav = document.querySelector('.nav'); if (!nav || nav.querySelector('[data-v312-reports]')) return;
    const btn = document.createElement('button'); btn.textContent='출력보고서'; btn.dataset.v312Reports='1'; btn.onclick=()=>{document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderReports().catch(e=>alert(e.message));}; nav.appendChild(btn);
  }

  const obs = new MutationObserver(() => {
    injectStyles(); addReportsMenu(); enhancePaymentForm(document).catch(()=>{}); injectSalesManagerIntoCustomerModal(document).catch(()=>{});
  });
  obs.observe(document.body, {childList:true, subtree:true});
  window.addEventListener('load', () => { injectStyles(); addReportsMenu(); });
  setTimeout(()=>{injectStyles(); addReportsMenu();}, 300);
  console.info('MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V312 loaded');
})();
