# 보완 체크리스트
> 기준: `풀스택 및 AI 개발자 과제.docx` + 코드 리뷰 피드백  
> 우선순위: 🔴 심각 → 🟡 중간 → 🟢 경미 → ⬜ 선택

---

## 🔴 심각 — 면접 감점 직결 (반드시 수정)

### ✅ S-1. `GET /files/:fileId/content` 소유자 검증 누락 — 완료
- [x] **문제:** `documents.service.ts:getFileContent()`가 `tenantId`만 확인하고 `ownerUserId`를 검증하지 않음  
  → 같은 tenant 내 다른 사용자(user-a2)가 fileId만 알면 PDF 원본 다운로드 가능
- [x] **수정 위치:** `apps/api/src/modules/documents/documents.service.ts:134`
- [x] **수정 방법:**
  ```typescript
  // Before
  where: { id: fileId, tenantId: user.tenantId }

  // After
  where: { id: fileId, tenantId: user.tenantId, ownerUserId: user.id }
  ```
- [x] **검증:** `test_checklist.py` `sec-nc-check` 태그 재실행 후 user-b1으로 user-a1 파일 content 접근 → 404 확인
- [x] **docx 근거:** 7절 "파일 권한: Nextcloud WebDAV 접근 전 해당 파일이 사용자 또는 tenant에 허용된 파일인지 확인"

---

### ✅ S-2. Worker `set_status()` SQL Injection 가능성 — 완료
- [x] **문제:** `apps/worker/main.py:set_status()`에서 `**kwargs`의 키(컬럼명)가 allowlist 없이 SQL에 직접 삽입됨
- [x] **수정 위치:** `apps/worker/main.py:44`
- [x] **수정 방법:** `_ALLOWED_UPDATE_FIELDS` 화이트리스트 추가, unknown 필드 시 `ValueError` raise
- [x] **docx 근거:** 7절 보안 요구사항 (암묵적)

---

### ✅ S-3. `getFileContent` vs `askFile` 권한 불일치 — 테스트 케이스 추가 — 완료
- [x] **문제:** content 엔드포인트(tenant 격리)와 chat 엔드포인트(owner 격리)의 접근 수준이 다름 → S-1 수정으로 일관성 확보
- [x] **테스트 추가:** `apps/api/test/documents.service.spec.ts` — 총 7개 케이스 통과
  - retryIndexing: FAILED→PENDING 정상 케이스
  - retryIndexing: 타 tenant 거부 (NotFoundException)
  - retryIndexing: 동일 tenant 비소유자 거부 (ForbiddenException)
  - getFileContent: 소유자 정상 조회
  - getFileContent: 타 tenant 거부 (NotFoundException)
  - getFileContent: 동일 tenant 비소유자 거부 (NotFoundException)
  - admin: cross-tenant 403 (기존)

---

## 🟡 중간 — 실무 코드 품질 / 과제 명세 미이행

### ✅ M-1. 채팅 세션이 매 질문마다 새로 생성됨 — 완료
- [x] `findFirst` → 없으면 `create` 패턴으로 세션 재사용 구현 (`chat.service.ts:27`)
- [x] 테스트: 기존 세션 재사용 / 신규 생성 / 권한 거부 / 근거 없음 — 6개 통과

---

### ✅ M-2. `AdminPanel` tenant 목록 하드코딩 — 완료
- [x] 하드코딩 dropdown 제거, 현재 사용자 tenantId만 고정 표시 (`AdminPanel.tsx`)
- [x] TypeScript 컴파일 오류 없음

---

### ✅ M-3. PROCESSING 상태 stuck 문서 처리 없음 — 완료
- [x] `documents.updated_at` 컬럼 추가 (Prisma `@updatedAt` + migration 적용)
- [x] `reset_stuck_processing()` 함수 구현 — 매 폴링 루프에서 호출 (`main.py`)
- [x] `STUCK_TIMEOUT_MINUTES` 환경변수로 타임아웃 설정 가능 (기본 30분)
- [x] 테스트: SQL 정확성 / 복구 count / 허용 필드 allowlist — 6개 통과

