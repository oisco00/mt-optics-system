# MT옵틱스 APPLY_FINAL_ENHANCEMENTS_V304

## 핵심 변경

- 카카오/다음 우편번호 iframe/embed/open 호출을 완전히 중단했습니다.
- 주소검색 버튼은 내부 직접입력 모달을 열고, 공식 도로명주소 검색 사이트를 새창으로 여는 방식으로 고정했습니다.
- 기존 버전의 주소검색 이벤트가 남아 있어도 캡처 단계에서 먼저 차단하여 about:blank 차단 화면이 뜨지 않게 했습니다.
- V303까지의 거래처 검색/정렬, 금액 소수점 제거, 발송구분별 미수금 조회, 삭제 안전확인 기능은 유지했습니다.

## 적용

1. 로컬 작업 폴더에 덮어쓰기 압축 해제
2. APPLY_FINAL_ENHANCEMENTS_V304.cmd 실행
3. GitHub Desktop에서 Commit / Push
4. AWS:

```bash
cd /var/www/mt-optics
bash ./deploy/github_update
```

## 주의

AWS의 .env는 GitHub에 올리면 안 됩니다. .env는 서버에만 보관하세요.
