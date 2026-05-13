#!/usr/bin/env bash
# 통합 테스트 스크립트 — Docker + API 실행 상태에서 실행
# Usage: API_BASE=http://localhost:4000 bash infra/test-integration.sh
set -euo pipefail

API="${API_BASE:-http://localhost:4000}/api"
PASS="${1:-User1234!}"

ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

echo "=== 통합 테스트 ==="
echo "API: $API"
echo ""

# ─── 1. Health ───────────────────────────────────────────────────────────────
echo "[1] Health check"
HEALTH=$(curl -sf "$API/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])")
[ "$HEALTH" = "ok" ] && ok "Health OK" || fail "Health failed"

# ─── 2. Login tenant-a ───────────────────────────────────────────────────────
echo ""
echo "[2] 로그인 (user-a1 / tenant-a)"
TOKEN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"ncUserId":"user-a1","password":"'"$PASS"'"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
[ -n "$TOKEN" ] && ok "JWT 발급 완료" || fail "Login failed"

AUTH="Authorization: Bearer $TOKEN"

# ─── 3. Admin usage API ──────────────────────────────────────────────────────
echo ""
echo "[3] 사용량 조회 (tenant-a)"
USAGE=$(curl -sf "$API/admin/tenants/tenant-a/users-usage" -H "$AUTH")
COUNT=$(echo "$USAGE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['users']))")
[ "$COUNT" -ge 3 ] && ok "사용자 ${COUNT}명 조회" || fail "Usage 조회 실패 (count=$COUNT)"

# ─── 4. Cross-tenant 접근 차단 ───────────────────────────────────────────────
echo ""
echo "[4] tenant 격리 (tenant-a 사용자가 tenant-b 접근)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/admin/tenants/tenant-b/users-usage" -H "$AUTH")
# Admin API는 tenant 필터 없음 — documents/files API로 확인
TOKEN_B=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"ncUserId":"user-b1","password":"'"$PASS"'"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null || echo "")

if [ -n "$TOKEN_B" ]; then
  STATUS2=$(curl -s -o /dev/null -w "%{http_code}" \
    "$API/tenants/tenant-a/files" \
    -H "Authorization: Bearer $TOKEN_B")
  [ "$STATUS2" = "403" ] && ok "Cross-tenant 403 확인" || fail "Cross-tenant 차단 실패 (got $STATUS2)"
else
  echo "  - tenant-b 사용자 미등록, 격리 테스트 스킵"
fi

# ─── 5. 잘못된 자격증명 ─────────────────────────────────────────────────────
echo ""
echo "[5] 잘못된 자격증명 → 401"
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
