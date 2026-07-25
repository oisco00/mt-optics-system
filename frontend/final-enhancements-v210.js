// MT_OPTICS_FINAL_FEATURES_V210
(() => {
  const VERSION = '2.1.0';
  const API_BASE = localStorage.getItem('mt_api_base') || '/api';
  const cache = {
    user: null,
    customers: null,
    sites: null,
    products: null,
    sitesByCustomer: new Map()
  };
  const uiState = {
    customerSearch: '',
    highlightCustomerId: null,
    orderFilters: {
      q: '',
      date_from: '',
      date_to: '',
      customer_q: '',
      customer_id: '',
      delivery_type: '',
      status: ''
    },
    paymentFilters: {
      customer_q: '',
      customer_id: '',
      site_id: '',
      delivery_type: '',
      date_from: monthAgo(),
      date_to: today()
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

  function money(value) {
    return Number(value || 0).toLocaleString('ko-KR');
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
    if (document.getElementById('mt-final-styles-v210')) return;

    const style = document.createElement('style');
    style.id = 'mt-final-styles-v210';
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
      .mtf-btn{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;background:#e2e8f0;color:#0f172a}
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
      .mtf-ac-item:hover,.mtf-ac-item.active{background:#eff6ff}
      .mtf-ac-item:last-child{border-bottom:0}
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
              <li>입력 중 결과가 자동으로 줄어들며 Enter를 누르면 즉시 조회합니다.</li>
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
              <li>조건 입력 후 Enter 또는 조회 버튼을 사용합니다.</li>
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
    for (const [key, value] of Object.entries(data)) {
      if (value === '') data[key] = null;
    }
    return data;
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

      function updateActiveItem() {
        list.querySelectorAll('[data-customer-id]').forEach((button, index) => {
          button.classList.toggle('active', index === activeIndex);
          if (index === activeIndex) {
            button.scrollIntoView({ block: 'nearest' });
          }
        });
      }

      function renderMatches() {
        const keyword = normalizeText(input.value);
        matches = customers
          .filter((customer) => {
            if (!keyword) return true;
            return [
              customer.name,
              customer.code,
              customer.business_no,
              customer.region,
              customer.phone,
              customer.mobile
            ].some((value) => normalizeText(value).includes(keyword));
          })
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'))
          .slice(0, 40);

        activeIndex = -1;
        list.innerHTML = matches.length
          ? matches.map((customer) => `
              <button type="button" class="mtf-ac-item"
                      data-customer-id="${customer.id}">
                <strong>${escapeHtml(customer.name)}</strong>
                <span class="mtf-sub">
                  ${escapeHtml([
                    customer.region,
                    customer.phone || customer.mobile,
                    customer.business_no
                  ].filter(Boolean).join(' · '))}
                </span>
              </button>
            `).join('')
          : `<div class="mtf-empty compact">일치하는 거래처가 없습니다.</div>`;

        list.hidden = false;
      }

      function selectCustomer(customer) {
        input.value = customer?.name || '';
        hidden.value = customer?.id || '';
        list.hidden = true;
        activeIndex = -1;
        wrapper.dispatchEvent(
          new CustomEvent('mtf-customer-selected', {
            bubbles: true,
            detail: customer || null
          })
        );
      }

      input.addEventListener('input', () => {
        hidden.value = '';
        renderMatches();
        options.onInput?.(input.value);
      });

      input.addEventListener('focus', renderMatches);

      input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) return;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (list.hidden) renderMatches();
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
          const exact = customers.find(
            (customer) => normalizeText(customer.name) === normalizeText(input.value)
          );
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
          const exact = customers.find(
            (customer) =>
              normalizeText(customer.name) === normalizeText(input.value)
          );
          if (exact) selectCustomer(exact);
          else if (!input.value.trim()) selectCustomer(null);
          list.hidden = true;
        }, 160);
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
        const customer = customers.find(
          (row) => String(row.id) === button.dataset.customerId
        );
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
            site.default_delivery_type
          ].filter(Boolean).join(' · '))}
        </option>
      `)
    ].join('');
  }

  function bindAddressSearch(scope) {
    scope.querySelectorAll('[data-mtf-address-search]').forEach((button) => {
      button.addEventListener('click', () => {
        const block = button.closest('[data-mtf-address-block]');
        if (!window.daum?.Postcode) {
          showToast('주소검색 서비스를 불러오지 못했습니다.', 'error');
          return;
        }

        new window.daum.Postcode({
          oncomplete(data) {
            const selectedType = data.userSelectedType === 'J' ? 'J' : 'R';
            block.querySelector('[name="postal_code"]').value =
              data.zonecode || '';
            block.querySelector('[name="road_address"]').value =
              data.roadAddress || '';
            block.querySelector('[name="jibun_address"]').value =
              data.jibunAddress || data.autoJibunAddress || '';
            block.querySelector('[name="address_type"]').value = selectedType;
            block.querySelector('[name="address"]').value =
              selectedType === 'J'
                ? (
                    data.jibunAddress ||
                    data.autoJibunAddress ||
                    data.roadAddress ||
                    ''
                  )
                : (data.roadAddress || data.jibunAddress || '');
            block.querySelector('[name="detail_address"]').focus();
          }
        }).open();
      });
    });
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
            <input class="mtf-input" type="number" name="opening_receivable"
                   value="${escapeHtml(row?.opening_receivable || 0)}">
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
      `${customer.name} 거래원장`,
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
      `${customer.name} 납품처/지역`,
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
            <input class="mtf-input" value="${escapeHtml(customer.name)}" disabled>
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
            <input class="mtf-input" type="number" name="opening_receivable"
                   value="${escapeHtml(row?.opening_receivable || 0)}">
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
    const rows = await api(
      `/final/customers?q=${encodeURIComponent(q)}&limit=10000`
    );
    if (token !== activeRenderToken || activePage() !== 'customers') return;

    cache.customers = q ? cache.customers : rows;

    const totalReceivable = rows.reduce(
      (sum, row) => sum + Number(row.receivable_balance || 0),
      0
    );

    el.innerHTML = `
      <div class="mtf-root" data-mtf-view="customers-v210">
        <div class="mtf-head">
          <div><h1>거래처/원장</h1></div>
          <div class="mtf-actions">
            <button class="mtf-btn help" data-page-help>도움말</button>
            ${can('customers.write')
              ? '<button class="mtf-btn primary" data-customer-add>거래처 등록</button>'
              : ''}
          </div>
        </div>

        <div class="mtf-toolbar">
          <div class="mtf-filter-grid" style="grid-template-columns:minmax(260px,1fr) auto">
            <div class="mtf-field">
              <label>거래처 검색</label>
              <input class="mtf-input" id="mtf-customer-search"
                     value="${escapeHtml(q)}"
                     placeholder="거래처명, 지역, 전화, 사업자번호를 입력하세요">
            </div>
            <div class="mtf-actions">
              <button class="mtf-btn primary" data-customer-search>조회</button>
              <button class="mtf-btn" data-customer-clear>전체 보기</button>
            </div>
          </div>
          <div class="mtf-summary">
            <div class="mtf-stat"><span>검색 거래처</span><strong>${money(rows.length)}</strong></div>
            <div class="mtf-stat"><span>검색 미수금 합계</span><strong>${money(totalReceivable)}원</strong></div>
            <div class="mtf-stat"><span>택배 미수금</span><strong>${money(rows.reduce((s, r) => s + Number(r.parcel_receivable || 0), 0))}원</strong></div>
            <div class="mtf-stat"><span>영업방문 미수금</span><strong>${money(rows.reduce((s, r) => s + Number(r.visit_receivable || 0), 0))}원</strong></div>
          </div>
        </div>

        <div class="mtf-card">
          <div class="mtf-table-wrap">
            <table class="mtf-table">
              <thead>
                <tr>
                  <th>No.</th><th>거래처</th><th>납품처</th><th>전화</th>
                  <th>미수금</th><th>발송구분별 미수</th><th>상태</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length
                  ? rows.map((customer, index) => `
                      <tr data-customer-row="${customer.id}"
                          class="${String(customer.id) === String(uiState.highlightCustomerId) ? 'mtf-highlight' : ''}">
                        <td>${index + 1}</td>
                        <td>
                          <strong>${escapeHtml(customer.name)}</strong>
                          <span class="mtf-sub">${escapeHtml([
                            customer.region,
                            customer.business_no
                          ].filter(Boolean).join(' · '))}</span>
                        </td>
                        <td>${money(customer.site_count || 0)}곳</td>
                        <td>${escapeHtml(customer.phone || customer.mobile || '')}</td>
                        <td><strong>${money(customer.receivable_balance)}원</strong></td>
                        <td>
                          택배 ${money(customer.parcel_receivable)} /
                          방문 ${money(customer.visit_receivable)} /
                          기타 ${money(customer.other_receivable)}
                        </td>
                        <td>${statusBadge(customer.status)}</td>
                        <td>
                          <div class="mtf-actions">
                            <button class="mtf-btn small" data-ledger="${customer.id}">원장</button>
                            <button class="mtf-btn small" data-sites="${customer.id}">납품처</button>
                            ${can('customers.write')
                              ? `<button class="mtf-btn small primary" data-edit="${customer.id}">수정</button>`
                              : ''}
                          </div>
                        </td>
                      </tr>
                    `).join('')
                  : '<tr><td colspan="8" class="mtf-empty">검색 결과가 없습니다.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    let debounce;
    const search = el.querySelector('#mtf-customer-search');
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        uiState.customerSearch = search.value.trim();
        renderCustomers(el, true);
      }, 220);
    });

    const customerSearchButton = el.querySelector('[data-customer-search]');
    const runCustomerSearch = async () => {
      clearTimeout(debounce);
      uiState.customerSearch = search.value.trim();
      await withBusyButton(
        customerSearchButton,
        '조회 중...',
        () => renderCustomers(el, true)
      );
    };
    customerSearchButton.addEventListener('click', runCustomerSearch);
    bindEnterAction(el, '#mtf-customer-search', runCustomerSearch);
    el.querySelector('[data-page-help]').addEventListener('click', () => openPageHelp('customers'));

    if (keepSearchFocus) {
      requestAnimationFrame(() => {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      });
    }

    el.querySelector('[data-customer-clear]').addEventListener('click', () => {
      uiState.customerSearch = '';
      uiState.highlightCustomerId = null;
      renderCustomers(el, true);
    });

    el.querySelector('[data-customer-add]')?.addEventListener(
      'click',
      () => openCustomerModal()
    );

    el.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const customer = rows.find(
          (row) => String(row.id) === button.dataset.edit
        );
        openCustomerModal(customer);
      });
    });

    el.querySelectorAll('[data-ledger]').forEach((button) => {
      button.addEventListener('click', () => {
        const customer = rows.find(
          (row) => String(row.id) === button.dataset.ledger
        );
        openCustomerLedger(customer);
      });
    });

    el.querySelectorAll('[data-sites]').forEach((button) => {
      button.addEventListener('click', () => {
        const customer = rows.find(
          (row) => String(row.id) === button.dataset.sites
        );
        openCustomerSites(customer);
      });
    });

    if (uiState.highlightCustomerId) {
      requestAnimationFrame(() => {
        el.querySelector(
          `[data-customer-row="${uiState.highlightCustomerId}"]`
        )?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function orderFilterQuery() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(uiState.orderFilters)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }

  async function renderOrders(el) {
    if (!el) return;
    const token = ++activeRenderToken;
    const [rows, customers] = await Promise.all([
      api(`/final/orders?${orderFilterQuery()}`),
      loadCustomers()
    ]);
    if (token !== activeRenderToken || activePage() !== 'orders') return;

    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0
    );
    const remaining = rows.reduce(
      (sum, row) => sum + Number(row.remaining_qty || 0),
      0
    );

    el.innerHTML = `
      <div class="mtf-root" data-mtf-view="orders-v210">
        <div class="mtf-head">
          <div><h1>주문/출고</h1></div>
          <div class="mtf-actions">
            <button class="mtf-btn help" data-page-help>도움말</button>
            ${can('orders.write')
              ? `
                <button class="mtf-btn primary" data-order-add>주문 등록</button>
                <button class="mtf-btn success" data-quick-ship>주문+즉시출고</button>
              `
              : ''}
          </div>
        </div>

        <div class="mtf-toolbar">
          <div class="mtf-filter-grid">
            <div class="mtf-field">
              <label>기간 시작</label>
              <input class="mtf-input" type="date" id="mtf-order-from"
                     value="${escapeHtml(uiState.orderFilters.date_from)}">
            </div>
            <div class="mtf-field">
              <label>기간 종료</label>
              <input class="mtf-input" type="date" id="mtf-order-to"
                     value="${escapeHtml(uiState.orderFilters.date_to)}">
            </div>
            ${customerAutocompleteHtml({
              id: 'mtf-order-customer-filter',
              label: '거래처',
              value: uiState.orderFilters.customer_q,
              customerId: uiState.orderFilters.customer_id,
              placeholder: '전체 또는 거래처명 입력'
            })}
            <div class="mtf-field">
              <label>발송구분</label>
              <select class="mtf-select" id="mtf-order-delivery">
                <option value="">전체</option>
                ${['택배', '영업방문', '기타'].map((value) => `
                  <option value="${value}"
                          ${uiState.orderFilters.delivery_type === value ? 'selected' : ''}>
                    ${value}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="mtf-field">
              <label>상태</label>
              <select class="mtf-select" id="mtf-order-status">
                <option value="">전체</option>
                ${[
                  ['draft', '임시'],
                  ['confirmed', '주문확정'],
                  ['packed', '포장'],
                  ['shipped', '출고'],
                  ['delivered', '납품완료'],
                  ['canceled', '취소']
                ].map(([value, label]) => `
                  <option value="${value}"
                          ${uiState.orderFilters.status === value ? 'selected' : ''}>
                    ${label}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="mtf-field">
              <label>주문번호/박싱/메모</label>
              <input class="mtf-input" id="mtf-order-q"
                     value="${escapeHtml(uiState.orderFilters.q)}"
                     placeholder="포함 검색">
            </div>
          </div>

          <div class="mtf-actions">
            <button class="mtf-btn primary" data-order-search>조회</button>
            <button class="mtf-btn" data-order-reset>조건 초기화</button>
          </div>

          <div class="mtf-summary">
            <div class="mtf-stat"><span>조회 주문</span><strong>${money(rows.length)}</strong></div>
            <div class="mtf-stat"><span>주문금액</span><strong>${money(totalAmount)}원</strong></div>
            <div class="mtf-stat"><span>미출고 수량</span><strong>${money(remaining)}</strong></div>
            <div class="mtf-stat"><span>미출고 주문</span><strong>${money(rows.filter((row) => Number(row.remaining_qty) > 0).length)}</strong></div>
          </div>
        </div>

        <div class="mtf-card">
          <div class="mtf-table-wrap">
            <table class="mtf-table">
              <thead>
                <tr>
                  <th>일자</th><th>주문번호</th><th>거래처/납품처</th>
                  <th>발송구분</th><th>박싱</th><th>상태</th>
                  <th>품목</th><th>미출고</th><th>금액</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length
                  ? rows.map((order) => `
                      <tr>
                        <td>${fmtDate(order.order_date)}</td>
                        <td>${escapeHtml(order.order_no)}</td>
                        <td>
                          <strong>${escapeHtml(order.customer_name)}</strong>
                          <span class="mtf-sub">${escapeHtml(order.site_name || order.region || '')}</span>
                        </td>
                        <td>${escapeHtml(order.delivery_type || order.delivery_method || '')}</td>
                        <td>${escapeHtml(order.delivery_group || '')}</td>
                        <td>${statusBadge(order.status)}</td>
                        <td>${money(order.item_count)}</td>
                        <td>
                          ${Number(order.remaining_qty) > 0
                            ? `<strong style="color:#b45309">${money(order.remaining_qty)}</strong>`
                            : '0'}
                        </td>
                        <td>${money(order.total_amount)}원</td>
                        <td>
                          <div class="mtf-actions">
                            <button class="mtf-btn small" data-order-view="${order.id}">상세</button>
                            ${can('orders.write')
                              ? `
                                <button class="mtf-btn small primary" data-order-edit="${order.id}">수정</button>
                                ${Number(order.remaining_qty) > 0
                                  ? `<button class="mtf-btn small success" data-order-ship="${order.id}">미출고 출고</button>`
                                  : ''}
                                <button class="mtf-btn small warning" data-order-cancel="${order.id}">취소</button>
                                <button class="mtf-btn small danger" data-order-delete="${order.id}">삭제</button>
                              `
                              : ''}
                          </div>
                        </td>
                      </tr>
                    `).join('')
                  : '<tr><td colspan="10" class="mtf-empty">조회 결과가 없습니다.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    bindCustomerAutocomplete(el, customers);
    const orderCustomerWrapper = el.querySelector(
      '[data-mtf-ac="mtf-order-customer-filter"]'
    );
    const orderCustomerHidden = orderCustomerWrapper?.querySelector('[data-mtf-ac-value]');
    orderCustomerWrapper?.addEventListener(
      'mtf-customer-selected',
      (event) => {
        uiState.orderFilters.customer_id = event.detail?.id || '';
        uiState.orderFilters.customer_q = event.detail?.name || '';
      }
    );
    orderCustomerWrapper?.querySelector('[data-mtf-ac-input]')?.addEventListener(
      'input',
      () => { uiState.orderFilters.customer_id = ''; }
    );

    const runOrderSearch = () => {
      uiState.orderFilters.date_from =
        el.querySelector('#mtf-order-from').value;
      uiState.orderFilters.date_to =
        el.querySelector('#mtf-order-to').value;
      uiState.orderFilters.delivery_type =
        el.querySelector('#mtf-order-delivery').value;
      uiState.orderFilters.status =
        el.querySelector('#mtf-order-status').value;
      uiState.orderFilters.q =
        el.querySelector('#mtf-order-q').value.trim();
      uiState.orderFilters.customer_q =
        el.querySelector('#mtf-order-customer-filter').value.trim();
      uiState.orderFilters.customer_id = orderCustomerHidden?.value || '';
      return renderOrders(el);
    };

    const orderSearchButton = el.querySelector('[data-order-search]');
    const runOrderSearchWithBusy = () => withBusyButton(
      orderSearchButton,
      '조회 중...',
      runOrderSearch
    );
    orderSearchButton.addEventListener('click', runOrderSearchWithBusy);
    bindEnterAction(
      el,
      '#mtf-order-from,#mtf-order-to,#mtf-order-customer-filter,#mtf-order-delivery,#mtf-order-status,#mtf-order-q',
      runOrderSearchWithBusy
    );
    el.querySelector('[data-page-help]').addEventListener('click', () => openPageHelp('orders'));

    el.querySelector('[data-order-reset]').addEventListener('click', () => {
      uiState.orderFilters = {
        q: '',
        date_from: '',
        date_to: '',
        customer_q: '',
        customer_id: '',
        delivery_type: '',
        status: ''
      };
      renderOrders(el);
    });

    el.querySelector('[data-order-add]')?.addEventListener(
      'click',
      () => openOrderForm({ quickShip: false })
    );
    el.querySelector('[data-quick-ship]')?.addEventListener(
      'click',
      () => openOrderForm({ quickShip: true })
    );

    el.querySelectorAll('[data-order-view]').forEach((button) => {
      button.addEventListener(
        'click',
        () => openOrderDetail(button.dataset.orderView)
      );
    });
    el.querySelectorAll('[data-order-edit]').forEach((button) => {
      button.addEventListener(
        'click',
        () => openOrderForm({
          orderId: button.dataset.orderEdit,
          quickShip: false
        })
      );
    });
    el.querySelectorAll('[data-order-ship]').forEach((button) => {
      button.addEventListener(
        'click',
        () => openShipModal(button.dataset.orderShip)
      );
    });
    el.querySelectorAll('[data-order-cancel]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await confirmModal(
          '주문 취소',
          '주문을 취소하고 매출 미수금도 반대로 조정할까요?',
          '주문 취소'
        );
        if (!ok) return;
        await api(`/orders/${button.dataset.orderCancel}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'canceled' })
        });
        showToast('주문을 취소했습니다.');
        renderOrders(el);
      });
    });
    el.querySelectorAll('[data-order-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const reason = window.prompt(
          '주문 삭제 사유를 입력하세요.\n수정이력에 영구 기록됩니다.'
        );
        if (!reason?.trim()) return;
        await api(`/orders/${button.dataset.orderDelete}`, {
          method: 'DELETE',
          body: JSON.stringify({ delete_reason: reason.trim() })
        });
        showToast('주문을 삭제 처리했습니다.');
        renderOrders(el);
      });
    });
  }

  function itemRowsHtml(items, products) {
    return items.map((item, index) => `
      <div class="mtf-item-row" data-item-index="${index}">
        <div class="mtf-field mtf-product">
          <label>제품</label>
          <select class="mtf-select" name="product_id">
            <option value="">직접입력</option>
            ${products.map((product) => `
              <option value="${product.id}"
                      ${String(item.product_id || '') === String(product.id) ? 'selected' : ''}>
                ${escapeHtml(`${product.name} · ${product.sku || ''} · 재고 ${product.current_stock || 0}`)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="mtf-field">
          <label>수량</label>
          <input class="mtf-input" type="number" min="1" name="quantity"
                 value="${escapeHtml(item.quantity || 1)}">
        </div>
        <div class="mtf-field">
          <label>단가</label>
          <input class="mtf-input" type="number" min="0" name="unit_price"
                 value="${escapeHtml(item.unit_price || 0)}">
        </div>
        <div class="mtf-field">
          <label>품목명</label>
          <input class="mtf-input" name="item_name"
                 value="${escapeHtml(item.item_name || '')}">
        </div>
        <button type="button" class="mtf-btn danger small"
                data-remove-item="${index}">삭제</button>
        <input type="hidden" name="spec" value="${escapeHtml(item.spec || '')}">
      </div>
    `).join('');
  }

  async function openOrderForm({
    orderId = null,
    quickShip = false
  } = {}) {
    const [customers, sites, products] = await Promise.all([
      loadCustomers(),
      loadSites(),
      loadProducts()
    ]);

    let order = null;
    let shipments = [];
    let items = [{
      product_id: products[0]?.id || '',
      item_name: products[0]?.name || '',
      spec: products[0]?.spec || '',
      quantity: 1,
      unit_price: products[0]?.default_price || 0
    }];

    if (orderId) {
      const detail = await api(`/orders/${orderId}`);
      order = detail.order;
      shipments = detail.shipments || [];
      if (shipments.length) {
        showToast('출고 이력이 있는 주문은 직접 수정할 수 없습니다.', 'error');
        return;
      }
      items = detail.items.map((item) => ({
        product_id: item.product_id || '',
        item_name: item.item_name || '',
        spec: item.spec || '',
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0)
      }));
    }

    const title = quickShip
      ? '주문등록과 즉시출고'
      : orderId
        ? `주문 수정 ${order.order_no}`
        : '주문 등록';

    const modal = openModal(
      title,
      `
        <div class="mtf-form-grid">
          ${customerAutocompleteHtml({
            id: 'mtf-order-form-customer',
            label: '거래처',
            value: order?.customer_name || '',
            customerId: order?.customer_id || '',
            required: true
          })}
          <div class="mtf-field">
            <label>납품처/지역</label>
            <select class="mtf-select" name="customer_site_id"
                    id="mtf-order-form-site">
              ${siteOptions(sites, order?.customer_id || '', order?.customer_site_id || '')}
            </select>
          </div>
          <div class="mtf-field">
            <label>발송구분</label>
            <select class="mtf-select" name="delivery_type"
                    id="mtf-order-form-delivery">
              ${['택배', '영업방문', '기타'].map((value) => `
                <option value="${value}"
                        ${(order?.delivery_type || '택배') === value ? 'selected' : ''}>
                  ${value}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>주문일</label>
            <input class="mtf-input" type="date" name="order_date"
                   value="${escapeHtml(order?.order_date ? fmtDate(order.order_date) : today())}">
          </div>
          <div class="mtf-field">
            <label>접수경로</label>
            <select class="mtf-select" name="source">
              ${[
                ['phone', '전화'],
                ['kakao', '카톡'],
                ['sales_visit', '영업방문'],
                ['ecount', '이카운트'],
                ['direct_ship', '즉시출고'],
                ['other', '기타']
              ].map(([value, label]) => `
                <option value="${value}"
                        ${(order?.source || (quickShip ? 'direct_ship' : 'phone')) === value ? 'selected' : ''}>
                  ${label}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>박싱구분</label>
            <select class="mtf-select" name="delivery_group">
              ${['영업부', '다빈치', '기타'].map((value) => `
                <option value="${value}"
                        ${(order?.delivery_group || '기타') === value ? 'selected' : ''}>
                  ${value}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>배송방법</label>
            <select class="mtf-select" name="delivery_method">
              ${['택배', '영업방문', '직접수령', '기타'].map((value) => `
                <option value="${value}"
                        ${(order?.delivery_method || '택배') === value ? 'selected' : ''}>
                  ${value}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="mtf-field">
            <label>부가세</label>
            <input class="mtf-input" type="number" name="vat_amount"
                   value="${escapeHtml(order?.vat_amount || 0)}">
          </div>
          ${orderId
            ? `
              <div class="mtf-field">
                <label>수정 사유 *</label>
                <input class="mtf-input" name="change_reason" required>
              </div>
            `
            : ''}
          ${quickShip
            ? `
              <div class="mtf-field">
                <label>택배사</label>
                <input class="mtf-input" name="carrier">
              </div>
              <div class="mtf-field">
                <label>송장번호</label>
                <input class="mtf-input" name="invoice_no">
              </div>
              <div class="mtf-field">
                <label>확인자</label>
                <input class="mtf-input" name="receiver_name">
              </div>
            `
            : ''}
          <div class="mtf-field mtf-span-3">
            <label>품목</label>
            <div class="mtf-items" id="mtf-order-items"></div>
            <button type="button" class="mtf-btn" data-add-item
                    style="margin-top:8px">품목 추가</button>
          </div>
          <div class="mtf-field mtf-span-3">
            <label>메모</label>
            <textarea class="mtf-textarea" name="memo">${escapeHtml(order?.memo || '')}</textarea>
          </div>
        </div>
      `,
      {
        submitText: quickShip
          ? '주문등록 후 즉시출고'
          : orderId
            ? '수정 저장'
            : '주문 저장',
        onSubmit: async (form) => {
          const data = formObject(form);
          const customerId = form.querySelector(
            '[name="customer_id"]'
          ).value;
          if (!customerId) throw new Error('거래처를 선택하세요.');

          const savedItems = [...form.querySelectorAll('[data-item-index]')]
            .map((row) => ({
              product_id: row.querySelector('[name="product_id"]').value || null,
              item_name: row.querySelector('[name="item_name"]').value || null,
              spec: row.querySelector('[name="spec"]').value || null,
              quantity: Number(row.querySelector('[name="quantity"]').value || 0),
              unit_price: Number(row.querySelector('[name="unit_price"]').value || 0)
            }))
            .filter((item) => item.product_id || item.item_name);

          if (!savedItems.length) {
            throw new Error('품목을 1개 이상 입력하세요.');
          }

          const payload = {
            ...data,
            customer_id: customerId,
            items: savedItems
          };

          if (quickShip) {
            await api('/final/quick-order-ship', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            showToast('주문등록과 출고를 동시에 완료했습니다.');
          } else {
            await api(orderId ? `/orders/${orderId}` : '/orders', {
              method: orderId ? 'PUT' : 'POST',
              body: JSON.stringify(payload)
            });
            showToast(orderId ? '주문을 수정했습니다.' : '주문을 등록했습니다.');
          }

          closeModal();
          await renderOrders(contentElement());
        }
      }
    );

    bindCustomerAutocomplete(modal, customers);
    const siteSelect = modal.querySelector('#mtf-order-form-site');
    const deliverySelect = modal.querySelector('#mtf-order-form-delivery');

    modal.querySelector('[data-mtf-ac]')?.addEventListener(
      'mtf-customer-selected',
      (event) => {
        const customer = event.detail;
        siteSelect.innerHTML = siteOptions(sites, customer?.id || '');
        if (!customer) {
          deliverySelect.value = '택배';
          return;
        }
        const first = sites.find(
          (site) => String(site.customer_id) === String(customer.id)
        );
        if (first) {
          siteSelect.value = first.id;
          deliverySelect.value = first.default_delivery_type || '택배';
        }
      }
    );

    siteSelect.addEventListener('change', () => {
      const site = sites.find(
        (row) => String(row.id) === String(siteSelect.value)
      );
      if (site?.default_delivery_type) {
        deliverySelect.value = site.default_delivery_type;
      }
    });

    const wrap = modal.querySelector('#mtf-order-items');

    function renderItems() {
      wrap.innerHTML = itemRowsHtml(items, products);
      wrap.querySelectorAll('[name="product_id"]').forEach((select) => {
        select.addEventListener('change', () => {
          const row = select.closest('[data-item-index]');
          const index = Number(row.dataset.itemIndex);
          const product = products.find(
            (item) => String(item.id) === select.value
          );
          if (product) {
            items[index] = {
              ...items[index],
              product_id: product.id,
              item_name: product.name,
              spec: product.spec || '',
              unit_price: Number(product.default_price || 0)
            };
            renderItems();
          }
        });
      });
      wrap.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', () => {
          const row = input.closest('[data-item-index]');
          const index = Number(row.dataset.itemIndex);
          items[index] = {
            ...items[index],
            quantity: Number(row.querySelector('[name="quantity"]').value || 0),
            unit_price: Number(row.querySelector('[name="unit_price"]').value || 0),
            item_name: row.querySelector('[name="item_name"]').value,
            spec: row.querySelector('[name="spec"]').value
          };
        });
      });
      wrap.querySelectorAll('[data-remove-item]').forEach((button) => {
        button.addEventListener('click', () => {
          items.splice(Number(button.dataset.removeItem), 1);
          if (!items.length) {
            items.push({
              product_id: '',
              item_name: '',
              spec: '',
              quantity: 1,
              unit_price: 0
            });
          }
          renderItems();
        });
      });
    }

    modal.querySelector('[data-add-item]').addEventListener('click', () => {
      items.push({
        product_id: '',
        item_name: '',
        spec: '',
        quantity: 1,
        unit_price: 0
      });
      renderItems();
    });

    renderItems();
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

  function openShipModal(orderId) {
    openModal(
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
          <div class="mtf-field"><label>택배사</label><input class="mtf-input" name="carrier"></div>
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
  }

  function paymentReceivableQuery() {
    const params = new URLSearchParams();
    const filters = uiState.paymentFilters;
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
    const filters = uiState.paymentFilters;
    return Boolean(
      filters.customer_id ||
      filters.customer_q ||
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
              <input class="mtf-input" type="number" min="1" name="amount"
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

    input.value = customer?.name || row.customer_name || '';
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
            value: payment.customer_name,
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
            <input class="mtf-input" type="number" name="amount" required
                   value="${payment.amount}">
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
    const customerId = uiState.paymentFilters.customer_id;

    const [customers, filterSites, receivables, payments] = await Promise.all([
      loadCustomers(),
      customerId ? loadCustomerSites(customerId) : Promise.resolve([]),
      uiState.paymentReceivablesLoaded && hasReceivableFilter()
        ? api(`/final/receivables?${paymentReceivableQuery()}`)
        : Promise.resolve([]),
      api(`/final/payments?${paymentListQuery()}`)
    ]);
    if (token !== activeRenderToken || activePage() !== 'payments') return;

    const receivableTotal = receivables.reduce(
      (sum, row) => sum + Number(row.receivable_balance || 0),
      0
    );
    const paymentTotal = payments.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );
    const customerCount = new Set(
      receivables.map((row) => String(row.customer_id))
    ).size;

    const initialReceivableMessage = uiState.paymentReceivablesLoaded
      ? '조건에 해당하는 미수금이 없습니다.'
      : '거래처 또는 발송구분을 선택한 뒤 조회하세요.';

    el.innerHTML = `
      <div class="mtf-root" data-mtf-view="payments-v210">
        <div class="mtf-head">
          <div><h1>수금/미수금</h1></div>
          <div class="mtf-actions">
            <button class="mtf-btn help" data-page-help>도움말</button>
          </div>
        </div>

        <div class="mtf-toolbar">
          <div class="mtf-filter-grid">
            ${customerAutocompleteHtml({
              id: 'mtf-payment-filter-customer',
              label: '거래처',
              value: uiState.paymentFilters.customer_q,
              customerId: uiState.paymentFilters.customer_id,
              placeholder: '전체 또는 거래처명 입력'
            })}
            <div class="mtf-field">
              <label>납품처/지역</label>
              <select class="mtf-select" id="mtf-payment-filter-site">
                ${siteOptions(filterSites, customerId, uiState.paymentFilters.site_id)}
              </select>
            </div>
            <div class="mtf-field">
              <label>발송구분</label>
              <select class="mtf-select" id="mtf-payment-filter-delivery">
                <option value="">전체</option>
                ${['택배', '영업방문', '기타'].map((value) => `
                  <option value="${value}"
                          ${uiState.paymentFilters.delivery_type === value ? 'selected' : ''}>
                    ${value}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="mtf-field">
              <label>수금 시작일</label>
              <input class="mtf-input" type="date" id="mtf-payment-from"
                     value="${escapeHtml(uiState.paymentFilters.date_from)}">
            </div>
            <div class="mtf-field">
              <label>수금 종료일</label>
              <input class="mtf-input" type="date" id="mtf-payment-to"
                     value="${escapeHtml(uiState.paymentFilters.date_to)}">
            </div>
            <div class="mtf-actions">
              <button class="mtf-btn primary" data-payment-search>조회</button>
              <button class="mtf-btn" data-payment-reset>초기화</button>
            </div>
          </div>

          <div class="mtf-summary">
            <div class="mtf-stat"><span>조회 미수금</span><strong>${money(receivableTotal)}원</strong></div>
            <div class="mtf-stat"><span>조회 거래처</span><strong>${money(customerCount)}</strong></div>
            <div class="mtf-stat"><span>최근 수금</span><strong>${money(paymentTotal)}원</strong></div>
            <div class="mtf-stat"><span>최근 수금 건수</span><strong>${money(payments.length)}</strong></div>
          </div>
        </div>

        ${can('payments.write') ? paymentRegistrationHtml() : ''}

        <div class="mtf-card">
          <div class="mtf-head" style="align-items:center">
            <div><h2 style="margin:0">발송구분별 미수금</h2></div>
          </div>
          <div class="mtf-table-wrap" style="margin-top:12px">
            <table class="mtf-table">
              <thead>
                <tr>
                  <th>거래처</th><th>납품처</th><th>발송구분</th>
                  <th>매출</th><th>수금</th><th>미수금</th><th>처리</th>
                </tr>
              </thead>
              <tbody>
                ${receivables.length
                  ? receivables.map((row, index) => `
                      <tr>
                        <td><strong>${escapeHtml(row.customer_name)}</strong></td>
                        <td>${escapeHtml(row.site_name || '기본')}</td>
                        <td>${escapeHtml(row.delivery_type || '')}</td>
                        <td>${money(row.sales_amount)}원</td>
                        <td>${money(row.payment_amount)}원</td>
                        <td><strong>${money(row.receivable_balance)}원</strong></td>
                        <td>
                          ${can('payments.write') && Number(row.receivable_balance) > 0
                            ? `<button class="mtf-btn small success" data-apply-receivable="${index}">수금 반영</button>`
                            : '-'}
                        </td>
                      </tr>
                    `).join('')
                  : `<tr><td colspan="7" class="mtf-empty">${initialReceivableMessage}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="mtf-card">
          <h2 style="margin-top:0">최근 수금</h2>
          <div class="mtf-table-wrap">
            <table class="mtf-table">
              <thead>
                <tr>
                  <th>일자</th><th>수금번호</th><th>거래처</th><th>발송구분</th>
                  <th>납품처</th><th>방법</th><th>금액</th><th>승인/비고</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                ${payments.length
                  ? payments.map((payment) => `
                      <tr>
                        <td>${fmtDate(payment.payment_date)}</td>
                        <td>${escapeHtml(payment.payment_no)}</td>
                        <td>${escapeHtml(payment.customer_name)}</td>
                        <td>${escapeHtml(payment.delivery_type || '')}</td>
                        <td>${escapeHtml(payment.site_name || payment.region || '')}</td>
                        <td>${statusBadge(payment.method)}</td>
                        <td>${money(payment.amount)}원</td>
                        <td>${escapeHtml(repairMojibake(payment.display_note || payment.approval_no || payment.memo || ''))}</td>
                        <td>
                          ${can('payments.write')
                            ? `
                              <div class="mtf-actions">
                                <button class="mtf-btn small primary" data-payment-edit="${payment.id}">수정</button>
                                <button class="mtf-btn small danger" data-payment-delete="${payment.id}">삭제</button>
                              </div>
                            `
                            : ''}
                        </td>
                      </tr>
                    `).join('')
                  : '<tr><td colspan="9" class="mtf-empty">최근 수금 자료가 없습니다.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    bindCustomerAutocomplete(el, customers);
    const filterWrapper = el.querySelector(
      '[data-mtf-ac="mtf-payment-filter-customer"]'
    );
    const filterHidden = filterWrapper?.querySelector('[data-mtf-ac-value]');
    const filterSite = el.querySelector('#mtf-payment-filter-site');

    filterWrapper?.querySelector('[data-mtf-ac-input]')?.addEventListener(
      'input',
      () => {
        uiState.paymentFilters.customer_id = '';
        uiState.paymentFilters.site_id = '';
        filterSite.innerHTML = '<option value="">거래처를 먼저 선택하세요</option>';
      }
    );

    filterWrapper?.addEventListener('mtf-customer-selected', async (event) => {
      const customer = event.detail;
      uiState.paymentFilters.customer_id = customer?.id || '';
      uiState.paymentFilters.customer_q = customer?.name || '';
      uiState.paymentFilters.site_id = '';
      filterSite.innerHTML = customer
        ? '<option value="">납품처 불러오는 중...</option>'
        : '<option value="">거래처를 먼저 선택하세요</option>';
      if (!customer) return;
      try {
        const rows = await loadCustomerSites(customer.id);
        if (String(filterHidden?.value || '') !== String(customer.id)) return;
        filterSite.innerHTML = siteOptions(rows, customer.id);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });

    const runPaymentSearch = () => {
      uiState.paymentFilters.customer_q =
        el.querySelector('#mtf-payment-filter-customer').value.trim();
      uiState.paymentFilters.customer_id = filterHidden?.value || '';
      uiState.paymentFilters.site_id = uiState.paymentFilters.customer_id
        ? filterSite.value
        : '';
      uiState.paymentFilters.delivery_type =
        el.querySelector('#mtf-payment-filter-delivery').value;
      uiState.paymentFilters.date_from =
        el.querySelector('#mtf-payment-from').value;
      uiState.paymentFilters.date_to =
        el.querySelector('#mtf-payment-to').value;

      if (!hasReceivableFilter()) {
        uiState.paymentReceivablesLoaded = false;
        showToast('미수금 조회는 거래처 또는 발송구분을 선택하세요.', 'error');
        return;
      }
      uiState.paymentReceivablesLoaded = true;
      return renderPayments(el);
    };

    const paymentSearchButton = el.querySelector('[data-payment-search]');
    const runPaymentSearchWithBusy = () => withBusyButton(
      paymentSearchButton,
      '조회 중...',
      runPaymentSearch
    );
    paymentSearchButton.addEventListener('click', runPaymentSearchWithBusy);
    bindEnterAction(
      el,
      '#mtf-payment-filter-customer,#mtf-payment-filter-site,#mtf-payment-filter-delivery,#mtf-payment-from,#mtf-payment-to',
      runPaymentSearchWithBusy
    );

    el.querySelector('[data-payment-reset]').addEventListener('click', () => {
      uiState.paymentFilters = {
        customer_q: '',
        customer_id: '',
        site_id: '',
        delivery_type: '',
        date_from: monthAgo(),
        date_to: today()
      };
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
        } catch (error) {
          showToast(error.message, 'error');
        } finally {
          button.disabled = false;
        }
      });
    });

    el.querySelectorAll('[data-payment-edit]').forEach((button) => {
      button.addEventListener('click', async () => {
        const payment = payments.find(
          (row) => String(row.id) === button.dataset.paymentEdit
        );
        try {
          await openPaymentEditModal(payment, customers);
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });

    el.querySelectorAll('[data-payment-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const reason = window.prompt(
          '수금 삭제 사유를 입력하세요.\n수정이력에 영구 기록됩니다.'
        );
        if (!reason?.trim()) return;
        await api(`/payments/${button.dataset.paymentDelete}`, {
          method: 'DELETE',
          body: JSON.stringify({ delete_reason: reason.trim() })
        });
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

    const marker = el.querySelector(`[data-mtf-view="${page}-v210"]`);
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

  console.info(`MT옵틱스 최종 기능 보완 ${VERSION} 로드 완료`);
})();
