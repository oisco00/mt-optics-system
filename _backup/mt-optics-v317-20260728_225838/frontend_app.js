const API_BASE = localStorage.getItem('mt_api_base') || '/api';
// 프로그램을 열 때마다 로그인 화면부터 시작하도록 기존 영구 저장 토큰을 제거합니다.
localStorage.removeItem('mt_token');
const appEl = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

const state = {
  token: sessionStorage.getItem('mt_token'),
  user: null,
  page: localStorage.getItem('mt_page') || 'dashboard',
  cache: {}
};

const pages = [
  { id: 'dashboard', label: '대시보드', perm: 'dashboard.view' },
  { id: 'customers', label: '거래처/원장', perm: 'customers.read' },
  { id: 'orders', label: '주문/출고', perm: 'orders.read' },
  { id: 'payments', label: '수금/미수금', perm: 'payments.read' },
  { id: 'products', label: '제품/재고', perm: 'products.read' },
  { id: 'masters', label: '기준정보', perm: 'masters.read' },
  { id: 'production', label: '생산지시', perm: 'production.read' },
  { id: 'imports', label: '엑셀가져오기', perm: 'imports.manage' },
  { id: 'audit', label: '수정이력', perm: 'audit.read' },
  { id: 'users', label: '사용자관리', perm: 'users.manage' }
];

const fmtMoney = new Intl.NumberFormat('ko-KR');
const fmtDate = (v) => v ? String(v).slice(0, 10) : '';
const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  if (value === undefined || value === null || value === '') return '0';
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').replace(/원/g, '').trim());
  const safe = Number.isFinite(parsed) ? parsed : 0;
  const integer = safe < 0 ? Math.ceil(safe) : Math.floor(safe);
  return fmtMoney.format(integer);
}

function can(permission) {
  if (!state.user) return false;
  if (state.user.role_name === 'admin') return true;
  return (state.user.permissions || []).includes(permission);
}

function statusBadge(status) {
  const s = String(status || '');
  const map = {
    active: ['사용', 'green'], inactive: ['중지', 'orange'], confirmed: ['주문확정', 'green'], draft: ['임시', 'orange'],
    packed: ['포장', 'orange'], shipped: ['출고', 'green'], delivered: ['납품완료', 'green'], canceled: ['취소', 'red'],
    planned: ['계획', 'orange'], issued: ['지시', 'orange'], in_progress: ['진행', 'orange'], completed: ['완료', 'green'],
    card: ['카드', 'green'], bank: ['송금', 'orange'], cash: ['현금', 'orange']
  };
  const [label, color] = map[s] || [s || '-', ''];
  return `<span class="badge ${color}">${escapeHtml(label)}</span>`;
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    if (response.status === 401) logout(false);
    throw new Error(json.error || `요청 실패: ${response.status}`);
  }
  return json.data;
}

function table(headers, rows, mapper) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map(mapper).join('') : `<tr><td colspan="${headers.length}" class="muted">자료가 없습니다.</td></tr>`
  }</tbody></table></div>`;
}

function optionList(rows, selected, labelFn = (row) => row.name, valueFn = (row) => row.id) {
  return rows.map((row) => {
    const value = valueFn(row);
    return `<option value="${escapeHtml(value)}" ${String(selected ?? '') === String(value) ? 'selected' : ''}>${escapeHtml(labelFn(row))}</option>`;
  }).join('');
}


function deliveryTypeOptions(selected = '택배') {
  return ['택배', '영업방문', '기타'].map((v) => `<option value="${v}" ${String(selected || '택배') === v ? 'selected' : ''}>${v}</option>`).join('');
}

function customerSiteOptions(sites, selected = '', customerId = '') {
  const filtered = customerId ? sites.filter((s) => String(s.customer_id) === String(customerId)) : sites;
  return `<option value="">기본/미지정</option>` + filtered.map((s) => `<option value="${escapeHtml(s.id)}" ${String(selected || '') === String(s.id) ? 'selected' : ''}>${escapeHtml([s.customer_name, s.site_name, s.default_delivery_type].filter(Boolean).join(' · '))}</option>`).join('');
}

function addressFields(row = {}) {
  return `
    <div class="address-block">
      <div class="form-grid two">
        <div><label>우편번호</label><div class="input-action"><input name="postal_code" value="${escapeHtml(row.postal_code || '')}" readonly /><button type="button" class="secondary address-search-btn">주소검색</button></div></div>
        <div><label>선택주소</label><select name="address_type"><option value="R" ${row.address_type === 'R' ? 'selected' : ''}>도로명주소</option><option value="J" ${row.address_type === 'J' ? 'selected' : ''}>지번주소</option></select></div>
      </div>
      <div class="form-grid two" style="margin-top:12px">
        <div><label>도로명주소(신주소)</label><input name="road_address" value="${escapeHtml(row.road_address || '')}" readonly /></div>
        <div><label>지번주소(구주소)</label><input name="jibun_address" value="${escapeHtml(row.jibun_address || '')}" readonly /></div>
      </div>
      <div style="margin-top:12px"><label>상세주소</label><input name="detail_address" value="${escapeHtml(row.detail_address || '')}" placeholder="동·층·호 등 상세주소" /></div>
      <input type="hidden" name="address" value="${escapeHtml(row.address || row.road_address || row.jibun_address || '')}" />
    </div>`;
}

function bindAddressSearch(scope = modalRoot) {
  // V307: use one Kakao postcode handler for every customer/ledger modal.
  // This replaces the old low z-index layer that appeared behind the customer modal.
  scope.querySelectorAll('.address-search-btn, [data-mtf-address-search]').forEach((button) => {
    if (button.dataset.mtopticsPostcodeV307Bound === '1') return;
    button.dataset.mtopticsPostcodeV307Bound = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      if (window.MTOpticsPostcodeV307 && typeof window.MTOpticsPostcodeV307.open === 'function') {
        window.MTOpticsPostcodeV307.open(button);
      } else {
        showToast('주소검색 모듈을 불러오는 중입니다. 잠시 후 다시 누르세요.', 'error');
      }
    }, true);
  });
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const [key, value] of Object.entries(data)) {
    if (value === '') data[key] = null;
  }
  return data;
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast-message');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = `toast-message ${type}`;
  div.textContent = message;
  div.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:50;max-width:360px;padding:13px 16px;border-radius:12px;background:#111827;color:white;box-shadow:0 12px 30px rgba(0,0,0,.18);font-weight:700;';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2600);
}

function openModal(title, html, options = {}) {
  const submitText = options.submitText || '저장';
  const hasSubmit = typeof options.onSubmit === 'function';
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header"><h2>${escapeHtml(title)}</h2><button class="close-btn" type="button" data-close>&times;</button></div>
        <div class="modal-body">
          <form id="modal-form">
            ${html}
            ${hasSubmit ? `<div class="form-actions"><button type="button" class="secondary" data-close>취소</button><button type="submit">${escapeHtml(submitText)}</button></div>` : ''}
          </form>
        </div>
      </div>
    </div>`;
  modalRoot.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', closeModal));
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) closeModal();
  });
  if (hasSubmit) {
    modalRoot.querySelector('#modal-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await options.onSubmit(formData(event.currentTarget), event.currentTarget);
        closeModal();
        showToast('저장되었습니다.');
        await showPage(state.page, true);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }
}

function closeModal() {
  modalRoot.innerHTML = '';
}

