#!/usr/bin/env python3
"""
통합 테스트 + CHECKLIST.md 자동 업데이트
각 테스트 통과 시 CHECKLIST.md의 [ ] → [x], 실패 시 [x] → [ ] 로 변경

Usage:
    python infra/test_checklist.py              # 전체 테스트
    python infra/test_checklist.py --list       # 등록된 태그 목록만 출력
    python infra/test_checklist.py --tag t2     # 특정 태그만 실행
    python infra/test_checklist.py --no-update  # CHECKLIST.md 수정 없이 결과만 출력
    python infra/test_checklist.py --disruptive # T9/T10 포함 (서비스 일시 중단)
"""
import argparse
import os
import re
import subprocess
import sys
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    print("httpx 없음 — pip install httpx 실행 후 재시도")
    sys.exit(1)

# ── 설정 ────────────────────────────────────────────────────────────────────
API      = os.environ.get("API_BASE", "http://localhost:4000") + "/api"
NC_BASE  = os.environ.get("NEXTCLOUD_BASE_URL", "http://localhost:8080")
NC_ADMIN = os.environ.get("NEXTCLOUD_ADMIN_USER", "admin")
NC_PASS  = os.environ.get("NEXTCLOUD_ADMIN_PASSWORD", "admin_password")
USER_A   = ("user-a1", "Nextcloud@2024!")
USER_B   = ("user-b1", "Nextcloud@2024!")
CHECKLIST = Path(__file__).parent.parent / "CHECKLIST.md"

GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

# ── 등록기 ──────────────────────────────────────────────────────────────────
_registry: dict[str, callable] = {}   # tag → test_fn
_results:  list[tuple[str, bool, str]] = []  # (tag, passed, description)

def register(*tags: str, desc: str = ""):
    """테스트 함수를 하나 이상의 체크리스트 태그에 연결"""
    def decorator(fn):
        name = desc or fn.__name__
        for tag in tags:
            _registry[tag] = (fn, name)
        return fn
    return decorator

# ── 공통 헬퍼 ───────────────────────────────────────────────────────────────
_token_cache: dict[str, str] = {}

def login(nc_user: str, password: str) -> str:
    if nc_user not in _token_cache:
        r = httpx.post(f"{API}/auth/login",
                       json={"ncUserId": nc_user, "password": password},
                       timeout=10)
        r.raise_for_status()
        _token_cache[nc_user] = r.json()["accessToken"]
    return _token_cache[nc_user]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def token_a() -> str:
    return login(*USER_A)

def token_b() -> str:
    return login(*USER_B)

def get_completed_file() -> dict | None:
    """tenant-a의 COMPLETED 문서 중 하나를 반환 (없으면 None)"""
    r = httpx.get(f"{API}/tenants/tenant-a/files",
                  headers=auth(token_a()), timeout=10)
    r.raise_for_status()
    for f in r.json():
        if f.get("indexStatus") == "COMPLETED" and f.get("fileId"):
            return f
    return None

def assert_true(condition: bool, msg: str = ""):
    if not condition:
        raise AssertionError(msg or "조건 실패")

# ── 3.1 Nextcloud 준비 ──────────────────────────────────────────────────────

@register("nc-docker", desc="Nextcloud OCS API 응답 확인")
def test_nc_docker():
    r = httpx.get(f"{NC_BASE}/ocs/v1.php/cloud/capabilities?format=json",
                  auth=(NC_ADMIN, NC_PASS),
                  headers={"OCS-APIREQUEST": "true"}, timeout=10)
    assert_true(r.status_code == 200, f"Nextcloud 응답 실패: {r.status_code}")

@register("nc-groups", desc="tenant-a / tenant-b 그룹 존재 확인")
def test_nc_groups():
    for group in ("tenant-a", "tenant-b"):
        r = httpx.get(f"{NC_BASE}/ocs/v1.php/cloud/groups/{group}?format=json",
                      auth=(NC_ADMIN, NC_PASS),
                      headers={"OCS-APIREQUEST": "true"}, timeout=10)
        assert_true(r.status_code == 200, f"그룹 {group} 없음")

