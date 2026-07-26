# MT옵틱스 통합관리 FINAL V300

주소검색, 거래처 자동완성, 전화번호/사업자번호 표준화, 발송구분별 미수금 조회를 최종 정리한 버전입니다.

# MT옵틱스 통합관리 v1.5

Lightsail 1대에서 Node.js + MySQL + Nginx로 운영하는 주문·판매·수금·미수금·생산·재고 통합 웹앱입니다.

## v1.5 핵심 변경

- 거래처와 납품처에 우편번호·도로명주소·지번주소·상세주소를 저장하고 주소검색 버튼으로 선택 등록합니다.
- `거래처 정보.xls`, `판매처 원장 상세.xls`, `일별영업현황.xls` 파일명을 인식합니다.
- 기존 `거래처원장.xls`, `기간별 판매명세서 상세.xls`, `수금(미수금)명세서.xls`, `거래처별 영업현황 거래내역.xls`도 지원합니다.
- 휴대폰에서 주문·수금·거래처 메뉴를 빠르게 사용할 수 있도록 반응형 화면과 하단 바로가기를 추가했습니다.
- 주문과 수금을 수정 또는 논리삭제할 수 있으며, 사용자·일시·IP·사유·수정 전후 값을 감사이력에 남깁니다.
- 로그인/API 요청 제한, 보안 헤더, Excel 확장자와 파일 내용 검사를 추가했습니다.
- Lightsail 업데이트·DB 백업·롤백 스크립트를 포함합니다.

## 처음 설치할 때

1. `.env.lightsail.example`을 `.env`로 복사합니다.
2. `.env`의 DB_PASSWORD, ADMIN_PASSWORD, JWT_SECRET, CORS_ORIGIN을 실제 값으로 변경합니다.
3. 다음 명령을 실행합니다.

```bash
npm install
npm run check
npm start
```

운영 서버에서는 PM2로 실행합니다.

```bash
pm2 start npm --name mt-optics -- start
pm2 save
```

## GitHub 업데이트 후 Lightsail 반영

```bash
cd /var/www/mt-optics
chmod +x deploy/*.sh
./deploy/update-lightsail.sh
```

## Excel 업로드

로그인 후 `엑셀가져오기` 메뉴에서 PC에 보관된 파일을 직접 선택합니다. 실제 거래처·판매·수금 Excel은 GitHub에 올리지 마세요.

우선 파일:

1. 거래처 정보.xls
2. 판매처 원장 상세.xls
3. 일별영업현황.xls

엑셀에 발송구분, 납품처, 수금방법 등이 없으면 프로그램은 가능한 범위만 등록합니다. 상세 표준양식은 `docs/MT옵틱스_엑셀업로드_표준양식_v1.5.xlsx`에 있습니다.

## 보안 원칙

- 저장소는 Private으로 설정합니다.
- `.env`, 실제 Excel, DB 백업, `node_modules`는 GitHub에 올리지 않습니다.
- Lightsail 방화벽은 22, 80, 443만 허용하고 3000, 3306은 외부에 열지 않습니다.
- 운영 전 기존에 노출된 DB/관리자 비밀번호를 모두 변경합니다.
- 도메인 연결 후 `.env`의 `CORS_ORIGIN=https://order.mtoptics.net`으로 제한합니다.

## 주요 폴더

```text
backend/        Node.js API와 MySQL 업무로직
frontend/       PC·휴대폰 공용 화면
database/       자동 생성 스키마
deploy/         Lightsail 업데이트·백업·롤백
import/excel/    명령어 가져오기용 빈 폴더
docs/           표준양식과 설명
```