function renderLogin() {
  appEl.innerHTML = `
    <main class="login-page">
      <section class="login-card">
        <h1>MT옵틱스 통합관리</h1>
        <p>주문·수금·생산·재고를 한 화면에서 관리합니다.</p>
        <form id="login-form" class="form-grid">
          <div><label>아이디</label><input name="username" value="admin" autocomplete="username" required /></div>
          <div><label>비밀번호</label><input name="password" type="password" autocomplete="current-password" required /></div>
          <button type="submit">로그인</button>
          <div class="muted">관리자가 발급한 아이디와 비밀번호를 입력하세요.</div>
        </form>
      </section>
    </main>`;
  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) });
      state.token = result.token;
      state.user = result.user;
      sessionStorage.setItem('mt_token', result.token);
      await showPage('dashboard', true);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderShell() {
  const availablePages = pages.filter((p) => can(p.perm));
  if (!availablePages.some((p) => p.id === state.page)) state.page = availablePages[0]?.id || 'dashboard';
  const isAdmin = state.user?.role_name === 'admin';
  const mobileQuickPages = availablePages.filter((page) => ['dashboard', 'customers', 'orders', 'payments'].includes(page.id));
  appEl.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">MT</div><div><div class="brand-title">MT옵틱스</div><div class="brand-subtitle">주문·수금·생산·재고</div></div></div>
        <nav class="nav">${availablePages.map((p) => `<button data-page="${p.id}" class="${state.page === p.id ? 'active' : ''}">${p.label}</button>`).join('')}</nav>
        <div class="sidebar-footer">
          <div>${escapeHtml(state.user.full_name)} · ${escapeHtml(state.user.role_label)}</div>
          <button class="secondary small" id="logout-btn" style="margin-top:10px;width:100%;">로그아웃</button>
          ${isAdmin ? `<button class="danger small" id="shutdown-btn" style="margin-top:8px;width:100%;">프로그램 종료</button>` : ''}
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div><strong>${escapeHtml(pages.find((p) => p.id === state.page)?.label || '')}</strong></div>
          <div class="topbar-actions"><span class="muted">${today()}</span><button class="secondary small" id="top-logout-btn">로그아웃</button>${isAdmin ? `<button class="danger small" id="top-shutdown-btn">프로그램 종료</button>` : ''}</div>
        </header>
        <section class="content" id="content"><div class="notice">불러오는 중입니다...</div></section>
      </main>
      <nav class="mobile-quickbar">${mobileQuickPages.map((page) => `<button data-page="${page.id}" class="${state.page === page.id ? 'active' : ''}">${page.label.replace('/원장','').replace('/출고','').replace('/미수금','')}</button>`).join('')}</nav>
    </div>`;
  appEl.querySelectorAll('[data-page]').forEach((btn) => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  document.getElementById('logout-btn')?.addEventListener('click', () => logout());
  document.getElementById('top-logout-btn')?.addEventListener('click', () => logout());
  document.getElementById('shutdown-btn')?.addEventListener('click', shutdownProgram);
  document.getElementById('top-shutdown-btn')?.addEventListener('click', shutdownProgram);
}

async function showPage(page = state.page, forceShell = false) {
  state.page = page;
  localStorage.setItem('mt_page', page);
  if (!state.token) return renderLogin();
  if (!state.user) {
    try {
      state.user = await api('/auth/me');
    } catch (error) {
      return renderLogin();
    }
  }
  if (forceShell || !document.getElementById('content')) renderShell();
  document.querySelectorAll('[data-page]').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === page));
  const content = document.getElementById('content');
  content.innerHTML = '<div class="notice">불러오는 중입니다...</div>';
  try {
    await renderers[page](content);
  } catch (error) {
    content.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

async function logout(show = true) {
  const tokenBeforeLogout = state.token;
  try {
    if (tokenBeforeLogout) await api('/auth/logout', { method: 'POST' });
  } catch (error) {
    // 로그아웃은 화면 전환이 우선입니다.
  }
  state.token = null;
  state.user = null;
  sessionStorage.removeItem('mt_token');
  localStorage.removeItem('mt_token');
  if (show) showToast('로그아웃되었습니다.');
  renderLogin();
}

async function shutdownProgram() {
  if (!confirm('프로그램을 종료할까요? 데이터베이스 연결을 정상 종료한 후 서버가 꺼집니다.')) return;
  try {
    await api('/system/shutdown', { method: 'POST' });
    state.token = null;
    state.user = null;
    sessionStorage.removeItem('mt_token');
    appEl.innerHTML = `<main class="login-page"><section class="login-card"><h1>프로그램 종료</h1><p>데이터베이스 연결을 정상 종료했습니다. 검은 명령창도 곧 종료됩니다.</p></section></main>`;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function renderDashboard(el) {
  const data = await api('/dashboard');
  const s = data.stats;
  el.innerHTML = `
    <h1 class="page-title">대시보드</h1>
    <p class="page-subtitle">주문·수금·생산·재고 현황을 요약합니다.</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">전체 거래처</div><div class="kpi-value">${money(s.total_customers)}</div></div>
      <div class="kpi-card"><div class="kpi-label">총 미수금</div><div class="kpi-value">${money(s.total_receivable)}원</div></div>
      <div class="kpi-card"><div class="kpi-label">진행 주문</div><div class="kpi-value">${money(s.open_orders)}</div></div>
      <div class="kpi-card"><div class="kpi-label">안전재고 부족</div><div class="kpi-value">${money(s.low_stock_count)}</div></div>
      <div class="kpi-card"><div class="kpi-label">최근 30일 매출</div><div class="kpi-value">${money(s.sales_30d)}원</div></div>
      <div class="kpi-card"><div class="kpi-label">최근 30일 수금</div><div class="kpi-value">${money(s.payments_30d)}원</div></div>
      <div class="kpi-card"><div class="kpi-label">제품 수</div><div class="kpi-value">${money(s.total_products)}</div></div>
      <div class="kpi-card"><div class="kpi-label">미완료 생산지시</div><div class="kpi-value">${money(s.pending_production)}</div></div>
    </div>
    <div class="panel"><div class="toolbar"><h3>안전재고 부족 제품</h3><button class="secondary small" data-go="production">생산지시로 이동</button></div>
      ${table(['SKU','제품명','현재','안전','부족','추천생산'], data.low_stock, (p) => `<tr><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(p.name)} <span class="muted">${escapeHtml(p.spec || '')}</span></td><td class="num">${money(p.current_stock)}</td><td class="num">${money(p.safety_stock)}</td><td class="num">${money(p.shortage)}</td><td class="num">${money(p.suggested_qty)}</td></tr>`)}
    </div>
    <div class="panel"><h3>최근 주문</h3>${table(['일자','주문번호','거래처','발송구분','상태','금액'], data.recent_orders, (o) => `<tr><td>${fmtDate(o.order_date)}</td><td>${escapeHtml(o.order_no)}</td><td>${escapeHtml(o.customer_name)}</td><td>${escapeHtml(o.delivery_type || o.delivery_method || o.delivery_group)}</td><td>${statusBadge(o.status)}</td><td class="money">${money(o.total_amount)}원</td></tr>`)}</div>
    <div class="panel"><h3>최근 수금</h3>${table(['일자','수금번호','거래처','발송구분','방법','금액'], data.recent_payments, (p) => `<tr><td>${fmtDate(p.payment_date)}</td><td>${escapeHtml(p.payment_no)}</td><td>${escapeHtml(p.customer_name)}</td><td>${escapeHtml(p.delivery_type || '')}</td><td>${statusBadge(p.method)}</td><td class="money">${money(p.amount)}원</td></tr>`)}</div>`;
  el.querySelector('[data-go="production"]')?.addEventListener('click', () => showPage('production'));
}

async function renderCustomers(el) {
  const q = state.cache.customerQ || '';
  const rows = await api(`/customers?q=${encodeURIComponent(q)}`);
  state.cache.customers = rows;
  el.innerHTML = `
    <h1 class="page-title">거래처/원장</h1>
    <p class="page-subtitle">같은 거래처의 지역/납품처를 하나의 거래처 아래에 묶고, 택배·영업방문·기타 발송구분별 미수금을 관리합니다.</p>
    <div class="panel">
      <div class="toolbar"><div class="left"><input class="search" id="customer-search" placeholder="거래처명, 코드, 전화, 사업자번호" value="${escapeHtml(q)}"/><button id="customer-search-btn" class="secondary">검색</button></div><div class="right">${can('customers.write') ? '<button id="customer-add">거래처 등록</button>' : ''}</div></div>
      ${table(['코드','거래처','납품처','전화','미수금','발송구분별 미수','상태','관리'], rows, (c) => `<tr><td>${escapeHtml(c.code || '')}</td><td><strong>${escapeHtml(c.name)}</strong><br/><span class="muted">${escapeHtml(c.business_no || '')}</span></td><td class="num">${money(c.site_count || 0)}</td><td>${escapeHtml(c.phone || c.mobile || '')}</td><td class="money">${money(c.receivable_balance)}원</td><td><span class="muted">택배</span> ${money(c.parcel_receivable)} / <span class="muted">방문</span> ${money(c.visit_receivable)} / <span class="muted">기타</span> ${money(c.other_receivable)}</td><td>${statusBadge(c.status)}</td><td><button class="small secondary" data-ledger="${c.id}">원장</button> <button class="small secondary" data-sites="${c.id}">납품처</button> ${can('customers.write') ? `<button class="small" data-edit="${c.id}">수정</button>` : ''}</td></tr>`)}
    </div>`;
  el.querySelector('#customer-search-btn').addEventListener('click', () => { state.cache.customerQ = el.querySelector('#customer-search').value; renderCustomers(el); });
  el.querySelector('#customer-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('#customer-search-btn').click(); });
  el.querySelector('#customer-add')?.addEventListener('click', () => customerModal());
  el.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => customerModal(rows.find((r) => String(r.id) === btn.dataset.edit))));
  el.querySelectorAll('[data-ledger]').forEach((btn) => btn.addEventListener('click', () => openLedger(btn.dataset.ledger)));
  el.querySelectorAll('[data-sites]').forEach((btn) => btn.addEventListener('click', () => openCustomerSites(btn.dataset.sites)));
}

function customerModal(row = {}) {
  openModal(row.id ? '거래처 수정' : '거래처 등록', `
    <div class="form-grid two">
      <div><label>거래처코드</label><input name="code" value="${escapeHtml(row.code || '')}" /></div>
      <div><label>거래처명 *</label><input name="name" required value="${escapeHtml(row.name || '')}" /></div>
      <div><label>사업자번호</label><input name="business_no" value="${escapeHtml(row.business_no || '')}" /></div>
      <div><label>대표자/성명</label><input name="owner_name" value="${escapeHtml(row.owner_name || '')}" /></div>
      <div><label>전화</label><input name="phone" value="${escapeHtml(row.phone || '')}" /></div>
      <div><label>휴대폰</label><input name="mobile" value="${escapeHtml(row.mobile || '')}" /></div>
      <div><label>지역</label><input name="region" value="${escapeHtml(row.region || '')}" /></div>
      <div><label>초기미수금</label><input name="opening_receivable" type="number" value="${row.opening_receivable || 0}" /></div>
      <div><label>상태</label><select name="status"><option value="active" ${row.status !== 'inactive' ? 'selected' : ''}>사용</option><option value="inactive" ${row.status === 'inactive' ? 'selected' : ''}>중지</option></select></div>
      <div><label>결제조건</label><input name="payment_terms" value="${escapeHtml(row.payment_terms || '')}" placeholder="카드/월말/현금 등" /></div>
    </div>
    ${addressFields(row)}
    <div style="margin-top:14px"><label>메모</label><textarea name="memo">${escapeHtml(row.memo || '')}</textarea></div>`, {
    onSubmit: (data) => row.id ? api(`/customers/${row.id}`, { method: 'PUT', body: JSON.stringify(data) }) : api('/customers', { method: 'POST', body: JSON.stringify(data) })
  });
  bindAddressSearch();
}

async function openLedger(customerId) {
  const data = await api(`/customers/${customerId}/ledger`);
  openModal(`${data.customer.name} 거래원장`, `
    <div class="notice">초기미수금 ${money(data.customer.opening_receivable)}원 + 주문/반품/수금 내역으로 잔액이 계산됩니다.</div>
    ${table(['일자','구분','납품처','발송','주문/수금번호','금액','잔액','메모'], data.rows, (r) => `<tr><td>${fmtDate(r.txn_date)}</td><td>${escapeHtml(r.txn_type)}</td><td>${escapeHtml(r.site_name || '')}</td><td>${escapeHtml(r.delivery_type || '')}</td><td>${escapeHtml(r.order_no || r.payment_no || '')}</td><td class="money">${money(r.amount)}원</td><td class="money">${money(r.balance_after)}원</td><td>${escapeHtml(r.memo || '')}</td></tr>`)}
  `, { submitText: null });
}


async function openCustomerSites(customerId) {
  const [customers, sites] = await Promise.all([api('/customers?limit=1000'), api(`/customer-sites?customer_id=${customerId}&limit=1000`)]);
  const customer = customers.find((c) => String(c.id) === String(customerId)) || { id: customerId, name: '거래처' };
  openModal(`${customer.name} 납품처/지역`, `
    <div class="notice">한 거래처에 지역별 납품처를 만들고, 기본 발송구분을 택배/영업방문/기타로 지정합니다.</div>
    ${can('customers.write') ? '<div class="form-actions"><button type="button" id="site-add" class="secondary">납품처 추가</button></div>' : ''}
    ${table(['납품처','지역','기본발송','전화','주소','미수금','상태','관리'], sites, (s) => `<tr><td>${escapeHtml(s.site_name)}</td><td>${escapeHtml(s.region || '')}</td><td>${escapeHtml(s.default_delivery_type)}</td><td>${escapeHtml(s.phone || '')}</td><td>${escapeHtml(s.address || '')}</td><td class="money">${money(s.receivable_balance)}원</td><td>${statusBadge(s.status)}</td><td>${can('customers.write') ? `<button type="button" class="small" data-edit-site="${s.id}">수정</button>` : ''}</td></tr>`)}
  `, { submitText: null });
  modalRoot.querySelector('#site-add')?.addEventListener('click', () => customerSiteModal({ customer_id: customerId }));
  modalRoot.querySelectorAll('[data-edit-site]').forEach((btn) => btn.addEventListener('click', () => customerSiteModal(sites.find((row) => String(row.id) === btn.dataset.editSite))));
}

async function customerSiteModal(row = {}) {
  const customers = await api('/customers?limit=1000');
  openModal(row.id ? '납품처 수정' : '납품처 등록', `
    <div class="form-grid two">
      <div><label>거래처 *</label><select name="customer_id" required>${optionList(customers, row.customer_id)}</select></div>
      <div><label>납품처/지역명 *</label><input name="site_name" required value="${escapeHtml(row.site_name || '')}" placeholder="예: 청주우암, 대구, 본점" /></div>
      <div><label>납품처코드</label><input name="site_code" value="${escapeHtml(row.site_code || '')}" /></div>
      <div><label>기본 발송구분</label><select name="default_delivery_type"><option ${row.default_delivery_type === '택배' ? 'selected' : ''}>택배</option><option ${row.default_delivery_type === '영업방문' ? 'selected' : ''}>영업방문</option><option ${row.default_delivery_type === '기타' ? 'selected' : ''}>기타</option></select></div>
      <div><label>박싱구분</label><select name="default_delivery_group"><option ${row.default_delivery_group === '영업부' ? 'selected' : ''}>영업부</option><option ${row.default_delivery_group === '다빈치' ? 'selected' : ''}>다빈치</option><option ${!row.default_delivery_group || row.default_delivery_group === '기타' ? 'selected' : ''}>기타</option></select></div>
      <div><label>지역</label><input name="region" value="${escapeHtml(row.region || '')}" /></div>
      <div><label>전화</label><input name="phone" value="${escapeHtml(row.phone || '')}" /></div>
      <div><label>휴대폰</label><input name="mobile" value="${escapeHtml(row.mobile || '')}" /></div>
      <div><label>초기미수금</label><input name="opening_receivable" type="number" value="${row.opening_receivable || 0}" /></div>
      <div><label>상태</label><select name="status"><option value="active" ${row.status !== 'inactive' ? 'selected' : ''}>사용</option><option value="inactive" ${row.status === 'inactive' ? 'selected' : ''}>중지</option></select></div>
    </div>
    ${addressFields(row)}
    <div style="margin-top:14px"><label>메모</label><textarea name="memo">${escapeHtml(row.memo || '')}</textarea></div>`, {
    onSubmit: (data) => row.id ? api(`/customer-sites/${row.id}`, { method: 'PUT', body: JSON.stringify(data) }) : api('/customer-sites', { method: 'POST', body: JSON.stringify(data) })
  });
  bindAddressSearch();
}

async function renderProducts(el) {
  const q = state.cache.productQ || '';
  const rows = await api(`/products?q=${encodeURIComponent(q)}`);
  state.cache.products = rows;
  el.innerHTML = `
    <h1 class="page-title">제품/재고</h1>
    <p class="page-subtitle">안경테, 선글라스, 부속품, 자재 관련 제품 기준정보와 안전재고를 함께 관리합니다.</p>
    <div class="panel">
      <div class="toolbar"><div class="left"><input class="search" id="product-search" placeholder="SKU, 제품명, 브랜드, 모델, 색상, 바코드, 위치" value="${escapeHtml(q)}"/><button id="product-search-btn" class="secondary">검색</button></div><div class="right">${can('products.write') ? '<button id="product-add">제품 등록</button>' : ''}</div></div>
      ${table(['SKU','제품명','브랜드/모델','색상/사이즈','단가','현재','안전','부족','추천생산','상태','관리'], rows, (p) => `<tr><td>${escapeHtml(p.sku)}</td><td><strong>${escapeHtml(p.name)}</strong><br/><span class="muted">${escapeHtml(p.spec || p.category || '')}</span></td><td>${escapeHtml([p.brand, p.model_no].filter(Boolean).join(' / '))}</td><td>${escapeHtml([p.color_name || p.color_code, [p.size_eye, p.bridge_size, p.temple_length].filter(Boolean).join('-')].filter(Boolean).join(' / '))}</td><td class="money">${money(p.default_price)}</td><td class="num">${money(p.current_stock)}</td><td class="num">${money(p.safety_stock)}</td><td class="num">${money(p.shortage)}</td><td class="num">${money(p.suggested_qty)}</td><td>${statusBadge(p.status)}</td><td>${can('inventory.write') ? `<button class="small secondary" data-adjust="${p.id}">재고조정</button>` : ''} ${can('products.write') ? `<button class="small" data-edit="${p.id}">수정</button>` : ''}</td></tr>`)}
    </div>`;
  el.querySelector('#product-search-btn').addEventListener('click', () => { state.cache.productQ = el.querySelector('#product-search').value; renderProducts(el); });
  el.querySelector('#product-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('#product-search-btn').click(); });
  el.querySelector('#product-add')?.addEventListener('click', () => productModal());
  el.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => productModal(rows.find((r) => String(r.id) === btn.dataset.edit))));
  el.querySelectorAll('[data-adjust]').forEach((btn) => btn.addEventListener('click', () => stockModal(rows.find((r) => String(r.id) === btn.dataset.adjust))));
}

function productModal(row = {}) {
  openModal(row.id ? '제품 수정' : '제품 등록', `
    <div class="form-grid three">
      <div><label>SKU *</label><input name="sku" value="${escapeHtml(row.sku || '')}" placeholder="미입력 시 자동" /></div>
      <div><label>제품명 *</label><input name="name" required value="${escapeHtml(row.name || '')}" /></div>
      <div><label>규격</label><input name="spec" value="${escapeHtml(row.spec || '')}" /></div>
      <div><label>분류</label><input name="category" value="${escapeHtml(row.category || '')}" placeholder="안경테/선글라스/렌즈/부속품" /></div>
      <div><label>제품유형</label><input name="product_type" value="${escapeHtml(row.product_type || '')}" placeholder="완제품/부품/자재" /></div>
      <div><label>브랜드</label><input name="brand" value="${escapeHtml(row.brand || '')}" /></div>
      <div><label>모델번호</label><input name="model_no" value="${escapeHtml(row.model_no || '')}" /></div>
      <div><label>색상코드</label><input name="color_code" value="${escapeHtml(row.color_code || '')}" /></div>
      <div><label>색상명</label><input name="color_name" value="${escapeHtml(row.color_name || '')}" /></div>
      <div><label>렌즈폭</label><input name="size_eye" type="number" value="${row.size_eye || ''}" /></div>
      <div><label>브릿지</label><input name="bridge_size" type="number" value="${row.bridge_size || ''}" /></div>
      <div><label>다리길이</label><input name="temple_length" type="number" value="${row.temple_length || ''}" /></div>
      <div><label>프레임소재</label><input name="frame_material" value="${escapeHtml(row.frame_material || '')}" placeholder="TR/티타늄/메탈/아세테이트" /></div>
      <div><label>렌즈소재</label><input name="lens_material" value="${escapeHtml(row.lens_material || '')}" /></div>
      <div><label>성별/대상</label><input name="gender" value="${escapeHtml(row.gender || '')}" placeholder="공용/남성/여성/아동" /></div>
      <div><label>원산지</label><input name="origin" value="${escapeHtml(row.origin || '')}" /></div>
      <div><label>바코드</label><input name="barcode" value="${escapeHtml(row.barcode || '')}" /></div>
      <div><label>단위</label><input name="unit" value="${escapeHtml(row.unit || '개')}" /></div>
      <div><label>기본단가</label><input name="default_price" type="number" value="${row.default_price || 0}" /></div>
      <div><label>현재재고</label><input name="current_stock" type="number" value="${row.current_stock || 0}" /></div>
      <div><label>안전재고</label><input name="safety_stock" type="number" value="${row.safety_stock || 300}" /></div>
      <div><label>생산단위</label><select name="production_lot_size"><option value="300" ${row.production_lot_size == 300 ? 'selected' : ''}>300</option><option value="500" ${row.production_lot_size == 500 ? 'selected' : ''}>500</option><option value="1000" ${row.production_lot_size == 1000 ? 'selected' : ''}>1000</option></select></div>
      <div><label>인기도</label><select name="popularity_grade"><option value="A" ${row.popularity_grade === 'A' ? 'selected' : ''}>A 인기</option><option value="B" ${row.popularity_grade === 'B' ? 'selected' : ''}>B 보통</option><option value="C" ${!row.popularity_grade || row.popularity_grade === 'C' ? 'selected' : ''}>C 기본</option></select></div>
      <div><label>보관위치</label><input name="location" value="${escapeHtml(row.location || '')}" /></div>
      <div><label>상태</label><select name="status"><option value="active" ${row.status !== 'inactive' ? 'selected' : ''}>사용</option><option value="inactive" ${row.status === 'inactive' ? 'selected' : ''}>중지</option></select></div>
    </div>
    <div style="margin-top:14px"><label>메모</label><textarea name="memo">${escapeHtml(row.memo || '')}</textarea></div>`, {
    onSubmit: (data) => row.id ? api(`/products/${row.id}`, { method: 'PUT', body: JSON.stringify(data) }) : api('/products', { method: 'POST', body: JSON.stringify(data) })
  });
}

function stockModal(row) {
  openModal(`${row.name} 재고조정`, `
    <div class="notice">현재재고: ${money(row.current_stock)}개. 증가분은 양수, 감소분은 음수로 입력합니다.</div>
    <div class="form-grid two"><div><label>조정수량 *</label><input name="qty_change" type="number" required /></div><div><label>사유</label><input name="memo" placeholder="실사조정, 불량, 누락 등" /></div></div>`, {
    onSubmit: (data) => api(`/products/${row.id}/adjust-stock`, { method: 'POST', body: JSON.stringify(data) })
  });
}

async function renderOrders(el) {
  const q = state.cache.orderQ || '';
  const rows = await api(`/orders?q=${encodeURIComponent(q)}`);
  state.cache.orders = rows;
  el.innerHTML = `
    <h1 class="page-title">주문/출고</h1>
    <p class="page-subtitle">주문은 거래처의 납품처/지역과 발송구분(택배·영업방문·기타)을 함께 기록합니다.</p>
    <div class="panel">
      <div class="toolbar"><div class="left"><input class="search" id="order-search" placeholder="주문번호, 거래처, 상태" value="${escapeHtml(q)}"/><button id="order-search-btn" class="secondary">검색</button></div><div class="right">${can('orders.write') ? '<button id="order-add">주문 등록</button>' : ''}</div></div>
      ${table(['일자','주문번호','거래처/납품처','발송구분','박싱','상태','품목','금액','관리'], rows, (o) => `<tr><td>${fmtDate(o.order_date)}</td><td>${escapeHtml(o.order_no)}</td><td>${escapeHtml(o.customer_name)}<br/><span class="muted">${escapeHtml(o.site_name || o.region || '')}</span></td><td>${escapeHtml(o.delivery_type || o.delivery_method || '')}</td><td>${escapeHtml(o.delivery_group)}</td><td>${statusBadge(o.status)}</td><td class="num">${money(o.item_count)}</td><td class="money">${money(o.total_amount)}원</td><td class="action-cell"><button class="small secondary" data-view="${o.id}">상세</button> ${can('orders.write') ? `<button class="small" data-edit-order="${o.id}">수정</button><button class="small" data-ship="${o.id}">출고</button><button class="small secondary" data-cancel="${o.id}">취소</button><button class="small danger" data-delete-order="${o.id}">삭제</button>` : ''}</td></tr>`)}
    </div>`;
  el.querySelector('#order-search-btn').addEventListener('click', () => { state.cache.orderQ = el.querySelector('#order-search').value; renderOrders(el); });
  el.querySelector('#order-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('#order-search-btn').click(); });
  el.querySelector('#order-add')?.addEventListener('click', openOrderModal);
  el.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => openOrderDetail(btn.dataset.view)));
  el.querySelectorAll('[data-edit-order]').forEach((btn) => btn.addEventListener('click', () => openOrderEditModal(btn.dataset.editOrder)));
  el.querySelectorAll('[data-delete-order]').forEach((btn) => btn.addEventListener('click', async () => {
    const reason = window.prompt('주문 삭제 사유를 입력하세요. 수정이력에 영구 기록됩니다.');
    if (!reason?.trim()) return;
    try {
      await api(`/orders/${btn.dataset.deleteOrder}`, { method: 'DELETE', body: JSON.stringify({ delete_reason: reason.trim() }) });
      showToast('주문이 삭제 처리되었습니다.');
      renderOrders(el);
    } catch (error) { showToast(error.message, 'error'); }
  }));
  el.querySelectorAll('[data-ship]').forEach((btn) => btn.addEventListener('click', () => openShipModal(btn.dataset.ship)));
  el.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('주문을 취소하고 매출 미수금도 반대로 조정할까요?')) return;
    await api(`/orders/${btn.dataset.cancel}/status`, { method: 'PUT', body: JSON.stringify({ status: 'canceled' }) });
    showToast('취소되었습니다.');
    renderOrders(el);
  }));
}

async function openOrderModal(existingData = null) {
  const [customers, products, sites] = await Promise.all([api('/customers?limit=500'), api('/products?limit=500'), api('/customer-sites?limit=1000')]);
  const existing = existingData?.order || {};
  const isEdit = Boolean(existing.id);
  let items = isEdit
    ? existingData.items.map((item) => ({ product_id: item.product_id || '', item_name: item.item_name || '', spec: item.spec || '', quantity: Number(item.quantity || 1), unit_price: Number(item.unit_price || 0) }))
    : [{ product_id: products[0]?.id || '', quantity: 1, unit_price: products[0]?.default_price || 0 }];
  const productOptions = (selected) => `<option value="">직접입력</option>${optionList(products, selected, (p) => `${p.sku} · ${p.name} · 재고 ${p.current_stock}`)}`;
  const sourceOptions = [['phone','전화'],['kakao','카톡'],['sales_visit','영업방문'],['ecount','이카운트'],['other','기타']]
    .map(([value, label]) => `<option value="${value}" ${String(existing.source || 'phone') === value ? 'selected' : ''}>${label}</option>`).join('');
  const groupOptions = ['영업부','다빈치','기타'].map((value) => `<option ${String(existing.delivery_group || '기타') === value ? 'selected' : ''}>${value}</option>`).join('');
  const methodOptions = ['택배','영업방문','직접수령','기타'].map((value) => `<option ${String(existing.delivery_method || existing.delivery_type || '택배') === value ? 'selected' : ''}>${value}</option>`).join('');

  openModal(isEdit ? `주문 수정 ${existing.order_no}` : '주문 등록', `
    <div class="form-grid three">
      <div><label>거래처 *</label><select name="customer_id" id="order-customer" required><option value="">선택</option>${optionList(customers, existing.customer_id || '')}</select></div>
      <div><label>납품처/지역</label><select name="customer_site_id" id="order-site">${customerSiteOptions(sites, existing.customer_site_id || '', existing.customer_id || '')}</select></div>
      <div><label>발송구분</label><select name="delivery_type" id="order-delivery-type">${deliveryTypeOptions(existing.delivery_type || '택배')}</select></div>
      <div><label>주문일</label><input name="order_date" type="date" value="${fmtDate(existing.order_date) || today()}" /></div>
      <div><label>접수경로</label><select name="source">${sourceOptions}</select></div>
      <div><label>박싱구분</label><select name="delivery_group">${groupOptions}</select></div>
      <div><label>배송방법</label><select name="delivery_method">${methodOptions}</select></div>
      <div><label>부가세</label><input name="vat_amount" type="number" value="${Number(existing.vat_amount || 0)}" /></div>
      ${isEdit ? '<div><label>수정 사유</label><input name="change_reason" required placeholder="잘못 입력된 항목 수정 등" /></div>' : ''}
    </div>
    <div style="margin-top:16px"><label>품목</label><div id="order-items"></div><button type="button" class="secondary small" id="add-item">품목 추가</button></div>
    <div style="margin-top:14px"><label>메모</label><textarea name="memo">${escapeHtml(existing.memo || '')}</textarea></div>`, {
    submitText: isEdit ? '수정 저장' : '주문 저장',
    onSubmit: (data) => {
      const formItems = [...modalRoot.querySelectorAll('.item-row')].map((row) => ({
        product_id: row.querySelector('[name="product_id"]').value || null,
        item_name: row.querySelector('[name="item_name"]').value || null,
        spec: row.querySelector('[name="spec"]').value || null,
        quantity: Number(row.querySelector('[name="quantity"]').value || 0),
        unit_price: Number(row.querySelector('[name="unit_price"]').value || 0)
      })).filter((item) => item.product_id || item.item_name);
      return api(isEdit ? `/orders/${existing.id}` : '/orders', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify({ ...data, items: formItems }) });
    }
  });

  const customerSelect = modalRoot.querySelector('#order-customer');
  const siteSelect = modalRoot.querySelector('#order-site');
  const deliverySelect = modalRoot.querySelector('#order-delivery-type');
  function refreshSites(preserveSelection = false) {
    const customerId = customerSelect.value;
    const selected = preserveSelection ? siteSelect.value : '';
    siteSelect.innerHTML = customerSiteOptions(sites, selected, customerId);
    const firstSite = sites.find((site) => String(site.customer_id) === String(customerId));
    if (!selected && firstSite) {
      siteSelect.value = firstSite.id;
      deliverySelect.value = firstSite.default_delivery_type || '택배';
    }
  }
  customerSelect.addEventListener('change', () => refreshSites(false));
  siteSelect.addEventListener('change', () => {
    const selectedSite = sites.find((site) => String(site.id) === String(siteSelect.value));
    if (selectedSite?.default_delivery_type) deliverySelect.value = selectedSite.default_delivery_type;
  });

  function renderItemRows() {
    const wrap = modalRoot.querySelector('#order-items');
    wrap.innerHTML = items.map((item, idx) => {
      const product = products.find((p) => String(p.id) === String(item.product_id));
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price ?? product?.default_price ?? 0);
      return `<div class="item-row" data-idx="${idx}">
        <div><label>제품</label><select name="product_id">${productOptions(item.product_id)}</select><input name="item_name" placeholder="직접입력 품목명" value="${escapeHtml(product ? product.name : item.item_name || '')}" /><input name="spec" placeholder="규격" value="${escapeHtml(item.spec || product?.spec || '')}" /></div>
        <div><label>수량</label><input name="quantity" type="number" value="${qty || 1}" /></div>
        <div><label>단가</label><input name="unit_price" type="number" value="${price}" /></div>
        <div><label>금액</label><input readonly value="${money((qty || 0) * price)}" /></div>
        <button type="button" class="danger small" data-remove="${idx}">삭제</button>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[name="product_id"]').forEach((select) => select.addEventListener('change', (event) => {
      const row = event.target.closest('.item-row');
      const idx = Number(row.dataset.idx);
      const product = products.find((p) => String(p.id) === event.target.value);
      items[idx].product_id = event.target.value;
      items[idx].item_name = product?.name || '';
      items[idx].spec = product?.spec || '';
      items[idx].unit_price = Number(product?.default_price || 0);
      renderItemRows();
    }));
    wrap.querySelectorAll('[name="quantity"], [name="unit_price"], [name="item_name"], [name="spec"]').forEach((input) => input.addEventListener('input', (event) => {
      const row = event.target.closest('.item-row');
      const idx = Number(row.dataset.idx);
      items[idx].quantity = Number(row.querySelector('[name="quantity"]').value || 0);
      items[idx].unit_price = Number(row.querySelector('[name="unit_price"]').value || 0);
      items[idx].item_name = row.querySelector('[name="item_name"]').value;
      items[idx].spec = row.querySelector('[name="spec"]').value;
    }));
    wrap.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      items.splice(Number(button.dataset.remove), 1);
      if (items.length === 0) items.push({ product_id: '', quantity: 1, unit_price: 0 });
      renderItemRows();
    }));
  }
  modalRoot.querySelector('#add-item').addEventListener('click', () => { items.push({ product_id: '', quantity: 1, unit_price: 0 }); renderItemRows(); });
  renderItemRows();
}