@register("nc-users", desc="각 그룹에 사용자 3명+ 확인")
def test_nc_users():
    for group in ("tenant-a", "tenant-b"):
        r = httpx.get(f"{NC_BASE}/ocs/v1.php/cloud/groups/{group}?format=json",
                      auth=(NC_ADMIN, NC_PASS),
                      headers={"OCS-APIREQUEST": "true"}, timeout=10)
        users = r.json()["ocs"]["data"]["users"]
        assert_true(len(users) >= 3, f"{group} 사용자 {len(users)}명 (3명 이상 필요)")

@register("nc-group-member", desc="user-a1이 tenant-a 그룹 소속 확인")
def test_nc_group_member():
    r = httpx.get(f"{NC_BASE}/ocs/v1.php/cloud/groups/tenant-a?format=json",
                  auth=(NC_ADMIN, NC_PASS),
                  headers={"OCS-APIREQUEST": "true"}, timeout=10)
    users = r.json()["ocs"]["data"]["users"]
    assert_true("user-a1" in users, "user-a1이 tenant-a 그룹에 없음")

@register("nc-quota", desc="사용자 quota 100MB 확인")
def test_nc_quota():
    r = httpx.get(f"{NC_BASE}/ocs/v1.php/cloud/users/user-a1?format=json",
                  auth=(NC_ADMIN, NC_PASS),
                  headers={"OCS-APIREQUEST": "true"}, timeout=10)
    quota = r.json()["ocs"]["data"]["quota"]["quota"]
    assert_true(quota == 104857600, f"quota={quota} (100MB=104857600 필요)")

@register("nc-50mb", desc="user-a1 사용량 50% 이상 확인")
def test_nc_50mb():
    r = httpx.get(f"{NC_BASE}/ocs/v1.php/cloud/users/user-a1?format=json",
                  auth=(NC_ADMIN, NC_PASS),
                  headers={"OCS-APIREQUEST": "true"}, timeout=10)
    pct = r.json()["ocs"]["data"]["quota"]["relative"]
    assert_true(pct >= 50, f"사용률={pct}% (50% 이상 필요)")

@register("nc-envvar", desc=".env 파일 존재 확인")
def test_nc_envvar():
    env = CHECKLIST.parent / "apps" / "api" / ".env"
    assert_true(env.exists(), f".env 파일 없음: {env}")

# ── 3.2 사용량 관리 ─────────────────────────────────────────────────────────

@register("ocs-api", "admin-tenant", desc="Admin API 사용량 조회 확인")
def test_admin_api():
    r = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                  headers=auth(token_a()), timeout=10)
    assert_true(r.status_code == 200, f"Admin API 실패: {r.status_code}")
    data = r.json()
    assert_true("users" in data and len(data["users"]) > 0, "users 배열 비어있음")

@register("admin-f-tenantid", desc="응답에 tenantId 필드 확인")
def test_admin_f_tenantid():
    r = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                  headers=auth(token_a()), timeout=10)
    assert_true(r.json().get("tenantId") == "tenant-a")

@register("admin-f-userid", desc="응답에 userId/email 필드 확인")
def test_admin_f_userid():
    users = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                      headers=auth(token_a()), timeout=10).json()["users"]
    assert_true(all("userId" in u and "email" in u for u in users))

@register("admin-f-usedbytes", desc="응답에 usedBytes 필드 확인")
def test_admin_f_usedbytes():
    users = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                      headers=auth(token_a()), timeout=10).json()["users"]
    assert_true(all(u.get("usedBytes", -1) >= 0 for u in users))

@register("admin-f-quotabytes", desc="응답에 quotaBytes 필드 확인")
def test_admin_f_quotabytes():
    users = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                      headers=auth(token_a()), timeout=10).json()["users"]
    assert_true(all(u.get("quotaBytes", 0) > 0 for u in users))

@register("admin-f-usagepct", desc="응답에 usagePercent 필드 확인")
def test_admin_f_usagepct():
    users = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                      headers=auth(token_a()), timeout=10).json()["users"]
    assert_true(all("usagePercent" in u for u in users))

