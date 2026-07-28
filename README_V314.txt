MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V314

1. 적용 목적
- 거래명세서 화면/인쇄 양식을 A4 1페이지 상하 2단으로 안정화
- 영업담당자 입력란이 거래처 등록/수정, 납품처 수정, 수금 등록에서 사라지는 문제 보완
- 출력보고서를 별도 메뉴로 구성하고 화면 조회 후 인쇄/엑셀 다운로드 가능하게 보완
- V310~V313 스크립트 혼재로 일부 화면이 이전 버전처럼 보이는 문제 방지

2. 적용 순서
- 로컬 mt-optics-system 폴더에 덮어쓰기 압축해제
- APPLY_FINAL_ENHANCEMENTS_V314.cmd 실행
- GitHub Desktop Commit/Push
- AWS: cd /var/www/mt-optics && bash ./deploy/github_update
- 브라우저 Ctrl+F5

3. 주의
- 기존 DB 테이블을 삭제하지 않습니다.
- 기존 주문/수금/거래처 데이터는 유지됩니다.