async function openOrderEditModal(id) {
  try {
    const data = await api(`/orders/${id}`);
    if (data.shipments?.length) {
      showToast('출고 이력이 있는 주문은 화면에서 직접 수정할 수 없습니다.', 'error');
      return;
    }
    await openOrderModal(data);
  } catch (error) { showToast(error.message, 'error'); }
}

async function openOrderDetail(id) {
  const data = await api(`/orders/${id}`);
  openModal(`주문 상세 ${data.order.order_no}`, `
    <div class="form-grid three"><div><label>거래처</label><div>${escapeHtml(data.order.customer_name)}</div></div><div><label>납품처/지역</label><div>${escapeHtml(data.order.site_name || data.order.region || '')}</div></div><div><label>발송구분</label><div>${escapeHtml(data.order.delivery_type || '')}</div></div><div><label>상태</label><div>${statusBadge(data.order.status)}</div></div><div><label>금액</label><div>${money(data.order.total_amount)}원</div></div></div>
    <h3>품목</h3>${table(['품목','수량','단가','금액','출고'], data.items, (i) => `<tr><td>${escapeHtml(i.item_name)}<br/><span class="muted">${escapeHtml(i.spec || i.sku || '')}</span></td><td class="num">${money(i.quantity)}</td><td class="money">${money(i.unit_price)}</td><td class="money">${money(i.amount)}</td><td class="num">${money(i.shipped_qty)}</td></tr>`)}
    <h3>출고</h3>${table(['일시','발송구분','박싱','방법','택배사','송장','상태'], data.shipments, (s) => `<tr><td>${fmtDate(s.shipped_at)}</td><td>${escapeHtml(s.delivery_type || '')}</td><td>${escapeHtml(s.delivery_group)}</td><td>${escapeHtml(s.delivery_method)}</td><td>${escapeHtml(s.carrier || '')}</td><td>${escapeHtml(s.invoice_no || '')}</td><td>${statusBadge(s.status)}</td></tr>`)}
  `);
}

