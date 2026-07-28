MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V315

핵심 목적
1. V310~V314가 섞여 보이는 현상 제거: app.js는 final-enhancements-v315.js만 로딩합니다.
2. 거래처 등록/수정, 납품처 수정, 수금 등록 화면에 영업담당자 선택을 항상 표시합니다.
3. 거래처 선택 시 수금 화면에 해당 거래처의 영업담당자를 기본 표시합니다.
4. 주문/출고 목록에 거래명세서 버튼을 다시 연결하고, 인쇄 버튼을 복구했습니다.
5. 거래명세서는 A4 1장에 공급받는자용/공급자용을 상하 배치하도록 재작성했습니다.
6. 출력보고서 메뉴를 별도 구성하고, 화면 조회 후 인쇄/엑셀 다운로드가 가능합니다.
7. 숫자/금액/수량 입력은 포커스 이동 시 천단위 콤마가 표시되고 저장 시 숫자로 정리됩니다.

적용 순서
1. 이 ZIP을 mt-optics-system 루트 폴더에 덮어쓰기 압축 해제합니다.
2. APPLY_FINAL_ENHANCEMENTS_V315.cmd를 실행합니다.
3. SUCCESS 문구를 확인한 뒤 GitHub Desktop에서 Commit / Push 합니다.
4. AWS에서 cd /var/www/mt-optics && bash ./deploy/github_update 를 실행합니다.
5. 브라우저에서 Ctrl+F5 또는 캐시 비우기 및 강력 새로고침을 실행합니다.

중요
- 기존 데이터는 삭제하지 않습니다.
- 기존 V300~V314 프런트 보완 스크립트가 남아 있어도 V315 적용 스크립트가 정리합니다.
- V315 적용 후 frontend/app.js에 final-enhancements-v315.js만 표시되는지 확인하세요.
