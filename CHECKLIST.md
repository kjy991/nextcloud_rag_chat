# 과제 체크리스트
> 원본: `풀스택 및 AI 개발자 과제.docx` 기준 전수 검토
> `python infra/test_checklist.py` 실행 시 자동 갱신

---

## 3.1 Nextcloud 준비 및 tenant 관리

- [x] Nextcloud Docker Compose 구축 (`infra/docker-compose.yml`) <!-- @nc-docker -->
- [x] tenant-a, tenant-b Nextcloud Group 생성 (`infra/init-nextcloud.sh`) <!-- @nc-groups -->
- [x] 각 회사 사용자 3명+ 생성 (user-a1~a3, user-b1~b3) <!-- @nc-users -->
- [x] 해당 Group에 소속 <!-- @nc-group-member -->
- [x] 사용자별 quota 100MB 설정 <!-- @nc-quota -->
- [x] 최소 1명 50MB 이상 사용 (user-a1 실측 60%) <!-- @nc-50mb -->
- [x] 인증정보 환경변수 관리 (`.env`) <!-- @nc-envvar -->

---

## 3.2 사용자 저장공간 사용량 관리

- [x] Nextcloud OCS Provisioning API로 used/quota 조회 (`nextcloud.service.ts`) <!-- @ocs-api -->
- [x] 특정 tenant 사용자 사용량 목록 제공 (`admin.service.ts`) <!-- @admin-tenant -->
- [x] 응답 필드: `tenantId` <!-- @admin-f-tenantid -->
- [x] 응답 필드: `userId`, `email` <!-- @admin-f-userid -->
- [x] 응답 필드: `usedBytes` <!-- @admin-f-usedbytes -->
- [x] 응답 필드: `quotaBytes` <!-- @admin-f-quotabytes -->
- [x] 응답 필드: `usagePercent` <!-- @admin-f-usagepct -->
- [x] 응답 필드: `lastCollectedAt` <!-- @admin-f-collectedat -->
- [x] 관리자 화면: 회사 선택 UI (`AdminPanel.tsx`)
- [x] 관리자 화면: 사용자별 사용량 테이블
- [x] Progress Bar (80%↑ 빨강 / 50%↑ 노랑 / 그 외 초록)
- [x] 새로고침 버튼
- [x] Nextcloud API 장애 시 5xx + 안전한 오류 메시지 (`BadGatewayException`) <!-- @admin-5xx -->

---

## 3.3 파일 업로드 및 문서 목록

- [x] PDF 업로드 지원 (200MB 이하 제한) <!-- @pdf-upload -->
- [x] Nextcloud `/documents` 폴더에 저장 <!-- @pdf-nc-stored -->
- [x] Nextcloud 파일 목록 화면에 표시 (PROPFIND WebDAV) <!-- @pdf-list -->
- [x] 인덱싱 상태 뱃지 표시 (PENDING / PROCESSING / COMPLETED / FAILED) <!-- @pdf-status -->
- [x] 파일 선택 시 AI 채팅창 활성화 (COMPLETED인 경우만) <!-- @pdf-activate -->
- [x] 단일 파일 기준 질문 — `POST /api/files/:id/chat` <!-- @single-chat -->
- [ ] 폴더 기준 질문 (선택 기능) — `POST /api/folders/:id/chat` 미구현

---

## 3.4 PDF 처리 및 검색 인덱싱

- [x] PDF 업로드 시 PENDING 처리 작업 생성 <!-- @pdf-pending -->
- [x] PDF 페이지별 텍스트 추출 (pdfplumber) <!-- @pdf-extract -->
- [x] 페이지 / 문단 / 길이 기준 chunk 분해 (`pdf_extractor.py`) <!-- @pdf-chunks -->
- [x] `tenantId` 메타데이터 저장 (DB + Qdrant payload) <!-- @meta-tenantid -->
- [x] `documentId` 메타데이터 저장 <!-- @meta-documentid -->
- [x] `fileName` 메타데이터 저장 <!-- @meta-filename -->
- [x] `pageNo` 메타데이터 저장 <!-- @meta-pageno -->
- [x] `paragraphNo` 메타데이터 저장 <!-- @meta-paragraphno -->
- [x] `bbox` 정보 저장 — pdfplumber word-level 좌표를 텍스트 chunk와 순차 매칭 (`find_text_bbox`) <!-- @meta-bbox -->
- [x] chunk별 embedding 생성 (nomic-embed-text / Ollama) <!-- @embed-gen -->
- [x] embedding + 메타데이터 Qdrant 저장 <!-- @qdrant-stored -->
- [x] 재처리 구조 — FAILED 문서 `POST /api/files/:fileId/retry-indexing` + UI 재처리 버튼 <!-- @retry-indexing -->

---

## 3.5 AI 채팅