function openShipModal(id) {
  openModal('출고/배송 처리', `
    <div class="form-grid three">
      <div><label>발송구분</label><select name="delivery_type">${deliveryTypeOptions('택배')}</select></div>
      <div><label>박싱구분</label><select name="delivery_group"><option>영업부</option><option>다빈치</option><option selected>기타</option></select></div>
      <div><label>배송방법</label><select name="delivery_method"><option selected>택배</option><option>영업방문</option><option>직접수령</option></select></div>
      <div><label>택배사</label><input name="carrier" placeholder="CJ, 로젠 등" /></div>
      <div><label>송장번호</label><input name="invoice_no" /></div>
      <div><label>박스번호</label><input name="box_no" /></div>
      <div><label>확인자</label><input name="receiver_name" /></div>
    </div><div style="margin-top:14px"><label>메모</label><input name="confirmation_note" /></div>`, {
    submitText: '출고 처리',
    onSubmit: (data) => api(`/orders/${id}/ship`, { method: 'POST', body: JSON.stringify(data) })
  });
}

async function renderPayments(el) {
  const [payments, customers, sites, byDelivery] = await Promise.all([
    api('/payments'), api('/customers?limit=500'), api('/customer-sites?limit=1000'), api('/receivables/by-delivery')
  ]);
  el.innerHTML = `
    <h1 class="page-title">수금/미수금</h1>
    <p class="page-subtitle">수금도 거래처·납품처·발송구분(택배/영업방문/기타) 단위로 기록하여 추후 미수금을 구분 관리합니다.</p>
    <div class="panel">
      ${can('payments.write') ? `<h3>수금 등록</h3><form id="payment-form" class="form-grid three">
        <div><label>거래처 *</label><select name="customer_id" id="payment-customer" required><option value="">선택</option>${optionList(customers, '')}</select></div>
        <div><label>납품처/지역</label><select name="customer_site_id" id="payment-site">${customerSiteOptions(sites)}</select></div>
        <div><label>발송구분</label><select name="delivery_type" id="payment-delivery-type">${deliveryTypeOptions('택배')}</select></div>
        <div><label>수금일</label><input name="payment_date" type="date" value="${today()}" /></div>
        <div><label>방법</label><select name="method"><option value="card">카드</option><option value="bank">송금</option><option value="cash">현금</option></select></div>
        <div><label>금액 *</label><input name="amount" type="number" required /></div>
        <div><label>카드사/은행</label><input name="card_company" /></div>
        <div><label>승인번호/메모</label><input name="approval_no" /></div>
        <div style="grid-column:1/-1"><label>비고</label><input name="memo" /></div>
        <div class="form-actions" style="grid-column:1/-1"><button type="submit">수금 저장</button></div></form>` : ''}
    </div>
    <div class="panel"><h3>발송구분별 미수금</h3>${table(['거래처','납품처','발송구분','매출','수금','미수'], byDelivery, (r) => `<tr><td>${escapeHtml(r.customer_name)}</td><td>${escapeHtml(r.site_name || '')}</td><td>${escapeHtml(r.delivery_type)}</td><td class="money">${money(r.sales_amount)}원</td><td class="money">${money(r.payment_amount)}원</td><td class="money">${money(r.receivable_balance)}원</td></tr>`)}</div>
    <div class="panel"><h3>최근 수금</h3>${table(['일자','수금번호','거래처/납품처','발송구분','방법','금액','승인/비고','관리'], payments, (p) => `<tr><td>${fmtDate(p.payment_date)}</td><td>${escapeHtml(p.payment_no)}</td><td>${escapeHtml(p.customer_name)}<br/><span class="muted">${escapeHtml(p.site_name || p.region || '')}</span></td><td>${escapeHtml(p.delivery_type || '')}</td><td>${statusBadge(p.method)}</td><td class="money">${money(p.amount)}원</td><td>${escapeHtml(p.approval_no || p.memo || '')}</td><td class="action-cell">${can('payments.write') ? `<button class="small" data-edit-payment="${p.id}">수정</button><button class="small danger" data-delete-payment="${p.id}">삭제</button>` : ''}</td></tr>`)}</div>`;
  const customerSelect = el.querySelector('#payment-customer');
  const siteSelect = el.querySelector('#payment-site');
  const deliverySelect = el.querySelector('#payment-delivery-type');
  function refreshPaymentSites() {
    const customerId = customerSelect.value;
    siteSelect.innerHTML = customerSiteOptions(sites, '', customerId);
    const firstSite = sites.find((site) => String(site.customer_id) === String(customerId));
    if (firstSite) {
      siteSelect.value = firstSite.id;
      deliverySelect.value = firstSite.default_delivery_type || '택배';
    }
  }
  customerSelect?.addEventListener('change', refreshPaymentSites);
  siteSelect?.addEventListener('change', () => {
    const selectedSite = sites.find((site) => String(site.id) === String(siteSelect.value));
    if (selectedSite?.default_delivery_type) deliverySelect.value = selectedSite.default_delivery_type;
  });
  el.querySelector('#payment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/payments', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) });
      showToast('수금 등록 완료');
      renderPayments(el);
    } catch (error) { showToast(error.message, 'error'); }
  });
  el.querySelectorAll('[data-edit-payment]').forEach((button) => button.addEventListener('click', () => {
    const row = payments.find((payment) => String(payment.id) === String(button.dataset.editPayment));
    if (row) openPaymentEditModal(row, customers, sites);
  }));
  el.querySelectorAll('[data-delete-payment]').forEach((button) => button.addEventListener('click', async () => {
    const reason = window.prompt('수금 삭제 사유를 입력하세요. 수정이력에 영구 기록됩니다.');
    if (!reason?.trim()) return;
    try {
      await api(`/payments/${button.dataset.deletePayment}`, { method: 'DELETE', body: JSON.stringify({ delete_reason: reason.trim() }) });
      showToast('수금이 삭제 처리되었습니다.');
      renderPayments(el);
    } catch (error) { showToast(error.message, 'error'); }
  }));
}