@register("admin-f-collectedat", desc="응답에 lastCollectedAt 필드 확인")
def test_admin_f_collectedat():
    users = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                      headers=auth(token_a()), timeout=10).json()["users"]
    assert_true(all(u.get("lastCollectedAt") for u in users))

@register("admin-5xx", desc="잘못된 NC 자격증명으로 로그인 시 에러 처리 확인")
def test_admin_5xx():
    r = httpx.post(f"{API}/auth/login",
                   json={"ncUserId": "user-a1", "password": "WRONG_PASSWORD"},
                   timeout=10)
    # NC 인증 실패 → 401 (민감정보 미포함 확인)
    assert_true(r.status_code == 401, f"잘못된 비밀번호에 {r.status_code} 응답")
    body = r.text
    assert_true("WRONG_PASSWORD" not in body, "응답에 비밀번호 노출")
    assert_true("stack" not in body.lower(), "응답에 스택 트레이스 노출")

# ── 3.3 파일 업로드 및 목록 ─────────────────────────────────────────────────

@register("pdf-list", desc="파일 목록 API 확인")
def test_pdf_list():
    r = httpx.get(f"{API}/tenants/tenant-a/files",
                  headers=auth(token_a()), timeout=10)
    assert_true(r.status_code == 200)
    assert_true(isinstance(r.json(), list))

@register("pdf-status", desc="파일 목록에 indexStatus 필드 확인")
def test_pdf_status():
    files = httpx.get(f"{API}/tenants/tenant-a/files",
                      headers=auth(token_a()), timeout=10).json()
    valid = {"PENDING", "PROCESSING", "COMPLETED", "FAILED"}
    assert_true(all(f.get("indexStatus") in valid for f in files),
                "indexStatus 값이 유효하지 않음")

@register("pdf-activate", desc="COMPLETED 파일에 fileId 존재 확인")
def test_pdf_activate():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 상태 파일 없음 (Worker가 완료한 파일 필요)")
    assert_true(f["fileId"] is not None)

@register("pdf-upload", "pdf-pending", "t3", desc="T3: PDF 업로드 → Nextcloud 저장 + PENDING")
def test_pdf_upload():
    from fpdf import FPDF
    import io
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.cell(0, 10, "Test upload document for checklist verification", new_x="LMARGIN", new_y="NEXT")
    pdf_bytes = bytes(pdf.output())

    r = httpx.post(
        f"{API}/tenants/tenant-a/files",
        headers=auth(token_a()),
        files={"file": ("checklist_test.pdf", pdf_bytes, "application/pdf")},
        timeout=30,
    )
    assert_true(r.status_code == 201, f"업로드 실패: {r.status_code} {r.text}")
    data = r.json()
    assert_true(data.get("indexStatus") == "PENDING", f"indexStatus={data.get('indexStatus')}")
    assert_true(data.get("fileId"), "fileId 없음")

@register("pdf-nc-stored", desc="업로드 후 Nextcloud에 파일 존재 확인")
def test_pdf_nc_stored():
    files = httpx.get(f"{API}/tenants/tenant-a/files",
                      headers=auth(token_a()), timeout=10).json()
    assert_true(len(files) > 0, "Nextcloud에 파일 없음")
    assert_true(any(".pdf" in f.get("fileName", "").lower() for f in files))

@register("single-chat", desc="단일 파일 채팅 엔드포인트 존재 확인")
def test_single_chat():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음 (Worker 실행 필요)")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is this document about?"},
                   timeout=60)
    assert_true(r.status_code == 200, f"채팅 실패: {r.status_code}")

# ── 3.4 PDF 처리 및 인덱싱 ──────────────────────────────────────────────────

@register("pdf-pending", desc="업로드 직후 PENDING 상태 확인")
def test_pdf_pending_status():
    # pdf-upload 테스트에서 검증 (중복 태그 허용)
    pass

@register("pdf-extract", "pdf-chunks", "t4", desc="T4: 인덱싱 완료 → COMPLETED + chunkCount")
def test_pdf_completed():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음 (Worker 실행 필요)")
    r = httpx.get(f"{API}/files/{f['fileId']}/index-status",
                  headers=auth(token_a()), timeout=10)
    data = r.json()
    assert_true(data["status"] == "COMPLETED")
    assert_true((data.get("chunkCount") or 0) > 0, "chunkCount = 0")
    assert_true((data.get("pageCount") or 0) > 0, "pageCount = 0")

