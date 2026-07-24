// MT_OPTICS_UPLOAD_UI_FIX_V156
(() => {
  const originalFetch = window.fetch.bind(window);
  const IMPORT_URL_PART = '/imports/excel';
  const COOLDOWN_MS = 3500;
  const SUCCESS_NOTICE_MS = 9000;

  let state = 'idle'; // idle | uploading | cooldown
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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  function setCurrentFormLocked(message) {
    const { form, fileInput, submitButton } = getElements();

    if (form) form.dataset.submitting = state === 'idle' ? '0' : '1';

    if (submitButton) {
      if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText =
          submitButton.textContent || '선택한 엑셀 등록';
      }

      submitButton.disabled = state !== 'idle';
      submitButton.setAttribute(
        'aria-busy',
        state === 'idle' ? 'false' : 'true'
      );
      submitButton.textContent =
        state === 'idle'
          ? submitButton.dataset.originalText
          : message;
      submitButton.style.cursor = state === 'idle' ? '' : 'wait';
      submitButton.style.opacity = state === 'idle' ? '' : '0.65';
    }

    if (fileInput) fileInput.disabled = state !== 'idle';

    document.documentElement.style.cursor =
      state === 'idle' ? '' : 'wait';
    document.body.style.cursor =
      state === 'idle' ? '' : 'wait';
  }

  function ensureObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (state === 'uploading') {
        setCurrentFormLocked('등록 처리 중...');
      } else if (state === 'cooldown') {
        setCurrentFormLocked('등록 완료 · 다음 파일 준비 중...');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function showPageProgress() {
    const { resultBox } = getElements();
    if (!resultBox) return;

    resultBox.innerHTML = `
      <div class="card"
           data-import-progress="1"
           style="margin-top:12px;border:1px solid #bfdbfe;background:#eff6ff">
        <strong>엑셀 자료를 등록하고 있습니다.</strong>
        <p style="margin:8px 0 0">
          완료 안내가 표시될 때까지 버튼을 다시 누르지 마세요.
          경과시간: <span id="import-elapsed-v156">0초</span>
        </p>
      </div>
    `;
  }

  function showFixedNotice(type, title, body) {
    let notice = document.getElementById('excel-import-notice-v156');

    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'excel-import-notice-v156';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      document.body.appendChild(notice);
    }

    const success = type === 'success';
    notice.style.cssText = [
      'position:fixed',
      'right:24px',
      'bottom:24px',
      'z-index:99999',
      'width:min(440px,calc(100vw - 48px))',
      'padding:16px 18px',
      'border-radius:12px',
      `border:1px solid ${success ? '#86efac' : '#fecaca'}`,
      `background:${success ? '#f0fdf4' : '#fef2f2'}`,
      `color:${success ? '#166534' : '#991b1b'}`,
      'box-shadow:0 10px 30px rgba(15,23,42,.22)',
      'font-size:14px',
      'line-height:1.55'
    ].join(';');

    notice.innerHTML = `
      <strong style="display:block;font-size:16px;margin-bottom:5px">
        ${escapeHtml(title)}
      </strong>
      <div>${body}</div>
    `;

    window.clearTimeout(notice._hideTimer);
    notice._hideTimer = window.setTimeout(() => {
      notice.remove();
    }, success ? SUCCESS_NOTICE_MS : 12000);
  }

  function summarizeSuccess(payload) {
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

    if (!rows.length) {
      return '엑셀 등록이 정상적으로 완료되었습니다. 잠시 후 다음 파일을 등록할 수 있습니다.';
    }

    return rows.map((row) => `
      <div style="margin-top:5px">
        <b>${escapeHtml(row.file_name || '엑셀 파일')}</b><br>
        등록 ${formatNumber(row.inserted)}
        · 수정 ${formatNumber(row.updated)}
        · 건너뜀 ${formatNumber(row.skipped)}
        · 오류 ${formatNumber(row.errors)}
      </div>
    `).join('');
  }

  function beginUpload() {
    state = 'uploading';
    elapsedSeconds = 0;
    ensureObserver();
    setCurrentFormLocked('등록 처리 중...');
    showPageProgress();

    window.clearInterval(timer);
    timer = window.setInterval(() => {
      elapsedSeconds += 1;
      const target = document.getElementById('import-elapsed-v156');
      if (target) target.textContent = `${elapsedSeconds}초`;
    }, 1000);
  }

  function finishSuccess(payload) {
    window.clearInterval(timer);
    timer = null;
    state = 'cooldown';

    setCurrentFormLocked('등록 완료 · 다음 파일 준비 중...');

    const body = summarizeSuccess(payload);
    showFixedNotice(
      'success',
      '엑셀 등록이 완료되었습니다.',
      `${body}<div style="margin-top:8px">약 3초 후 다음 파일을 등록할 수 있습니다.</div>`
    );

    // 원래 화면이 가져오기 이력을 다시 그릴 시간을 확보하여
    // 첫 번째 처리 완료와 두 번째 제출이 겹치지 않게 한다.
    window.setTimeout(() => {
      state = 'idle';
      const { fileInput } = getElements();
      if (fileInput) fileInput.value = '';
      setCurrentFormLocked('');

      showFixedNotice(
        'success',
        '다음 파일 등록 가능',
        '화면 새로고침 없이 다음 엑셀 파일을 선택하여 등록할 수 있습니다.'
      );
    }, COOLDOWN_MS);
  }

  function finishFailure(message) {
    window.clearInterval(timer);
    timer = null;
    state = 'idle';
    setCurrentFormLocked('');

    showFixedNotice(
      'error',
      '엑셀 등록에 실패했습니다.',
      escapeHtml(message)
    );
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'excel-import-form') return;

    if (state !== 'idle') {
      event.preventDefault();
      event.stopImmediatePropagation();

      showFixedNotice(
        'error',
        '등록 처리 중입니다.',
        state === 'uploading'
          ? '현재 파일의 등록이 완료될 때까지 기다려 주세요.'
          : '첫 번째 등록 결과를 화면에 반영 중입니다. 잠시 후 다시 눌러 주세요.'
      );
    }
  }, true);

  window.fetch = async function mtOpticsFetch(input, init = {}) {
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
        // fetch가 끝났다고 즉시 버튼을 풀지 않고,
        // 원래 app.js의 결과 처리와 목록 새로고침이 끝날 때까지 잠근다.
        window.setTimeout(() => finishSuccess(payload), 500);
      } else {
        const serverMessage =
          payload?.error ||
          payload?.message ||
          `요청 실패: ${response.status}`;

        finishFailure(serverMessage);
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
