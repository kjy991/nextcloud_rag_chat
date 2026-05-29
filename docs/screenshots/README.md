# 실행 화면 캡처

`npm run screenshots` 명령으로 자동 생성됩니다.

| 파일 | 설명 |
|------|------|
| 01-login.png | 로그인 화면 |
| 02-main-admin.png | ADMIN 메인 화면 (파일 목록 + 관리자 사용량 패널) |
| 03-admin-usage.png | tenant별 사용자 저장공간 사용량 (Progress Bar) |
| 04-file-selected-chat.png | PDF 파일 선택 후 우측 AI 채팅창 활성화 |
| 05-chat-with-sources.png | 질문 답변 + 근거 카드 (파일명/페이지/문단) |
| 06-main-regular-user.png | 일반 사용자 화면 (관리자 패널 비표시) |

## 생성 방법

```bash
# 1. 인프라 + 앱 실행 중인 상태에서
npm run infra:up
npm run dev
# apps/worker도 실행 + PDF 1개 이상 COMPLETED 상태

# 2. Playwright 설치 (최초 1회)
npx playwright install chromium

# 3. 캡처 실행
npm run screenshots
```
