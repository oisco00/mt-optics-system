# MT옵틱스 주문·수금·생산·재고 통합 웹앱

전화, 카톡, 영업방문으로 받는 주문과 수기 거래카드, 이카운트 일부 등록 자료를 하나의 웹앱으로 통합하기 위한 MVP입니다. PC에서 먼저 테스트하고, 이후 GitHub + Netlify에 올려 같은 코드를 사용할 수 있도록 구성했습니다.

## v1.3 추가 반영

- 프로그램 실행 시 항상 로그인 화면부터 시작합니다.
- 로그아웃 버튼은 로그인 화면으로 돌아갑니다.
- 관리자에게는 프로그램 종료 버튼이 표시되며, 로컬 PC 실행 시 MySQL 연결을 정상 종료한 뒤 Node 서버를 종료합니다.
- 기준정보 메뉴를 추가했습니다: 코드그룹/코드항목/자재 기준정보를 등록·수정할 수 있습니다.
- 제품/재고에 안경제품 관리 항목을 추가했습니다: 브랜드, 모델번호, 색상, 렌즈폭, 브릿지, 다리길이, 프레임소재, 렌즈소재, 바코드 등.
- 엑셀가져오기 메뉴와 CLI 가져오기 스크립트를 추가했습니다. 첨부된 거래처원장, 기간별 판매명세서 상세, 수금(미수금)명세서, 거래처별 영업현황 거래내역 파일을 DB에 등록할 수 있습니다.
- 중복 가져오기를 줄이기 위해 import_row_hashes 테이블에 엑셀 행 해시를 저장합니다.

## 1. 반영한 업무 범위

### 주문 및 수금관리
- 거래처 약 4천 곳까지 관리할 수 있는 거래처 마스터
- 전화, 카톡, 영업방문, 이카운트, 기타 주문 접수 경로 구분
- 납품/박싱 구분: `영업부`, `다빈치`, `기타`
- 배송방법: 택배, 영업방문, 직접수령
- 주문 등록 시 거래처 원장에 매출 미수금 자동 반영
- 수금방법: 카드, 송금, 현금
- 수금 등록 시 거래처 원장에 수금액 자동 반영
- 거래처별 원장, 미수금 조회

### 생산 및 재고관리
- 제품별 현재재고, 안전재고, 보관위치, 인기도 관리
- 안경테/선글라스/렌즈/부속품/자재 기준정보 관리
- 브랜드, 모델번호, 색상코드/색상명, 렌즈폭, 브릿지, 다리길이, 소재, 바코드 관리
- 인기도/생산단위 기준: 1000개, 500개, 300개
- 안전재고 부족 제품 추천 생산수량 계산
- 사람이 최종 판단근거를 입력한 뒤 생산지시 등록
- 생산입고 시 제품 재고 자동 증가
- 주문 출고 시 제품 재고 자동 감소
- 재고조정 및 모든 입출고 이력 저장

### 관리자/사용자/이력
- 사용자 권한: 관리자, 영업, 경리/수금, 생산/재고, 조회전용
- 권한별 메뉴 자동 노출
- 데이터 등록/수정/출고/입고/수금 시 audit_logs에 이전값/이후값 저장
- 비전문가가 운영 중 GPT에게 파일을 보여주고 수정 요청하기 쉽도록 단순한 Node.js + MySQL + 정적 HTML 구조로 작성

## 2. 폴더 구조

```text
mt-optics-system/
  backend/                 # Node.js Express API
    src/app.js             # API 라우트, 권한, 업무 로직
    src/db.js              # MySQL 연결, 자동 DB/테이블 생성, 기본 권한/관리자 생성
    src/server.js          # PC 로컬 실행 서버
    src/sampleData.js      # 테스트 예시자료 입력 스크립트
    src/excelImport.js     # 엑셀 자료 가져오기 로직
  import/excel/             # 첨부 엑셀 원본 파일 보관 및 일괄 가져오기 폴더
  tools/import-excel.js     # import/excel 폴더 엑셀을 DB로 가져오는 CLI
  database/
    create_database.sql    # DB 생성 SQL
    schema.sql             # 테이블/뷰 생성 SQL
    sample_data.sql        # 선택 실행 예시자료
    import_uploaded_excel_data.sql # 첨부 엑셀에서 추출한 사전 등록 SQL
  frontend/
    index.html             # 웹앱 화면
    app.js                 # 화면 로직
    styles.css             # 디자인
  netlify/functions/api.js # Netlify Functions API 연결
  netlify.toml             # Netlify 배포 설정
  .env.example             # 환경변수 예시
```

## 3. PC에서 테스트하기

### 3-1. 준비

