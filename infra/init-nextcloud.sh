#!/usr/bin/env bash
# Nextcloud 초기 설정: tenant 그룹, 사용자, quota 생성
# Usage: ./infra/init-nextcloud.sh
set -euo pipefail

NC_URL="${NEXTCLOUD_BASE_URL:-http://localhost:8080}"
ADMIN="${NEXTCLOUD_ADMIN_USER:-admin}"
PASS="${NEXTCLOUD_ADMIN_PASSWORD:-admin_password}"
QUOTA="107374182"  # 100 MB in bytes (Nextcloud expects bytes as string)
NC_USER_PASSWORD="${NC_USER_PASSWORD:-Nextcloud@2024!}"  # min 10 chars, complex

OCS="${NC_URL}/ocs/v1.php/cloud"
CURL="curl -sf -u ${ADMIN}:${PASS} -H 'OCS-APIREQUEST: true'"

ocs() {
  curl -sf \
    -u "${ADMIN}:${PASS}" \
    -H "OCS-APIREQUEST: true" \
    "$@"
}

echo "=== Nextcloud 초기화 ==="
echo "URL: ${NC_URL}"
echo ""

# ── 그룹 생성 ─────────────────────────────────────────
echo "[1/3] 그룹 생성 (tenant-a, tenant-b)..."
for GROUP in tenant-a tenant-b; do
  STATUS=$(ocs -X POST \
    -d "groupid=${GROUP}" \
    "${OCS}/groups" \
    -w "%{http_code}" -o /dev/null || true)
  if [[ "$STATUS" == "200" || "$STATUS" == "100" ]]; then
    echo "  ✓ 그룹 ${GROUP} 생성 완료"
  else
    echo "  - 그룹 ${GROUP} 이미 존재하거나 생성됨 (status: ${STATUS})"
  fi
done

# ── 사용자 생성 함수 ──────────────────────────────────
create_user() {
  local USER="$1"
  local GROUP="$2"
  local EMAIL="$3"
  local DISPLAY="$4"

  # 사용자 생성
  STATUS=$(ocs -X POST \
    -d "userid=${USER}" \
    -d "password=${NC_USER_PASSWORD}" \
    -d "email=${EMAIL}" \
    -d "displayName=${DISPLAY}" \
    "${OCS}/users" \
    -w "%{http_code}" -o /dev/null || true)

  if [[ "$STATUS" == "200" || "$STATUS" == "100" ]]; then
    echo "  ✓ 사용자 ${USER} 생성"
  else
    echo "  - 사용자 ${USER} 이미 존재 (status: ${STATUS})"
  fi

  # 그룹 추가
  ocs -X POST \
    -d "groupid=${GROUP}" \
    "${OCS}/users/${USER}/groups" \
    -o /dev/null || true
  echo "    → 그룹 ${GROUP} 추가"

  # Quota 설정 (100MB)
  ocs -X PUT \
    -d "key=quota" \
    -d "value=${QUOTA}" \
    "${OCS}/users/${USER}" \
    -o /dev/null || true
  echo "    → quota 100MB 설정"
}

# ── tenant-a 사용자 생성 ──────────────────────────────
echo ""
echo "[2/3] tenant-a 사용자 생성..."
create_user "user-a1" "tenant-a" "user-a1@datco.kr" "User A1"
create_user "user-a2" "tenant-a" "user-a2@datco.kr" "User A2"
create_user "user-a3" "tenant-a" "user-a3@datco.kr" "User A3"

# ── tenant-b 사용자 생성 ──────────────────────────────
echo ""
echo "[3/3] tenant-b 사용자 생성..."
create_user "user-b1" "tenant-b" "user-b1@datco.kr" "User B1"
create_user "user-b2" "tenant-b" "user-b2@datco.kr" "User B2"
create_user "user-b3" "tenant-b" "user-b3@datco.kr" "User B3"

# ── 사용자 폴더 생성 (WebDAV) ─────────────────────────
echo ""
echo "[+] tenant 문서 폴더 생성..."
for USER in user-a1 user-a2 user-a3 user-b1 user-b2 user-b3; do
  curl -sf \
    -u "${ADMIN}:${PASS}" \
    -X MKCOL \
    "${NC_URL}/remote.php/dav/files/${USER}/documents" \
    -o /dev/null || true
  echo "  ✓ ${USER}/documents 폴더"
done

echo ""
echo "=== 초기화 완료 ==="
echo ""
echo "사용자 목록:"
echo "  tenant-a: user-a1, user-a2, user-a3  (비밀번호: Nextcloud@2024!)"
echo "  tenant-b: user-b1, user-b2, user-b3  (비밀번호: Nextcloud@2024!)"
echo "  quota: 100MB per user"
