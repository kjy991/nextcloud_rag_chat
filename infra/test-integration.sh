#!/usr/bin/env bash
# 통합 테스트 스크립트 — Docker + API 실행 상태에서 실행
# Usage: API_BASE=http://localhost:4000 bash infra/test-integration.sh [비밀번호]
set -euo pipefail

API="${API_BASE:-http://localhost:4000}/api"
PASS="${1:-Nextcloud@2024!}"

ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
skip() { echo "  - $1 (스킵)"; }

echo "=== 통합 테스트 ==="
echo "API: $API"
echo ""

# ─── 1. Health ───────────────────────────────────────────────────────────────
echo "[1] Health check"
HEALTH=$(curl -sf "$API/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])")
[ "$HEALTH" = "ok" ] && ok "Health OK" || fail "Health failed"

# ─── 2. ADMIN 로그인 (user-a1) ───────────────────────────────────────────────
echo ""
echo "[2] ADMIN 로그인 (user-a1 / tenant-a)"
ADMIN_TOKEN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"ncUserId\":\"user-a1\",\"password\":\"$PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
[ -n "$ADMIN_TOKEN" ] && ok "ADMIN JWT 발급 완료" || fail "ADMIN 로그인 실패"

ADMIN_AUTH="Authorization: Bearer $ADMIN_TOKEN"

# JWT payload에서 role 확인
ROLE=$(echo "$ADMIN_TOKEN" | python3 -c "
import sys, base64, json
token = sys.stdin.read().strip()
payload = token.split('.')[1]
payload += '=' * (-len(payload) % 4)
data = json.loads(base64.b64decode(payload))
print(data.get('role', 'MISSING'))
")
[ "$ROLE" = "ADMIN" ] && ok "JWT role=ADMIN 확인" || fail "JWT role이 ADMIN이 아님 (got: $ROLE) — db:seed 실행 여부 확인"

# ─── 3. 일반 사용자 로그인 (user-a2) ─────────────────────────────────────────
echo ""
echo "[3] USER 로그인 (user-a2 / tenant-a)"
USER_TOKEN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"ncUserId\":\"user-a2\",\"password\":\"$PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null || echo "")

if [ -n "$USER_TOKEN" ]; then
  USER_AUTH="Authorization: Bearer $USER_TOKEN"
  ok "USER JWT 발급 완료"
else
  skip "user-a2 미등록 — db:seed 실행 여부 확인"
  USER_AUTH=""
fi

# ─── 4. ADMIN — 사용량 조회 성공 ─────────────────────────────────────────────
echo ""
echo "[4] 사용량 조회 — ADMIN 권한 (tenant-a)"
USAGE=$(curl -sf "$API/admin/tenants/tenant-a/users-usage" -H "$ADMIN_AUTH")
COUNT=$(echo "$USAGE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['users']))")
[ "$COUNT" -ge 3 ] && ok "사용자 ${COUNT}명 조회" || fail "Usage 조회 실패 (count=$COUNT)"

# ─── 5. USER — 사용량 조회 거부 (403) ────────────────────────────────────────
echo ""
echo "[5] 사용량 조회 — USER 권한 거부 (403 필수)"
if [ -n "$USER_AUTH" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$API/admin/tenants/tenant-a/users-usage" -H "$USER_AUTH")
  [ "$STATUS" = "403" ] && ok "USER → 403 Admin access required" || fail "USER 역할 차단 실패 (got $STATUS)"
else
  skip "user-a2 토큰 없음"
fi

# ─── 6. ADMIN — Cross-tenant 사용량 조회 거부 (403) ──────────────────────────
echo ""
echo "[6] Cross-tenant 사용량 조회 — ADMIN도 타 tenant 접근 불가 (403)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API/admin/tenants/tenant-b/users-usage" -H "$ADMIN_AUTH")
[ "$STATUS" = "403" ] && ok "Cross-tenant 403 확인" || fail "Cross-tenant 차단 실패 (got $STATUS)"

# ─── 7. Cross-tenant 파일 접근 차단 ─────────────────────────────────────────
echo ""
echo "[7] Cross-tenant 파일 목록 접근 차단"
TOKEN_B=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"ncUserId\":\"user-b1\",\"password\":\"$PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null || echo "")

if [ -n "$TOKEN_B" ]; then
  STATUS_B=$(curl -s -o /dev/null -w "%{http_code}" \
    "$API/tenants/tenant-a/files" \
    -H "Authorization: Bearer $TOKEN_B")
  [ "$STATUS_B" = "403" ] && ok "tenant-b → tenant-a 파일 접근 403" || fail "Cross-tenant 차단 실패 (got $STATUS_B)"
else
  skip "tenant-b user-b1 미등록 — db:seed 실행 여부 확인"
fi

# ─── 8. 잘못된 자격증명 ──────────────────────────────────────────────────────
echo ""
echo "[8] 잘못된 자격증명 → 401"
BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"ncUserId":"user-a1","password":"wrongpassword"}')
[ "$BAD" = "401" ] && ok "401 응답 확인" || fail "Expected 401, got $BAD"

echo ""
echo "=== 기본 통합 테스트 완료 ==="
echo ""
echo "다음 테스트는 PDF 업로드 후 수동으로 확인하세요:"
echo "  - POST $API/tenants/tenant-a/files (multipart PDF)"
echo "  - GET  $API/files/{fileId}/index-status (COMPLETED 대기)"
echo "  - POST $API/files/{fileId}/chat (질문/답변)"
