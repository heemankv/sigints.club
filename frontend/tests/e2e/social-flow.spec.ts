import { test, expect, Page, type APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";

async function ensureConnected(page: Page) {
  const addressBtn = page.locator(".wallet-address-btn");
  if (await addressBtn.isVisible()) return;
  const connectBtn = page.getByRole("button", { name: /connect wallet/i });
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    const testWalletOption = page.getByRole("button", { name: /TestWallet/i });
    if (await testWalletOption.isVisible()) {
      await testWalletOption.click();
    }
  }
  await expect(addressBtn).toBeVisible({ timeout: 10_000 });
}

async function waitForBackend(request: APIRequestContext, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request.get(`${BACKEND_URL}/health`);
      if (res.ok()) return;
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Backend not ready after ${timeoutMs}ms`);
}

async function waitForPost(page: Page, text: string, tabName: "Intents" | "Slashings") {
  const start = Date.now();
  const timeoutMs = 120_000;
  let attempts = 0;
  while (Date.now() - start < timeoutMs) {
    const status = page.locator(".x-status-msg");
    if (await status.isVisible().catch(() => false)) {
      const msg = (await status.textContent()) ?? "";
      if (/503|tapestry|failed to fetch/i.test(msg)) {
        // transient Tapestry outage, retry by waiting
      } else if (/failed|error/i.test(msg)) {
        throw new Error(`Post failed: ${msg}`);
      }
    }
    const post = page.locator(".xpost", { hasText: text });
    if (await post.first().isVisible().catch(() => false)) {
      return;
    }
    attempts += 1;
    if (attempts % 3 === 0) {
      await page.reload();
      await ensureConnected(page);
    }
    await page.getByRole("link", { name: tabName }).click();
    await page.waitForTimeout(2000);
  }
  throw new Error(`Post not visible after ${timeoutMs}ms: ${text}`);
}

async function retryIf503(page: Page, action: () => Promise<void>, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    await action();
    await page.waitForTimeout(1000);
    const status = page.locator(".x-status-msg");
    if (await status.isVisible().catch(() => false)) {
      const msg = (await status.textContent()) ?? "";
      if (/503|tapestry|failed to fetch/i.test(msg)) {
        if (i < attempts - 1) {
          await page.waitForTimeout(2000);
          continue;
        }
        throw new Error(`Post failed: ${msg}`);
      }
    }
    return;
  }
}

test("social discovery flow (intent + slash post)", async ({ page }) => {
  test.setTimeout(180_000);
  await waitForBackend(page.request);
  const intentText = `Need alert when Amazon offers iPhone exchange ${Date.now()}`;
  const slashText = `Validator reports stale ETH price data ${Date.now()}`;

  await page.goto("/feed");
  await ensureConnected(page);

  await page.getByRole("link", { name: "Intents" }).click();
  await page.getByRole("button", { name: /^Intent$/i }).click();
  await page.getByPlaceholder("Share your market intelligence...").fill(intentText);
  await retryIf503(page, async () => {
    await page.getByRole("button", { name: /^Post$/i }).click();
  });
  await waitForPost(page, intentText, "Intents");

  await page.getByRole("link", { name: "Slashings" }).click();
  await page.getByRole("button", { name: /Slash report/i }).click();
  await page.getByPlaceholder("Report a false or misleading signal...").fill(slashText);
  await retryIf503(page, async () => {
    await page.getByRole("button", { name: /^Report$/i }).click();
  });
  await waitForPost(page, slashText, "Slashings");
});