function openPaymentEditModal(row, customers, sites) {
  const methods = [['card','카드'],['bank','송금'],['cash','현금'],['other','기타']]
    .map(([value, label]) => `<option value="${value}" ${String(row.method || 'card') === value ? 'selected' : ''}>${label}</option>`).join('');
  openModal(`수금 수정 ${row.payment_no}`, `
    <div class="form-grid three">
      <div><label>거래처 *</label><select name="customer_id" id="edit-payment-customer" required>${optionList(customers, row.customer_id)}</select></div>
      <div><label>납품처/지역</label><select name="customer_site_id" id="edit-payment-site">${customerSiteOptions(sites, row.customer_site_id || '', row.customer_id)}</select></div>
      <div><label>발송구분</label><select name="delivery_type" id="edit-payment-delivery">${deliveryTypeOptions(row.delivery_type || '택배')}</select></div>
      <div><label>수금일</label><input name="payment_date" type="date" value="${fmtDate(row.payment_date)}" /></div>
      <div><label>방법</label><select name="method">${methods}</select></div>
      <div><label>금액 *</label><input name="amount" type="number" value="${Number(row.amount || 0)}" required /></div>
      <div><label>카드사</label><input name="card_company" value="${escapeHtml(row.card_company || '')}" /></div>
      <div><label>승인번호</label><input name="approval_no" value="${escapeHtml(row.approval_no || '')}" /></div>
      <div><label>은행명</label><input name="bank_name" value="${escapeHtml(row.bank_name || '')}" /></div>
      <div style="grid-column:1/-1"><label>수정 사유 *</label><input name="change_reason" required placeholder="잘못 입력된 금액 수정 등" /></div>
      <div style="grid-column:1/-1"><label>비고</label><input name="memo" value="${escapeHtml(row.memo || '')}" /></div>
    </div>`, {
    submitText: '수정 저장',
    onSubmit: (data) => api(`/payments/${row.id}`, { method: 'PUT', body: JSON.stringify(data) })
  });
  const customerSelect = modalRoot.querySelector('#edit-payment-customer');
  const siteSelect = modalRoot.querySelector('#edit-payment-site');
  const deliverySelect = modalRoot.querySelector('#edit-payment-delivery');
  customerSelect?.addEventListener('change', () => {
    siteSelect.innerHTML = customerSiteOptions(sites, '', customerSelect.value);
    const first = sites.find((site) => String(site.customer_id) === String(customerSelect.value));
    if (first) { siteSelect.value = first.id; deliverySelect.value = first.default_delivery_type || '택배'; }
  });
  siteSelect?.addEventListener('change', () => {
    const selected = sites.find((site) => String(site.id) === String(siteSelect.value));
    if (selected?.default_delivery_type) deliverySelect.value = selected.default_delivery_type;
  });
}

