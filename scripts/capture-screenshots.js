/**
 * 실행 화면 자동 캡처 스크립트
 *
 * 사전 조건:
 *   npm run infra:up       (PostgreSQL, Qdrant, Nextcloud 실행)
 *   npm run db:migrate     (DB 마이그레이션)
 *   npm run nc:init        (Nextcloud 그룹/사용자/quota 설정)
 *   npm run dev            (API :4000, Web :5173 실행)
 *   apps/worker 실행 + 최소 1개 PDF 인덱싱 COMPLETED 상태
 *
 * 실행:
 *   npx playwright install chromium
 *   node scripts/capture-screenshots.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:4000';
const OUT_DIR = path.join(__dirname, '../docs/screenshots');

const ADMIN_USER = { ncUserId: 'user-a1', password: 'Nextcloud@2024!' };
const REGULAR_USER = { ncUserId: 'user-a2', password: 'Nextcloud@2024!' };

async function login(page, user) {
  await page.goto(`${WEB_URL}/login`);
  await page.waitForSelector('input[placeholder="user-a1"]');
  await page.fill('input[placeholder="user-a1"]', user.ncUserId);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${WEB_URL}/`);
}

async function waitForCompletedFile(page) {
  // COMPLETED 파일이 나타날 때까지 최대 60초 대기
  await page.waitForSelector('.status--completed', { timeout: 60_000 }).catch(() => {
    console.warn('⚠️  COMPLETED 상태 파일을 찾지 못했습니다. PDF를 먼저 업로드·인덱싱하세요.');
  });
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    // ── 1. 로그인 화면 ──────────────────────────────────────────────────────
    {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${WEB_URL}/login`);
      await page.waitForSelector('input[placeholder="user-a1"]');
      await page.screenshot({ path: path.join(OUT_DIR, '01-login.png') });
      console.log('✅ 01-login.png');
      await page.close();
    }

    // ── 2. ADMIN — 메인 화면 (파일 목록 + 관리자 사용량 패널) ──────────────
    {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await login(page, ADMIN_USER);
      await page.waitForSelector('.file-panel');
      await page.screenshot({ path: path.join(OUT_DIR, '02-main-admin.png'), fullPage: true });
      console.log('✅ 02-main-admin.png');

      // ── 3. 관리자 사용량 화면 클로즈업 ──────────────────────────────────
      const adminPanel = page.locator('.admin-panel');
      if (await adminPanel.isVisible()) {
        await adminPanel.screenshot({ path: path.join(OUT_DIR, '03-admin-usage.png') });
        console.log('✅ 03-admin-usage.png');
      } else {
        console.warn('⚠️  .admin-panel 미표시 — ADMIN 계정으로 로그인했는지 확인하세요.');
      }

      // ── 4. 파일 선택 → AI 채팅창 활성화 ─────────────────────────────────
      await waitForCompletedFile(page);
      const firstFile = page.locator('.file-row-main').first();
      if (await firstFile.isVisible()) {
        await firstFile.click();
        await page.waitForSelector('.chat-panel:not(.chat-panel--empty)', { timeout: 5_000 }).catch(() => {});
        await page.screenshot({ path: path.join(OUT_DIR, '04-file-selected-chat.png') });
        console.log('✅ 04-file-selected-chat.png');

        // ── 5. 질문 입력 후 근거 카드 표시 ──────────────────────────────
        const input = page.locator('.chat-form input');
        if (await input.isVisible()) {
          await input.fill('이 문서의 주요 내용은 무엇인가요?');
          await page.locator('.chat-form button[type="submit"]').click();
          // 답변 생성 대기 (최대 30초)
          await page.waitForSelector('.source-card', { timeout: 30_000 }).catch(() => {
            console.warn('⚠️  근거 카드 미표시 — 인덱싱 완료 후 다시 시도하세요.');
          });
          await page.screenshot({ path: path.join(OUT_DIR, '05-chat-with-sources.png') });
          console.log('✅ 05-chat-with-sources.png');
        }
      }

      await page.close();
    }

    // ── 6. 일반 사용자 — 관리자 패널 비표시 확인 ────────────────────────
    {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await login(page, REGULAR_USER);
      await page.waitForSelector('.file-panel');
      await page.screenshot({ path: path.join(OUT_DIR, '06-main-regular-user.png'), fullPage: true });
      console.log('✅ 06-main-regular-user.png');
      await page.close();
    }

    console.log(`\n스크린샷 저장 위치: ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('캡처 실패:', err.message);
  process.exit(1);
});