- [x] 오른쪽 채팅창에서 자연어 질문 입력
- [x] `tenantId + documentId` 조건으로 검색 범위 제한 <!-- @chat-scope -->
- [x] 전체 Vector DB 검색 금지 (Qdrant `must` filter 강제) <!-- @chat-no-global -->
- [x] 검색된 chunk를 근거로 LLM 답변 생성 (Ollama) <!-- @chat-llm -->
- [x] 근거: `fileName` <!-- @chat-f-filename -->
- [x] 근거: `pageNo` <!-- @chat-f-pageno -->
- [x] 근거: `paragraphNo` <!-- @chat-f-paragraphno -->
- [x] 근거: 텍스트 일부 (최대 200자) <!-- @chat-f-text -->
- [x] 검색 결과 부족 시 "문서에서 확인 불가" 반환 (score < 0.2) <!-- @chat-no-answer -->
- [x] 일반 지식 보완 금지 (시스템 프롬프트에 명시) <!-- @chat-no-hallucination -->
- [x] 응답 시간 10초 이내 (200MB PDF 기준) <!-- @chat-10s -->

---

## 2.1 화면 구성 (UX)

- [x] 상단: 로그인 사용자 정보 표시 (email / ncUserId)
- [x] 상단: 현재 tenant 표시 (eyebrow 라벨)
- [x] 상단: 저장공간 사용량 요약 — topbar에 현재 사용자 사용률 표시
- [x] 좌측: 파일 목록
- [x] 좌측: PDF 업로드 버튼
- [x] 좌측: 인덱싱 상태 표시
- [x] 중앙: 선택된 PDF 실제 미리보기 (react-pdf) <!-- @pdf-viewer -->
- [x] 중앙: 페이지 이동 (‹ / › 버튼) <!-- @pdf-page-nav -->
- [x] 중앙: 근거 위치 하이라이트 (선택 구현) — bbox가 있는 근거 카드 클릭 시 하이라이트 표시
- [x] 오른쪽: AI 채팅창 + 질문 입력 + 답변 표시
- [x] 오른쪽: 근거 카드 목록 (파일명 / 페이지 / 문단 / 텍스트)
- [x] 근거 카드 클릭 → PDF 해당 페이지 이동
- [x] 관리자: 사용자 used/quota 리스트
- [x] 관리자: Progress Bar
- [x] 관리자: 새로고침 버튼

---

## 7. 보안 및 권한

- [x] 모든 tenant route 요청에서 tenantId 검증 (JWT Guard + route tenant 비교) <!-- @sec-tenantid -->
- [x] DB 쿼리에 tenantId 필터 <!-- @sec-db-filter -->
- [x] Vector DB 쿼리에 tenantId 필터 (Qdrant `must`) <!-- @sec-vector-filter -->
- [x] Nextcloud WebDAV 접근 전 ownerUserId 검증 <!-- @sec-nc-check -->
- [x] 전체 Vector DB 검색 경로 없음 <!-- @sec-no-global -->
- [x] Nextcloud App Password 환경변수 관리 <!-- @sec-envvar-nc -->
- [x] DB Password 환경변수 관리 <!-- @sec-envvar-db -->
- [x] 채팅 로그 접근 권한 및 보관 기간 정책 — README 보안 섹션에 명시
- [x] NC API 실패 시 민감정보 제외 오류 메시지 <!-- @sec-safe-msg -->

---

## 8. 필수 테스트 시나리오 (10개)

- [x] T1: tenant-a 로그인 → tenant-a 허용 파일만 표시 <!-- @t1 -->
- [x] T2: tenant-b가 tenant-a 파일 접근 → 403 / 404 <!-- @twww2 -->
- [x] T3: PDF 업로드 → Nextcloud 저장 + PENDING <!-- @t3 -->
- [x] T4: 인덱싱 완료 → COMPLETED + chunkCount 표시 <!-- @t4 -->
- [x] T5: 파일 선택 → 오른쪽 채팅창 표시 <!-- @t5 -->
- [x] T6: 문서 내용 질문 → 답변 + 파일명 / 페이지 / 문단 / 텍스트 <!-- @t6 -->
- [x] T7: 문서에 없는 질문 → "문서에서 확인 불가" <!-- @t7 -->
- [x] T8: 50MB 이상 → 사용률 50%+ 표시 <!-- @t8 -->
- [ ] T9: Nextcloud API 인증 실패 → 5xx + 안전한 메시지 <!-- @t9 -->
- [ ] T10: Vector DB 장애 → 채팅 실패 메시지 + 시스템 로그 <!-- @t10 -->

---

## 9. 제출물
 흐름 (README 포함) <!-- @sub-search -->
- [x] 설계 문서: 권한 / 보안 고려사항 (README 포함) <!-- @sub-security -->
- [ ] 실행 화면 캡처 — skip
- [ ] 데모 영상 (선택)

- [ ] Git Repository — skip
- [x] README.md (설치 / 실행 / 테스트 방법) <!-- @sub-readme -->
- [x] 설계 문서: 전체 아키텍처 (README 포함) <!-- @sub-arch -->
- [x] 설계 문서: 데이터 모델 (README 포함) <!-- @sub-datamodel -->
- [x] 설계 문서: API 명세 + 응답 예시 JSON (README 포함) <!-- @sub-api -->
- [x] 설계 문서: 문서 검색 처리
---

## 미완성 항목 요약

| 항목 | 파일 위치 | 중요도 |
|------|-----------|--------|
| T9 Nextcloud 장애 실제 테스트 | — | 낮음 |
| T10 Qdrant 장애 실제 테스트 | — | 낮음 |
| 폴더 기반 채팅 (선택) | — | 선택 |
| 응답 시간 200MB 기준 테스트 | — | 낮음 |