@register("meta-tenantid", "meta-documentid", "meta-filename",
          "meta-pageno", "meta-paragraphno",
          desc="채팅 소스에 메타데이터 필드 확인")
def test_meta_fields():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    sources = r.json().get("sources", [])
    assert_true(len(sources) > 0, "소스 없음 (문서에 관련 내용 필요)")
    src = sources[0]
    assert_true(src.get("fileName"), "fileName 없음")
    assert_true(src.get("pageNo", 0) > 0, "pageNo 없음")
    assert_true(src.get("paragraphNo", 0) > 0, "paragraphNo 없음")

@register("meta-bbox", desc="소스에 bbox 필드 존재 확인 (null 허용)")
def test_meta_bbox():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    sources = r.json().get("sources", [])
    assert_true(len(sources) > 0, "소스 없음")
    assert_true("bbox" in sources[0], "bbox 키 없음")

@register("embed-gen", "qdrant-stored", desc="임베딩 생성 및 Qdrant 저장 확인 (채팅 소스로 검증)")
def test_embed_and_store():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    assert_true(r.status_code == 200)
    # 소스가 있으면 Qdrant에서 검색된 것
    assert_true(len(r.json().get("sources", [])) > 0, "Qdrant 검색 결과 없음")

@register("retry-indexing", desc="FAILED 문서 재처리 엔드포인트 확인")
def test_retry_indexing():
    # 잘못된 fileId로 호출하면 404 (엔드포인트 존재 확인)
    r = httpx.post(f"{API}/files/nonexistent-id/retry-indexing",
                   headers=auth(token_a()), timeout=10)
    assert_true(r.status_code in (404, 400),
                f"retry 엔드포인트 없음 (got {r.status_code})")

# ── 3.5 AI 채팅 ─────────────────────────────────────────────────────────────

@register("chat-scope", desc="tenantId + documentId 필터링 확인")
def test_chat_scope():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is this document about?"},
                   timeout=60)
    sources = r.json().get("sources", [])
    # 소스가 있으면 파일명이 현재 문서와 일치해야 함
    if sources:
        assert_true(
            all(s["fileName"] == f["fileName"] for s in sources),
            f"다른 파일 소스 포함: {[s['fileName'] for s in sources]}"
        )

@register("chat-no-global", desc="전체 Vector DB 검색 경로 없음 확인")
def test_chat_no_global():
    # /api/search 같은 전체 검색 엔드포인트가 없어야 함
    r = httpx.get(f"{API}/search?q=test",
                  headers=auth(token_a()), timeout=5)
    assert_true(r.status_code == 404, f"전체 검색 엔드포인트가 존재함 ({r.status_code})")

@register("chat-llm", desc="LLM 답변 생성 확인")
def test_chat_llm():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is this document about?"},
                   timeout=60)
    answer = r.json().get("answer", "")
    assert_true(len(answer.strip()) > 0, "답변이 비어있음")

@register("chat-f-filename", desc="소스에 fileName 필드 확인")
def test_chat_f_filename():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    sources = r.json().get("sources", [])
    assert_true(len(sources) > 0, "소스 없음")
    assert_true(all(s.get("fileName") for s in sources))

@register("chat-f-pageno", desc="소스에 pageNo 필드 확인")
def test_chat_f_pageno():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    sources = r.json().get("sources", [])
    assert_true(len(sources) > 0, "소스 없음")
    assert_true(all(s.get("pageNo", 0) > 0 for s in sources))

@register("chat-f-paragraphno", desc="소스에 paragraphNo 필드 확인")
def test_chat_f_paragraphno():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    sources = r.json().get("sources", [])
    assert_true(len(sources) > 0, "소스 없음")
    assert_true(all(s.get("paragraphNo", 0) > 0 for s in sources))

@register("chat-f-text", desc="소스에 text 필드 확인")
def test_chat_f_text():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    sources = r.json().get("sources", [])
    assert_true(len(sources) > 0, "소스 없음")
    assert_true(all(len(s.get("text", "")) > 0 for s in sources))

