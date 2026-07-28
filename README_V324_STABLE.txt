MT옵틱스 V324 안정 패치 완성본

기준
- no24/V317 안정 구조 유지
- frontend/app.js / frontend/index.html 수정 없음
- final-enhancements-v317.js 로딩 구조 사용
- v318/v319 로더 사용 안 함

반영 내용
1. 수금/미수금 초기 조회 오류 수정
   - Incorrect arguments to mysqld_stmt_execute 오류가 발생하지 않도록 payments-page / receivables-page API를 보완
   - LIMIT/OFFSET prepared statement 문제를 피하도록 안전 처리
   - 조회조건과 서버 API 파라미터 정합성 보완

2. 제품 등록 일원화
   - 주문등록 팝업의 제품 등록 항목을 제품/재고의 정식 제품등록 항목과 최대한 동일하게 구성
   - SKU, 제품명, 규격, 분류, 제품유형, 브랜드, 모델번호, 색상, 사이즈, 소재, 원산지, 바코드, 단위, 단가, 재고, 안전재고, 생산단위, 인기도, 보관위치, 상태, 메모 포함
   - 주문 중 제품 등록 후 즉시 현재 주문 품목에 선택
   - 등록 후 수정은 제품/재고 → 제품 검색 → 수정에서 가능

3. 출력보고서 메뉴복귀 버튼 유지
   - 메뉴로 복귀 버튼은 대시보드로 복귀하도록 유지

4. github_update 자동 재시작 보완
   - deploy/github_update 마지막에 PM2 restart, PM2 save, nginx reload가 없으면 자동 추가
   - 앞으로 AWS에서는 bash ./deploy/github_update 만 실행해도 반영되도록 개선

적용 방법
1. 이 ZIP을 mt-optics-system 루트에 압축 해제
2. Windows: APPLY_FINAL_ENHANCEMENTS_V324_STABLE.cmd 실행
3. SUCCESS 메시지 확인
4. GitHub Desktop에서 Commit / Push
5. AWS:
   cd /var/www/mt-optics
   bash ./deploy/github_update
6. 브라우저 Ctrl+F5

주의
- 실행 전 frontend/app.js에 final-enhancements-v318 또는 v319가 남아 있으면 중단됩니다.
