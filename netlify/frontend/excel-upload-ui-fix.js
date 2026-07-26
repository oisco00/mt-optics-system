// MT_OPTICS_UPLOAD_UI_FIX_V157
(() => {
  const originalFetch = window.fetch.bind(window);
  const IMPORT_URL_PART = '/imports/excel';

  let state = 'idle'; // idle | uploading | waiting_confirm
  let timer = null;
  let elapsedSeconds = 0;
  let observer = null;

  function getElements() {
    const form = document.querySelector('#excel-import-form');
    return {
      form,
      fileInput: form?.querySelector('input[type="file"]') || null,
      submitButton: form?.querySelector('button[type="submit"]') || null,
      resultBox: document.getElementById('import-result')
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function numberText(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  function lockCurrentForm(buttonText) {
    const { form, fileInput, submitButton } = getElements();
    const locked = state !== 'idle';

    if (form) form.dataset.submitting = locked ? '1' : '0';

    if (submitButton) {
      if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText =
          submitButton.textContent || '선택한 엑셀 등록';
      }

      submitButton.disabled = locked;
      submitButton.setAttribute('aria-busy', locked ? 'true' : 'false');
      submitButton.textContent = locked
        ? buttonText
        : submitButton.dataset.originalText;
      submitButton.style.cursor = locked ? 'wait' : '';
      submitButton.style.opacity = locked ? '0.65' : '';
    }

    if (fileInput) fileInput.disabled = locked;

    document.documentElement.style.cursor = locked ? 'wait' : '';
    document.body.style.cursor = locked ? 'wait' : '';
  }

  function ensureObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (state === 'uploading') {
        lockCurrentForm('등록 처리 중...');
      } else if (state === 'waiting_confirm') {
        lockCurrentForm('등록 완료 · 확인 대기 중...');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function showProgress() {
    const { resultBox } = getElements();
    if (!resultBox) return;

    resultBox.innerHTML = `
      <div class="card"
           data-import-progress-v157="1"
           style="margin-top:12px;border:1px solid #bfdbfe;background:#eff6ff;padding:12px 14px">
        <strong>엑셀 자료를 등록하고 있습니다.</strong>
        <p style="margin:8px 0 0">
          완료 팝업이 표시될 때까지 다시 클릭하지 마세요.
          경과시간: <span id="import-elapsed-v157">0초</span>
        </p>
      </div>
    `;
  }

  function removeExistingModal() {
    document.getElementById('excel-import-modal-v157')?.remove();
  }

  function createModal({ success, title, messageHtml, elapsed }) {
    removeExistingModal();

    const overlay = document.createElement('div');
    overlay.id = 'excel-import-modal-v157';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'excel-import-modal-title-v157');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:100000',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'background:rgba(15,23,42,.52)'
    ].join(';');

    overlay.innerHTML = `
      <div style="
        width:min(520px,100%);
        background:#fff;
        border-radius:16px;
        box-shadow:0 24px 70px rgba(15,23,42,.35);
        overflow:hidden;
        border:1px solid ${success ? '#86efac' : '#fecaca'};
      ">
        <div style="
          padding:18px 22px;
          background:${success ? '#f0fdf4' : '#fef2f2'};
          color:${success ? '#166534' : '#991b1b'};
          font-size:18px;
          font-weight:700;
        " id="excel-import-modal-title-v157">
          ${escapeHtml(title)}
        </div>

        <div style="padding:20px 22px;color:#1e293b;line-height:1.65">
          ${messageHtml}

          <div style="
            margin-top:14px;
            padding:10px 12px;
            border-radius:10px;
            background:#f8fafc;
            color:#475569;
          ">
            처리시간: <strong>${escapeHtml(elapsed)}초</strong>
          </div>

          <p style="margin:14px 0 0;color:#64748b">
            확인을 누르면 처리시간과 선택 파일을 초기화하고 화면을 자동으로 새로고침합니다.
          </p>
        </div>

        <div style="
          padding:0 22px 20px;
          display:flex;
          justify-content:flex-end;
        ">
          <button type="button"
                  id="excel-import-modal-ok-v157"
                  style="
                    min-width:110px;
                    border:0;
                    border-radius:10px;
                    padding:11px 20px;
                    background:${success ? '#16a34a' : '#dc2626'};
                    color:#fff;
                    font-size:15px;
                    font-weight:700;
                    cursor:pointer;
                  ">
            확인
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const okButton = document.getElementById('excel-import-modal-ok-v157');
    okButton?.focus();

    okButton?.addEventListener('click', () => {
      resetAndReload();
    }, { once: true });
  }

  function summarizePayload(payload) {
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

    if (!rows.length) {
      return '<p style="margin:0">엑셀 자료가 정상적으로 등록되었습니다.</p>';
    }

    return rows.map((row) => `
      <div style="
        margin-top:8px;
        padding:10px 12px;
        border:1px solid #dcfce7;
        border-radius:10px;
        background:#f7fee7;
      ">
        <strong>${escapeHtml(row.file_name || '엑셀 파일')}</strong><br>
        등록 ${numberText(row.inserted)}
        · 수정 ${numberText(row.updated)}
        · 건너뜀 ${numberText(row.skipped)}
        · 오류 ${numberText(row.errors)}
      </div>
    `).join('');
  }

  function beginUpload() {
    state = 'uploading';
    elapsedSeconds = 0;

    ensureObserver();
    lockCurrentForm('등록 처리 중...');
    showProgress();

    window.clearInterval(timer);
    timer = window.setInterval(() => {
      elapsedSeconds += 1;
      const target = document.getElementById('import-elapsed-v157');
      if (target) target.textContent = `${elapsedSeconds}초`;
    }, 1000);
  }

  function finishSuccess(payload) {
    window.clearInterval(timer);
    timer = null;
    state = 'waiting_confirm';
    lockCurrentForm('등록 완료 · 확인 대기 중...');

    createModal({
      success: true,
      title: '엑셀 등록이 완료되었습니다.',
      messageHtml: summarizePayload(payload),
      elapsed: elapsedSeconds
    });
  }

  function finishFailure(message) {
    window.clearInterval(timer);
    timer = null;
    state = 'waiting_confirm';
    lockCurrentForm('등록 실패 · 확인 대기 중...');

    createModal({
      success: false,
      title: '엑셀 등록에 실패했습니다.',
      messageHtml: `
        <p style="margin:0">
          ${escapeHtml(message)}
        </p>
        <p style="margin:12px 0 0;color:#64748b">
          확인을 누르면 화면을 초기화한 후 다시 시도할 수 있습니다.
        </p>
      `,
      elapsed: elapsedSeconds
    });
  }

  function resetAndReload() {
    window.clearInterval(timer);
    timer = null;
    elapsedSeconds = 0;

    const { form, fileInput, submitButton, resultBox } = getElements();

    if (form) {
      form.dataset.submitting = '0';
      try {
        form.reset();
      } catch {
        // Ignore reset errors and continue with page reload.
      }
    }

    if (fileInput) {
      fileInput.disabled = false;
      fileInput.value = '';
    }

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.setAttribute('aria-busy', 'false');
      submitButton.textContent =
        submitButton.dataset.originalText || '선택한 엑셀 등록';
      submitButton.style.cursor = '';
      submitButton.style.opacity = '';
    }

    if (resultBox) resultBox.innerHTML = '';

    document.documentElement.style.cursor = '';
    document.body.style.cursor = '';

    state = 'idle';
    removeExistingModal();

    // F5로 정상화되던 현상을 프로그램에서 자동 수행합니다.
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'excel-import-form') return;

    if (state !== 'idle') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.fetch = async function mtOpticsFetchV157(input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : String(input?.url || '');

    const method = String(
      init?.method || input?.method || 'GET'
    ).toUpperCase();

    const isExcelImport =
      method === 'POST' && url.includes(IMPORT_URL_PART);

    if (!isExcelImport) {
      return originalFetch(input, init);
    }

    if (state !== 'idle') {
      throw new Error('엑셀 등록이 이미 진행 중입니다.');
    }

    beginUpload();

    try {
      const response = await originalFetch(input, init);
      const cloned = response.clone();

      let payload = null;
      try {
        payload = await cloned.json();
      } catch {
        payload = null;
      }

      if (response.ok) {
        finishSuccess(payload);
      } else {
        finishFailure(
          payload?.error ||
          payload?.message ||
          `요청 실패: ${response.status}`
        );
      }

      return response;
    } catch (error) {
      finishFailure(
        error?.message || '서버 연결 중 오류가 발생했습니다.'
      );
      throw error;
    }
  };
})();