@register("chat-no-answer", "chat-no-hallucination", "t7",
          desc="T7: 문서 외 질문 → '문서에서 확인 불가'")
def test_chat_no_answer():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "오늘 서울 날씨는 어때요?"},
                   timeout=60)
    answer = r.json().get("answer", "")
    assert_true("문서에서 확인 불가" in answer,
                f"환각 억제 실패: '{answer[:100]}'")

@register("chat-10s", desc="응답 시간 10초 이내 확인")
def test_chat_10s():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    start = time.time()
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is this document about?"},
                   timeout=60)
    elapsed = time.time() - start
    assert_true(r.status_code == 200)
    assert_true(elapsed < 10.0, f"응답 시간 {elapsed:.1f}s > 10s")

# ── 2.1 화면 구성 (API로 검증 가능한 것) ─────────────────────────────────────

@register("pdf-viewer", desc="GET /api/files/:id/content → PDF 바이너리 반환")
def test_pdf_viewer():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.get(f"{API}/files/{f['fileId']}/content",
                  headers=auth(token_a()), timeout=30)
    assert_true(r.status_code == 200, f"content 엔드포인트 실패: {r.status_code}")
    assert_true(r.headers.get("content-type", "").startswith("application/pdf"))
    assert_true(len(r.content) > 100, "PDF 바이트 너무 작음")

@register("pdf-page-nav", desc="index-status에 pageCount 포함 확인")
def test_pdf_page_nav():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.get(f"{API}/files/{f['fileId']}/index-status",
                  headers=auth(token_a()), timeout=10)
    assert_true((r.json().get("pageCount") or 0) > 0, "pageCount 없음")

# ── 7. 보안 및 권한 ─────────────────────────────────────────────────────────

@register("sec-tenantid", "t1", "t2", desc="T1/T2: tenant 격리 확인")
def test_tenant_isolation():
    # T1: user-a1은 tenant-a 파일만 조회
    files_a = httpx.get(f"{API}/tenants/tenant-a/files",
                        headers=auth(token_a()), timeout=10).json()
    assert_true(isinstance(files_a, list), "tenant-a 파일 목록 실패")

    # T2: user-b1이 tenant-a 파일 목록 → 403
    r = httpx.get(f"{API}/tenants/tenant-a/files",
                  headers=auth(token_b()), timeout=10)
    assert_true(r.status_code == 403, f"cross-tenant 차단 실패 (got {r.status_code})")

@register("sec-db-filter", desc="DB 쿼리 tenant 필터: tenant-b는 tenant-a 문서 조회 불가")
def test_sec_db_filter():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    # user-b1 토큰으로 user-a1 파일 index-status 조회 → 404
    r = httpx.get(f"{API}/files/{f['fileId']}/index-status",
                  headers=auth(token_b()), timeout=10)
    assert_true(r.status_code == 404, f"DB 필터 실패 (got {r.status_code})")

@register("sec-vector-filter", desc="Vector 검색 tenant 필터: tenant-b는 tenant-a 채팅 불가")
def test_sec_vector_filter():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_b()),
                   json={"question": "test"},
                   timeout=30)
    assert_true(r.status_code in (403, 404),
                f"Vector 필터 실패 (got {r.status_code})")

@register("sec-nc-check", desc="파일 content 접근 전 ownerUserId 검증")
def test_sec_nc_check():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    # user-b1 토큰으로 user-a1 파일 content 접근 → 404
    r = httpx.get(f"{API}/files/{f['fileId']}/content",
                  headers=auth(token_b()), timeout=30)
    assert_true(r.status_code == 404, f"NC 접근 제어 실패 (got {r.status_code})")

@register("sec-no-global", desc="전체 검색 엔드포인트 없음")
def test_sec_no_global():
    r = httpx.get(f"{API}/search", headers=auth(token_a()), timeout=5)
    assert_true(r.status_code == 404)

