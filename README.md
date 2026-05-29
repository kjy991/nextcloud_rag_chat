# Nextcloud RAG Chat

Nextcloud를 파일 저장소로 활용한 **tenant 격리 + 문서 AI 채팅** 시스템입니다.

## 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | NestJS 11 + TypeScript |
| Worker | Python 3.12 (pdfplumber + Qdrant) |
| Database | PostgreSQL 16 (Prisma ORM) |
| Vector DB | Qdrant v1.12.6 |
| Storage | Nextcloud stable-apache |
| LLM/Embed | Ollama (qwen2.5:7b / nomic-embed-text) |
| Infra | Docker Compose |

## 사전 요구사항

- Docker Desktop 실행 중
- Node.js ≥ 22, npm ≥ 10
- Python 3.12 + pip (Worker 로컬 실행 시)
- Ollama 설치 및 실행 중

```bash
# Ollama 모델 다운로드 (최초 1회)
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
# .env에 JWT_SECRET을 안전한 값으로 수정하세요
# NC_APP_PASSWORD_ENCRYPTION_KEY도 운영 환경에서는 별도 난수 값으로 설정하세요
```

### 2. 인프라 시작

```bash
npm run infra:up
# PostgreSQL, Qdrant, Nextcloud가 시작됩니다 (첫 실행 시 약 2분 소요)
```

### 3. DB 마이그레이션 및 seed

```bash
npm run db:migrate   # 스키마 마이그레이션
npm run db:seed      # tenant / user 초기 데이터 투입 (멱등 — 재실행 안전)
```

### 4. Nextcloud 초기화

