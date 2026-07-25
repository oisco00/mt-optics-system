const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
const backendApp = path.join(projectRoot, 'backend', 'src', 'app.js');
const frontendIndex = path.join(projectRoot, 'frontend', 'index.html');
const finalFeatures = path.join(
  projectRoot,
  'frontend',
  'final-enhancements-v200.js'
);

const required = [backendApp, frontendIndex, finalFeatures];

for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`[실패] 필요한 파일을 찾을 수 없습니다: ${file}`);
    console.error('실제 GitHub 작업 폴더 최상위에 압축을 풀었는지 확인하세요.');
    process.exit(1);
  }
}

const backupDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'mt-optics-address-fix-v201-')
);

fs.copyFileSync(backendApp, path.join(backupDir, 'backend-app.js'));
fs.copyFileSync(frontendIndex, path.join(backupDir, 'frontend-index.html'));
fs.copyFileSync(
  finalFeatures,
  path.join(backupDir, 'final-enhancements-v200.js')
);

let backendSource = fs.readFileSync(backendApp, 'utf8');
let indexSource = fs.readFileSync(frontendIndex, 'utf8');
let featureSource = fs.readFileSync(finalFeatures, 'utf8');

const newCsp = [
  "default-src 'self'",
  "script-src 'self' https://t1.daumcdn.net https://t1.kakaocdn.net https://postcode.map.daum.net https://postcode.map.kakao.com 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self' https://postcode.map.daum.net https://postcode.map.kakao.com",
  "frame-src https://postcode.map.daum.net https://postcode.map.kakao.com",
  "child-src https://postcode.map.daum.net https://postcode.map.kakao.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

const cspPattern =
  /res\.setHeader\(\s*['"]Content-Security-Policy['"]\s*,\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\);/;

if (!cspPattern.test(backendSource)) {
  console.error('[실패] backend/src/app.js에서 CSP 설정을 찾지 못했습니다.');
  console.error('원본 파일은 변경하지 않았습니다.');
  process.exit(1);
}

backendSource = backendSource.replace(
  cspPattern,
  `// MT_OPTICS_ADDRESS_CSP_FIX_V201\n` +
  `res.setHeader('Content-Security-Policy', ${JSON.stringify(newCsp)});`
);

const oldScriptPattern =
  /(?:https?:)?\/\/t1\.daumcdn\.net\/mapjsapi\/bundle\/postcode\/prod\/postcode\.v2\.js/g;

const newScriptUrl =
  'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

if (oldScriptPattern.test(indexSource)) {
  indexSource = indexSource.replace(oldScriptPattern, newScriptUrl);
} else if (!indexSource.includes('postcode.v2.js')) {
  const appScriptPattern = /<script\b[^>]*\bsrc=["'][^"']*app\.js[^"']*["'][^>]*><\/script>/i;
  const postcodeTag =
    `<script src="${newScriptUrl}"></script>\n  `;

  if (appScriptPattern.test(indexSource)) {
    indexSource = indexSource.replace(
      appScriptPattern,
      `${postcodeTag}$&`
    );
  } else {
    indexSource = indexSource.replace(
      /<\/body>/i,
      `  ${postcodeTag}</body>`
    );
  }
}

if (!indexSource.includes('MT_OPTICS_ADDRESS_SCRIPT_FIX_V201')) {
  indexSource = indexSource.replace(
    newScriptUrl,
    `${newScriptUrl}" data-fix="MT_OPTICS_ADDRESS_SCRIPT_FIX_V201`
  );
}

const startMarker = '  function bindAddressSearch(scope) {';
const endMarker = '  function addressFields(row = {}) {';

const start = featureSource.indexOf(startMarker);
const end = featureSource.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  console.error('[실패] 주소검색 처리 함수를 찾지 못했습니다.');
  console.error('원본 파일은 변경하지 않았습니다.');
  process.exit(1);
}

const replacement = String.raw`  // MT_OPTICS_ADDRESS_EMBED_FIX_V201
  function bindAddressSearch(scope) {
    scope.querySelectorAll('[data-mtf-address-search]').forEach((button) => {
      button.addEventListener('click', () => {
        const block = button.closest('[data-mtf-address-block]');
        const Postcode = window.kakao?.Postcode || window.daum?.Postcode;

        if (!Postcode) {
          showToast(
            '주소검색 서비스를 불러오지 못했습니다. 화면을 새로고침한 후 다시 시도하세요.',
            'error'
          );
          return;
        }

        document.getElementById('mtf-postcode-layer-v201')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'mtf-postcode-layer-v201';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = [
          'position:fixed',
          'inset:0',
          'z-index:120000',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'padding:16px',
          'background:rgba(15,23,42,.58)'
        ].join(';');

        overlay.innerHTML = [
          '<div style="',
          'width:min(560px,100%);',
          'height:min(700px,90vh);',
          'background:#fff;',
          'border-radius:16px;',
          'box-shadow:0 28px 80px rgba(15,23,42,.4);',
          'overflow:hidden;',
          'display:grid;',
          'grid-template-rows:auto 1fr;',
          '">',
          '<div style="',
          'display:flex;',
          'align-items:center;',
          'justify-content:space-between;',
          'padding:14px 16px;',
          'border-bottom:1px solid #e2e8f0;',
          '">',
          '<strong style="font-size:18px">주소검색</strong>',
          '<button type="button" data-postcode-close ',
          'style="border:0;border-radius:9px;padding:9px 13px;',
          'background:#e2e8f0;font-weight:700;cursor:pointer">닫기</button>',
          '</div>',
          '<div data-postcode-container style="width:100%;height:100%;"></div>',
          '</div>'
        ].join('');

        document.body.appendChild(overlay);

        const container = overlay.querySelector(
          '[data-postcode-container]'
        );
        const closeButton = overlay.querySelector(
          '[data-postcode-close]'
        );

        function closeLayer() {
          overlay.remove();
        }

        closeButton.addEventListener('click', closeLayer);
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) closeLayer();
        });

        new Postcode({
          oncomplete(data) {
            const selectedType =
              data.userSelectedType === 'J' ? 'J' : 'R';

            block.querySelector('[name="postal_code"]').value =
              data.zonecode || '';

            block.querySelector('[name="road_address"]').value =
              data.roadAddress || data.autoRoadAddress || '';

            block.querySelector('[name="jibun_address"]').value =
              data.jibunAddress || data.autoJibunAddress || '';

            block.querySelector('[name="address_type"]').value =
              selectedType;

            block.querySelector('[name="address"]').value =
              selectedType === 'J'
                ? (
                    data.jibunAddress ||
                    data.autoJibunAddress ||
                    data.roadAddress ||
                    ''
                  )
                : (
                    data.roadAddress ||
                    data.autoRoadAddress ||
                    data.jibunAddress ||
                    ''
                  );

            closeLayer();

            window.setTimeout(() => {
              block
                .querySelector('[name="detail_address"]')
                ?.focus();
            }, 80);
          },
          onresize(size) {
            if (size?.height) {
              container.style.minHeight =
                Math.min(Number(size.height), 620) + 'px';
            }
          },
          width: '100%',
          height: '100%',
          maxSuggestItems: 5
        }).embed(container);
      });
    });
  }

`;

featureSource =
  featureSource.slice(0, start) +
  replacement +
  featureSource.slice(end);

fs.writeFileSync(backendApp, backendSource, 'utf8');
fs.writeFileSync(frontendIndex, indexSource, 'utf8');
fs.writeFileSync(finalFeatures, featureSource, 'utf8');

console.log('[완료] MT옵틱스 주소검색 차단 해결 패치 v2.0.1 적용 완료');
console.log('- Kakao 신규 도메인을 CSP 허용 목록에 추가');
console.log('- 우편번호 스크립트를 t1.kakaocdn.net으로 변경');
console.log('- 별도 팝업 대신 프로그램 내부 레이어 주소검색 적용');
console.log(`- 원본 임시 백업: ${backupDir}`);
console.log('');
console.log('GitHub Desktop에서 변경 파일을 Commit 후 Push origin 하세요.');