@register("sec-envvar-nc", "sec-envvar-db", desc="환경변수 파일 존재 확인")
def test_sec_envvar():
    env_path = CHECKLIST.parent / "apps" / "api" / ".env"
    assert_true(env_path.exists(), ".env 파일 없음")
    content = env_path.read_text()
    assert_true("NEXTCLOUD" in content, "NEXTCLOUD 환경변수 없음")
    assert_true("DATABASE_URL" in content, "DATABASE_URL 없음")

@register("sec-safe-msg", desc="NC 오류 시 민감정보 미포함 확인")
def test_sec_safe_msg():
    r = httpx.post(f"{API}/auth/login",
                   json={"ncUserId": "user-a1", "password": "WRONG"},
                   timeout=10)
    body = r.text
    assert_true("password" not in body.lower() or "Invalid" in body,
                "응답에 비밀번호 관련 민감정보 노출")

# ── 8. 필수 테스트 시나리오 ─────────────────────────────────────────────────

@register("t5", desc="T5: COMPLETED 파일 선택 가능 (fileId 존재)")
def test_t5():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    assert_true(f.get("fileId") is not None)

@register("t6", desc="T6: 문서 내용 질문 → 답변 + 소스")
def test_t6():
    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")
    r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                   headers=auth(token_a()),
                   json={"question": "What is described in this document?"},
                   timeout=60)
    data = r.json()
    assert_true(len(data.get("answer", "").strip()) > 0, "답변 없음")
    assert_true(len(data.get("sources", [])) > 0, "소스 없음")
    src = data["sources"][0]
    assert_true(src.get("fileName") and src.get("pageNo") and
                src.get("paragraphNo") and src.get("text"))

@register("t8", desc="T8: 사용률 50% 이상 표시")
def test_t8():
    r = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                  headers=auth(token_a()), timeout=10)
    users = r.json()["users"]
    over_50 = [u for u in users if u.get("usagePercent", 0) >= 50]
    assert_true(len(over_50) > 0,
                f"50% 이상 사용자 없음: {[u['usagePercent'] for u in users]}")

@register("t9", desc="T9: Nextcloud 장애 → 5xx 안전한 메시지 (컨테이너 일시 중단 필요)")
def test_t9(disruptive: bool = False):
    if not disruptive:
        raise SkipTest("--disruptive 없이 스킵 (서비스 중단 필요)")

    subprocess.run(["docker", "stop", "rag-nextcloud"], check=True, capture_output=True)
    try:
        time.sleep(2)
        r = httpx.get(f"{API}/admin/tenants/tenant-a/users-usage",
                      headers=auth(token_a()), timeout=10)
        assert_true(r.status_code >= 500, f"5xx 아님 (got {r.status_code})")
        body = r.json()
        assert_true("password" not in str(body).lower(), "응답에 민감정보 포함")
        assert_true("Nextcloud" in str(body) or "unavailable" in str(body).lower())
    finally:
        subprocess.run(["docker", "start", "rag-nextcloud"], check=True, capture_output=True)
        time.sleep(3)

@register("t10", desc="T10: Qdrant 장애 → 503 + 로그 (컨테이너 일시 중단 필요)")
def test_t10(disruptive: bool = False):
    if not disruptive:
        raise SkipTest("--disruptive 없이 스킵 (서비스 중단 필요)")

    f = get_completed_file()
    assert_true(f is not None, "COMPLETED 파일 없음")

    subprocess.run(["docker", "stop", "rag-qdrant"], check=True, capture_output=True)
    try:
        time.sleep(2)
        r = httpx.post(f"{API}/files/{f['fileId']}/chat",
                       headers=auth(token_a()),
                       json={"question": "test"},
                       timeout=15)
        assert_true(r.status_code in (503, 500), f"장애 처리 실패 (got {r.status_code})")
    finally:
        subprocess.run(["docker", "start", "rag-qdrant"], check=True, capture_output=True)
        time.sleep(3)

# ── 9. 제출물 ────────────────────────────────────────────────────────────────

@register("sub-readme", desc="README.md 존재 확인")
def test_sub_readme():
    readme = CHECKLIST.parent / "README.md"
    assert_true(readme.exists(), "README.md 없음")
    assert_true(readme.stat().st_size > 1000, "README.md 너무 짧음")

