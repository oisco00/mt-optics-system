// MT_OPTICS_UPLOAD_UI_FIX_V155
(() => {
  const originalFetch = window.fetch.bind(window);
  let busy = false;
  let timer = null;
  let seconds = 0;

  function els() {
    const form = document.querySelector('#excel-import-form');
    return {
      form,
      file: form?.querySelector('input[type="file"]'),
      button: form?.querySelector('button[type="submit"]'),
      result: document.getElementById('import-result')
    };
  }

  function start() {
    const { form, file, button, result } = els();
    if (form) form.dataset.submitting = '1';
    if (button) {
      button.dataset.originalText ||= button.textContent || '선택한 엑셀 등록';
      button.disabled = true;
      button.textContent = '등록 처리 중...';
      button.style.cursor = 'wait';
      button.style.opacity = '0.65';
    }
    if (file) file.disabled = true;
    document.body.style.cursor = 'wait';
    seconds = 0;
    if (result) {
      result.innerHTML =
        '<div class="card" style="margin-top:12px;border:1px solid #bfdbfe;background:#eff6ff">' +
        '<strong>엑셀 자료를 등록하고 있습니다.</strong>' +
        '<p style="margin:8px 0 0">완료될 때까지 다시 클릭하지 마세요. 경과시간: ' +
        '<span id="import-elapsed">0초</span></p></div>';
    }
    clearInterval(timer);
    timer = setInterval(() => {
      seconds += 1;
      const target = document.getElementById('import-elapsed');
      if (target) target.textContent = seconds + '초';
    }, 1000);
  }

  function stop() {
    clearInterval(timer);
    const { form, file, button } = els();
    if (form) form.dataset.submitting = '0';
    if (button) {
      button.disabled = false;
      button.textContent = button.dataset.originalText || '선택한 엑셀 등록';
      button.style.cursor = '';
      button.style.opacity = '';
    }
    if (file) file.disabled = false;
    document.body.style.cursor = '';
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'excel-import-form' && busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const isImport = method === 'POST' && url.includes('/imports/excel');

    if (!isImport) return originalFetch(input, init);
    if (busy) throw new Error('엑셀 등록이 이미 진행 중입니다.');

    busy = true;
    start();
    try {
      return await originalFetch(input, init);
    } finally {
      busy = false;
      stop();
    }
  };
})();
