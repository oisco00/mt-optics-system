MT옵틱스 V323 안정 패치 완성본

기준
- no24/V317 안정 구조 유지
- frontend/app.js / frontend/index.html 수정 없음
- final-enhancements-v317.js 로딩 구조 사용
- v318/v319 로더 사용 안 함

반영 내용
1. 출력보고서
   - 메뉴로 복귀 버튼 클릭 시 대시보드로 복귀되도록 수정
   - 기존 방식이 shell을 대체하여 버튼이 동작하지 않던 문제를 reload 방식으로 보완

2. 주문등록 팝업
   - 상단에 제품 등록 버튼 추가
   - 주문 중 미등록 제품을 즉시 등록 가능
   - 등록 후 주문 품목 select에 즉시 추가
   - 현재 주문 품목 행에 자동 선택
   - 제품명/규격/단가 자동 반영

3. V322 기능 유지
   - 수금/미수금 조회조건
   - 거래처/원장 삭제버튼
   - 거래명세서 직인 및 제목 보완
   - 출력보고서 월별 판매현황 구조

적용 방법
1. ZIP을 mt-optics-system 루트에 압축 해제
2. APPLY_FINAL_ENHANCEMENTS_V323_STABLE.cmd 실행
3. SUCCESS 메시지 확인
4. GitHub Desktop에서 Commit / Push
5. AWS:
   cd /var/www/mt-optics
   bash ./deploy/github_update
   pm2 restart mt-optics --update-env
   pm2 save
   sudo systemctl reload nginx
6. 브라우저 Ctrl+F5

주의
- 실행 전 frontend/app.js에 final-enhancements-v318 또는 v319가 남아 있으면 중단됩니다.
