// MT_OPTICS_FINAL_FEATURES_V309
(() => {
  const VERSION = '3.0.9';
  const API_BASE = localStorage.getItem('mt_api_base') || '/api';
  const cache = {
    user: null,
    customers: null,
    sites: null,
    products: null,
    carriers: null,
    dateRange: null,
    sitesByCustomer: new Map()
  };
  const uiState = {
    customerSearch: '',
    customerPage: 1,
    customerPageSize: Number(localStorage.getItem('mt_customer_page_size') || 20),
    customerTotal: 0,
    highlightCustomerId: null,
    orderFilters: {
      q: '',
      date_from: '',
      date_to: today(),
      customer_q: '',
      customer_id: '',
      delivery_type: '',
      status: ''
    },
    // 최근 수금 목록 조회 조건
    paymentFilters: {
      customer_q: '',
      customer_id: '',
      site_id: '',
      delivery_type: '',
      date_from: '',
      date_to: today()
    },
    // 발송구분별 미수금 전용 조회 조건
    receivableFilters: {
      customer_q: '',
      customer_id: '',
      site_id: '',
      delivery_type: ''
    },
    paymentReceivablesLoaded: false
  };

  let renderTimer = null;
  let activeRenderToken = 0;

  function today() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  function monthAgo() {
    const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 10);
  }

  function fmtDate(value) {
    return value ? String(value).slice(0, 10) : '';
  }

  function parseWonNumber(value) {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value).replace(/,/g, '').replace(/원/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function integerWon(value) {
    const parsed = parseWonNumber(value);
    return parsed < 0 ? Math.ceil(parsed) : Math.floor(parsed);
  }

  function money(value) {
    return integerWon(value).toLocaleString('ko-KR');
  }

  function wonInputValue(value) {
    return String(integerWon(value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeText(value) {
    return String(value || '').trim().toLocaleLowerCase('ko-KR');
  }

  function cp1252Byte(character) {
    const map = new Map([
      ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84],
      ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88],
      ['‰', 0x89], ['Š', 0x8A], ['‹', 0x8B], ['Œ', 0x8C],
      ['Ž', 0x8E], ['‘', 0x91], ['’', 0x92], ['“', 0x93],
      ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
      ['˜', 0x98], ['™', 0x99], ['š', 0x9A], ['›', 0x9B],
      ['œ', 0x9C], ['ž', 0x9E], ['Ÿ', 0x9F]
    ]);
    return map.get(character);
  }

  function byteForCharacter(character) {
    const code = character.charCodeAt(0);
    if (code <= 255) return code;
    return cp1252Byte(character);
  }

  function textScore(value) {
    const text = String(value || '');
    const hangul = (text.match(/[가-힣]/g) || []).length;
    const jamo = (text.match(/[ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
    const replacement = (text.match(/�/g) || []).length;
    const controls = (text.match(/[\u0080-\u009f]/g) || []).length;
    const suspicious = (
      text.match(/[ÃÂâêëìíîïðñòóôõöøùúûüýþæçžœš]/gi) || []
    ).length;
    return (
      hangul * 12 +
      jamo * 3 -
      replacement * 80 -
      controls * 25 -
      suspicious * 4
    );
  }

  function decodeByteRun(run) {
    if (!run) return run;
    const bytes = [];

    for (const character of run) {
      const byte = byteForCharacter(character);
      if (byte === undefined) return run;
      bytes.push(byte);
    }

    let decoded;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true })
        .decode(Uint8Array.from(bytes));
    } catch {
      return run;
    }

    return textScore(decoded) > textScore(run) ? decoded : run;
  }

  // Repairs a broken byte sequence even when valid Korean appears before it.
  // This is required for strings such as "엑셀 수금 ìê¸...".
  function decodeMojibakeSegments(value) {
    const text = String(value ?? '');
    let output = '';
    let byteRun = '';

    const flush = () => {
      if (!byteRun) return;
      output += decodeByteRun(byteRun);
      byteRun = '';
    };

    for (const character of text) {
      if (byteForCharacter(character) !== undefined) {
        byteRun += character;
      } else {
        flush();
        output += character;
      }
    }
    flush();
    return output;
  }

  function repairMojibake(value) {
    let current = String(value ?? '');

    for (let pass = 0; pass < 4; pass += 1) {
      const decoded = decodeMojibakeSegments(current);
      if (decoded === current) break;
      current = decoded;
    }

    return current.normalize('NFC');
  }

  function statusBadge(status) {
    const map = {
      active: ['사용', 'green'],
      inactive: ['중지', 'orange'],
      confirmed: ['주문확정', 'green'],
      draft: ['임시', 'orange'],
      packed: ['포장', 'orange'],
      shipped: ['출고', 'green'],
      delivered: ['납품완료', 'green'],
      canceled: ['취소', 'red'],
      deleted: ['삭제', 'red'],
      card: ['카드', 'green'],
      bank: ['송금', 'orange'],
      cash: ['현금', 'orange'],
      other: ['기타', 'orange']
    };
    const [label, color] = map[String(status || '')] || [
      String(status || '-'),
      ''
    ];
    return `<span class="mtf-badge ${color}">${escapeHtml(label)}</span>`;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = sessionStorage.getItem('mt_token');

    if (!(options.body instanceof FormData)) {
      headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.ok === false) {
      throw new Error(json.error || `요청 실패: ${response.status}`);
    }

    return json.data;
  }

  async function getUser() {
    if (!cache.user) cache.user = await api('/auth/me');
    return cache.user;
  }

  function can(permission) {
    const user = cache.user;
    if (!user) return false;
    if (user.role_name === 'admin') return true;
    return Array.isArray(user.permissions) &&
      user.permissions.includes(permission);
  }

  function activePage() {
    return document.querySelector('[data-page].active')?.dataset.page || '';
  }

  function contentElement() {
    return document.getElementById('content');
  }

  function showToast(message, type = 'success') {
    document.querySelector('.mtf-toast')?.remove();
    const node = document.createElement('div');
    node.className = `mtf-toast ${type}`;
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3500);
  }

  async function withBusyButton(button, busyText, task) {
    const original = button?.textContent || '';
    if (button) {
      button.disabled = true;
      button.textContent = busyText;
    }
    try {
      return await task();
    } catch (error) {
      showToast(error.message, 'error');
      return undefined;
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }

  function injectStyles() {
    if (document.getElementById('mt-final-styles-v309')) return;

    const style = document.createElement('style');
    style.id = 'mt-final-styles-v309';
    style.textContent = `
      .mtf-root{display:grid;gap:18px}
      .mtf-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .mtf-head h1{margin:0 0 6px;font-size:26px}
      .mtf-head p{margin:0;color:#64748b}
      .mtf-toolbar,.mtf-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;box-shadow:0 6px 18px rgba(15,23,42,.04)}
      .mtf-toolbar{display:grid;gap:12px}
      .mtf-filter-grid{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;align-items:end}
      .mtf-field{display:grid;gap:5px;min-width:0}
      .mtf-field label{font-size:13px;font-weight:700;color:#475569}
      .mtf-input,.mtf-select,.mtf-textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px 11px;background:#fff;color:#0f172a;font:inherit}
      .mtf-textarea{min-height:88px;resize:vertical}
      .mtf-input:focus,.mtf-select:focus,.mtf-textarea:focus{outline:2px solid #bfdbfe;border-color:#2563eb}
      .mtf-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .mtf-table td .mtf-actions{align-items:center;justify-content:flex-start;flex-wrap:nowrap}
      .mtf-table td .mtf-btn{vertical-align:middle;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}
      .mtf-btn{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;background:#e2e8f0;color:#0f172a;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;min-height:38px}
      .mtf-btn.primary{background:#2563eb;color:#fff}
      .mtf-btn.success{background:#16a34a;color:#fff}
      .mtf-btn.danger{background:#dc2626;color:#fff}
      .mtf-btn.warning{background:#d97706;color:#fff}
      .mtf-btn.small{padding:7px 10px;font-size:13px}
      .mtf-btn.help{background:#0f172a;color:#fff}
      .mtf-btn:disabled{opacity:.5;cursor:not-allowed}
      .mtf-key{display:inline-flex;align-items:center;justify-content:center;min-width:25px;height:22px;padding:0 6px;border:1px solid #cbd5e1;border-bottom-width:2px;border-radius:6px;background:#fff;color:#334155;font-size:12px;font-weight:800}
      .mtf-summary{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px}
      .mtf-stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:13px}
      .mtf-stat span{display:block;color:#64748b;font-size:13px;margin-bottom:6px}
      .mtf-stat strong{font-size:21px}
      .mtf-table-wrap{overflow:auto;max-height:68vh;border:1px solid #e2e8f0;border-radius:12px}
      .mtf-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1000px;background:#fff}
      .mtf-table th,.mtf-table td{padding:10px 11px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:middle;white-space:nowrap}
      .mtf-table th{position:sticky;top:0;z-index:2;background:#f8fafc;color:#475569;font-size:13px}
      .mtf-table tr:last-child td{border-bottom:0}
      .mtf-table tr.mtf-highlight td{background:#fef9c3;animation:mtfFlash 2s ease 2}
      @keyframes mtfFlash{50%{background:#fde68a}}
      .mtf-sub{display:block;color:#64748b;font-size:12px;margin-top:2px}
      .mtf-badge{display:inline-flex;border-radius:999px;padding:3px 8px;background:#e2e8f0;font-size:12px;font-weight:700}
      .mtf-badge.green{background:#dcfce7;color:#166534}
      .mtf-badge.orange{background:#ffedd5;color:#9a3412}
      .mtf-badge.red{background:#fee2e2;color:#991b1b}
      .mtf-empty{padding:30px;text-align:center;color:#64748b}
      .mtf-empty.compact{padding:18px}
      .mtf-help-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .mtf-help-section{border:1px solid #e2e8f0;border-radius:14px;padding:15px;background:#f8fafc}
      .mtf-help-section h3{margin:0 0 8px;font-size:16px}
      .mtf-help-section p{margin:0;color:#475569;line-height:1.65}
      .mtf-help-steps{margin:0;padding-left:20px;color:#334155;line-height:1.75}
      .mtf-help-tip{margin-top:12px;padding:12px 14px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;line-height:1.6}
      .mtf-help-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
      .mtf-query-note{display:flex;align-items:center;gap:8px;min-height:42px;padding:10px 12px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;background:#f8fafc}
      .mtf-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:28px;color:#475569}
      .mtf-loading::before{content:'';width:18px;height:18px;border:3px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:mtfSpin .75s linear infinite}

      .mtf-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}
      .mtf-pager-pages{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .mtf-page-btn{border:1px solid #cbd5e1;background:#fff;border-radius:8px;min-width:34px;height:34px;padding:0 10px;font-weight:800;cursor:pointer;color:#334155}
      .mtf-page-btn.active{background:#2563eb;color:#fff;border-color:#2563eb}
      .mtf-page-btn:disabled{opacity:.45;cursor:not-allowed}
      .mtf-page-size{display:flex;align-items:center;gap:6px;color:#475569;font-weight:700}
      .mtf-address-cell{max-width:280px;white-space:normal;line-height:1.35;color:#334155}
      @keyframes mtfSpin{to{transform:rotate(360deg)}}
      .mtf-modal-backdrop{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px}
      .mtf-modal{width:min(980px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.38)}
      .mtf-modal-head{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #e2e8f0;position:sticky;top:0;background:#fff;z-index:3}
      .mtf-modal-head h2{margin:0;font-size:21px}
      .mtf-modal-body{padding:20px 22px}
      .mtf-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:16px 22px;border-top:1px solid #e2e8f0;position:sticky;bottom:0;background:#fff}
      .mtf-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .mtf-span-2{grid-column:span 2}
      .mtf-span-3{grid-column:1/-1}
      .mtf-ac{position:relative}
      .mtf-ac-list{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;max-height:260px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 15px 35px rgba(15,23,42,.18)}
      .mtf-ac-item{display:block;width:100%;border:0;border-bottom:1px solid #f1f5f9;background:#fff;text-align:left;padding:9px 11px;cursor:pointer}
      .mtf-ac-item strong{display:block;color:#0f172a!important;font-weight:900;letter-spacing:-.01em}
      .mtf-ac-item .mtf-sub{color:#64748b!important}
      .mtf-ac-item:hover,.mtf-ac-item.active{background:#eff6ff}
      .mtf-ac-item:hover strong,.mtf-ac-item.active strong{color:#0f172a!important}
      .mtf-ac-item:last-child{border-bottom:0}
      .mtf-postcode-layer{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:18px}
      .mtf-postcode-box{width:min(560px,96vw);height:min(640px,86vh);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.28);overflow:hidden;display:flex;flex-direction:column}
      .mtf-postcode-head{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #e2e8f0}
      .mtf-postcode-body{flex:1;min-height:0}

      .mtf-address-v308-box{width:min(720px,96vw);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.28);overflow:hidden;display:flex;flex-direction:column;max-height:90vh}
      .mtf-address-v308-body{padding:16px;overflow:auto;background:#f8fafc}
      .mtf-address-v308-guide{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:12px;padding:12px 14px;line-height:1.55;margin-bottom:12px;font-weight:700}
      .mtf-address-v308-guide small{display:block;color:#475569;font-weight:600;margin-top:4px}
      .mtf-address-v308-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .mtf-address-v308-actions .mtf-btn{height:38px}
      .mtf-items{display:grid;gap:8px}
      .mtf-item-row{display:grid;grid-template-columns:2.2fr 1fr .8fr 1fr auto;gap:8px;align-items:end;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
      .mtf-selected-bar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 14px}
      .mtf-selected-total{font-size:20px;font-weight:800;color:#1d4ed8}
      .mtf-toast{position:fixed;right:22px;bottom:22px;z-index:110000;max-width:420px;padding:13px 16px;border-radius:12px;background:#111827;color:#fff;box-shadow:0 14px 35px rgba(0,0,0,.25);font-weight:700}
      .mtf-toast.error{background:#b91c1c}
      .mtf-confirm{font-size:15px;line-height:1.65}
      .mtf-nowrap{white-space:nowrap}
      @media(max-width:1100px){
        .mtf-filter-grid{grid-template-columns:repeat(3,minmax(130px,1fr))}
        .mtf-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .mtf-span-3{grid-column:1/-1}
      }
      @media(max-width:700px){
        .mtf-filter-grid,.mtf-summary,.mtf-form-grid,.mtf-help-grid{grid-template-columns:1fr}
        .mtf-span-2,.mtf-span-3{grid-column:auto}
        .mtf-item-row{grid-template-columns:1fr 1fr}
        .mtf-item-row .mtf-product{grid-column:1/-1}
        .mtf-head h1{font-size:22px}
        .mtf-modal-backdrop{padding:8px}
      }
    `;
    document.head.appendChild(style);
  }

  function openModal(title, bodyHtml, options = {}) {
    closeModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'mtf-modal-backdrop';
    backdrop.id = 'mtf-modal-root';
    backdrop.innerHTML = `
      <div class="mtf-modal" role="dialog" aria-modal="true">
        <div class="mtf-modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button type="button" class="mtf-btn small" data-mtf-close>닫기</button>
        </div>
        <form id="mtf-modal-form">
          <div class="mtf-modal-body">${bodyHtml}</div>
          <div class="mtf-modal-foot">
            <button type="button" class="mtf-btn" data-mtf-close>취소</button>
            ${options.onSubmit
              ? `<button type="submit" class="mtf-btn primary">${escapeHtml(options.submitText || '저장')}</button>`
              : ''}
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(backdrop);
    bindNumericFormatting(backdrop);

    backdrop.querySelectorAll('[data-mtf-close]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeModal();
    });

    const form = backdrop.querySelector('#mtf-modal-form');
    if (options.onSubmit) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        const original = submit.textContent;
        submit.textContent = '처리 중...';
        try {
          await options.onSubmit(form, backdrop);
        } catch (error) {
          showToast(error.message, 'error');
          submit.disabled = false;
          submit.textContent = original;
        }
      });
    }

    return backdrop;
  }

  function closeModal() {
    document.getElementById('mtf-modal-root')?.remove();
  }

  function confirmModal(title, message, confirmText = '확인') {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onEscape);
        resolve(value);
      };
      const onEscape = (event) => {
        if (event.key === 'Escape') finish(false);
      };

      const modal = openModal(
        title,
        `<div class="mtf-confirm">${message}</div>`,
        {
          submitText: confirmText,
          onSubmit: async () => {
            closeModal();
            finish(true);
          }
        }
      );
      modal.querySelectorAll('[data-mtf-close]').forEach((button) => {
        button.addEventListener('click', () => finish(false), { once: true });
      });
      modal.addEventListener('click', (event) => {
        if (event.target === modal) finish(false);
      });
      document.addEventListener('keydown', onEscape);
    });
  }

  function helpContent(page) {
    const commonTip = `
      <div class="mtf-help-tip">
        대부분의 검색칸은 값을 입력한 뒤 <span class="mtf-key">Enter</span>를 누르면 바로 조회됩니다.
        거래처 자동완성은 <span class="mtf-key">↑</span> <span class="mtf-key">↓</span>로 이동하고
        <span class="mtf-key">Enter</span>로 선택합니다.
      </div>
    `;

    if (page === 'customers') {
      return `
        <div class="mtf-help-grid">
          <section class="mtf-help-section">
            <h3>거래처 찾기</h3>
            <ol class="mtf-help-steps">
              <li>거래처명, 지역, 전화번호, 사업자번호 일부를 입력합니다.</li>
              <li>한글 입력 중 자모 분리·지연을 막기 위해 입력 후 조회 버튼을 누릅니다.</li>
              <li>검색어를 비우면 전체 거래처가 가나다순으로 표시됩니다.</li>
            </ol>
          </section>
          <section class="mtf-help-section">
            <h3>원장과 납품처</h3>
            <ol class="mtf-help-steps">
              <li><b>원장</b>에서 매출·수금·잔액을 확인합니다.</li>
              <li><b>납품처</b>에서 본점·지점·지역별 배송정보를 관리합니다.</li>
              <li>같은 상호는 지역·전화번호를 함께 확인해 구분합니다.</li>
            </ol>
          </section>
        </div>
        ${commonTip}
      `;
    }

    if (page === 'orders') {
      return `
        <div class="mtf-help-grid">
          <section class="mtf-help-section">
            <h3>주문 조회</h3>
            <ol class="mtf-help-steps">
              <li>기간, 거래처, 발송구분, 상태를 필요한 항목만 선택합니다.</li>
              <li>주문번호·박싱·메모는 포함검색으로 찾을 수 있습니다.</li>
              <li>조건 입력 후 조회 버튼을 사용합니다. Enter 키는 실수 저장·종료 방지를 위해 기본 실행하지 않습니다.</li>
            </ol>
          </section>
          <section class="mtf-help-section">
            <h3>안경기업 출고 흐름</h3>
            <ol class="mtf-help-steps">
              <li><b>주문 등록</b>: 먼저 주문만 접수합니다.</li>
              <li><b>미출고 출고</b>: 주문된 수량 중 남은 수량을 출고합니다.</li>
              <li><b>주문+즉시출고</b>: 전화·카톡 주문을 받은 즉시 함께 처리합니다.</li>
            </ol>
          </section>
        </div>
        ${commonTip}
      `;
    }

    return `
      <div class="mtf-help-grid">
        <section class="mtf-help-section">
          <h3>미수금 조회</h3>
          <ol class="mtf-help-steps">
            <li>거래처 또는 발송구분 중 하나 이상을 선택합니다.</li>
            <li>조회 전에는 전체 미수금을 불러오지 않아 대기시간을 줄입니다.</li>
            <li>결과는 같은 거래처·발송구분별 합계로 표시됩니다.</li>
          </ol>
        </section>
        <section class="mtf-help-section">
          <h3>수금 반영</h3>
          <ol class="mtf-help-steps">
            <li>미수금 행 오른쪽의 <b>수금 반영</b>을 누릅니다.</li>
            <li>거래처·발송구분·금액이 수금 등록란에 자동 입력됩니다.</li>
            <li>카드가 기본값이며 송금·현금으로 변경할 수 있습니다.</li>
          </ol>
        </section>
      </div>
      ${commonTip}
      ${can('payments.write') ? `
        <div class="mtf-help-actions">
          <button type="button" class="mtf-btn warning" data-help-repair-korean>
            기존 엑셀 수금 한글 정리 실행
          </button>
        </div>
        <div class="mtf-help-tip">
          기존 자료의 깨진 파일명·비고를 한 번 정리합니다. 앞으로 업로드되는 파일명은 저장 전에 자동 보정합니다.
        </div>
      ` : ''}
    `;
  }

  function openPageHelp(page = activePage()) {
    const titleMap = {
      customers: '거래처/원장 사용법',
      orders: '주문/출고 사용법',
      payments: '수금/미수금 사용법'
    };
    const modal = openModal(titleMap[page] || '사용법', helpContent(page));
    const footClose = modal.querySelector('.mtf-modal-foot [data-mtf-close]');
    if (footClose) footClose.textContent = '닫기';

    modal.querySelector('[data-help-repair-korean]')?.addEventListener(
      'click',
      async () => {
        const ok = await confirmModal(
          '기존 한글 정리',
          '기존 수금 비고와 엑셀 파일명에서 복구 가능한 깨진 한글을 일괄 정리합니다. 이 작업은 한 번만 실행하면 됩니다.',
          '정리 실행'
        );
        if (!ok) return;
        try {
          const result = await api('/final/repair-mojibake', {
            method: 'POST',
            body: JSON.stringify({})
          });
          showToast(`${money(result.updated)}건의 한글을 정리했습니다.`);
          await renderPayments(contentElement());
        } catch (error) {
          showToast(error.message, 'error');
        }
      }
    );
    return modal;
  }

  function formObject(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const numericFields = new Set([
      'opening_receivable', 'credit_limit', 'vat_amount', 'amount', 'unit_price',
      'quantity', 'current_stock', 'safety_stock', 'production_lot_size',
      'planned_qty', 'received_qty'
    ]);
    for (const [key, value] of Object.entries(data)) {
      if (value === '') data[key] = null;
      else if (numericFields.has(key)) data[key] = integerWon(value);
    }
    return data;
  }

  function bindNumericFormatting(scope = document) {
    scope.querySelectorAll('[data-mtf-number-format]').forEach((input) => {
      if (input.dataset.mtfNumberBound === '1') return;
      input.dataset.mtfNumberBound = '1';
      const plain = () => String(input.value || '').replace(/,/g, '').replace(/원/g, '').trim();
      input.addEventListener('focus', () => { input.value = plain(); });
      input.addEventListener('input', () => {
        const cleaned = plain().replace(/[^0-9.-]/g, '');
        if (input.value !== cleaned) input.value = cleaned;
      });
      input.addEventListener('blur', () => {
        if (input.value === '') return;
        input.value = money(input.value);
      });
      if (input.value !== '') input.value = money(input.value);
    });
  }

  // V308: Prevent accidental Enter submission/window closing. Use save/search buttons explicitly.
  if (!window.__MT_OPTICS_ENTER_GUARD_V308__) {
    window.__MT_OPTICS_ENTER_GUARD_V308__ = true;
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      const target = event.target;
      if (!target || target.tagName === 'TEXTAREA') return;
      if (target.closest('[data-mtf-allow-enter]')) return;
      if (target.matches('input, select')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  async function loadCustomers(force = false) {
    if (!cache.customers || force) {
      cache.customers = await api('/final/customers?limit=10000');
    }
    return cache.customers;
  }

  async function loadSites(force = false) {
    if (!cache.sites || force) {
      cache.sites = await api('/final/sites');
    }
    return cache.sites;
  }

  async function loadCustomerSites(customerId, force = false) {
    const key = String(customerId || '');
    if (!key) return [];
    if (force || !cache.sitesByCustomer.has(key)) {
      const rows = await api(`/final/sites?customer_id=${encodeURIComponent(key)}`);
      cache.sitesByCustomer.set(key, rows);
    }
    return cache.sitesByCustomer.get(key) || [];
  }

  async function loadProducts(force = false) {
    if (!cache.products || force) {
      cache.products = await api('/final/products');
    }
    return cache.products;
  }


  async function loadCarriers(force = false) {
    if (!cache.carriers || force) {
      cache.carriers = await api('/final/carriers');
    }
    return cache.carriers;
  }

  function carrierOptions(carriers = [], selected = '') {
    const values = (carriers.length ? carriers : ['우체국', '한진택배', '기타'])
      .map((item) => typeof item === 'string' ? item : (item.item_name || item.item_value || item.item_code))
      .filter(Boolean);
    const unique = [...new Set(values.concat(['우체국', '한진택배', '기타']))];
    return unique.map((name) => `<option value="${escapeHtml(name)}" ${String(selected || '') === String(name) ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  }

  async function addCarrierPrompt(select = null) {
    const name = window.prompt('추가할 택배사명을 입력하세요. 예: 로젠택배');
    if (!name?.trim()) return;
    await api('/final/carriers', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    cache.carriers = null;
    const carriers = await loadCarriers(true);
    if (select) {
      select.innerHTML = carrierOptions(carriers, name.trim());
      select.value = name.trim();
    }
    showToast('택배사를 추가했습니다.');
  }


  async function loadDateRange(force = false) {
    if (!cache.dateRange || force) {
      cache.dateRange = await api('/final/date-range');
    }
    return cache.dateRange || {};
  }

  async function applyDateDefaults(page) {
    const range = await loadDateRange();
    if (page === 'orders') {
      if (!uiState.orderFilters.date_from) {
        uiState.orderFilters.date_from = range.min_order_date || '';
      }
      if (!uiState.orderFilters.date_to) {
        uiState.orderFilters.date_to = today();
      }
    }
    if (page === 'payments') {
      if (!uiState.paymentFilters.date_from) {
        uiState.paymentFilters.date_from = range.min_payment_date || '';
      }
      if (!uiState.paymentFilters.date_to) {
        uiState.paymentFilters.date_to = today();
      }
    }
  }

  function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function formatPhone(value) {
    const digits = phoneDigits(value);
    if (!digits) return '';
    if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    if (digits.startsWith('02')) {
      if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return digits;
  }

  function formatBusinessNo(value) {
    const digits = phoneDigits(value);
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    return String(value || '').trim();
  }

  function badCustomerName(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    if (/[가-힣a-zA-Z]/.test(text)) return false;
    return /^[0-9\-\s().·]+$/.test(text);
  }

  function customerDisplayName(row = {}) {
    const candidates = [
      row.display_name,
      row.customer_display_name,
      row.name,
      row.customer_name,
      row.original_customer_name,
      row.site_original_customer_name,
      row.site_name,
      row.region
    ];
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (text && !badCustomerName(text)) return text;
    }
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (text) return text;
    }
    return '거래처명 미등록';
  }

  function customerSubText(row = {}) {
    return [
      row.region,
      formatPhone(row.phone || row.customer_phone || row.site_phone || row.mobile),
      formatBusinessNo(row.business_no || row.customer_business_no)
    ].filter(Boolean).join(' · ');
  }


  function customerAddressText(row = {}) {
    const base = String(row.address || row.road_address || row.jibun_address || '').trim();
    const detail = String(row.detail_address || '').trim();
    if (base && detail && !base.includes(detail)) return `${base} ${detail}`;
    return base || detail || '';
  }

  function customerBranchLabel(row = {}) {
    if (row.record_type === 'site') return row.site_name || row.region || '납품처';
    return '본점/기본';
  }

  function customerPagerHtml({ page, pageSize, total }) {
    const totalPages = Math.max(Math.ceil(Number(total || 0) / Number(pageSize || 20)), 1);
    const current = Math.min(Math.max(Number(page || 1), 1), totalPages);
    const start = Math.max(1, current - 2);
    const end = Math.min(totalPages, current + 2);
    const pages = [];
    if (start > 1) pages.push(1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    if (end < totalPages) pages.push(totalPages);
    return `
      <div class="mtf-pager" data-customer-pager>
        <div class="mtf-page-size">
          <span>페이지당</span>
          <select class="mtf-select" style="width:92px" data-customer-page-size>
            ${[10, 20, 50, 100].map((n) => `<option value="${n}" ${Number(pageSize) === n ? 'selected' : ''}>${n}건</option>`).join('')}
          </select>
          <span>전체 ${money(total)}건 · ${money(current)} / ${money(totalPages)}쪽</span>
        </div>
        <div class="mtf-pager-pages">
          <button type="button" class="mtf-page-btn" data-customer-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>이전</button>
          ${pages.map((item) => item === '...'
            ? '<span class="mtf-sub" style="padding:0 4px">…</span>'
            : `<button type="button" class="mtf-page-btn ${item === current ? 'active' : ''}" data-customer-page="${item}">${item}</button>`
          ).join('')}
          <button type="button" class="mtf-page-btn" data-customer-page="${current + 1}" ${current >= totalPages ? 'disabled' : ''}>다음</button>
        </div>
      </div>
    `;
  }

  function customerLoadingHtml(message = '거래처 자료를 불러오는 중입니다...') {
    return `<div class="mtf-card"><div class="mtf-loading">${escapeHtml(message)}</div></div>`;
  }

  function customerSearchValues(row = {}) {
    return [
      customerDisplayName(row), row.display_name, row.customer_display_name,
      row.name, row.customer_name, row.code, row.customer_code,
      row.business_no, row.customer_business_no,
      row.region, row.site_name, row.original_customer_name,
      row.phone, row.mobile, phoneDigits(row.phone), phoneDigits(row.mobile)
    ];
  }


  function primaryCustomerSearchValues(row = {}) {
    return [
      customerDisplayName(row), row.display_name, row.customer_display_name,
      row.name, row.customer_name, row.original_customer_name,
      row.site_original_customer_name, row.site_name, row.region,
      row.code, row.customer_code
    ];
  }

  function contactCustomerSearchValues(row = {}) {
    return [
      row.phone, row.mobile, row.customer_phone, row.site_phone,
      row.business_no, row.customer_business_no,
      phoneDigits(row.phone), phoneDigits(row.mobile), phoneDigits(row.customer_phone),
      phoneDigits(row.business_no), phoneDigits(row.customer_business_no)
    ];
  }

  function customerSearchScore(row, keyword) {
    const kw = normalizeText(keyword);
    const digits = phoneDigits(keyword);
    if (!kw) return 100 + customerDisplayName(row).length;

    const name = normalizeText(customerDisplayName(row));
    const code = normalizeText(row.code || row.customer_code || '');
    const region = normalizeText(row.region || row.site_name || '');
    const original = normalizeText(row.original_customer_name || row.site_original_customer_name || '');

    if (name === kw) return 0;
    if (name.startsWith(kw)) return 10 + name.length;
    if (name.includes(kw)) return 20 + name.indexOf(kw);
    if (original && original.startsWith(kw)) return 30 + original.length;
    if (original && original.includes(kw)) return 40 + original.indexOf(kw);
    if (code && code.startsWith(kw)) return 50 + code.length;
    if (code && code.includes(kw)) return 60 + code.indexOf(kw);
    if (region && region.includes(kw)) return 70 + region.indexOf(kw);

    // 전화·사업자번호 검색은 6자리 이상 입력했을 때만 보조 검색으로 사용합니다.
    // 1001처럼 거래처명 검색 중 사업자번호에 우연히 포함된 거래처가 섞이는 문제를 방지합니다.
    if (digits.length >= 6) {
      const contactHit = contactCustomerSearchValues(row).some((value) => phoneDigits(value).includes(digits));
      if (contactHit) return 200;
    }
    return 9999;
  }

  function localCustomerMatches(customers, keyword, limit = 40) {
    const kw = normalizeText(keyword);
    const rows = Array.isArray(customers) ? customers : [];
    const scored = rows
      .map((row) => ({ row, score: customerSearchScore(row, kw) }))
      .filter((item) => !kw || item.score < 9999)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return customerDisplayName(a.row).localeCompare(customerDisplayName(b.row), 'ko');
      })
      .slice(0, limit)
      .map((item) => item.row);
    return scored;
  }

  const remoteCustomerSearchCache = new Map();
  async function remoteCustomerMatches(keyword, fallbackRows, limit = 40) {
    const kw = String(keyword || '').trim();
    if (!kw) return localCustomerMatches(fallbackRows, kw, limit);
    const key = `${kw}|${limit}`;
    if (remoteCustomerSearchCache.has(key)) return remoteCustomerSearchCache.get(key);
    try {
      const rows = await api(`/final/customers/search?q=${encodeURIComponent(kw)}&limit=${limit}`);
      const result = Array.isArray(rows) && rows.length ? rows : localCustomerMatches(fallbackRows, kw, limit);
      remoteCustomerSearchCache.set(key, result);
      if (remoteCustomerSearchCache.size > 100) remoteCustomerSearchCache.delete(remoteCustomerSearchCache.keys().next().value);
      return result;
    } catch (error) {
      console.warn('customer remote search fallback', error);
      return localCustomerMatches(fallbackRows, kw, limit);
    }
  }

  function customerAutocompleteHtml({
    id,
    name = 'customer_id',
    label = '거래처',
    value = '',
    customerId = '',
    required = false,
    placeholder = '거래처명을 입력하세요'
  }) {
    return `
      <div class="mtf-field mtf-ac" data-mtf-ac="${escapeHtml(id)}">
        <label for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' *' : ''}</label>
        <input
          id="${escapeHtml(id)}"
          class="mtf-input"
          type="text"
          autocomplete="off"
          value="${escapeHtml(value)}"
          placeholder="${escapeHtml(placeholder)}"
          ${required ? 'required' : ''}
          data-mtf-ac-input
        >
        <input
          type="hidden"
          name="${escapeHtml(name)}"
          value="${escapeHtml(customerId)}"
          data-mtf-ac-value
        >
        <div class="mtf-ac-list" hidden data-mtf-ac-list></div>
      </div>
    `;
  }

  function bindCustomerAutocomplete(scope, customers, options = {}) {
    scope.querySelectorAll('[data-mtf-ac]').forEach((wrapper) => {
      const input = wrapper.querySelector('[data-mtf-ac-input]');
      const hidden = wrapper.querySelector('[data-mtf-ac-value]');
      const list = wrapper.querySelector('[data-mtf-ac-list]');
      let matches = [];
      let activeIndex = -1;
      let searchTimer = null;
      let searchSerial = 0;

      function updateActiveItem() {
        list.querySelectorAll('[data-customer-id]').forEach((button, index) => {
          button.classList.toggle('active', index === activeIndex);
          if (index === activeIndex) button.scrollIntoView({ block: 'nearest' });
        });
      }

      function drawMatches(rows, loading = false) {
        matches = rows || [];
        activeIndex = -1;
        if (loading) {
          list.innerHTML = '<div class="mtf-empty compact">거래처 검색 중...</div>';
        } else if (matches.length) {
          list.innerHTML = matches.map((customer) => `
            <button type="button" class="mtf-ac-item" data-customer-id="${customer.id}">
              <strong>${escapeHtml(customerDisplayName(customer))}</strong>
              <span class="mtf-sub">${escapeHtml(customerSubText(customer))}</span>
            </button>
          `).join('');
        } else {
          list.innerHTML = '<div class="mtf-empty compact">입력한 단어를 포함한 거래처가 없습니다.</div>';
        }
        list.hidden = false;
      }

      async function renderMatches(immediate = false) {
        const keyword = input.value.trim();
        const serial = ++searchSerial;
        clearTimeout(searchTimer);

        const run = async () => {
          drawMatches(localCustomerMatches(customers, keyword, 10), true);
          const rows = await remoteCustomerMatches(keyword, customers, 40);
          if (serial !== searchSerial) return;
          drawMatches(rows, false);
        };

        if (immediate) await run();
        else searchTimer = setTimeout(run, keyword ? 180 : 0);
      }

      function selectCustomer(customer) {
        input.value = customer ? customerDisplayName(customer) : '';
        hidden.value = customer?.id || '';
        list.hidden = true;
        activeIndex = -1;
        wrapper.dispatchEvent(new CustomEvent('mtf-customer-selected', {
          bubbles: true,
          detail: customer || null
        }));
      }

      input.addEventListener('input', () => {
        hidden.value = '';
        renderMatches(false);
        options.onInput?.(input.value);
      });

      input.addEventListener('focus', () => renderMatches(true));

      input.addEventListener('keydown', async (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (list.hidden) await renderMatches(true);
          if (matches.length) {
            activeIndex = Math.min(activeIndex + 1, matches.length - 1);
            updateActiveItem();
          }
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (matches.length) {
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActiveItem();
          }
          return;
        }
        if (event.key === 'Escape') {
          list.hidden = true;
          activeIndex = -1;
          return;
        }
        if (event.key === 'Enter') {
          if (!matches.length) await renderMatches(true);
          const exact = matches.find((customer) => normalizeText(customerDisplayName(customer)) === normalizeText(input.value));
          const selected = matches[activeIndex] || exact || (matches.length === 1 ? matches[0] : null);
          if (selected) {
            event.preventDefault();
            event.stopPropagation();
            selectCustomer(selected);
          }
        }
      });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          const exact = matches.find((customer) => normalizeText(customerDisplayName(customer)) === normalizeText(input.value));
          if (exact) selectCustomer(exact);
          else if (!input.value.trim()) selectCustomer(null);
          list.hidden = true;
        }, 180);
      });

      list.addEventListener('mousemove', (event) => {
        const button = event.target.closest('[data-customer-id]');
        if (!button) return;
        activeIndex = [...list.querySelectorAll('[data-customer-id]')].indexOf(button);
        updateActiveItem();
      });

      list.addEventListener('mousedown', (event) => {
        const button = event.target.closest('[data-customer-id]');
        if (!button) return;
        event.preventDefault();
        const customer = matches.find((row) => String(row.id) === button.dataset.customerId);
        selectCustomer(customer);
      });
    });
  }

  function bindEnterAction(scope, selector, handler) {
    scope.querySelectorAll(selector).forEach((element) => {
      element.addEventListener('keydown', (event) => {
        if (
          event.key !== 'Enter' ||
          event.isComposing ||
          event.keyCode === 229 ||
          event.target.tagName === 'TEXTAREA'
        ) return;
        event.preventDefault();
        handler(event);
      });
    });
  }

  function siteOptions(sites, customerId, selected = '') {
    if (!customerId) {
      return '<option value="">거래처를 먼저 선택하세요</option>';
    }

    const filtered = sites
      .filter((site) => String(site.customer_id) === String(customerId))
      .sort((a, b) =>
        String(a.site_name || '').localeCompare(String(b.site_name || ''), 'ko')
      );

    return [
      '<option value="">기본/미지정</option>',
      ...filtered.map((site) => `
        <option value="${site.id}"
                ${String(site.id) === String(selected) ? 'selected' : ''}>
          ${escapeHtml([
            site.site_name,
            site.region,
            site.default_delivery_type,
            formatPhone(site.phone || site.mobile)
          ].filter(Boolean).join(' · '))}
        </option>
      `)
    ].join('');
  }

  // V307: Kakao postcode API restored with top-most layer
  // Root cause found: the postcode layer used z-index 9999, but the customer modal uses z-index 100000.
  // Therefore the Kakao iframe could be created behind the existing modal. V307 creates a top-level layer
  // with z-index 2147483647 and uses the current Kakao API constructor while keeping manual fallback.

  let mtfPostcodeScriptPromiseV307 = null;
  function ensureKakaoPostcodeV307() {
    if (window.kakao?.Postcode || window.daum?.Postcode) return Promise.resolve();
    if (mtfPostcodeScriptPromiseV307) return mtfPostcodeScriptPromiseV307;
    mtfPostcodeScriptPromiseV307 = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-mtf-postcode-v308]')
        || Array.from(document.scripts).find((s) => String(s.src || '').includes('/postcode/prod/postcode.v2.js'));
      if (existing && (window.kakao?.Postcode || window.daum?.Postcode)) return resolve();
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Kakao postcode script load failed')), { once: true });
        setTimeout(() => {
          if (window.kakao?.Postcode || window.daum?.Postcode) resolve();
        }, 400);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.async = true;
      script.dataset.mtfPostcodeV307 = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('카카오 우편번호 스크립트를 불러오지 못했습니다. 인터넷 연결 또는 CSP를 확인하세요.'));
      document.head.appendChild(script);
    });
    return mtfPostcodeScriptPromiseV307;
  }

  function postcodeConstructorV307() {
    return window.kakao?.Postcode || window.daum?.Postcode || null;
  }

  function findAddressBlockFromButton(button) {
    return button.closest('[data-mtf-address-block]')
      || button.closest('.address-block')
      || button.closest('form')
      || button.closest('.modal')
      || document;
  }

  function addressField(block, name) {
    return block.querySelector(`[name="${name}"]`);
  }

  function addressCurrentValue(block, ...names) {
    for (const name of names) {
      const element = addressField(block, name);
      if (element && String(element.value || '').trim()) return String(element.value || '').trim();
    }
    return '';
  }

  function fillAddressBlock(block, data = {}) {
    if (!block) return;
    const selectedType = data.userSelectedType === 'J' ? 'J' : 'R';
    const postal = String(data.zonecode || data.postal_code || '').trim();
    const road = String(data.roadAddress || data.road_address || data.address || '').trim();
    const jibun = String(data.jibunAddress || data.jibun_address || '').trim();
    const selected = selectedType === 'J' ? (jibun || road) : (road || jibun);
    const values = {
      postal_code: postal,
      road_address: road,
      jibun_address: jibun,
      address_type: selected ? selectedType : '',
      address: selected
    };
    Object.entries(values).forEach(([name, value]) => {
      const element = addressField(block, name);
      if (!element) return;
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const detailInput = addressField(block, 'detail_address') || addressField(block, 'address_detail');
    if (detailInput) setTimeout(() => detailInput.focus(), 30);
  }

  function applyManualAddressV307(layer, block) {
    fillAddressBlock(block, {
      userSelectedType: 'R',
      zonecode: layer.querySelector('[name="v307_postal_code"]')?.value || '',
      roadAddress: layer.querySelector('[name="v307_road_address"]')?.value || '',
      jibunAddress: layer.querySelector('[name="v307_jibun_address"]')?.value || ''
    });
    const detail = layer.querySelector('[name="v307_detail_address"]')?.value || '';
    const detailInput = addressField(block, 'detail_address') || addressField(block, 'address_detail');
    if (detailInput && detail) {
      detailInput.value = detail;
      detailInput.dispatchEvent(new Event('input', { bubbles: true }));
      detailInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function showManualAddressFallbackV307(layer, block, message = '') {
    const body = layer.querySelector('.mtf-postcode-body');
    const postal = addressCurrentValue(block, 'postal_code', 'postcode', 'zip_code');
    const road = addressCurrentValue(block, 'road_address', 'address');
    const jibun = addressCurrentValue(block, 'jibun_address');
    const detail = addressCurrentValue(block, 'detail_address', 'address_detail');
    body.innerHTML = `
      <div style="padding:16px;background:#f8fafc;height:100%;overflow:auto">
        <div style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;padding:12px 14px;line-height:1.55;margin-bottom:12px;font-weight:800">
          ${escapeHtml(message || '주소검색 화면이 비어 있거나 차단되면 아래 직접입력을 사용하세요.')}
          <div style="font-weight:600;color:#475569;margin-top:6px">카카오 주소검색은 그대로 유지되어 있으며, 필요 시 상단의 팝업형 재시도 버튼을 누르세요.</div>
        </div>
        <div class="mtf-form-grid">
          <div class="mtf-field">
            <label>우편번호</label>
            <input class="mtf-input" name="v307_postal_code" value="${escapeHtml(postal)}" inputmode="numeric" placeholder="예: 12345">
          </div>
          <div class="mtf-field mtf-span-2">
            <label>도로명주소</label>
            <input class="mtf-input" name="v307_road_address" value="${escapeHtml(road)}" placeholder="도로명주소 입력">
          </div>
          <div class="mtf-field mtf-span-3">
            <label>지번주소</label>
            <input class="mtf-input" name="v307_jibun_address" value="${escapeHtml(jibun)}" placeholder="필요 시 입력">
          </div>
          <div class="mtf-field mtf-span-3">
            <label>상세주소</label>
            <input class="mtf-input" name="v307_detail_address" value="${escapeHtml(detail)}" placeholder="동·층·호 등">
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button type="button" class="mtf-btn" data-open-juso-v308>도로명주소 검색 사이트 열기</button>
          <button type="button" class="mtf-btn primary" data-apply-manual-v308>주소 적용</button>
        </div>
      </div>`;
    body.querySelector('[data-open-juso-v308]')?.addEventListener('click', () => {
      const popup = window.open('https://www.juso.go.kr/openIndexPage.do', 'jusoSearchV307', 'width=1100,height=780,scrollbars=yes,resizable=yes');
      if (popup) { try { popup.focus(); } catch (_) {} }
      else showToast('팝업이 차단되었습니다. 브라우저 주소창에서 www.juso.go.kr 을 열어 주소를 검색하세요.', 'error');
    });
    body.querySelector('[data-apply-manual-v308]')?.addEventListener('click', () => {
      applyManualAddressV307(layer, block);
      layer.remove();
      showToast('주소를 반영했습니다.', 'success');
    });
  }

  function createPostcodeLayerV307() {
    document.querySelectorAll('.mtf-postcode-layer,.mtf-address-v308-layer,.mtf-address-v308-layer').forEach((node) => node.remove());
    const layer = document.createElement('div');
    layer.className = 'mtf-postcode-layer mtf-address-v308-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.56);display:flex;align-items:center;justify-content:center;padding:18px;';
    layer.innerHTML = `
      <div class="mtf-postcode-box" style="width:min(620px,96vw);height:min(720px,92vh);background:#fff;border-radius:18px;box-shadow:0 30px 90px rgba(15,23,42,.45);overflow:hidden;display:flex;flex-direction:column;position:relative;z-index:2147483647">
        <div class="mtf-postcode-head" style="height:54px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 14px;border-bottom:1px solid #e2e8f0;background:#fff;flex-shrink:0">
          <strong>주소검색</strong>
          <div style="display:flex;gap:6px;align-items:center">
            <button type="button" class="mtf-btn small" data-postcode-popup-v308>팝업형 재시도</button>
            <button type="button" class="mtf-btn small" data-postcode-manual-v308>직접입력</button>
            <button type="button" class="mtf-btn small" data-close-postcode-v308>닫기</button>
          </div>
        </div>
        <div class="mtf-postcode-body" style="flex:1;min-height:520px;background:#fff;position:relative"></div>
      </div>`;
    document.documentElement.appendChild(layer);
    return layer;
  }

  async function openKakaoPostcodeLayerV307(button) {
    const block = findAddressBlockFromButton(button);
    if (!block) {
      showToast('주소 입력 영역을 찾지 못했습니다.', 'error');
      return;
    }
    const layer = createPostcodeLayerV307();
    const body = layer.querySelector('.mtf-postcode-body');
    const close = () => layer.remove();
    layer.querySelector('[data-close-postcode-v308]')?.addEventListener('click', close);
    layer.querySelector('[data-postcode-manual-v308]')?.addEventListener('click', () => showManualAddressFallbackV307(layer, block, '직접입력 모드입니다.'));
    layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
    document.addEventListener('keydown', function escHandler(event) {
      if (!document.body.contains(layer) && !document.documentElement.contains(layer)) {
        document.removeEventListener('keydown', escHandler, true);
        return;
      }
      if (event.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler, true); }
    }, true);

    const openPopup = async () => {
      try {
        await ensureKakaoPostcodeV307();
        const Postcode = postcodeConstructorV307();
        if (!Postcode) throw new Error('Postcode constructor not found');
        const popup = new Postcode({
          oncomplete(data) { fillAddressBlock(block, data); close(); }
        });
        popup.open({ popupKey: 'mtOpticsPostcodeV307', popupTitle: 'MT옵틱스 주소검색', autoClose: true });
        showToast('카카오 주소검색 팝업을 열었습니다. 팝업창에서 주소를 선택하세요.', 'info');
      } catch (error) {
        console.error(error);
        showManualAddressFallbackV307(layer, block, '팝업형 주소검색을 열지 못했습니다. 직접입력을 사용하세요.');
      }
    };
    layer.querySelector('[data-postcode-popup-v308]')?.addEventListener('click', openPopup);

    body.innerHTML = '<div class="mtf-loading">카카오 주소검색을 불러오는 중입니다...</div>';
    try {
      await ensureKakaoPostcodeV307();
      const Postcode = postcodeConstructorV307();
      if (!Postcode) throw new Error('Kakao Postcode constructor not loaded');
      body.innerHTML = '';
      const initialKeyword = addressCurrentValue(block, 'road_address', 'address', 'jibun_address');
      const postcode = new Postcode({
        width: '100%',
        height: '100%',
        animation: false,
        maxSuggestItems: 5,
        oncomplete(data) {
          fillAddressBlock(block, data);
          close();
          showToast('주소를 반영했습니다.', 'success');
        },
        onresize(size) {
          if (size?.height) body.style.minHeight = `${Math.max(Number(size.height), 520)}px`;
        }
      });
      postcode.embed(body, initialKeyword ? { q: initialKeyword, autoClose: true } : { autoClose: true });
      setTimeout(() => {
        const iframe = body.querySelector('iframe');
        if (!iframe) showManualAddressFallbackV307(layer, block, '주소검색 iframe이 생성되지 않았습니다. 직접입력 또는 팝업형 재시도를 사용하세요.');
      }, 3500);
    } catch (error) {
      console.error(error);
      showManualAddressFallbackV307(layer, block, '카카오 주소검색 API 로딩에 실패했습니다. 직접입력 또는 도로명주소 검색 사이트를 사용하세요.');
    }
  }

  function isAddressSearchTrigger(target) {
    const element = target.closest('[data-mtf-address-search], .address-search-btn, button, a');
    if (!element) return null;
    if (element.matches('[data-mtf-address-search], .address-search-btn')) return element;
    const label = normalizeText(element.textContent || element.value || element.getAttribute('aria-label') || '');
    if (label.includes('주소검색') || label.includes('우편번호')) {
      const inCustomerForm = element.closest('[data-mtf-address-block], .address-block, form, .modal, .mtf-modal');
      if (inCustomerForm) return element;
    }
    return null;
  }

  function bindAddressSearch(scope) {
    scope.querySelectorAll('[data-mtf-address-search], .address-search-btn').forEach((button) => {
      button.dataset.mtfAddressV307 = '1';
    });
  }

  // Capture phase: override all previous v300-v308 address handlers and open the top-most V307 Kakao layer.
  if (!window.__MT_OPTICS_ADDRESS_V307_CAPTURE__) {
    window.__MT_OPTICS_ADDRESS_V307_CAPTURE__ = true;
    document.addEventListener('click', (event) => {
      const trigger = isAddressSearchTrigger(event.target);
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      if (window.MTOpticsPostcodeV307 && typeof window.MTOpticsPostcodeV307.open === 'function') window.MTOpticsPostcodeV307.open(trigger); else openKakaoPostcodeLayerV307(trigger);
    }, true);
  }

  function addressFields(row = {}) {
    return `
      <div class="mtf-span-3 mtf-form-grid" data-mtf-address-block>
        <div class="mtf-field">
          <label>우편번호</label>
          <div class="mtf-actions">
            <input class="mtf-input" name="postal_code"
                   value="${escapeHtml(row.postal_code || '')}">
            <button type="button" class="mtf-btn"
                    data-mtf-address-search>주소검색</button>
          </div>
        </div>
        <div class="mtf-field">
          <label>선택주소</label>
          <select class="mtf-select" name="address_type">
            <option value="R" ${row.address_type === 'R' ? 'selected' : ''}>도로명주소</option>
            <option value="J" ${row.address_type === 'J' ? 'selected' : ''}>지번주소</option>
          </select>
        </div>
        <div class="mtf-field">
          <label>기본주소</label>
          <input class="mtf-input" name="address"
                 value="${escapeHtml(row.address || '')}">
        </div>
        <div class="mtf-field">
          <label>도로명주소</label>
          <input class="mtf-input" name="road_address"
                 value="${escapeHtml(row.road_address || '')}">
        </div>
        <div class="mtf-field">
          <label>지번주소</label>
          <input class="mtf-input" name="jibun_address"
                 value="${escapeHtml(row.jibun_address || '')}">
        </div>
        <div class="mtf-field">
          <label>상세주소</label>
          <input class="mtf-input" name="detail_address"
                 value="${escapeHtml(row.detail_address || '')}">
        </div>
      </div>
    `;
  }

  async function openCustomerModal(row = null) {
    const editing = Boolean(row?.id);
    const modal = openModal(
      editing ? '거래처 수정' : '거래처 등록',
      `
        <div class="mtf-form-grid">
          <div class="mtf-field">
            <label>거래처명 *</label>
            <input class="mtf-input" name="name" required
                   value="${escapeHtml(row?.name || '')}">
          </div>
          <div class="mtf-field">
            <label>사업자번호</label>
            <input class="mtf-input" name="business_no"
                   value="${escapeHtml(row?.business_no || '')}">
          </div>
          <div class="mtf-field">
            <label>대표자/성명</label>
            <input class="mtf-input" name="owner_name"
                   value="${escapeHtml(row?.owner_name || '')}">
          </div>
          <div class="mtf-field">
            <label>전화</label>
            <input class="mtf-input" name="phone"
                   value="${escapeHtml(row?.phone || '')}">
          </div>
          <div class="mtf-field">
            <label>휴대폰</label>
            <input class="mtf-input" name="mobile"
                   value="${escapeHtml(row?.mobile || '')}">
          </div>
          <div class="mtf-field">
            <label>지역</label>
            <input class="mtf-input" name="region"
                   value="${escapeHtml(row?.region || '')}">
          </div>
          <div class="mtf-field">
            <label>초기미수금</label>
            <input class="mtf-input" type="text" inputmode="numeric" data-mtf-number-format name="opening_receivable"
                   value="${escapeHtml(wonInputValue(row?.opening_receivable || 0))}">
          </div>
          <div class="mtf-field">
            <label>결제조건</label>
            <input class="mtf-input" name="payment_terms"
                   value="${escapeHtml(row?.payment_terms || '')}">
          </div>
          <div class="mtf-field">
            <label>상태</label>
            <select class="mtf-select" name="status">
              <option value="active" ${row?.status !== 'inactive' ? 'selected' : ''}>사용</option>
              <option value="inactive" ${row?.status === 'inactive' ? 'selected' : ''}>중지</option>
            </select>
          </div>
          ${addressFields(row || {})}
          <div class="mtf-field mtf-span-3">
            <label>메모</label>
            <textarea class="mtf-textarea" name="memo">${escapeHtml(row?.memo || '')}</textarea>
          </div>
        </div>
      `,
      {
        submitText: editing ? '수정 저장' : '거래처 등록',
        onSubmit: async (form) => {
          const data = formObject(form);
          const result = await api(
            editing ? `/customers/${row.id}` : '/customers',
            {
              method: editing ? 'PUT' : 'POST',
              body: JSON.stringify(data)
            }
          );

          closeModal();
          cache.customers = null;
          uiState.customerSearch = data.name || '';
          uiState.highlightCustomerId = result.id;
          showToast(editing ? '거래처를 수정했습니다.' : '거래처를 등록했습니다.');
          await renderCustomers(contentElement(), true);
        }
      }
    );
    bindAddressSearch(modal);
  }

  async function openCustomerLedger(customer) {
    const data = await api(`/customers/${customer.id}/ledger`);
    openModal(
      `${customerDisplayName(customer)} 거래원장`,
      `
        <div class="mtf-summary">
          <div class="mtf-stat">
            <span>초기미수금</span>
            <strong>${money(data.customer.opening_receivable)}원</strong>
          </div>
          <div class="mtf-stat">
            <span>원장 건수</span>
            <strong>${money(data.rows.length)}</strong>
          </div>
        </div>
        <div class="mtf-table-wrap" style="margin-top:14px">
          <table class="mtf-table">
            <thead>
              <tr>
                <th>일자</th><th>구분</th><th>납품처</th><th>발송</th>
                <th>주문/수금번호</th><th>금액</th><th>잔액</th><th>메모</th>
              </tr>
            </thead>
            <tbody>
              ${data.rows.length
                ? data.rows.map((row) => `
                    <tr>
                      <td>${fmtDate(row.txn_date)}</td>
                      <td>${escapeHtml(row.txn_type)}</td>
                      <td>${escapeHtml(row.site_name || '')}</td>
                      <td>${escapeHtml(row.delivery_type || '')}</td>
                      <td>${escapeHtml(row.order_no || row.payment_no || '')}</td>
                      <td>${money(row.amount)}원</td>
                      <td>${money(row.balance_after)}원</td>
                      <td>${escapeHtml(repairMojibake(row.memo || ''))}</td>
                    </tr>
                  `).join('')
                : '<tr><td colspan="8" class="mtf-empty">원장 자료가 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
      `
    );
  }

  async function openCustomerSites(customer) {
    const sites = await api(`/final/sites?customer_id=${customer.id}`);
    const modal = openModal(
      `${customerDisplayName(customer)} 납품처/지역`,
      `
        <div class="mtf-actions" style="margin-bottom:12px">
          ${can('customers.write')
            ? '<button type="button" class="mtf-btn primary" data-add-site>납품처 추가</button>'
            : ''}
        </div>
        <div class="mtf-table-wrap">
          <table class="mtf-table">
            <thead>
              <tr>
                <th>납품처</th><th>지역</th><th>기본발송</th><th>전화</th>
                <th>주소</th><th>미수금</th><th>상태</th><th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${sites.length
                ? sites.map((site) => `
                    <tr>
                      <td>${escapeHtml(site.site_name)}</td>
                      <td>${escapeHtml(site.region || '')}</td>
                      <td>${escapeHtml(site.default_delivery_type || '')}</td>
                      <td>${escapeHtml(site.phone || site.mobile || '')}</td>
                      <td>${escapeHtml(site.address || '')}</td>
                      <td>${money(site.receivable_balance)}원</td>
                      <td>${statusBadge(site.status)}</td>
                      <td>
                        ${can('customers.write')
                          ? `<button type="button" class="mtf-btn small" data-edit-site="${site.id}">수정</button>`
                          : ''}
                      </td>
                    </tr>
                  `).join('')
                : '<tr><td colspan="8" class="mtf-empty">납품처가 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
      `
    );

    modal.querySelector('[data-add-site]')?.addEventListener('click', () => {
      openSiteModal(customer, null);
    });
    modal.querySelectorAll('[data-edit-site]').forEach((button) => {
      button.addEventListener('click', () => {
        const site = sites.find(
          (row) => String(row.id) === button.dataset.editSite
        );
        openSiteModal(customer, site);
      });
    });
  }

  function openSiteModal(customer, row = null) {
    const editing = Boolean(row?.id);
    const modal = openModal(
      editing ? '납품처 수정' : '납품처 등록',
      `
        <div class="mtf-form-grid">
          <input type="hidden" name="customer_id" value="${customer.id}">
          <div class="mtf-field">
            <label>거래처</label>
            <input class="mtf-input" value="${escapeHtml(customerDisplayName(customer))}" disabled>
          </div>
          <div class="mtf-field">
            <label>납품처/지역명 *</label>
            <input class="mtf-input" name="site_name" required
                   value="${escapeHtml(row?.site_name || '')}">
          </div>
          <div class="mtf-field">
            <label>지역</label>
            <input class="mtf-input" name="region"
                   value="${escapeHtml(row?.region || '')}">
          </div>
          <div class="mtf-field">
            <label>기본 발송구분</label>
            <select class="mtf-select" name="default_delivery_type">
              ${['택배', '영업방문', '기타'].map((value) => `
                <option value="${value}"
                        ${row?.default_delivery_type === value ? 'selected' : ''}>
                  ${value}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>박싱구분</label>
            <select class="mtf-select" name="default_delivery_group">
              ${['영업부', '다빈치', '기타'].map((value) => `
                <option value="${value}"
                        ${row?.default_delivery_group === value ? 'selected' : ''}>
                  ${value}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>전화</label>
            <input class="mtf-input" name="phone"
                   value="${escapeHtml(row?.phone || '')}">
          </div>
          <div class="mtf-field">
            <label>휴대폰</label>
            <input class="mtf-input" name="mobile"
                   value="${escapeHtml(row?.mobile || '')}">
          </div>
          <div class="mtf-field">
            <label>초기미수금</label>
            <input class="mtf-input" type="text" inputmode="numeric" data-mtf-number-format name="opening_receivable"
                   value="${escapeHtml(wonInputValue(row?.opening_receivable || 0))}">
          </div>
          <div class="mtf-field">
            <label>상태</label>
            <select class="mtf-select" name="status">
              <option value="active" ${row?.status !== 'inactive' ? 'selected' : ''}>사용</option>
              <option value="inactive" ${row?.status === 'inactive' ? 'selected' : ''}>중지</option>
            </select>
          </div>
          ${addressFields(row || {})}
          <div class="mtf-field mtf-span-3">
            <label>메모</label>
            <textarea class="mtf-textarea" name="memo">${escapeHtml(row?.memo || '')}</textarea>
          </div>
        </div>
      `,
      {
        submitText: editing ? '수정 저장' : '납품처 등록',
        onSubmit: async (form) => {
          const data = formObject(form);
          await api(
            editing ? `/customer-sites/${row.id}` : '/customer-sites',
            {
              method: editing ? 'PUT' : 'POST',
              body: JSON.stringify(data)
            }
          );
          closeModal();
          cache.sites = null;
          cache.sitesByCustomer.delete(String(customer.id));
          showToast('납품처를 저장했습니다.');
          await openCustomerSites(customer);
        }
      }
    );
    bindAddressSearch(modal);
  }

  async function renderCustomers(el, force = false) {
    if (!el) return;
    const keepSearchFocus = document.activeElement?.id === 'mtf-customer-search';
    const token = ++activeRenderToken;
    const q = uiState.customerSearch || '';
    const pageSize = Number(uiState.customerPageSize || 20);
    const page = Math.max(Number(uiState.customerPage || 1), 1);
    const offset = (page - 1) * pageSize;

    const hasFrame = Boolean(el.querySelector('[data-mtf-view="customers-v309"]'));
    if (!hasFrame) {
      el.innerHTML = `
        <div class="mtf-root" data-mtf-view="customers-v309">
          <div class="mtf-head"><div><h1>거래처/원장</h1><p>거래처와 납품장소를 독립 단위로 조회합니다.</p></div></div>
          ${customerLoadingHtml()}
        </div>
      `;
    }

    const data = await api(
      `/final/customer-branches?q=${encodeURIComponent(q)}&limit=${pageSize}&offset=${offset}`
    );
    if (token !== activeRenderToken || activePage() !== 'customers') return;

    const rows = Array.isArray(data) ? data : (data.rows || []);
    const total = Array.isArray(data) ? rows.length : Number(data.total || 0);
    uiState.customerTotal = total;

    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    if (page > totalPages) {
      uiState.customerPage = totalPages;
      return renderCustomers(el, true);
    }

    const totalReceivable = rows.reduce(
      (sum, row) => sum + Number(row.receivable_balance || 0),
      0
    );
    const pager = customerPagerHtml({ page, pageSize, total });

    el.innerHTML = `
      <div class="mtf-root" data-mtf-view="customers-v309">
        <div class="mtf-head">
          <div>
            <h1>거래처/원장</h1>
            <p>거래처명 입력 후 <span class="mtf-key">Enter</span> 또는 조회 버튼으로 검색합니다. 납품장소가 다른 거래처는 독립 행으로 표시합니다.</p>
          </div>
          <div class="mtf-actions">
            <button class="mtf-btn help" data-page-help>도움말</button>
            ${can('customers.write')
              ? '<button class="mtf-btn primary" data-customer-add>거래처 등록</button>'
              : ''}
          </div>
        </div>

        <div class="mtf-toolbar">
          <div class="mtf-filter-grid" style="grid-template-columns:minmax(280px,1fr) auto">
            <div class="mtf-field">
              <label>거래처 검색</label>
              <input class="mtf-input" id="mtf-customer-search" data-mtf-allow-enter
                     value="${escapeHtml(q)}"
                     placeholder="거래처명, 납품처, 지역, 전화, 사업자번호를 입력 후 Enter">
            </div>
            <div class="mtf-actions">
              <button class="mtf-btn primary" data-customer-search>조회</button>
              <button class="mtf-btn" data-customer-clear>전체 보기</button>
            </div>
          </div>
          <div class="mtf-summary">
            <div class="mtf-stat"><span>전체 거래처/납품장소</span><strong>${money(total)}</strong></div>
            <div class="mtf-stat"><span>현재 페이지</span><strong>${money(rows.length)}건</strong></div>
            <div class="mtf-stat"><span>현재 페이지 미수금</span><strong>${money(totalReceivable)}원</strong></div>
            <div class="mtf-stat"><span>조회 방식</span><strong>${q ? '검색' : '전체'}</strong></div>
          </div>
        </div>

        <div class="mtf-card">
          ${pager}
          <div class="mtf-table-wrap" style="margin-top:12px" data-mtf-customer-table>
            <table class="mtf-table">
              <thead>
                <tr>
                  <th>No.</th><th>거래처/납품장소</th><th>구분</th><th>전화</th>
                  <th>주소</th><th>미수금</th><th>발송구분별 미수</th><th>상태</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length
                  ? rows.map((customer, index) => {
                      const branchNo = offset + index + 1;
                      const address = customerAddressText(customer);
                      const parent = {
                        ...customer,
                        id: customer.customer_id || customer.id,
                        name: customer.parent_customer_name || customer.customer_name || customer.name,
                        display_name: customer.parent_customer_name || customer.customer_name || customer.name
                      };
                      return `
                        <tr data-customer-row="${escapeHtml(customer.branch_key || customer.id)}"
                            class="${String(customer.branch_key || customer.id) === String(uiState.highlightCustomerId) ? 'mtf-highlight' : ''}">
                          <td>${branchNo}</td>
                          <td>
                            <strong>${escapeHtml(customerDisplayName(customer))}</strong>
                            <span class="mtf-sub">${escapeHtml([
                              customer.parent_customer_name && customer.parent_customer_name !== customerDisplayName(customer) ? `상위 ${customer.parent_customer_name}` : '',
                              customer.region,
                              customer.business_no
                            ].filter(Boolean).join(' · '))}</span>
                          </td>
                          <td>${escapeHtml(customerBranchLabel(customer))}</td>
                          <td>${escapeHtml(formatPhone(customer.phone || customer.mobile || customer.customer_phone) || '')}</td>
                          <td class="mtf-address-cell">${address ? escapeHtml(address) : '<span class="mtf-sub">주소 미등록</span>'}</td>
                          <td><strong>${money(customer.receivable_balance)}원</strong></td>
                          <td>
                            택배 ${money(customer.parcel_receivable)} /
                            방문 ${money(customer.visit_receivable)} /
                            기타 ${money(customer.other_receivable)}
                          </td>
                          <td>${statusBadge(customer.status)}</td>
                          <td>
                            <div class="mtf-actions">
                              <button class="mtf-btn small" data-ledger="${parent.id}">원장</button>
                              <button class="mtf-btn small" data-sites="${parent.id}">납품처</button>
                              ${can('customers.write')
                                ? customer.record_type === 'site'
                                  ? `<button class="mtf-btn small primary" data-edit-site-row="${customer.customer_site_id}">수정</button>`
                                  : `<button class="mtf-btn small primary" data-edit="${parent.id}">수정</button><button class="mtf-btn small danger" data-delete-customer="${parent.id}">삭제</button>`
                                : ''}
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')
                  : '<tr><td colspan="9" class="mtf-empty">검색 결과가 없습니다.</td></tr>'}
              </tbody>
            </table>
          </div>
          ${pager}
        </div>
      </div>
    `;

    const search = el.querySelector('#mtf-customer-search');
    const customerSearchButton = el.querySelector('[data-customer-search]');
    const runCustomerSearch = async () => {
      uiState.customerSearch = search.value.trim();
      uiState.customerPage = 1;
      await withBusyButton(
        customerSearchButton,
        '조회 중...',
        () => renderCustomers(el, true)
      );
    };
    customerSearchButton.addEventListener('click', runCustomerSearch);
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      runCustomerSearch();
    });
    el.querySelector('[data-page-help]').addEventListener('click', () => openPageHelp('customers'));

    if (keepSearchFocus) {
      requestAnimationFrame(() => {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      });
    }

    el.querySelector('[data-customer-clear]').addEventListener('click', async () => {
      uiState.customerSearch = '';
      uiState.highlightCustomerId = null;
      uiState.customerPage = 1;
      await withBusyButton(el.querySelector('[data-customer-clear]'), '불러오는 중...', () => renderCustomers(el, true));
    });

    el.querySelectorAll('[data-customer-page]').forEach((button) => {
      button.addEventListener('click', async () => {
        const pageNo = Number(button.dataset.customerPage);
        if (!Number.isFinite(pageNo) || pageNo < 1) return;
        uiState.customerPage = pageNo;
        await renderCustomers(el, true);
      });
    });

    el.querySelectorAll('[data-customer-page-size]').forEach((select) => {
      select.addEventListener('change', async () => {
        uiState.customerPageSize = Number(select.value || 20);
        localStorage.setItem('mt_customer_page_size', String(uiState.customerPageSize));
        uiState.customerPage = 1;
        await renderCustomers(el, true);
      });
    });

    el.querySelector('[data-customer-add]')?.addEventListener(
      'click',
      () => openCustomerModal()
    );

    el.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', async () => {
        const customer = rows.find(
          (row) => String(row.customer_id || row.id) === button.dataset.edit
        );
        if (customer) openCustomerModal({ ...customer, id: customer.customer_id || customer.id });
      });
    });

    el.querySelectorAll('[data-edit-site-row]').forEach((button) => {
      button.addEventListener('click', async () => {
        const row = rows.find((item) => String(item.customer_site_id) === button.dataset.editSiteRow);
        if (!row) return;
        const parent = {
          id: row.customer_id || row.id,
          name: row.parent_customer_name || row.customer_name || row.name,
          display_name: row.parent_customer_name || row.customer_name || row.name
        };
        const site = {
          id: row.customer_site_id,
          customer_id: row.customer_id,
          site_name: row.site_name || row.display_name || row.name,
          original_customer_name: row.original_customer_name,
          region: row.region,
          default_delivery_type: row.default_delivery_type || '택배',
          default_delivery_group: row.default_delivery_group || '기타',
          phone: row.phone,
          mobile: row.mobile,
          business_no: row.business_no,
          owner_name: row.owner_name,
          opening_receivable: row.opening_receivable || 0,
          status: row.status,
          address: row.address,
          postal_code: row.postal_code,
          road_address: row.road_address,
          jibun_address: row.jibun_address,
          detail_address: row.detail_address,
          address_type: row.address_type,
          memo: row.memo
        };
        openSiteModal(parent, site);
      });
    });

    el.querySelectorAll('[data-delete-customer]').forEach((button) => {
      button.addEventListener('click', async () => {
        const customer = rows.find((row) => String(row.customer_id || row.id) === button.dataset.deleteCustomer);
        if (!customer) return;
        try {
          const check = await api(`/final/customers/${button.dataset.deleteCustomer}/delete-check`);
          if (!check.can_delete) {
            const lines = [
              `거래처명: ${customerDisplayName(customer)}`,
              '',
              '아래 관련 자료가 있어 바로 삭제할 수 없습니다.',
              `- 주문 자료: ${money(check.orders)}건`,
              `- 출고 자료: ${money(check.shipments)}건`,
              `- 수금 자료: ${money(check.payments)}건`,
              `- 미수/원장 자료: ${money(check.receivable_transactions)}건`,
              '',
              '주문·출고·수금·원장 자료를 먼저 정리한 뒤 삭제하세요.'
            ];
            window.alert(lines.join('\n'));
            return;
          }
          const reason = window.prompt('거래처 삭제 사유를 입력하세요.\n삭제 이력은 수정이력에 기록됩니다.');
          if (!reason?.trim()) return;
          await api(`/final/customers/${button.dataset.deleteCustomer}`, { method: 'DELETE', body: JSON.stringify({ delete_reason: reason.trim() }) });
          showToast('거래처를 삭제 처리했습니다.');
          await renderCustomers(el, true);
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });

    el.querySelectorAll('[data-ledger]').forEach((button) => {
      button.addEventListener('click', () => {
        const customer = rows.find((row) => String(row.customer_id || row.id) === button.dataset.ledger);
        if (customer) openCustomerLedger({ ...customer, id: customer.customer_id || customer.id });
      });
    });

    el.querySelectorAll('[data-sites]').forEach((button) => {
      button.addEventListener('click', () => {
        const customer = rows.find((row) => String(row.customer_id || row.id) === button.dataset.sites);
        if (customer) openCustomerSites({ ...customer, id: customer.customer_id || customer.id, name: customer.parent_customer_name || customer.customer_name || customer.name });
      });
    });
  }

  async function openOrderDetail(orderId) {
    const data = await api(`/orders/${orderId}`);
    openModal(
      `주문 상세 ${data.order.order_no}`,
      `
        <div class="mtf-summary">
          <div class="mtf-stat"><span>거래처</span><strong>${escapeHtml(data.order.customer_name)}</strong></div>
          <div class="mtf-stat"><span>납품처</span><strong>${escapeHtml(data.order.site_name || data.order.region || '-')}</strong></div>
          <div class="mtf-stat"><span>발송구분</span><strong>${escapeHtml(data.order.delivery_type || '-')}</strong></div>
          <div class="mtf-stat"><span>금액</span><strong>${money(data.order.total_amount)}원</strong></div>
        </div>
        <h3>품목</h3>
        <div class="mtf-table-wrap">
          <table class="mtf-table">
            <thead><tr><th>품목</th><th>규격</th><th>수량</th><th>출고</th><th>미출고</th><th>단가</th><th>금액</th></tr></thead>
            <tbody>
              ${data.items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.item_name)}</td>
                  <td>${escapeHtml(item.spec || item.sku || '')}</td>
                  <td>${money(item.quantity)}</td>
                  <td>${money(item.shipped_qty)}</td>
                  <td>${money(Number(item.quantity) - Number(item.shipped_qty || 0))}</td>
                  <td>${money(item.unit_price)}원</td>
                  <td>${money(item.amount)}원</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <h3>출고 이력</h3>
        <div class="mtf-table-wrap">
          <table class="mtf-table">
            <thead><tr><th>일시</th><th>발송</th><th>박싱</th><th>방법</th><th>택배사</th><th>송장</th><th>상태</th></tr></thead>
            <tbody>
              ${data.shipments.length
                ? data.shipments.map((shipment) => `
                    <tr>
                      <td>${fmtDate(shipment.shipped_at)}</td>
                      <td>${escapeHtml(shipment.delivery_type || '')}</td>
                      <td>${escapeHtml(shipment.delivery_group || '')}</td>
                      <td>${escapeHtml(shipment.delivery_method || '')}</td>
                      <td>${escapeHtml(shipment.carrier || '')}</td>
                      <td>${escapeHtml(shipment.invoice_no || '')}</td>
                      <td>${statusBadge(shipment.status)}</td>
                    </tr>
                  `).join('')
                : '<tr><td colspan="7" class="mtf-empty">출고 이력이 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
      `
    );
  }

  async function openShipModal(orderId) {
    const carriers = await loadCarriers();
    const modal = openModal(
      '미출고 제품 출고',
      `
        <div class="mtf-form-grid">
          <div class="mtf-field">
            <label>발송구분</label>
            <select class="mtf-select" name="delivery_type">
              <option value="택배">택배</option>
              <option value="영업방문">영업방문</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div class="mtf-field">
            <label>박싱구분</label>
            <select class="mtf-select" name="delivery_group">
              <option value="영업부">영업부</option>
              <option value="다빈치">다빈치</option>
              <option value="기타" selected>기타</option>
            </select>
          </div>
          <div class="mtf-field">
            <label>배송방법</label>
            <select class="mtf-select" name="delivery_method">
              <option value="택배">택배</option>
              <option value="영업방문">영업방문</option>
              <option value="직접수령">직접수령</option>
            </select>
          </div>
          <div class="mtf-field"><label>택배사</label><div style="display:flex;gap:6px"><select class="mtf-select" name="carrier">${carrierOptions(carriers)}</select><button type="button" class="mtf-btn small" data-carrier-add>추가</button></div></div>
          <div class="mtf-field"><label>송장번호</label><input class="mtf-input" name="invoice_no"></div>
          <div class="mtf-field"><label>박스번호</label><input class="mtf-input" name="box_no"></div>
          <div class="mtf-field"><label>확인자</label><input class="mtf-input" name="receiver_name"></div>
          <div class="mtf-field mtf-span-2"><label>메모</label><input class="mtf-input" name="confirmation_note"></div>
        </div>
      `,
      {
        submitText: '미출고 전량 출고',
        onSubmit: async (form) => {
          await api(`/orders/${orderId}/ship`, {
            method: 'POST',
            body: JSON.stringify(formObject(form))
          });
          closeModal();
          showToast('미출고 품목을 출고 처리했습니다.');
          await renderOrders(contentElement());
        }
      }
    );
    modal.querySelector('[data-carrier-add]')?.addEventListener('click', () => addCarrierPrompt(modal.querySelector('[name="carrier"]')));
  }
  function paymentReceivableQuery() {
    const params = new URLSearchParams();
    const filters = uiState.receivableFilters;
    if (filters.customer_id) params.set('customer_id', filters.customer_id);
    else if (filters.customer_q) params.set('customer_q', filters.customer_q);
    if (filters.site_id) params.set('site_id', filters.site_id);
    if (filters.delivery_type) params.set('delivery_type', filters.delivery_type);
    params.set('group', 'customer');
    params.set('require_filter', '1');
    params.set('limit', '1000');
    return params.toString();
  }
  function paymentListQuery() {
    const params = new URLSearchParams();
    const filters = uiState.paymentFilters;
    if (filters.customer_id) params.set('customer_id', filters.customer_id);
    else if (filters.customer_q) params.set('customer_q', filters.customer_q);
    if (filters.site_id) params.set('site_id', filters.site_id);
    if (filters.delivery_type) params.set('delivery_type', filters.delivery_type);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    params.set('limit', '500');
    return params.toString();
  }
  function hasReceivableFilter() {
    const filters = uiState.receivableFilters;
    return Boolean(
      filters.customer_id ||
      filters.customer_q ||
      filters.site_id ||
      filters.delivery_type
    );
  }

  function paymentRegistrationHtml() {
    return `
      <div class="mtf-card" id="mtf-payment-register-card">
        <div class="mtf-head" style="align-items:center">
          <div><h2 style="margin:0">수금 등록</h2></div>
        </div>
        <form id="mtf-payment-form">
          <div class="mtf-form-grid" style="margin-top:12px">
            ${customerAutocompleteHtml({
              id: 'mtf-payment-form-customer',
              label: '거래처',
              required: true
            })}
            <div class="mtf-field">
              <label>납품처/지역</label>
              <select class="mtf-select" name="customer_site_id"
                      id="mtf-payment-form-site">
                <option value="">거래처를 먼저 선택하세요</option>
              </select>
            </div>
            <div class="mtf-field">
              <label>발송구분</label>
              <select class="mtf-select" name="delivery_type"
                      id="mtf-payment-form-delivery">
                <option value="택배">택배</option>
                <option value="영업방문">영업방문</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div class="mtf-field">
              <label>수금일</label>
              <input class="mtf-input" type="date" name="payment_date"
                     value="${today()}">
            </div>
            <div class="mtf-field">
              <label>방법</label>
              <select class="mtf-select" name="method">
                <option value="card">카드</option>
                <option value="bank">송금</option>
                <option value="cash">현금</option>
                <option value="other">기타</option>
              </select>
            </div>
            <div class="mtf-field">
              <label>금액 *</label>
              <input class="mtf-input" type="text" inputmode="numeric" data-mtf-number-format name="amount"
                     id="mtf-payment-amount" required inputmode="numeric">
            </div>
            <div class="mtf-field">
              <label>카드사/입금은행</label>
              <input class="mtf-input" name="card_company">
            </div>
            <div class="mtf-field">
              <label>승인번호</label>
              <input class="mtf-input" name="approval_no">
            </div>
            <div class="mtf-field">
              <label>은행명</label>
              <input class="mtf-input" name="bank_name">
            </div>
            <div class="mtf-field mtf-span-3">
              <label>비고</label>
              <textarea class="mtf-textarea" name="memo"
                        id="mtf-payment-memo"></textarea>
            </div>
          </div>
          <div class="mtf-actions" style="margin-top:12px">
            <button type="submit" class="mtf-btn primary">수금 저장</button>
          </div>
        </form>
      </div>
    `;
  }

  function bindPaymentRegistration(el, customers) {
    const form = el.querySelector('#mtf-payment-form');
    if (!form) return;

    const card = el.querySelector('#mtf-payment-register-card');
    bindCustomerAutocomplete(card, customers);

    const wrapper = card.querySelector(
      '[data-mtf-ac="mtf-payment-form-customer"]'
    );
    const hidden = wrapper.querySelector('[data-mtf-ac-value]');
    const siteSelect = card.querySelector('#mtf-payment-form-site');
    const deliverySelect = card.querySelector('#mtf-payment-form-delivery');
    let currentSites = [];

    wrapper.querySelector('[data-mtf-ac-input]')?.addEventListener('input', () => {
      currentSites = [];
      siteSelect.innerHTML = '<option value="">거래처를 먼저 선택하세요</option>';
    });

    wrapper.addEventListener('mtf-customer-selected', async (event) => {
      const customer = event.detail;
      currentSites = [];
      siteSelect.innerHTML = customer
        ? '<option value="">납품처 불러오는 중...</option>'
        : '<option value="">거래처를 먼저 선택하세요</option>';
      if (!customer) return;

      try {
        const rows = await loadCustomerSites(customer.id);
        if (String(hidden.value) !== String(customer.id)) return;
        currentSites = rows;
        siteSelect.innerHTML = siteOptions(rows, customer.id);
        if (rows.length === 1) {
          siteSelect.value = rows[0].id;
          deliverySelect.value = rows[0].default_delivery_type || '택배';
        }
      } catch (error) {
        siteSelect.innerHTML = '<option value="">납품처를 불러오지 못했습니다</option>';
        showToast(error.message, 'error');
      }
    });

    siteSelect.addEventListener('change', () => {
      const site = currentSites.find(
        (row) => String(row.id) === String(siteSelect.value)
      );
      if (site?.default_delivery_type) {
        deliverySelect.value = site.default_delivery_type;
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = formObject(form);
      if (!data.customer_id) {
        showToast('거래처를 선택하세요.', 'error');
        return;
      }
      if (!Number(data.amount || 0)) {
        showToast('수금 금액을 입력하세요.', 'error');
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = '수금 저장 중...';

      try {
        await api('/payments', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        uiState.paymentReceivablesLoaded = hasReceivableFilter();
        showToast('수금을 등록했습니다.');
        await renderPayments(el);
      } catch (error) {
        showToast(error.message, 'error');
        button.disabled = false;
        button.textContent = '수금 저장';
      }
    });
  }

  async function applyReceivableToPaymentForm(el, row, customers) {
    const form = el.querySelector('#mtf-payment-form');
    if (!form) {
      showToast('수금 등록 권한이 없습니다.', 'error');
      return;
    }

    const customer = customers.find(
      (item) => String(item.id) === String(row.customer_id)
    );
    const sites = await loadCustomerSites(row.customer_id);
    const input = form.querySelector('#mtf-payment-form-customer');
    const hidden = form.querySelector('[name="customer_id"]');
    const siteSelect = form.querySelector('#mtf-payment-form-site');
    const deliverySelect = form.querySelector('#mtf-payment-form-delivery');
    const amountInput = form.querySelector('#mtf-payment-amount');
    const memoInput = form.querySelector('#mtf-payment-memo');

    input.value = customer ? customerDisplayName(customer) : customerDisplayName(row);
    hidden.value = row.customer_id;
    siteSelect.innerHTML = siteOptions(
      sites,
      row.customer_id,
      row.customer_site_id || ''
    );
    if (row.customer_site_id) {
      siteSelect.value = row.customer_site_id;
    } else {
      siteSelect.value = '';
    }
    deliverySelect.value = row.delivery_type || '택배';
    amountInput.value = Math.max(Number(row.receivable_balance || 0), 0);
    memoInput.value = `미수금 반영 · ${row.delivery_type || '기타'} · ${money(row.receivable_balance)}원`;

    el.querySelector('#mtf-payment-register-card').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    requestAnimationFrame(() => {
      amountInput.focus();
      amountInput.select?.();
    });
    showToast('미수금 금액을 수금 등록란에 반영했습니다.');
  }

  async function openPaymentEditModal(payment, customers) {
    const initialSites = await loadCustomerSites(payment.customer_id);
    let currentSites = initialSites;

    const modal = openModal(
      `수금 수정 ${payment.payment_no}`,
      `
        <div class="mtf-form-grid">
          ${customerAutocompleteHtml({
            id: 'mtf-payment-edit-customer',
            label: '거래처',
            value: customerDisplayName(payment),
            customerId: payment.customer_id,
            required: true
          })}
          <div class="mtf-field">
            <label>납품처/지역</label>
            <select class="mtf-select" name="customer_site_id"
                    id="mtf-payment-edit-site">
              ${siteOptions(initialSites, payment.customer_id, payment.customer_site_id || '')}
            </select>
          </div>
          <div class="mtf-field">
            <label>발송구분</label>
            <select class="mtf-select" name="delivery_type"
                    id="mtf-payment-edit-delivery">
              ${['택배', '영업방문', '기타'].map((value) => `
                <option value="${value}"
                        ${payment.delivery_type === value ? 'selected' : ''}>
                  ${value}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>수금일</label>
            <input class="mtf-input" type="date" name="payment_date"
                   value="${fmtDate(payment.payment_date)}">
          </div>
          <div class="mtf-field">
            <label>방법</label>
            <select class="mtf-select" name="method">
              ${[
                ['card', '카드'],
                ['bank', '송금'],
                ['cash', '현금'],
                ['other', '기타']
              ].map(([value, label]) => `
                <option value="${value}"
                        ${payment.method === value ? 'selected' : ''}>
                  ${label}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>금액 *</label>
            <input class="mtf-input" type="text" inputmode="numeric" data-mtf-number-format name="amount" required
                   value="${escapeHtml(wonInputValue(payment.amount))}">
          </div>
          <div class="mtf-field">
            <label>카드사/입금은행</label>
            <input class="mtf-input" name="card_company"
                   value="${escapeHtml(payment.card_company || '')}">
          </div>
          <div class="mtf-field">
            <label>승인번호</label>
            <input class="mtf-input" name="approval_no"
                   value="${escapeHtml(repairMojibake(payment.approval_no || ''))}">
          </div>
          <div class="mtf-field">
            <label>은행명</label>
            <input class="mtf-input" name="bank_name"
                   value="${escapeHtml(payment.bank_name || '')}">
          </div>
          <div class="mtf-field mtf-span-3">
            <label>수정 사유 *</label>
            <input class="mtf-input" name="change_reason" required>
          </div>
          <div class="mtf-field mtf-span-3">
            <label>비고</label>
            <textarea class="mtf-textarea" name="memo">${escapeHtml(repairMojibake(payment.memo || ''))}</textarea>
          </div>
        </div>
      `,
      {
        submitText: '수정 저장',
        onSubmit: async (form) => {
          const data = formObject(form);
          if (!data.customer_id) throw new Error('거래처를 선택하세요.');
          await api(`/payments/${payment.id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
          });
          closeModal();
          showToast('수금을 수정했습니다.');
          await renderPayments(contentElement());
        }
      }
    );

    bindCustomerAutocomplete(modal, customers);
    const wrapper = modal.querySelector(
      '[data-mtf-ac="mtf-payment-edit-customer"]'
    );
    const hidden = wrapper.querySelector('[data-mtf-ac-value]');
    const siteSelect = modal.querySelector('#mtf-payment-edit-site');
    const deliverySelect = modal.querySelector('#mtf-payment-edit-delivery');

    wrapper.querySelector('[data-mtf-ac-input]')?.addEventListener('input', () => {
      currentSites = [];
      siteSelect.innerHTML = '<option value="">거래처를 먼저 선택하세요</option>';
    });

    wrapper.addEventListener('mtf-customer-selected', async (event) => {
      const customer = event.detail;
      currentSites = [];
      siteSelect.innerHTML = customer
        ? '<option value="">납품처 불러오는 중...</option>'
        : '<option value="">거래처를 먼저 선택하세요</option>';
      if (!customer) return;
      try {
        const rows = await loadCustomerSites(customer.id);
        if (String(hidden.value) !== String(customer.id)) return;
        currentSites = rows;
        siteSelect.innerHTML = siteOptions(rows, customer.id);
        if (rows.length === 1) {
          siteSelect.value = rows[0].id;
          deliverySelect.value = rows[0].default_delivery_type || '택배';
        }
      } catch (error) {
        showToast(error.message, 'error');
      }
    });

    siteSelect.addEventListener('change', () => {
      const site = currentSites.find(
        (row) => String(row.id) === String(siteSelect.value)
      );
      if (site?.default_delivery_type) {
        deliverySelect.value = site.default_delivery_type;
      }
    });
  }
  async function renderPayments(el) {
    if (!el) return;
    const token = ++activeRenderToken;
    await applyDateDefaults('payments');

    const paymentCustomerId = uiState.paymentFilters.customer_id;
    const receivableCustomerId = uiState.receivableFilters.customer_id;

    const [customers, paymentSites, receivableSites, receivables, payments] = await Promise.all([
      loadCustomers(),
      paymentCustomerId ? loadCustomerSites(paymentCustomerId) : Promise.resolve([]),
      receivableCustomerId ? loadCustomerSites(receivableCustomerId) : Promise.resolve([]),
      uiState.paymentReceivablesLoaded && hasReceivableFilter()
        ? api(`/final/receivables?${paymentReceivableQuery()}`)
        : Promise.resolve([]),
      api(`/final/payments?${paymentListQuery()}`)
    ]);
    if (token !== activeRenderToken || activePage() !== 'payments') return;

    const receivableTotal = receivables.reduce((sum, row) => sum + Number(row.receivable_balance || 0), 0);
    const paymentTotal = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const customerCount = new Set(receivables.map((row) => String(row.customer_id))).size;
    const initialReceivableMessage = uiState.paymentReceivablesLoaded
      ? '조건에 해당하는 미수금이 없습니다.'
      : '발송구분별 미수금은 아래 별도 조건에서 거래처 또는 발송구분을 선택한 뒤 조회하세요.';

    el.innerHTML = `
      <div class="mtf-root" data-mtf-view="payments-v309">
        <div class="mtf-head">
          <div><h1>수금/미수금</h1></div>
          <div class="mtf-actions"><button class="mtf-btn help" data-page-help>도움말</button></div>
        </div>

        <div class="mtf-toolbar">
          <div class="mtf-head" style="align-items:center;margin-bottom:8px"><h2 style="margin:0;font-size:18px">최근 수금 조회</h2></div>
          <div class="mtf-filter-grid">
            ${customerAutocompleteHtml({
              id: 'mtf-payment-list-customer',
              label: '거래처',
              value: uiState.paymentFilters.customer_q,
              customerId: uiState.paymentFilters.customer_id,
              placeholder: '전체 또는 거래처명 입력'
            })}
            <div class="mtf-field">
              <label>납품처/지역</label>
              <select class="mtf-select" id="mtf-payment-list-site">
                ${siteOptions(paymentSites, paymentCustomerId, uiState.paymentFilters.site_id)}
              </select>
            </div>
            <div class="mtf-field">
              <label>발송구분</label>
              <select class="mtf-select" id="mtf-payment-list-delivery">
                <option value="">전체</option>
                ${['택배', '영업방문', '기타'].map((value) => `
                  <option value="${value}" ${uiState.paymentFilters.delivery_type === value ? 'selected' : ''}>${value}</option>
                `).join('')}
              </select>
            </div>
            <div class="mtf-field">
              <label>수금 시작일</label>
              <input class="mtf-input" type="date" id="mtf-payment-from" value="${escapeHtml(uiState.paymentFilters.date_from)}">
            </div>
            <div class="mtf-field">
              <label>수금 종료일</label>
              <input class="mtf-input" type="date" id="mtf-payment-to" value="${escapeHtml(uiState.paymentFilters.date_to)}">
            </div>
            <div class="mtf-actions">
              <button class="mtf-btn primary" data-payment-search>조회</button>
              <button class="mtf-btn" data-payment-reset>초기화</button>
            </div>
          </div>
          <div class="mtf-summary">
            <div class="mtf-stat"><span>최근 수금</span><strong>${money(paymentTotal)}원</strong></div>
            <div class="mtf-stat"><span>최근 수금 건수</span><strong>${money(payments.length)}</strong></div>
            <div class="mtf-stat"><span>조회 미수금</span><strong>${money(receivableTotal)}원</strong></div>
            <div class="mtf-stat"><span>미수 거래처</span><strong>${money(customerCount)}</strong></div>
          </div>
        </div>

        ${can('payments.write') ? paymentRegistrationHtml() : ''}

        <div class="mtf-card">
          <div class="mtf-head" style="align-items:center"><div><h2 style="margin:0">발송구분별 미수금</h2></div></div>
          <div class="mtf-filter-grid" style="margin-top:12px">
            ${customerAutocompleteHtml({
              id: 'mtf-receivable-filter-customer',
              label: '거래처',
              value: uiState.receivableFilters.customer_q,
              customerId: uiState.receivableFilters.customer_id,
              placeholder: '전체 또는 거래처명 입력'
            })}
            <div class="mtf-field">
              <label>납품처/지역</label>
              <select class="mtf-select" id="mtf-receivable-filter-site">
                ${siteOptions(receivableSites, receivableCustomerId, uiState.receivableFilters.site_id)}
              </select>
            </div>
            <div class="mtf-field">
              <label>발송구분</label>
              <select class="mtf-select" id="mtf-receivable-filter-delivery">
                <option value="">전체</option>
                ${['택배', '영업방문', '기타'].map((value) => `
                  <option value="${value}" ${uiState.receivableFilters.delivery_type === value ? 'selected' : ''}>${value}</option>
                `).join('')}
              </select>
            </div>
            <div class="mtf-actions">
              <button class="mtf-btn primary" data-receivable-search>미수금 조회</button>
              <button class="mtf-btn" data-receivable-reset>미수 조건 초기화</button>
            </div>
          </div>
          <div class="mtf-help-tip" style="margin-top:8px">거래처를 선택하면 발송구분 전체 미수금을 볼 수 있고, 거래처 없이 조회할 때는 발송구분을 선택해야 대기시간 없이 조회됩니다.</div>
          <div class="mtf-table-wrap" style="margin-top:12px">
            <table class="mtf-table">
              <thead><tr><th>거래처</th><th>납품처</th><th>발송구분</th><th>매출</th><th>수금</th><th>미수금</th><th>처리</th></tr></thead>
              <tbody>
                ${receivables.length ? receivables.map((row, index) => `
                  <tr>
                    <td><strong>${escapeHtml(customerDisplayName(row))}</strong></td>
                    <td>${escapeHtml(row.site_name || '기본')}</td>
                    <td>${escapeHtml(row.delivery_type || '')}</td>
                    <td>${money(row.sales_amount)}원</td>
                    <td>${money(row.payment_amount)}원</td>
                    <td><strong>${money(row.receivable_balance)}원</strong></td>
                    <td>${can('payments.write') && Number(row.receivable_balance) > 0 ? `<button class="mtf-btn small success" data-apply-receivable="${index}">수금 반영</button>` : '-'}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7" class="mtf-empty">${initialReceivableMessage}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="mtf-card">
          <h2 style="margin-top:0">최근 수금</h2>
          <div class="mtf-table-wrap">
            <table class="mtf-table">
              <thead><tr><th>일자</th><th>수금번호</th><th>거래처</th><th>발송구분</th><th>납품처</th><th>방법</th><th>금액</th><th>승인/비고</th><th>관리</th></tr></thead>
              <tbody>
                ${payments.length ? payments.map((payment) => `
                  <tr>
                    <td>${fmtDate(payment.payment_date)}</td>
                    <td>${escapeHtml(payment.payment_no)}</td>
                    <td>${escapeHtml(customerDisplayName(payment))}</td>
                    <td>${escapeHtml(payment.delivery_type || '')}</td>
                    <td>${escapeHtml(payment.site_name || payment.region || '')}</td>
                    <td>${statusBadge(payment.method)}</td>
                    <td>${money(payment.amount)}원</td>
                    <td>${escapeHtml(repairMojibake(payment.display_note || payment.approval_no || payment.memo || ''))}</td>
                    <td>${can('payments.write') ? `<div class="mtf-actions"><button class="mtf-btn small primary" data-payment-edit="${payment.id}">수정</button><button class="mtf-btn small danger" data-payment-delete="${payment.id}">삭제</button></div>` : ''}</td>
                  </tr>
                `).join('') : '<tr><td colspan="9" class="mtf-empty">최근 수금 자료가 없습니다.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    bindCustomerAutocomplete(el, customers);

    const listWrapper = el.querySelector('[data-mtf-ac="mtf-payment-list-customer"]');
    const listHidden = listWrapper?.querySelector('[data-mtf-ac-value]');
    const listSite = el.querySelector('#mtf-payment-list-site');
    listWrapper?.querySelector('[data-mtf-ac-input]')?.addEventListener('input', () => {
      uiState.paymentFilters.customer_id = '';
      uiState.paymentFilters.site_id = '';
      listSite.innerHTML = '<option value="">거래처를 먼저 선택하세요</option>';
    });
    listWrapper?.addEventListener('mtf-customer-selected', async (event) => {
      const customer = event.detail;
      uiState.paymentFilters.customer_id = customer?.id || '';
      uiState.paymentFilters.customer_q = customer ? customerDisplayName(customer) : '';
      uiState.paymentFilters.site_id = '';
      listSite.innerHTML = customer ? '<option value="">납품처 불러오는 중...</option>' : '<option value="">거래처를 먼저 선택하세요</option>';
      if (!customer) return;
      try {
        const rows = await loadCustomerSites(customer.id);
        if (String(listHidden?.value || '') !== String(customer.id)) return;
        listSite.innerHTML = siteOptions(rows, customer.id);
      } catch (error) { showToast(error.message, 'error'); }
    });

    const recvWrapper = el.querySelector('[data-mtf-ac="mtf-receivable-filter-customer"]');
    const recvHidden = recvWrapper?.querySelector('[data-mtf-ac-value]');
    const recvSite = el.querySelector('#mtf-receivable-filter-site');
    recvWrapper?.querySelector('[data-mtf-ac-input]')?.addEventListener('input', () => {
      uiState.receivableFilters.customer_id = '';
      uiState.receivableFilters.site_id = '';
      recvSite.innerHTML = '<option value="">거래처를 먼저 선택하세요</option>';
    });
    recvWrapper?.addEventListener('mtf-customer-selected', async (event) => {
      const customer = event.detail;
      uiState.receivableFilters.customer_id = customer?.id || '';
      uiState.receivableFilters.customer_q = customer ? customerDisplayName(customer) : '';
      uiState.receivableFilters.site_id = '';
      recvSite.innerHTML = customer ? '<option value="">납품처 불러오는 중...</option>' : '<option value="">거래처를 먼저 선택하세요</option>';
      if (!customer) return;
      try {
        const rows = await loadCustomerSites(customer.id);
        if (String(recvHidden?.value || '') !== String(customer.id)) return;
        recvSite.innerHTML = siteOptions(rows, customer.id);
      } catch (error) { showToast(error.message, 'error'); }
    });

    const runPaymentListSearch = () => {
      uiState.paymentFilters.customer_q = el.querySelector('#mtf-payment-list-customer').value.trim();
      uiState.paymentFilters.customer_id = listHidden?.value || '';
      uiState.paymentFilters.site_id = uiState.paymentFilters.customer_id ? listSite.value : '';
      uiState.paymentFilters.delivery_type = el.querySelector('#mtf-payment-list-delivery').value;
      uiState.paymentFilters.date_from = el.querySelector('#mtf-payment-from').value;
      uiState.paymentFilters.date_to = el.querySelector('#mtf-payment-to').value || today();
      return renderPayments(el);
    };
    const paymentSearchButton = el.querySelector('[data-payment-search]');
    const runPaymentListSearchWithBusy = () => withBusyButton(paymentSearchButton, '조회 중...', runPaymentListSearch);
    paymentSearchButton.addEventListener('click', runPaymentListSearchWithBusy);
    bindEnterAction(el, '#mtf-payment-list-customer,#mtf-payment-list-site,#mtf-payment-list-delivery,#mtf-payment-from,#mtf-payment-to', runPaymentListSearchWithBusy);

    const runReceivableSearch = () => {
      uiState.receivableFilters.customer_q = el.querySelector('#mtf-receivable-filter-customer').value.trim();
      uiState.receivableFilters.customer_id = recvHidden?.value || '';
      uiState.receivableFilters.site_id = uiState.receivableFilters.customer_id ? recvSite.value : '';
      uiState.receivableFilters.delivery_type = el.querySelector('#mtf-receivable-filter-delivery').value;
      if (!hasReceivableFilter()) {
        uiState.paymentReceivablesLoaded = false;
        showToast('발송구분별 미수금은 거래처 또는 발송구분을 선택하세요.', 'error');
        return;
      }
      uiState.paymentReceivablesLoaded = true;
      return renderPayments(el);
    };
    const receivableSearchButton = el.querySelector('[data-receivable-search]');
    const runReceivableSearchWithBusy = () => withBusyButton(receivableSearchButton, '미수 조회 중...', runReceivableSearch);
    receivableSearchButton.addEventListener('click', runReceivableSearchWithBusy);
    bindEnterAction(el, '#mtf-receivable-filter-customer,#mtf-receivable-filter-site,#mtf-receivable-filter-delivery', runReceivableSearchWithBusy);

    el.querySelector('[data-payment-reset]').addEventListener('click', async () => {
      const range = await loadDateRange();
      uiState.paymentFilters = {
        customer_q: '', customer_id: '', site_id: '', delivery_type: '',
        date_from: range.min_payment_date || '', date_to: today()
      };
      renderPayments(el);
    });

    el.querySelector('[data-receivable-reset]').addEventListener('click', () => {
      uiState.receivableFilters = { customer_q: '', customer_id: '', site_id: '', delivery_type: '' };
      uiState.paymentReceivablesLoaded = false;
      renderPayments(el);
    });

    el.querySelector('[data-page-help]').addEventListener('click', () => openPageHelp('payments'));
    bindPaymentRegistration(el, customers);

    el.querySelectorAll('[data-apply-receivable]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const row = receivables[Number(button.dataset.applyReceivable)];
          await applyReceivableToPaymentForm(el, row, customers);
        } catch (error) { showToast(error.message, 'error'); }
        finally { button.disabled = false; }
      });
    });

    el.querySelectorAll('[data-payment-edit]').forEach((button) => {
      button.addEventListener('click', async () => {
        const payment = payments.find((row) => String(row.id) === button.dataset.paymentEdit);
        try { await openPaymentEditModal(payment, customers); }
        catch (error) { showToast(error.message, 'error'); }
      });
    });

    el.querySelectorAll('[data-payment-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const reason = window.prompt('수금 삭제 사유를 입력하세요.\n수정이력에 영구 기록됩니다.');
        if (!reason?.trim()) return;
        await api(`/payments/${button.dataset.paymentDelete}`, { method: 'DELETE', body: JSON.stringify({ delete_reason: reason.trim() }) });
        uiState.paymentReceivablesLoaded = hasReceivableFilter();
        showToast('수금을 삭제 처리했습니다.');
        renderPayments(el);
      });
    });
  }


  async function renderCurrentPage(force = false) {
    const page = activePage();
    const el = contentElement();
    if (!el || !['customers', 'orders', 'payments'].includes(page)) return;

    const marker = el.querySelector(`[data-mtf-view="${page}-v309"]`);
    if (marker && !force) return;

    try {
      await getUser();
      injectStyles();

      if (page === 'customers') await renderCustomers(el, force);
      if (page === 'orders') await renderOrders(el);
      if (page === 'payments') await renderPayments(el);
    } catch (error) {
      console.error('[MT Final Features]', error);
      showToast(error.message, 'error');
    }
  }

  function scheduleRender(force = false) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderCurrentPage(force), 90);
  }
  // V307: the old manual-only V307 blocker has been removed so Kakao Postcode opens first.

  const observer = new MutationObserver(() => {
    scheduleRender(false);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-page]')) {
      scheduleRender(true);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('mtf-modal-root')) {
      closeModal();
      return;
    }
    if (event.key === 'F1' && ['customers', 'orders', 'payments'].includes(activePage())) {
      event.preventDefault();
      openPageHelp(activePage());
    }
  });

  window.addEventListener('load', () => scheduleRender(true));
  scheduleRender(true);

  console.info(`MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V309 ${VERSION} 로드 완료`);
})();