async function renderProduction(el) {
  const [recommendations, orders, products] = await Promise.all([
    api('/production-recommendations'), api('/production-orders'), api('/products?limit=500')
  ]);
  el.innerHTML = `
    <h1 class="page-title">생산지시</h1>
    <p class="page-subtitle">안전재고 부족분을 확인하고 1000/500/300 단위 기준으로 사람이 최종 지시합니다.</p>
    <div class="panel"><div class="toolbar"><h3>생산 추천</h3>${can('production.write') ? '<button id="production-add">생산지시 등록</button>' : ''}</div>
      ${table(['SKU','제품명','현재','안전','부족','추천','관리'], recommendations, (p) => `<tr><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(p.name)}</td><td class="num">${money(p.current_stock)}</td><td class="num">${money(p.safety_stock)}</td><td class="num">${money(p.shortage)}</td><td class="num">${money(p.suggested_qty)}</td><td>${can('production.write') ? `<button class="small" data-create-po="${p.id}" data-qty="${p.suggested_qty}">지시</button>` : ''}</td></tr>`)}
    </div>
    <div class="panel"><h3>생산지시 목록</h3>${table(['지시번호','제품','계획','입고','상태','납기','판단근거','관리'], orders, (o) => `<tr><td>${escapeHtml(o.production_no)}</td><td>${escapeHtml(o.product_name)}<br/><span class="muted">${escapeHtml(o.sku)}</span></td><td class="num">${money(o.planned_qty)}</td><td class="num">${money(o.received_qty)}</td><td>${statusBadge(o.status)}</td><td>${fmtDate(o.due_date)}</td><td>${escapeHtml(o.decision_reason || '')}</td><td>${can('production.write') && o.status !== 'completed' ? `<button class="small" data-receive="${o.id}">입고</button>` : ''}</td></tr>`)}</div>`;
  el.querySelector('#production-add')?.addEventListener('click', () => productionModal(products));
  el.querySelectorAll('[data-create-po]').forEach((btn) => btn.addEventListener('click', () => productionModal(products, { product_id: btn.dataset.createPo, planned_qty: btn.dataset.qty })));
  el.querySelectorAll('[data-receive]').forEach((btn) => btn.addEventListener('click', () => receiveModal(btn.dataset.receive)));
}