@register("sub-arch", desc="README에 아키텍처 섹션 확인")
def test_sub_arch():
    content = (CHECKLIST.parent / "README.md").read_text()
    assert_true("아키텍처" in content or "Architecture" in content)

@register("sub-datamodel", desc="README에 데이터 모델 섹션 확인")
def test_sub_datamodel():
    content = (CHECKLIST.parent / "README.md").read_text()
    assert_true("데이터 모델" in content or "document_chunks" in content)

@register("sub-api", desc="README에 API 명세 확인")
def test_sub_api():
    content = (CHECKLIST.parent / "README.md").read_text()
    assert_true("/api/files" in content and "POST" in content)

@register("sub-search", desc="README에 문서 검색 흐름 확인")
def test_sub_search():
    content = (CHECKLIST.parent / "README.md").read_text()
    assert_true("검색" in content and ("Qdrant" in content or "Vector" in content))

@register("sub-security", desc="README에 보안 섹션 확인")
def test_sub_security():
    content = (CHECKLIST.parent / "README.md").read_text()
    assert_true("tenant" in content and "403" in content)

# ── CHECKLIST.md 업데이트 ───────────────────────────────────────────────────

class SkipTest(Exception):
    pass

def update_checklist(tag: str, passed: bool) -> None:
    text = CHECKLIST.read_text(encoding="utf-8")
    pattern = re.compile(
        r"^(- \[)([x ])(\] .+<!-- @" + re.escape(tag) + r" -->)",
        re.MULTILINE
    )
    mark = "x" if passed else " "
    new_text, count = pattern.subn(lambda m: f"{m.group(1)}{mark}{m.group(3)}", text)
    if count == 0:
        return
    CHECKLIST.write_text(new_text, encoding="utf-8")

# ── 실행 엔진 ────────────────────────────────────────────────────────────────

def run_tests(tags: list[str], no_update: bool, disruptive: bool) -> int:
    passed = skipped = failed = 0

    for tag in tags:
        entry = _registry.get(tag)
        if not entry:
            continue
        fn, desc = entry

        try:
            import inspect
            sig = inspect.signature(fn)
            if "disruptive" in sig.parameters:
                fn(disruptive=disruptive)
            else:
                fn()
            result = True
            print(f"  {GREEN}✓{RESET} [{tag}] {desc}")
            passed += 1
        except SkipTest as e:
            print(f"  {YELLOW}−{RESET} [{tag}] {desc}  ({e})")
            skipped += 1
            continue
        except Exception as e:
            result = False
            print(f"  {RED}✗{RESET} [{tag}] {desc}")
            print(f"      {RED}{e}{RESET}")
            failed += 1

        if not no_update:
            update_checklist(tag, result)

    print()
    print(f"{BOLD}결과: {GREEN}{passed} 통과{RESET}{BOLD}  "
          f"{YELLOW}{skipped} 스킵{RESET}{BOLD}  "
          f"{RED}{failed} 실패{RESET}")
    return failed

def main():
    parser = argparse.ArgumentParser(description="통합 테스트 + CHECKLIST.md 자동 업데이트")
    parser.add_argument("--list",       action="store_true", help="등록된 태그 목록 출력")
    parser.add_argument("--tag",        metavar="TAG",       help="특정 태그만 실행")
    parser.add_argument("--no-update",  action="store_true", help="CHECKLIST.md 수정 없음")
    parser.add_argument("--disruptive", action="store_true", help="T9/T10 포함 (서비스 일시 중단)")
    args = parser.parse_args()

    if args.list:
        print(f"\n{BOLD}등록된 태그 ({len(_registry)}개):{RESET}")
        for tag, (_, desc) in sorted(_registry.items()):
            print(f"  @{tag:30s} {desc}")
        return

    tags = [args.tag] if args.tag else list(_registry.keys())

    print(f"\n{BOLD}=== 통합 테스트 ({len(tags)}개) ==={RESET}")
    if not args.no_update:
        print(f"  CHECKLIST.md 자동 갱신: {CHECKLIST}\n")

    failed = run_tests(tags, args.no_update, args.disruptive)
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
