# MT옵틱스 주문·수금·생산·재고 통합 웹앱 v1.5

AWS Lightsail 1대에서 Node.js + MySQL + Nginx + PM2로 운영하는 소규모 ERP입니다. 같은 거래처의 여러 지역·납품처와 발송구분(택배·영업방문·기타), 판매·수금·미수금, 제품·재고·생산지시를 통합 관리합니다.

## v1.5 핵심 기능

- 거래처·납품처 주소 검색: 우편번호, 도로명주소(신주소), 지번주소(구주소), 선택주소, 상세주소 저장
- PC·휴대폰 공용 반응형 화면과 `모바일 영업` 빠른 주문·수금 화면
- 주문·수금 수정 및 사유 필수 논리삭제
- 삭제 시 관련 미수원장 역분개, 출고 재고 복원, 이전값·이후값·사용자·시각·IP·브라우저 감사기록
- 엑셀 업로드 전 형식 분석, 중복 방지, 업로드 후 보완 검토목록
- 주요 파일명: `거래처 정보.xls`, `판매처 원장 상세.xls`, `일별영업현황.xls`
- 기존 파일명 별칭: `거래처원장.xls`, `기간별 판매명세서 상세.xls`, `수금(미수금)명세서.xls`, `거래처별 영업현황 거래내역.xls`
- 관리자·영업·경리·생산·조회전용 권한 분리
- 보안 헤더, 로그인/API 요청 제한, CORS 제한, 업로드 용량·확장자·파일 시그니처 검사
- 운영 모드의 취약한 비밀번호·JWT·CORS 설정 자동 차단
- 원격 서버 종료 기본 차단

## 표준 엑셀양식

프로그램의 `엑셀가져오기` 화면에서 `표준양식 다운로드`를 누르거나 다음 파일을 사용합니다.

```text
frontend/templates/MT옵틱스_엑셀업로드_표준양식_v1.5.xlsx
```

## Lightsail 최초 설정

```bash
cp .env.lightsail.example .env
nano .env
chmod 600 .env
npm install --no-package-lock --no-audit --no-fund
npm run check
npm run preflight
npm start
```

`.env`의 필수 변경값:

```env
NODE_ENV=production
JWT_SECRET=32자_이상_무작위값
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://order.mtoptics.net
DB_HOST=127.0.0.1
DB_USER=mtopt
DB_PASSWORD=실제_DB_비밀번호
DB_NAME=mt_optics
ADMIN_PASSWORD=영문숫자특수문자_10자이상
AUTO_MIGRATE=true
ALLOW_REMOTE_SHUTDOWN=false
SECURITY_STRICT_MODE=true
```

## GitHub → Lightsail 갱신

GitHub 저장소를 Private로 바꾼 경우 먼저 `docs/v1.5_업그레이드_및_Lightsail_배포.md`의 **읽기 전용 Deploy key**를 설정합니다. 그다음 Lightsail SSH에서:

```bash
cd /var/www/mt-optics
chmod +x deploy/*.sh
./deploy/update-lightsail.sh
```

스크립트는 DB 백업, GitHub 소스 갱신, 보안 사전점검, 패키지 설치, 문법검사, DB 자동 마이그레이션, PM2 재시작, Nginx 점검, 헬스체크를 수행합니다. 보안 사전점검이 실패하면 기존 PM2 프로그램은 계속 실행되고 새 버전 재시작은 하지 않습니다.

## 엑셀 분석과 등록

웹 화면:

```text
엑셀가져오기 → 파일 선택 → 파일 분석 → 경고 확인 → 분석 후 DB 등록
```

명령행:

```bash
node tools/analyze-excel.js "/엑셀/폴더"
node tools/import-excel.js "/엑셀/폴더"
```

엑셀에 발송구분, 수금방법, 납품처, 품목 상세 등이 없으면 프로그램은 값을 임의 확정하지 않고 `기타` 또는 보완 검토목록으로 남깁니다.

## 주요 폴더

```text
backend/                 Express API, MySQL 업무 로직
frontend/                PC·모바일 반응형 화면과 표준양식
database/                신규 설치 스키마와 자동 마이그레이션
tools/                   엑셀 분석·가져오기 CLI
deploy/                  Lightsail 갱신·롤백·DB 백업·보안점검
docs/                    배포, 엑셀 판정, 보안 문서
.github/workflows/       GitHub 소스 문법검사
```

## 보안 필수사항

- GitHub 저장소를 **Private**로 변경하고 GitHub Pages/기존 Netlify 배포는 비활성화
- `.env`, `node_modules`, `package-lock.json`, 실제 고객 엑셀은 GitHub에 올리지 않음
- 대화나 화면에 노출된 기존 DB·관리자 비밀번호는 즉시 변경
- Lightsail 방화벽은 22, 80, 443만 허용하고 3000/3306은 외부 개방 금지
- `order.mtoptics.net` HTTPS와 Cloudflare Access 적용
- 매일 MySQL 백업과 정기 Lightsail 스냅샷
- 엑셀 업로드는 권한이 있는 관리자와 신뢰할 수 있는 사내 파일만 사용
- 레거시 `.xls` 처리는 SheetJS 공식 배포본 0.20.3으로 고정

자세한 절차:

- `docs/v1.5_업그레이드_및_Lightsail_배포.md`
- `docs/엑셀_자료_판정.md`
- `docs/최종_검토결과.md`
- `docs/보안_체크리스트.md`
