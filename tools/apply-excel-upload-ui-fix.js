const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
const target = path.join(projectRoot, 'frontend', 'app.js');
const marker = 'MT_OPTICS_UPLOAD_UI_FIX_V154';

if (!fs.existsSync(target)) {
  console.error(`[실패] 파일을 찾을 수 없습니다: ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes(marker)) {
  console.log('[완료] 이미 v1.5.4 UI 패치가 적용되어 있습니다.');
  process.exit(0);
}

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-optics-ui-v154-'));
const backupFile = path.join(backupDir, 'frontend-app.js');
fs.copyFileSync(target, backupFile);

const patch = String.raw`

/* MT_OPTICS_UPLOAD_UI_FIX_V154 */
;(() => {
  const nativeFetch = window.fetch.bind(window);
  let importBusy = false;
  let elapsedSeconds = 0;
  let elapsedTimer = null;

  function getImportElements() {
    const form = document.querySelector('#excel-import-form');
    return {
      form,
      fileInput: form?.querySelector('input[type="file"]') || null,
      submitButton: form?.querySelector('button[type="submit"]') || null,
      resultBox: document.getElementById('import-result')
    };
  }

  function showProcessing() {
    const { form, fileInput, submitButton, resultBox } = getImportElements();

    if (form) form.dataset.submitting = '1';

    if (submitButton) {
      if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText = submitButton.textContent || '선택한 엑셀 등록';
      }
      submitButton.disabled = true;
      submitButton.setAttribute('aria-disabled', 'true');
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.textContent = '등록 처리 중...';
      submitButton.style.cursor = 'wait';
      submitButton.style.opacity = '0.65';
    }

    if (fileInput) fileInput.disabled = true;

    document.documentElement.style.cursor = 'wait';
    document.body.style.cursor = 'wait';

    elapsedSeconds = 0;
    if (resultBox) {
      resultBox.innerHTML = `
        <div data-import-progress="1" class="card"
             style="margin-top:12px;border:1px solid #bfdbfe;background:#eff6ff">
          <strong>엑셀 자료를 등록하고 있습니다.</strong>
          <p style="margin:8px 0 0">
            완료 또는 오류 안내가 표시될 때까지 버튼을 다시 누르지 마세요.
            경과시간: <span id="import-elapsed">0초</span>
          </p>
        </div>
      `;
    }

    window.clearInterval(elapsedTimer);
    elapsedTimer = window.setInterval(() => {
      elapsedSeconds += 1;
      const elapsed = document.getElementById('import-elapsed');
      if (elapsed) elapsed.textContent = `${elapsedSeconds}초`;
    }, 1000);
  }

  function showFailure(message) {
    const resultBox = document.getElementById('import-result');
    if (!resultBox) return;

    resultBox.innerHTML = `
      <div class="card"
           style="margin-top:12px;border:1px solid #fecaca;background:#fef2f2">
        <strong>엑셀 가져오기 실패</strong>
        <p style="margin:8px 0 0">${String(message)}</p>
      </div>
    `;
  }

  function clearProcessing() {
    window.clearInterval(elapsedTimer);
    elapsedTimer = null;

    const { form, fileInput, submitButton } = getImportElements();

    if (form) form.dataset.submitting = '0';

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-disabled');
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent =
        submitButton.dataset.originalText || '선택한 엑셀 등록';
      submitButton.style.cursor = '';
      submitButton.style.opacity = '';
    }

    if (fileInput) fileInput.disabled = false;

    document.documentElement.style.cursor = '';
    document.body.style.cursor = '';
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'excel-import-form' && importBusy) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.fetch = async function patchedFetch(input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : String(input?.url || '');

    const method = String(
      init?.method || input?.method || 'GET'
    ).toUpperCase();

    const isExcelImport =
      method === 'POST' && url.includes('/imports/excel');

    if (!isExcelImport) {
      return nativeFetch(input, init);
    }

    if (importBusy) {
      throw new Error('엑셀 등록이 이미 진행 중입니다.');
    }

    importBusy = true;
    showProcessing();

    try {
      const response = await nativeFetch(input, init);

      if (!response.ok) {
        const message = response.status === 502
          ? '서버가 엑셀 처리 중 연결을 종료했습니다(502). AWS에서 upload_diagnose를 실행해 원인을 확인하세요.'
          : `엑셀 등록 요청이 실패했습니다(${response.status}).`;

        showFailure(message);
      }

      return response;
    } catch (error) {
      showFailure(
        `서버 연결 중 오류가 발생했습니다: ${error?.message || '알 수 없는 오류'}`
      );
      throw error;
    } finally {
      importBusy = false;
      clearProcessing();
    }
  };
})();
`;

source += patch;
fs.writeFileSync(target, source, 'utf8');

console.log('[완료] MT옵틱스 엑셀 등록 UI 패치 v1.5.4 적용 완료');
console.log(`- 수정 파일: ${target}`);
console.log('- 등록 버튼 중복 클릭 차단: 적용');
console.log('- 처리 중 버튼 비활성화: 적용');
console.log('- 대기 커서 및 경과시간 표시: 적용');
console.log('- 502 오류 안내: 적용');
console.log(`- 원본 임시 백업: ${backupFile}`);
