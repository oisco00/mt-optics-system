(function () {
  'use strict';

  const VERSION = 'V311';
  const SCRIPT_URL = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  const LAYER_CLASS = 'mtoptics-postcode-v311-layer';

  function text(value) { return value == null ? '' : String(value); }
  function showToast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
      return;
    }
    console.log('[MTOPTICS ' + VERSION + ']', message);
  }
  function postcodeCtor() {
    return (window.daum && window.daum.Postcode) || (window.kakao && window.kakao.Postcode) || null;
  }
  function loadPostcodeScript() {
    if (postcodeCtor()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const current = Array.from(document.scripts).find((s) => String(s.src || '').includes('/postcode/prod/postcode.v2.js'));
      if (current) {
        const started = Date.now();
        const timer = setInterval(() => {
          if (postcodeCtor()) { clearInterval(timer); resolve(); }
          else if (Date.now() - started > 8000) { clearInterval(timer); reject(new Error('postcode script timeout')); }
        }, 100);
        current.addEventListener('load', () => resolve(), { once: true });
        current.addEventListener('error', () => reject(new Error('postcode script error')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.dataset.mtopticsPostcodeV311 = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('postcode script load failed'));
      document.head.appendChild(script);
    });
  }

  function closestAddressBlock(button) {
    return button.closest('[data-mtf-address-block], .address-block')
      || button.closest('form')
      || button.closest('.modal, .mtf-modal')
      || document;
  }
  function setField(scope, names, value) {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      const el = scope.querySelector('[name="' + name + '"]');
      if (!el) continue;
      el.value = value == null ? '' : String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el;
    }
    return null;
  }
  function getField(scope, names) {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      const el = scope.querySelector('[name="' + name + '"]');
      if (el) return el;
    }
    return null;
  }
  function fill(scope, data) {
    const selectedType = data.userSelectedType === 'J' ? 'J' : 'R';
    const road = text(data.roadAddress || data.autoRoadAddress || data.road_address || '');
    const jibun = text(data.jibunAddress || data.autoJibunAddress || data.jibun_address || '');
    const selected = selectedType === 'J' ? (jibun || road) : (road || jibun);
    setField(scope, ['postal_code', 'postcode', 'zip_code'], data.zonecode || data.postal_code || '');
    setField(scope, 'road_address', road);
    setField(scope, 'jibun_address', jibun);
    setField(scope, 'address_type', selectedType);
    setField(scope, 'address', selected);
    const detail = getField(scope, 'detail_address');
    if (detail) setTimeout(() => detail.focus(), 50);
  }
  function createLayer(title) {
    document.querySelectorAll('.' + LAYER_CLASS + ', .mtf-postcode-layer, .mtf-address-v304-layer, .mtf-address-v305-layer, .mtf-address-v306-layer, .mtf-address-v311-layer').forEach((n) => n.remove());
    const layer = document.createElement('div');
    layer.className = LAYER_CLASS;
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;';
    layer.innerHTML = ''+
      '<div style="width:min(620px,96vw);height:min(720px,92vh);background:#fff;border-radius:18px;box-shadow:0 30px 90px rgba(15,23,42,.45);overflow:hidden;display:flex;flex-direction:column;position:relative;">'+
      '  <div style="height:54px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 14px;border-bottom:1px solid #e2e8f0;background:#fff;flex-shrink:0;">'+
      '    <strong>' + (title || '주소검색') + '</strong>'+
      '    <div style="display:flex;gap:8px;align-items:center;">'+
      '      <button type="button" data-mt-postcode-popup style="border:0;border-radius:10px;padding:8px 12px;background:#e2e8f0;font-weight:700;cursor:pointer">팝업형</button>'+
      '      <button type="button" data-mt-postcode-close style="border:0;border-radius:10px;padding:8px 12px;background:#e2e8f0;font-weight:700;cursor:pointer">닫기</button>'+
      '    </div>'+
      '  </div>'+
      '  <div data-mt-postcode-body style="flex:1;min-height:520px;background:#fff;position:relative"></div>'+
      '</div>';
    document.body.appendChild(layer);
    return layer;
  }
  function closeLayer(layer) { if (layer) layer.remove(); }
  function openPopup(scope, layer) {
    try {
      const Postcode = postcodeCtor();
      if (!Postcode) throw new Error('postcode constructor not loaded');
      new Postcode({
        oncomplete: function (data) { fill(scope, data); closeLayer(layer); showToast('주소를 반영했습니다.', 'success'); }
      }).open({ popupKey: 'mtoptics-postcode-v311', popupTitle: 'MT옵틱스 주소검색', autoClose: true });
    } catch (err) {
      showToast('주소검색 팝업을 열지 못했습니다. 브라우저 팝업 차단을 확인하세요.', 'error');
    }
  }
  async function open(button) {
    const scope = closestAddressBlock(button);
    const layer = createLayer('카카오 주소검색');
    const body = layer.querySelector('[data-mt-postcode-body]');
    const close = () => closeLayer(layer);
    layer.querySelector('[data-mt-postcode-close]').addEventListener('click', close);
    layer.addEventListener('click', (ev) => { if (ev.target === layer) close(); });
    layer.querySelector('[data-mt-postcode-popup]').addEventListener('click', () => openPopup(scope, layer));
    body.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#475569;font-weight:700">카카오 주소검색을 불러오는 중입니다...</div>';
    try {
      await loadPostcodeScript();
      const Postcode = postcodeCtor();
      if (!Postcode) throw new Error('postcode constructor missing');
      body.innerHTML = '';
      const initialKeyword = text(getField(scope, ['road_address','address'])?.value || '').trim();
      const pc = new Postcode({
        width: '100%',
        height: '100%',
        animation: false,
        autoMapping: true,
        oncomplete: function (data) { fill(scope, data); close(); showToast('주소를 반영했습니다.', 'success'); },
        onresize: function (size) { if (size && size.height) body.style.height = Math.max(520, Number(size.height)) + 'px'; }
      });
      pc.embed(body, initialKeyword ? { q: initialKeyword, autoClose: true } : { autoClose: true });
      setTimeout(() => {
        const iframe = body.querySelector('iframe');
        if (iframe) {
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = '0';
        }
      }, 200);
    } catch (err) {
      body.innerHTML = '<div style="padding:22px;line-height:1.7;color:#334155">카카오 주소검색 API를 불러오지 못했습니다.<br>상단의 <b>팝업형</b> 버튼을 눌러 다시 시도하세요.<br><br><span style="color:#64748b">원인: ' + String(err.message || err) + '</span></div>';
    }
  }

  window.MTOpticsPostcodeV311 = { open, loadPostcodeScript };

  function triggerFromEventTarget(target) {
    const btn = target && target.closest ? target.closest('[data-mtf-address-search], .address-search-btn, button, a') : null;
    if (!btn) return null;
    if (btn.matches('[data-mtf-address-search], .address-search-btn')) return btn;
    const label = text(btn.textContent || btn.value || btn.getAttribute('aria-label')).replace(/\s+/g, '');
    if (label.includes('주소검색') || label.includes('우편번호')) {
      if (btn.closest('[data-mtf-address-block], .address-block, form, .modal, .mtf-modal')) return btn;
    }
    return null;
  }

  if (!window.__MTOPTICS_POSTCODE_V311_CAPTURE__) {
    window.__MTOPTICS_POSTCODE_V311_CAPTURE__ = true;
    document.addEventListener('click', function (event) {
      const btn = triggerFromEventTarget(event.target);
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      open(btn);
    }, true);
  }
})();
