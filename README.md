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
```

### 2. 인프라 시작

```bash
npm run infra:up
# PostgreSQL, Qdrant, Nextcloud가 시작됩니다 (첫 실행 시 약 2분 소요)
```

### 3. DB 마이그레이션

```bash
npm run db:migrate
# 첫 실행 시 마이그레이션 이름: init
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

Nextcloud 계정과 내부 DB를 동기화합니다 (SQL 직접 실행).

```bash
# Prisma Studio에서 직접 입력하거나 아래 SQL 실행
npm run db:studio
```

또는 아래 SQL을 PostgreSQL에 실행:

```sql
INSERT INTO tenants (id, name, nc_group_id) VALUES
  ('tenant-a', 'Tenant A', 'tenant-a'),
  ('tenant-b', 'Tenant B', 'tenant-b');

INSERT INTO users (id, tenant_id, email, nc_user_id) VALUES
  ('user-a1-id', 'tenant-a', 'user-a1@datco.kr', 'user-a1'),
  ('user-a2-id', 'tenant-a', 'user-a2@datco.kr', 'user-a2'),
  ('user-a3-id', 'tenant-a', 'user-a3@datco.kr', 'user-a3'),
  ('user-b1-id', 'tenant-b', 'user-b1@datco.kr', 'user-b1'),
  ('user-b2-id', 'tenant-b', 'user-b2@datco.kr', 'user-b2'),
  ('user-b3-id', 'tenant-b', 'user-b3@datco.kr', 'user-b3');
```

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
npm run db:studio     # Prisma Studio (DB 브라우저)
npm run typecheck     # 전체 타입 검사
npm run build         # 전체 빌드
npm run test:integration  # 통합 테스트
```

## API 명세

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/auth/login | 로그인 → JWT |
| GET | /api/health | 헬스체크 |
| GET | /api/admin/tenants/:id/users-usage | tenant 사용량 조회 |
| POST | /api/tenants/:id/files | PDF 업로드 |
| GET | /api/tenants/:id/files | 파일 목록 |
| GET | /api/files/:id/index-status | 인덱싱 상태 |
| POST | /api/files/:id/chat | 문서 질의응답 |

## 보안

- 모든 API는 JWT 인증 필요 (`Authorization: Bearer <token>`)
- 모든 DB/Vector 쿼리에 `tenantId` 필터 적용 (tenant 격리)
- 다른 tenant의 파일 접근 시 403 반환
- 문서 근거 없는 답변 → `"문서에서 확인 불가"` (환각 억제)
- 환경변수로 모든 비밀정보 관리 (`.env` 파일, `.gitignore`에 포함)

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