Nextcloud가 완전히 기동된 후 실행합니다 (http://localhost:8080 접속 확인).

```bash
npm run nc:init
```

생성되는 계정:

| 사용자 | 그룹 | 비밀번호 | quota |
|--------|------|----------|-------|
| user-a1 | tenant-a | Nextcloud@2024! | 100 MB |
| user-a2 | tenant-a | Nextcloud@2024! | 100 MB |
| user-a3 | tenant-a | Nextcloud@2024! | 100 MB |
| user-b1 | tenant-b | Nextcloud@2024! | 100 MB |
| user-b2 | tenant-b | Nextcloud@2024! | 100 MB |
| user-b3 | tenant-b | Nextcloud@2024! | 100 MB |

### 5. DB에 tenant/user 등록

Nextcloud 계정과 내부 DB를 동기화합니다.

```bash
npm run db:seed
```

seed 결과:

| 사용자 | tenant | 역할 |
|--------|--------|------|
| user-a1 | tenant-a | **ADMIN** |
| user-a2 | tenant-a | USER |
| user-a3 | tenant-a | USER |
| user-b1 | tenant-b | **ADMIN** |
| user-b2 | tenant-b | USER |
| user-b3 | tenant-b | USER |

> **ADMIN** 계정으로 로그인해야 저장공간 사용량 관리자 패널이 표시됩니다.

### 6. 개발 서버 실행

```bash
npm run dev
# API: http://localhost:4000
# Web: http://localhost:5173
```

### 7. Python Worker 실행

```bash
cd apps/worker
pip install -r requirements.txt
DATABASE_URL=postgresql://rag:rag_password@localhost:5432/rag \
NEXTCLOUD_BASE_URL=http://localhost:8080 \
NEXTCLOUD_ADMIN_USER=admin \
NEXTCLOUD_ADMIN_PASSWORD=admin_password \
JWT_SECRET=change-me-in-production-use-a-long-random-string \
NC_APP_PASSWORD_ENCRYPTION_KEY=change-me-in-production-use-a-long-random-string \
QDRANT_URL=http://localhost:6333 \
OLLAMA_BASE_URL=http://localhost:11434 \
OLLAMA_EMBED_MODEL=nomic-embed-text \
python main.py
```

## 사용 흐름

1. http://localhost:5173/login 접속
2. `user-a1` / `Nextcloud@2024!`로 로그인
3. 좌측 **PDF 업로드** 버튼으로 PDF 파일 업로드
4. 상태가 **COMPLETED**가 되면 파일 클릭
5. 우측 채팅창에서 질문 입력
6. 답변과 함께 **근거 카드** (파일명/페이지/문단) 확인
7. 근거 카드 클릭 시 PDF 해당 페이지로 이동

## 실행 화면 캡처

인프라와 앱 실행 후 아래 명령으로 제출용 스크린샷을 자동 생성합니다.

```bash
npx playwright install chromium   # 최초 1회
npm run screenshots               # docs/screenshots/ 에 저장
```

캡처 항목: 로그인, 관리자 사용량 화면, 파일 선택+채팅창, 근거 카드, 일반 사용자 화면.  
자세한 내용은 [docs/screenshots/README.md](docs/screenshots/README.md) 참조.

## 통합 테스트

```bash
# API + 인프라 실행 중인 상태에서
npm run test:integration
```

## 주요 명령어

```bash
npm run dev           # API + Web 동시 실행
npm run infra:up      # 인프라 시작 (with build)
npm run infra:down    # 인프라 종료
npm run infra:logs    # 인프라 로그
npm run nc:init       # Nextcloud 초기화
npm run db:migrate    # DB 마이그레이션
npm run db:seed       # tenant/user 초기 데이터 투입 (멱등)
npm run db:studio     # Prisma Studio (DB 브라우저)
npm run typecheck     # 전체 타입 검사
npm run build         # 전체 빌드
npm run test:integration  # 통합 테스트
```

## 아키텍처

```
사용자 브라우저
    │
    ▼
React Frontend (Vite, :5173)
    ├── 로그인 / JWT 저장
    ├── 파일 목록 / PDF 업로드
    ├── PDF Viewer (react-pdf)  ← GET /api/files/:id/content
    ├── AI 채팅창 + 근거 카드
    └── 관리자 사용량 화면
    │
    ▼  (Authorization: Bearer JWT)
NestJS API (:4000, prefix /api)
    ├── auth/       JWT 발급 (Nextcloud OCS 인증)
    ├── nextcloud/  WebDAV 파일 업로드·다운로드, OCS 사용량
    ├── documents/  파일 메타데이터 (PostgreSQL), content 스트리밍
    ├── chat/       RAG 파이프라인 (Qdrant 검색 + Ollama 생성)
    └── admin/      tenant별 사용량 조회
    │
    ├──────────────▶ PostgreSQL (tenants, users, documents, chunks, chat)
    ├──────────────▶ Nextcloud WebDAV (파일 실제 저장소)
    ├──────────────▶ Qdrant (벡터 검색, tenantId 필터)
    └──────────────▶ Ollama (nomic-embed-text 임베딩, LLM 답변)

PDF Worker (Python, 폴링)
    └── PENDING 문서 감지 → Nextcloud 다운로드 → pdfplumber 추출
        → nomic-embed-text 임베딩 → Qdrant 저장 → COMPLETED
```

## 문서 검색 처리 흐름

```
1. POST /api/files/{fileId}/chat  { "question": "..." }
2. JWT에서 tenantId + userId 추출 → fileId 소유권 검증
3. Ollama nomic-embed-text로 질문 임베딩 생성
4. Qdrant 검색: filter(tenantId=X, documentId=Y) + 코사인 유사도
5. score >= 0.2 인 chunk만 선별 (없으면 → "문서에서 확인 불가")
6. 선별된 chunk 텍스트를 LLM 프롬프트 context로 주입
7. qwen2.5:7b (Ollama): "문서 내용만으로 답변, 없으면 확인 불가"
8. Response: { answer, sources: [{ fileName, pageNo, paragraphNo, text, bbox }] }
```

## 데이터 모델

| 테이블 | 주요 컬럼 |
|--------|----------|
| tenants | id, name, nc_group_id |
| users | id, tenant_id, email, nc_user_id, nc_app_password(AES-256-GCM 암호문) |
| documents | id, tenant_id, owner_user_id, nc_path, file_name, index_status, page_count, chunk_count |
| document_chunks | id, document_id, tenant_id, page_no, paragraph_no, chunk_text, bbox_json, embedding_id |
| chat_sessions | id, tenant_id, user_id, document_id |
| chat_messages | id, session_id, role, message, sources_json |

## API 명세 및 응답 예시

### POST /api/auth/login
```json
// Request
{ "ncUserId": "user-a1", "password": "Nextcloud@2024!" }

// Response 201
{ "accessToken": "eyJhbGci..." }
```

### GET /api/admin/tenants/:tenantId/users-usage
```json
// Response 200
{
  "tenantId": "tenant-a",
  "users": [
    {
      "userId": "user-a1-id",
      "email": "user-a1@datco.kr",
      "usedBytes": 62636727,
      "quotaBytes": 104857600,
      "usagePercent": 60,
      "lastCollectedAt": "2026-05-13T10:00:00.000Z"
    }
  ]
}
```

### POST /api/tenants/:tenantId/files (multipart)
```json
// Response 201
{
  "fileId": "cmp3i1sen000vfd6jbp3e4bod",
  "tenantId": "tenant-a",
  "fileName": "contract.pdf",
  "nextcloudPath": "/documents/contract.pdf",
  "indexStatus": "PENDING"
}
```

### GET /api/files/:fileId/index-status
```json
// Response 200
{
  "fileId": "cmp3i1sen000vfd6jbp3e4bod",
  "status": "COMPLETED",
  "pageCount": 3,
  "chunkCount": 11,
  "indexedAt": "2026-05-13T05:10:00.000Z"
}
```

### GET /api/files/:fileId/content
PDF 바이너리 스트림 (`Content-Type: application/pdf`). JWT 인증 필요.

### POST /api/files/:fileId/chat
```json
// Request
{ "question": "납품 지연 시 패널티 조건은?" }

// Response 200
{
  "answer": "문서 기준으로 납품 지연 시 지체일수에 따라 계약금액의 일정 비율을 부과합니다.",
  "sources": [
    {
      "fileName": "contract.pdf",
      "pageNo": 2,
      "paragraphNo": 1,
      "text": "3. RAG Pipeline The RAG pipeline...",
      "bbox": null
    }
  ]
}

// 근거 없는 경우
{ "answer": "문서에서 확인 불가", "sources": [] }
```

## 보안

- 모든 API는 JWT 인증 필요 (`Authorization: Bearer <token>`)
- 모든 DB/Vector 쿼리에 `tenantId` 필터 적용 (tenant 격리)
- 다른 tenant 파일 목록 접근 → **HTTP 403**
- 다른 tenant 문서 직접 접근 → **HTTP 404** (존재 노출 차단)
- Vector DB 검색 시 `tenantId + documentId` 필터 강제 (전체 검색 불가)
- 문서 근거 없는 답변 → `"문서에서 확인 불가"` (환각 억제)
- LLM 프롬프트에 "문서 내용 외 일반 지식으로 보완하지 말 것" 명시
- 환경변수로 모든 비밀정보 관리 (`.env`, `.gitignore`에 포함)
- Nextcloud App Password를 AES-256-GCM으로 암호화해 `nc_app_password`에 저장 (평문 비밀번호 미보관)
- PDF 파일 content 접근 시 `tenantId + ownerUserId` 이중 검증 (타 사용자 다운로드 차단)

### 채팅 로그 정책

`chat_sessions` / `chat_messages` 테이블에 사용자 질문과 AI 답변이 저장됩니다.

| 항목 | 정책 |
|------|------|
| **접근 권한** | 세션 소유자(`userId`)만 조회 가능. 타 사용자 및 타 tenant 접근 불가 (tenantId 필터 적용) |
| **보관 기간** | 기본 90일. 문서 삭제 시 연관 세션 및 메시지 Cascade 삭제 (`onDelete: Cascade`) |
| **민감정보** | 질문/답변에 개인정보가 포함될 수 있으므로 DB 접근을 DB 관리자 계정으로 제한 |
| **향후 개선** | 보관 기간 만료 레코드 자동 삭제 배치 작업 추가 권장 |

## 프로젝트 구조

```
apps/
  api/          NestJS 백엔드
    src/modules/
      auth/       JWT 인증
      nextcloud/  OCS + WebDAV 클라이언트
      admin/      사용량 조회
      documents/  파일 업로드/목록
      chat/       RAG 채팅 (Qdrant + Ollama)
      prisma/     DB 서비스
  web/          React 프론트엔드
    src/
      pages/      LoginPage, MainPage
      components/ FilePanel, ChatPanel, AdminPanel
      lib/api.ts  API 클라이언트
  worker/       Python PDF 처리 Worker
    main.py      폴링 메인 루프
    services/
      pdf_extractor.py  pdfplumber 텍스트 추출
      embedder.py       Ollama embedding
      vector_store.py   Qdrant 저장/삭제
packages/
  shared/       공용 TypeScript 타입
infra/
  docker-compose.yml    인프라 정의
  init-nextcloud.sh     Nextcloud 초기화
  test-integration.sh   통합 테스트
```