1. Node.js 18 이상을 설치합니다.
2. MySQL 8.x 또는 MariaDB 호환 서버를 준비합니다.
3. 이 폴더에서 `.env.example`을 복사해 `.env`로 이름을 바꿉니다.
4. `.env`에서 MySQL 비밀번호와 DB 정보를 맞춥니다.

```bash
cp .env.example .env
```

예시:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=내비밀번호
DB_NAME=mt_optics
DB_AUTO_CREATE_DATABASE=true
AUTO_MIGRATE=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin1234!
```

### 3-2. 설치 및 실행

```bash
npm install
npm run dev
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:3000
```

최초 로그인:

```text
아이디: admin
비밀번호: admin1234!
```

운영 전에는 반드시 `.env`의 `ADMIN_PASSWORD`와 `JWT_SECRET`을 변경하세요.

### 3-3. 첨부 엑셀자료 DB 등록하기

방법 A: 웹 화면에서 등록

1. 로그인 후 `엑셀가져오기` 메뉴로 이동합니다.
2. `거래처원장.xls`, `기간별 판매명세서 상세.xls`, `수금(미수금)명세서.xls`, `거래처별 영업현황 거래내역.xls` 파일을 선택합니다.
3. `엑셀 가져오기 실행`을 누릅니다.
4. 거래처/원장, 제품/재고, 주문/출고, 수금/미수금 화면에서 등록 결과를 확인합니다.

방법 B: 명령창에서 일괄 등록

이 zip에는 첨부 엑셀 원본이 `import/excel` 폴더에 포함되어 있습니다. 아래 명령을 실행하면 해당 폴더의 .xls/.xlsx 파일을 DB에 등록합니다.

```bash
npm run import:excel
```

방법 C: MySQL Workbench에서 사전 추출 SQL 실행

`database/import_uploaded_excel_data.sql`은 현재 첨부 엑셀 파일에서 추출한 거래처 18건, 제품 4건, 매출주문 23건을 등록하는 SQL입니다. Workbench에서 열어 실행할 수 있습니다. 웹/명령창 가져오기와 중복 실행하지 않는 것을 권장합니다.

특정 폴더의 엑셀 파일을 가져오려면 다음처럼 실행합니다.

```bash
node tools/import-excel.js "C:\엑셀자료폴더"
```

엑셀 가져오기 기능을 추가했으므로 기존 설치 폴더에서 v1.3으로 교체하는 경우에는 한 번 더 의존성을 설치하세요.

```bash
npm install
```

### 3-4. 예시자료 넣기

첨부된 이카운트 자료에서 보이는 거래처/품목 일부를 테스트용으로 넣고 싶으면 아래 명령을 실행합니다.

```bash
npm run seed:sample
```

## 4. MySQL 테이블 생성 방식

앱 실행 시 `.env` 값이 아래처럼 되어 있으면 DB와 테이블이 자동 생성됩니다.

```env
DB_AUTO_CREATE_DATABASE=true
AUTO_MIGRATE=true
```

수동으로 만들고 싶으면 MySQL에서 다음 순서로 실행합니다.

```sql
SOURCE database/create_database.sql;
SOURCE database/schema.sql;
```

핵심 테이블은 다음과 같습니다.

| 테이블 | 목적 |
|---|---|
| users, roles, permissions, role_permissions | 사용자/권한 |
| customers | 거래처 마스터 |
| products | 제품/현재재고/안전재고/안경제품 세부정보 |
| code_groups, code_items | 기준정보 코드그룹/코드항목 |
| materials | 자재 기준정보/자재재고 |
| product_components | 제품별 자재 구성/BOM |
| sales_orders, order_items | 주문/품목 |
| shipments | 출고/택배/영업방문 납품 기록 |
| payments | 카드/송금/현금 수금 |
| receivable_transactions | 거래처 원장/미수금 증감 |
| production_orders | 생산지시 |
| production_receipts | 생산입고 |
| inventory_transactions | 재고 입출고 이력 |
| audit_logs | 이전값/이후값 수정이력 |
| import_batches, import_errors, import_row_hashes | 엑셀 가져오기 이력/오류/중복방지 |

## 5. Netlify + GitHub 배포

이 프로젝트는 프론트엔드는 정적 파일, 백엔드는 Netlify Functions로 구성했습니다. 단, MySQL은 Netlify 내부에 포함되지 않으므로 외부에서 접근 가능한 MySQL 서버가 필요합니다.

1. GitHub에 새 저장소를 만듭니다.
2. 이 폴더 전체를 GitHub에 올립니다.
3. Netlify에서 GitHub 저장소를 연결합니다.
4. Build command는 `npm run build`, Publish directory는 `frontend`로 둡니다. `netlify.toml`에 이미 설정되어 있습니다.
5. Netlify Site settings > Environment variables에 `.env`와 같은 값을 등록합니다.
6. 배포 후 `/api/health`가 정상 응답하는지 확인합니다.

Netlify 환경변수 예시:

```text
DB_HOST=외부 MySQL 호스트
DB_PORT=3306
DB_USER=사용자
DB_PASSWORD=비밀번호
DB_NAME=mt_optics
DB_AUTO_CREATE_DATABASE=true
AUTO_MIGRATE=true
JWT_SECRET=운영용긴랜덤문자열
ADMIN_USERNAME=admin
ADMIN_PASSWORD=운영용초기비밀번호
```

## 6. 기준정보와 엑셀자료 운영 순서

초기 구축 시 추천 순서는 다음과 같습니다.

```text
1. 기준정보 메뉴에서 제품분류, 배송방법, 박싱구분, 소재 코드 확인
2. 엑셀가져오기 메뉴 또는 npm run import:excel로 기존 엑셀자료 등록
3. 거래처/원장에서 거래처명, 전화, 미수금 확인
4. 제품/재고에서 SKU, 제품명, 브랜드/모델/색상/사이즈, 안전재고 보완
5. 주문/출고, 수금/미수금, 생산지시를 실제 업무 흐름에 맞게 테스트
```

엑셀 가져오기는 가능한 자료를 최대한 활용하지만, 파일마다 누락된 정보가 있을 수 있습니다. 예를 들어 판매명세서에 전화번호가 없으면 거래처명만 먼저 등록되고, 수금(미수금)명세서에 전화번호·사업자번호가 있을 때 추가 보완됩니다.

## 7. 운영 절차 예시

### 주문 접수
1. 거래처/원장에서 거래처를 등록하거나 검색합니다.
2. 주문/출고 > 주문 등록을 누릅니다.
3. 접수경로를 전화/카톡/영업방문 등으로 선택합니다.
4. 박싱구분을 영업부/다빈치/기타로 선택합니다.
5. 품목과 수량을 입력하고 저장합니다.
6. 저장과 동시에 거래처 원장에 매출 미수금이 반영됩니다.

### 출고
1. 주문/출고 목록에서 출고 버튼을 누릅니다.
2. 택배사, 송장번호, 박스번호, 확인자를 입력합니다.
3. 출고 처리 시 품목의 현재재고가 자동 차감됩니다.

### 수금
1. 수금/미수금에서 거래처를 선택합니다.
2. 카드/송금/현금을 선택하고 금액을 입력합니다.
3. 저장 시 거래처 원장 잔액이 자동 차감됩니다.

### 생산
1. 제품/재고에서 안전재고와 현재재고를 관리합니다.
2. 생산지시에서 부족 제품과 추천 생산량을 확인합니다.
3. 사람이 최종 판단근거를 입력하고 생산지시를 등록합니다.
4. 생산완료 후 입고 처리하면 현재재고가 증가합니다.

## 8. 백업과 안전 운영

- 운영 DB는 최소 하루 1회 백업하세요.
- 실수로 수정한 자료는 `수정이력` 메뉴에서 이전값과 이후값을 확인할 수 있습니다.
- 실제 삭제 대신 상태를 `중지`로 변경하는 방식으로 운영하는 것을 권장합니다.
- 신규 기능을 추가할 때는 PC에서 먼저 테스트한 뒤 GitHub/Netlify에 반영하세요.

## 9. GPT에게 유지보수 요청할 때 전달하면 좋은 내용

아래 4가지를 같이 전달하면 비전문가도 비교적 안전하게 수정할 수 있습니다.

1. 이 프로젝트 zip 또는 GitHub 링크
2. 원하는 변경사항 예: “주문 등록 화면에 안경원 담당자 칸을 추가해줘”
3. 현재 사용하는 DB 테이블: `database/schema.sql`
4. 오류 화면 또는 서버 로그

변경 후에는 다음 순서로 확인하세요.

```bash
npm run check
npm run dev
```

그리고 브라우저에서 주문 등록, 수금 등록, 생산입고, 수정이력 조회를 한 번씩 테스트합니다.

---

## v1.4 추가 반영: AWS RDS + 거래처 납품처/발송구분 관리

이번 버전은 AWS RDS MySQL에서 운영 테스트하기 쉽도록 보완했고, 같은 거래처가 지역별로 여러 개 존재하는 MT옵틱스 업무 특성을 반영했습니다.

### v1.4 핵심 변경

- `customer_sites` 테이블 추가: 하나의 거래처 아래에 지역/지점/납품처를 여러 개 등록합니다.
- 주문·출고·수금·미수금에 `발송구분`을 추가했습니다.
  - 택배
  - 영업방문
  - 기타
- `sales_orders`, `shipments`, `payments`, `receivable_transactions`에 `customer_site_id`, `delivery_type`을 저장합니다.
- 수금/미수금 화면에서 발송구분별 미수금 집계를 확인할 수 있습니다.
- 엑셀 가져오기 시 `거래처명(지역)` 형식은 다음처럼 정리합니다.
  - 거래처명: 괄호 앞 기본 거래처명
  - 납품처/지역: 괄호 안 지역명
- AWS RDS 접속용 `.env.aws.example`, `database/aws_create_database_and_user.sql`, `database/aws_check.sql`을 추가했습니다.

## AWS RDS MySQL에서 처음 실행하는 순서

### 1. AWS RDS 접속 확인

PowerShell에서 다음처럼 3306 접속이 성공해야 합니다.

```powershell
Test-NetConnection -ComputerName mtoptics.cls0gww4u9u4.ap-northeast-2.rds.amazonaws.com -Port 3306
```

`TcpTestSucceeded : True`이면 PC에서 RDS에 접속 가능합니다.

### 2. MySQL Workbench에서 admin 계정으로 접속

MySQL Workbench에서 새 연결을 만듭니다.

| 항목 | 입력값 |
|---|---|
| Hostname | AWS RDS Endpoint |
| Port | 3306 |
| Username | RDS 관리자 계정 |
| Password | RDS 관리자 비밀번호 |

주의: 관리자/DB 비밀번호는 GitHub에 올리면 안 됩니다.

### 3. DB와 mtopt 사용자 준비

Workbench에서 `database/aws_create_database_and_user.sql`을 열고, `<MTOPT_PASSWORD>`를 실제 앱용 DB 비밀번호로 바꾼 뒤 실행합니다.

이 작업은 최초 1회만 하면 됩니다.

### 4. 프로그램 .env 작성

프로그램 폴더에서 `.env.aws.example`을 `.env`로 복사합니다.

Windows 명령 프롬프트 예시:

```cmd
copy .env.aws.example .env
notepad .env
```

아래 항목을 실제 AWS RDS 값으로 맞춥니다.

```env
DB_HOST=mtoptics.cls0gww4u9u4.ap-northeast-2.rds.amazonaws.com
DB_PORT=3306
DB_USER=mtopt
DB_PASSWORD=여기에_mtopt_비밀번호_입력
DB_NAME=mt_optics
DB_AUTO_CREATE_DATABASE=false
AUTO_MIGRATE=true
```

처음 접속이 안 되면 `DB_SSL=false`로 테스트하고, 운영 전에는 SSL 적용 여부를 확인하세요.

### 5. 패키지 설치

```cmd
npm install
```

### 6. 테이블 자동 생성 및 PC 테스트 실행

```cmd
npm run dev
```

브라우저에서 엽니다.

```text
http://localhost:3000
```

최초 로그인은 `.env`의 관리자 계정 정보입니다.

```text
아이디: admin
비밀번호: .env의 ADMIN_PASSWORD
```

### 7. 테이블 생성 확인

Workbench에서 `database/aws_check.sql`을 실행합니다.

`customers`, `customer_sites`, `sales_orders`, `payments`, `receivable_transactions` 등이 보이면 정상입니다.

### 8. 첨부 엑셀자료 등록

방법 A: 웹 화면

```text
엑셀가져오기 → 파일 선택 → 엑셀 가져오기 실행
```

방법 B: 명령창 일괄 등록

```cmd
npm run import:excel
```

이번 zip의 `import/excel` 폴더에는 첨부 엑셀 원본이 포함되어 있습니다.

## GitHub 업로드 시 주의

올려도 되는 파일:

```text
backend/
frontend/
database/
tools/
import/excel/
.env.example
.env.aws.example
package.json
README.md
```

절대 올리면 안 되는 파일:

```text
.env
node_modules/
```

`.gitignore`에 `.env`와 `node_modules/`가 포함되어 있으므로 그대로 사용하세요.

## 발송구분별 수금/미수금 운영 방식

권장 입력 방식은 다음과 같습니다.

1. `거래처/원장`에서 거래처를 등록합니다.
2. `납품처` 버튼을 눌러 지역/지점/납품처를 등록합니다.
3. 각 납품처의 기본 발송구분을 `택배`, `영업방문`, `기타` 중 하나로 지정합니다.
4. 주문 등록 시 거래처와 납품처를 선택하면 기본 발송구분이 자동 반영됩니다.
5. 수금 등록 시에도 거래처와 납품처, 발송구분을 선택합니다.
6. `수금/미수금` 화면에서 발송구분별 미수금을 확인합니다.

예시:

```text
대지안경원
 ├─ 청주우암 / 택배
 ├─ 대전 / 영업방문
 └─ 기타 / 기타
```

이 구조로 관리하면 같은 거래처명이 지역별로 반복되어도 거래처 본체는 하나로 보고, 실제 납품/수금은 지역·발송구분별로 나눠 확인할 수 있습니다.
