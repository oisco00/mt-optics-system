# MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V307

V307은 거래처/원장 거래처 등록 화면의 주소검색 문제를 원초적으로 정리한 버전입니다.

## 핵심 보완

1. V304 직접입력 주소창 잔여 로직을 제거하고 카카오 우편번호 API를 다시 사용합니다.
2. 기존 app.js의 원장 거래처 등록 주소검색 함수 자체를 V307 카카오 주소검색 모듈로 교체했습니다.
3. 주소검색 레이어 z-index를 2147483647로 고정하여 거래처 등록창 뒤로 숨지 않게 했습니다.
4. index.html에서 app.js 캐시를 v=307로 갱신하고 postcode-kakao-v307.js를 app.js보다 먼저 로딩합니다.
5. 기존 final-enhancements-v300~v306 파일을 삭제하여 이전 버전과 섞이지 않게 했습니다.

## 적용

1. B:\No_Code(Low_Code)\mt-optics-system 에 압축을 덮어쓰기 해제합니다.
2. APPLY_FINAL_ENHANCEMENTS_V307.cmd를 실행합니다.
3. GitHub Desktop에서 Commit / Push 합니다.
4. AWS에서 다음을 실행합니다.

```bash
cd /var/www/mt-optics
bash ./deploy/github_update
```

5. 브라우저에서 Ctrl+F5로 강력 새로고침합니다.

## 확인

거래처/원장 > 거래처 등록 > 주소검색을 누르면 카카오 주소검색 창이 거래처 등록창보다 앞에 표시되어야 합니다.