---

### ✅ M-4. 상단 topbar 저장공간 사용량 요약 없음 — 완료
- [x] `MainPage.tsx` — `getUsersUsage` 호출 후 현재 사용자 데이터 필터링, topbar에 `저장공간 XX%` 표시
- [x] TypeScript 컴파일 오류 없음

---

### ✅ M-5. `AskDto` 질문 길이 검증 없음 — 완료
- [x] `@MaxLength(2000)` 추가 (`chat.dto.ts`) — ValidationPipe는 이미 main.ts에 설정됨
- [x] 테스트: 정상 / 빈문자열 / 2001자 / 2000자 / 필드없음 / 비문자열 — 6개 통과

---

### ✅ M-6. 채팅 로그 접근 권한 및 보관 기간 정책 미정의 — 완료
- [x] `README.md` 보안 섹션에 "채팅 로그 정책" 테이블 추가 (접근 권한 / 보관 기간 90일 / 민감정보 / 향후 개선)

---

## 🟢 경미 — 코드 품질 / 운영 고려

### ✅ L-1. `nc_app_password` DB 평문 저장 — 완료
- [x] **문제:** `users.nc_app_password`가 평문으로 PostgreSQL에 저장 → DB 유출 시 모든 Nextcloud 계정 위험
- [x] **수정 방법:** AES-256-GCM + 앱 수준 암호화 키(`NC_APP_PASSWORD_ENCRYPTION_KEY` env) 적용
  ```typescript
  // prisma user 저장 전
  const encrypted = encrypt(appPassword, process.env.NC_ENCRYPTION_KEY);
  await prisma.user.update({ data: { ncAppPassword: encrypted } });

  // 사용 시
  const plain = decrypt(user.ncAppPassword, process.env.NC_ENCRYPTION_KEY);
  ```
- [x] **docx 근거:** 7절 "비밀정보 관리: Nextcloud App Password는 환경변수 또는 Secret Manager로 관리"

---

### L-2. Score Threshold 하드코딩
- [ ] **문제:** `chat.service.ts:8` `const SCORE_THRESHOLD = 0.2` — 임베딩 모델 변경 시 코드 수정 필요
- [ ] **수정 위치:** `apps/api/src/modules/chat/chat.service.ts`
- [ ] **수정 방법:**
  ```typescript
  // ConfigService로 읽기
  const threshold = this.config.get<number>('QDRANT_SCORE_THRESHOLD', 0.2);
  ```
- [ ] **추가 작업:** `.env.example`에 `QDRANT_SCORE_THRESHOLD=0.2` 추가

---

### L-3. Worker 파일 다운로드 시 admin 자격증명 fallback 불명확
- [ ] **문제:** `nc_app_password`가 null이면 즉시 FAILED — 사용자가 로그인을 한 번도 안 한 경우 발생 가능
- [ ] **수정 방법:** 에러 메시지에 원인 명시 + 향후 admin 다운로드 fallback 고려
  ```python
  log.error("document %s FAILED: nc_app_password 없음 — 해당 사용자(%s) 재로그인 필요",
            doc_id, nc_user_id)
  ```

---

### L-4. listFiles가 본인 파일만 표시 (tenant 공유 불가)
- [ ] **현황:** `documents.service.ts:listFiles()`에 `ownerUserId: user.id` 필터 → 같은 tenant 내 다른 사용자 파일 공유 불가
- [ ] **검토:** 과제 명세상 공유 요구는 없으나 tenant 개념과 맞지 않을 수 있음
- [ ] **결정 필요:** 개인 파일만 볼지 vs tenant 전체 파일 볼지 → README에 정책 명시

---