function productionModal(products, preset = {}) {
  openModal('생산지시 등록', `
    <div class="form-grid two">
      <div><label>제품 *</label><select name="product_id" required><option value="">선택</option>${optionList(products, preset.product_id, (p) => `${p.sku} · ${p.name} · 현재 ${p.current_stock}/안전 ${p.safety_stock}`)}</select></div>
      <div><label>생산수량</label><input name="planned_qty" type="number" value="${preset.planned_qty || ''}" placeholder="미입력 시 추천수량" /></div>
      <div><label>우선순위</label><select name="priority"><option value="normal">보통</option><option value="high">긴급</option><option value="low">낮음</option></select></div>
      <div><label>납기</label><input name="due_date" type="date" /></div>
    </div>
    <div style="margin-top:14px"><label>판단근거</label><input name="decision_reason" placeholder="사람이 최종 판단한 근거" /></div>
    <div style="margin-top:14px"><label>메모</label><textarea name="memo"></textarea></div>`, {
    onSubmit: (data) => api('/production-orders', { method: 'POST', body: JSON.stringify(data) })
  });
}

function receiveModal(id) {
  openModal('생산입고 처리', `<div class="form-grid two"><div><label>입고수량 *</label><input name="qty_received" type="number" required /></div><div><label>입고일시</label><input name="received_at" type="datetime-local" /></div></div><div style="margin-top:14px"><label>메모</label><input name="memo" /></div>`, {
    submitText: '입고 처리',
    onSubmit: (data) => api(`/production-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(data) })
  });
}

async function renderAudit(el) {
  const tableName = state.cache.auditTable || '';
  const rows = await api(`/audit-logs?table_name=${encodeURIComponent(tableName)}&limit=100`);
  el.innerHTML = `
    <h1 class="page-title">수정이력</h1>
    <p class="page-subtitle">자료가 수정되면 이전값과 이후값을 함께 저장하여 추적합니다.</p>
    <div class="panel"><div class="toolbar"><div class="left"><select id="audit-table"><option value="">전체 테이블</option>${['customers','products','sales_orders','payments','production_orders','inventory_transactions','users'].map((t) => `<option value="${t}" ${tableName === t ? 'selected' : ''}>${t}</option>`).join('')}</select><button id="audit-search" class="secondary">조회</button></div></div>
      ${table(['시각','테이블','ID','작업','사용자','사유/IP','이전/이후'], rows, (r) => `<tr><td>${escapeHtml(String(r.changed_at || '').slice(0, 19).replace('T',' '))}</td><td>${escapeHtml(r.table_name)}</td><td>${escapeHtml(r.record_id)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.full_name || r.username || '')}</td><td>${escapeHtml(r.change_reason || '')}<br/><span class="muted">${escapeHtml(r.ip_address || '')}</span></td><td><details><summary>보기</summary><div class="json-box">이전\n${escapeHtml(JSON.stringify(r.before_data, null, 2))}\n\n이후\n${escapeHtml(JSON.stringify(r.after_data, null, 2))}</div></details></td></tr>`)}
    </div>`;
  el.querySelector('#audit-search').addEventListener('click', () => { state.cache.auditTable = el.querySelector('#audit-table').value; renderAudit(el); });
}

async function renderMasters(el) {
  const [groups, items, materials] = await Promise.all([
    api('/code-groups'), api('/code-items'), api('/materials?limit=500')
  ]);
  const groupById = Object.fromEntries(groups.map((g) => [String(g.id), g]));
  el.innerHTML = `
    <h1 class="page-title">기준정보</h1>
    <p class="page-subtitle">거래처·제품·자재·박싱·배송·수금 등 공통 기준정보를 관리합니다.</p>
    <div class="panel"><div class="toolbar"><h3>코드그룹</h3>${can('masters.write') ? '<button id="group-add">코드그룹 등록</button>' : ''}</div>
      ${table(['그룹코드','그룹명','설명','사용','관리'], groups, (g) => `<tr><td>${escapeHtml(g.group_code)}</td><td>${escapeHtml(g.group_name)}</td><td>${escapeHtml(g.description || '')}</td><td>${g.is_active ? '사용' : '중지'}</td><td>${can('masters.write') ? `<button class="small" data-edit-group="${g.id}">수정</button>` : ''}</td></tr>`)}</div>
    <div class="panel"><div class="toolbar"><h3>코드항목</h3>${can('masters.write') ? '<button id="item-add">코드항목 등록</button>' : ''}</div>
      ${table(['그룹','코드','명칭','값','정렬','사용','관리'], items, (i) => `<tr><td>${escapeHtml(i.group_name)}</td><td>${escapeHtml(i.item_code)}</td><td>${escapeHtml(i.item_name)}</td><td>${escapeHtml(i.item_value || '')}</td><td class="num">${money(i.sort_order)}</td><td>${i.is_active ? '사용' : '중지'}</td><td>${can('masters.write') ? `<button class="small" data-edit-item="${i.id}">수정</button>` : ''}</td></tr>`)}</div>
    <div class="panel"><div class="toolbar"><h3>제품/자재 기준정보</h3>${can('masters.write') ? '<button id="material-add">자재 등록</button>' : ''}</div>
      ${table(['자재코드','자재명','구분','단위','매입가','현재','안전','거래처','위치','상태','관리'], materials, (m) => `<tr><td>${escapeHtml(m.material_code)}</td><td>${escapeHtml(m.material_name)}</td><td>${escapeHtml(m.material_type || '')}</td><td>${escapeHtml(m.unit)}</td><td class="money">${money(m.default_purchase_price)}</td><td class="num">${money(m.current_stock)}</td><td class="num">${money(m.safety_stock)}</td><td>${escapeHtml(m.supplier_name || '')}</td><td>${escapeHtml(m.location || '')}</td><td>${statusBadge(m.status)}</td><td>${can('masters.write') ? `<button class="small" data-edit-material="${m.id}">수정</button>` : ''}</td></tr>`)}</div>`;
  el.querySelector('#group-add')?.addEventListener('click', () => codeGroupModal());
  el.querySelectorAll('[data-edit-group]').forEach((btn) => btn.addEventListener('click', () => codeGroupModal(groups.find((g) => String(g.id) === btn.dataset.editGroup))));
  el.querySelector('#item-add')?.addEventListener('click', () => codeItemModal(groups));
  el.querySelectorAll('[data-edit-item]').forEach((btn) => btn.addEventListener('click', () => codeItemModal(groups, items.find((i) => String(i.id) === btn.dataset.editItem))));
  el.querySelector('#material-add')?.addEventListener('click', () => materialModal());
  el.querySelectorAll('[data-edit-material]').forEach((btn) => btn.addEventListener('click', () => materialModal(materials.find((m) => String(m.id) === btn.dataset.editMaterial))));
}

function codeGroupModal(row = {}) {
  openModal(row.id ? '코드그룹 수정' : '코드그룹 등록', `<div class="form-grid two"><div><label>그룹코드 *</label><input name="group_code" ${row.id ? 'readonly' : 'required'} value="${escapeHtml(row.group_code || '')}" /></div><div><label>그룹명 *</label><input name="group_name" required value="${escapeHtml(row.group_name || '')}" /></div><div><label>정렬</label><input name="sort_order" type="number" value="${row.sort_order || 0}" /></div><div><label>사용</label><select name="is_active"><option value="1" ${row.is_active !== 0 ? 'selected' : ''}>사용</option><option value="0" ${row.is_active === 0 ? 'selected' : ''}>중지</option></select></div></div><div style="margin-top:14px"><label>설명</label><input name="description" value="${escapeHtml(row.description || '')}" /></div>`, {
    onSubmit: (data) => { data.is_active = data.is_active === '1'; return row.id ? api(`/code-groups/${row.id}`, { method: 'PUT', body: JSON.stringify(data) }) : api('/code-groups', { method: 'POST', body: JSON.stringify(data) }); }
  });
}

function codeItemModal(groups, row = {}) {
  openModal(row.id ? '코드항목 수정' : '코드항목 등록', `<div class="form-grid two"><div><label>그룹 *</label><select name="group_id" required>${optionList(groups, row.group_id, (g) => `${g.group_code} · ${g.group_name}`)}</select></div><div><label>항목코드 *</label><input name="item_code" required value="${escapeHtml(row.item_code || '')}" /></div><div><label>항목명 *</label><input name="item_name" required value="${escapeHtml(row.item_name || '')}" /></div><div><label>값</label><input name="item_value" value="${escapeHtml(row.item_value || '')}" /></div><div><label>정렬</label><input name="sort_order" type="number" value="${row.sort_order || 0}" /></div><div><label>사용</label><select name="is_active"><option value="1" ${row.is_active !== 0 ? 'selected' : ''}>사용</option><option value="0" ${row.is_active === 0 ? 'selected' : ''}>중지</option></select></div></div><div style="margin-top:14px"><label>메모</label><input name="memo" value="${escapeHtml(row.memo || '')}" /></div>`, {
    onSubmit: (data) => { data.is_active = data.is_active === '1'; return row.id ? api(`/code-items/${row.id}`, { method: 'PUT', body: JSON.stringify(data) }) : api('/code-items', { method: 'POST', body: JSON.stringify(data) }); }
  });
}

function materialModal(row = {}) {
  openModal(row.id ? '자재 수정' : '자재 등록', `<div class="form-grid three"><div><label>자재코드 *</label><input name="material_code" value="${escapeHtml(row.material_code || '')}" placeholder="미입력 시 자동" /></div><div><label>자재명 *</label><input name="material_name" required value="${escapeHtml(row.material_name || '')}" /></div><div><label>구분</label><input name="material_type" value="${escapeHtml(row.material_type || '')}" placeholder="프레임소재/렌즈/부속품/포장재" /></div><div><label>단위</label><input name="unit" value="${escapeHtml(row.unit || '개')}" /></div><div><label>기본매입가</label><input name="default_purchase_price" type="number" value="${row.default_purchase_price || 0}" /></div><div><label>현재재고</label><input name="current_stock" type="number" value="${row.current_stock || 0}" /></div><div><label>안전재고</label><input name="safety_stock" type="number" value="${row.safety_stock || 0}" /></div><div><label>공급처</label><input name="supplier_name" value="${escapeHtml(row.supplier_name || '')}" /></div><div><label>위치</label><input name="location" value="${escapeHtml(row.location || '')}" /></div><div><label>상태</label><select name="status"><option value="active" ${row.status !== 'inactive' ? 'selected' : ''}>사용</option><option value="inactive" ${row.status === 'inactive' ? 'selected' : ''}>중지</option></select></div></div><div style="margin-top:14px"><label>메모</label><textarea name="memo">${escapeHtml(row.memo || '')}</textarea></div>`, {
    onSubmit: (data) => row.id ? api(`/materials/${row.id}`, { method: 'PUT', body: JSON.stringify(data) }) : api('/materials', { method: 'POST', body: JSON.stringify(data) })
  });
}

async function renderImports(el) {
  const batches = await api('/imports/batches?limit=100');
  el.innerHTML = `
    <h1 class="page-title">엑셀가져오기</h1>
    <p class="page-subtitle">지정 엑셀 3종을 업로드하면 거래처·판매·수금 자료를 자동 판별해 등록합니다. 누락된 발송구분·수금방법은 기타로 기록되므로 등록 후 확인하세요.</p>
    <div class="panel"><h3>엑셀 파일 업로드</h3>
      <div class="upload-guide">
        <strong>우선 업로드할 파일</strong>
        <ol><li>거래처 정보.xls</li><li>판매처 원장 상세.xls</li><li>일별영업현황.xls</li></ol>
        <div class="muted">기존 파일명(거래처원장.xls, 기간별 판매명세서 상세.xls, 수금(미수금)명세서.xls, 거래처별 영업현황 거래내역.xls)도 계속 지원합니다.</div>
      </div>
      <form id="excel-import-form"><input type="file" name="files" multiple accept=".xls,.xlsx" required /><div class="form-actions"><button type="submit">선택한 엑셀 등록</button></div></form><div id="import-result"></div></div>
    <div class="panel"><h3>최근 가져오기 이력</h3>${table(['일시','파일명','유형','상태','전체','등록','수정','건너뜀','오류','사용자'], batches, (b) => `<tr><td>${escapeHtml(String(b.imported_at || '').slice(0,19).replace('T',' '))}</td><td>${escapeHtml(b.file_name)}</td><td>${escapeHtml(b.file_type || '')}</td><td>${statusBadge(b.status)}</td><td class="num">${money(b.total_rows)}</td><td class="num">${money(b.inserted_rows)}</td><td class="num">${money(b.updated_rows)}</td><td class="num">${money(b.skipped_rows)}</td><td class="num">${money(b.error_rows)}</td><td>${escapeHtml(b.imported_by_name || '')}</td></tr>`)}</div>`;
  el.querySelector('#excel-import-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      const result = await api('/imports/excel', { method: 'POST', body: fd });
      document.getElementById('import-result').innerHTML = `<div class="success"><strong>가져오기 완료</strong>${result.map((item) => `<div>${escapeHtml(item.file_name)} · 유형 ${escapeHtml(item.file_type)} · 등록 ${money(item.inserted)} · 수정 ${money(item.updated)} · 건너뜀 ${money(item.skipped)} · 오류 ${money(item.errors)}</div>`).join('')}</div>`;
      showToast('엑셀 가져오기가 완료되었습니다.');
      renderImports(el);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function renderUsers(el) {
  const [users, meta] = await Promise.all([api('/users'), api('/meta')]);
  const roles = meta.roles;
  el.innerHTML = `
    <h1 class="page-title">사용자관리</h1>
    <p class="page-subtitle">관리자, 영업, 경리/수금, 생산/재고, 조회전용 권한을 부여합니다.</p>
    <div class="panel"><div class="toolbar"><h3>사용자</h3><button id="user-add">사용자 등록</button></div>
      ${table(['아이디','이름','이메일','권한','상태','최근로그인','관리'], users, (u) => `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.full_name)}</td><td>${escapeHtml(u.email || '')}</td><td>${escapeHtml(u.role_label)}</td><td>${u.is_active ? statusBadge('active') : statusBadge('inactive')}</td><td>${escapeHtml(String(u.last_login_at || '').slice(0, 19).replace('T',' '))}</td><td><button class="small" data-edit-user="${u.id}">수정</button></td></tr>`)}
    </div>`;
  el.querySelector('#user-add').addEventListener('click', () => userModal(roles));
  el.querySelectorAll('[data-edit-user]').forEach((btn) => btn.addEventListener('click', () => userModal(roles, users.find((u) => String(u.id) === btn.dataset.editUser))));
}

function userModal(roles, row = {}) {
  openModal(row.id ? '사용자 수정' : '사용자 등록', `
    <div class="form-grid two">
      <div><label>아이디 *</label><input name="username" ${row.id ? 'readonly' : 'required'} value="${escapeHtml(row.username || '')}" /></div>
      <div><label>이름 *</label><input name="full_name" required value="${escapeHtml(row.full_name || '')}" /></div>
      <div><label>이메일</label><input name="email" value="${escapeHtml(row.email || '')}" /></div>
      <div><label>전화</label><input name="phone" value="${escapeHtml(row.phone || '')}" /></div>
      <div><label>권한 *</label><select name="role_id" required>${optionList(roles, row.role_id, (r) => r.label)}</select></div>
      <div><label>상태</label><select name="is_active"><option value="1" ${row.is_active !== 0 ? 'selected' : ''}>사용</option><option value="0" ${row.is_active === 0 ? 'selected' : ''}>중지</option></select></div>
      <div style="grid-column:1/-1"><label>${row.id ? '새 비밀번호(변경 시만 입력)' : '비밀번호 *'}</label><input name="password" type="password" ${row.id ? '' : 'required'} /></div>
    </div>`, {
    onSubmit: (data) => {
      data.is_active = data.is_active === '1';
      if (row.id) {
        delete data.username;
        if (!data.password) delete data.password;
        return api(`/users/${row.id}`, { method: 'PUT', body: JSON.stringify(data) });
      }
      return api('/users', { method: 'POST', body: JSON.stringify(data) });
    }
  });
}

const renderers = {
  dashboard: renderDashboard,
  customers: renderCustomers,
  products: renderProducts,
  masters: renderMasters,
  orders: renderOrders,
  payments: renderPayments,
  production: renderProduction,
  imports: renderImports,
  audit: renderAudit,
  users: renderUsers
};

(async function boot() {
  if (!state.token) return renderLogin();
  try {
    state.user = await api('/auth/me');
    await showPage(state.page, true);
  } catch (error) {
    renderLogin();
  }
})();

// MT_OPTICS_UPLOAD_UI_LOADER_V157
import("/excel-upload-ui-fix.js?v=157").catch(console.error);

// MT_OPTICS_FINAL_FEATURES_LOADER_V317
import("/final-enhancements-v317.js?v=317").catch(console.error);
