MT옵틱스 V321 안정 패치 완성본

이 ZIP은 이전 안정 상태인 V317 로딩 구조를 그대로 유지하면서,
요청하신 V317 보완사항과 V318 직인/거래명세서 보완사항만 반영한 완성 패키지입니다.

중요 원칙
- frontend/app.js는 수정하지 않습니다.
- frontend/index.html은 수정하지 않습니다.
- V318/V319 로더를 새로 만들지 않습니다.
- 현재 정상 작동 중인 V317 구조(final-enhancements-v317.js)를 유지합니다.
- 이전 로그인 먹통 원인이 된 v318/v319 로딩 구조는 사용하지 않습니다.

포함 파일
1. frontend/final-enhancements-v317.js
2. frontend/assets/mt_stamp.png
3. backend/src/finalEnhancements.js
4. frontend/postcode-kakao-v317.js
5. APPLY_FINAL_ENHANCEMENTS_V321_STABLE.cmd
6. APPLY_FINAL_ENHANCEMENTS_V321_STABLE.sh
7. _patch_files 폴더

반영 내용
1. 거래처/원장 삭제 버튼 복구
2. 거래명세서
   - "거래명세표" 제목 중앙 배치
   - 제목 앞 세로 라인 제거
   - 첨부 직인 이미지의 붉은색 부분으로 교체
   - 직인 위치를 "오희숙" 우측에 배치
   - 직인 크기 약 지름 2cm 수준
   - 하단 판매금액 / 전잔액 위치 요청 반영
3. 상단 "PC 테스트와 Netlify 배포를 모두 지원합니다." 문구 숨김
4. 수금/미수금
   - 수금등록 아래 수금내역 및 미수금내역 조회 복구
   - 각각 기본 10건 조회
   - 페이지 이동 및 합계 확인 가능

적용 방법
1. 현재 정상 복구된 mt-optics-system 루트 폴더에 압축 해제
2. APPLY_FINAL_ENHANCEMENTS_V321_STABLE.cmd 실행
3. SUCCESS 메시지 확인
4. GitHub Desktop에서 Commit / Push
5. AWS에서 실행
   cd /var/www/mt-optics
   bash ./deploy/github_update
   pm2 restart mt-optics --update-env
   pm2 save
   sudo systemctl reload nginx
6. 브라우저 Ctrl+F5

적용 전 확인
현재 프로젝트가 no24/V317 상태여야 합니다.
frontend/app.js 안에 final-enhancements-v318 또는 final-enhancements-v319가 있으면 이 패치는 중단됩니다.


V321 추가 반영
1. 거래명세서 직인 크기를 기존 V320 대비 3/4 수준으로 축소
2. 직인 위치를 위로 약 1.5cm, 우측으로 약 1.5cm 이동
3. 거래처/원장 첫 페이지 삭제 버튼 복구 보완
4. 출력보고서에 닫기 버튼 추가
5. 월별 판매현황을 요청 예시처럼 제품명/구분/영업사원별 집계 구조로 변경
   - 제품명 | 구분 | 김안구 | 김동열 | 이영성 | 사무실
   - 구분: 판매수량, 판매금액, 수금금액, 미수금
   - 마지막에 합계 행 표시