### L-5. `retryIndexing` 단위 테스트 cross-tenant 케이스 없음
- [ ] **문제:** `documents.service.spec.ts`에 성공 케이스만 있고 cross-tenant 접근 거부 케이스 없음
- [ ] **추가 테스트:**
  ```typescript
  it('다른 tenant 사용자의 문서 retry를 거부한다', async () => {
    prisma.document.findFirst.mockResolvedValue(null); // tenantId 불일치 → findFirst null
    await expect(service.retryIndexing('doc-1', otherTenantUser))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('소유자가 아닌 경우 retry를 거부한다', async () => {
    prisma.document.findFirst.mockResolvedValue({ ownerUserId: 'other-user', ... });
    await expect(service.retryIndexing('doc-1', authUser))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  ```

---

## ⬜ 선택 — 가산점 항목

### ✅ O-1. PDF 근거 위치 하이라이트 (bbox 활용) — 완료
- [x] **현황:** bbox 데이터는 Qdrant에 저장되고 소스 카드 클릭 시 PDF Viewer에 좌표 오버레이 표시
- [x] **구현 방법:** `react-pdf` 페이지 위에 bbox 좌표를 현재 렌더 폭으로 스케일링한 하이라이트 오버레이 표시
- [ ] **docx 근거:** 2.1절 "중앙: 근거 위치 하이라이트 (선택 구현)"

---

### O-2. 폴더 기반 채팅 `POST /api/folders/:folderId/chat`
- [ ] **현황:** 미구현
- [ ] **구현 방법:** `folderId` 기준 `documents` 조회 → 복수 documentId로 Qdrant 검색
- [ ] **docx 근거:** 3.3절 "폴더 기준 질문은 선택 기능", 6.5절 API 명세 예시

---

### O-3. 대화 히스토리 LLM 컨텍스트 반영
- [ ] **현황:** 매 질문이 독립적으로 처리됨 (이전 대화 무시)
- [ ] **구현 방법:**
  ```typescript
  // 최근 N개 메시지를 LLM messages 배열에 추가
  const history = await this.prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'asc' },
    take: 6  // 최근 3턴
  });
  ```

---

### O-4. T9 / T10 실제 장애 테스트 실행
- [ ] **현황:** `--disruptive` 플래그 필요 → 현재 스킵
- [ ] **실행 방법:**
  ```bash
  python infra/test_checklist.py --disruptive --tag t9
  python infra/test_checklist.py --disruptive --tag t10
  ```
- [ ] **사전 조건:** Nextcloud/Qdrant 컨테이너 이름 `rag-nextcloud`, `rag-qdrant` 확인

---

### O-5. 실행 화면 캡처 추가
- [ ] **필요 화면 (docx 9절):**
  - [ ] tenant별 사용량 화면 (Progress Bar 포함)
  - [ ] 파일 선택 + 오른쪽 AI 채팅창 활성화 화면
  - [ ] 근거 카드 표시 화면 (파일명/페이지/문단/텍스트)
  - [ ] "문서에서 확인 불가" 응답 화면
- [ ] **저장 위치:** `docs/screenshots/` 폴더 생성 후 README에 링크

---

## 진행 현황 요약

| 우선순위 | 항목 수 | 완료 | 잔여 |
|----------|---------|------|------|
| 🔴 심각 | 3 | 3 | **0** ✅ |
| 🟡 중간 | 6 | 6 | **0** ✅ |
| 🟢 경미 | 5 | 1 | **4** |
| ⬜ 선택 | 5 | 1 | 4 |
| **합계** | **19** | **11** | **8** |

---

## 수정 작업 순서 (권장)

```
1. S-1 → S-2 → S-3  (보안 구멍 먼저 막기)
2. M-5              (DTO 검증은 5분 작업)
3. M-1              (세션 구조 개선 — migration 필요)
4. M-3              (stuck 문서 처리)
5. M-4              (topbar UI)
6. M-2 + M-6        (Admin 개선 + 정책 문서화)
7. L-1 ~ L-5        (경미 항목 순차 처리)
8. O-5              (스크린샷 → 제출 직전)
```
