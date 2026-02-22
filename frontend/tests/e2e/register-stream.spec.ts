import { test, expect, Page } from "@playwright/test";

async function collectErrors(page: Page) {
  const errors: string[] = [];
  const ignoredPatterns = [/Text content did not match/i, /hydration/i, /There was an error while hydrating/i];
  page.on("pageerror", (err) => {
    const message = err.message ?? String(err);
    if (ignoredPatterns.some((pattern) => pattern.test(message))) return;
    errors.push(`pageerror: ${message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (ignoredPatterns.some((pattern) => pattern.test(text))) return;
    errors.push(`console:${text}`);
  });
  return errors;
}

async function ensureConnected(page: Page) {
  const addressBtn = page.locator(".wallet-address-btn");
  if (await addressBtn.isVisible()) return;

  const connectBtn = page.getByRole("button", { name: /connect wallet/i });
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    const testWalletOption = page.getByRole("button", { name: /TestWallet/i });
    if (await testWalletOption.isVisible()) {
      await testWalletOption.click();
    } else {
      const firstWallet = page.locator(".wallet-option").first();
      if (await firstWallet.isVisible()) {
        await firstWallet.click();
      }
    }
  }

  await expect(addressBtn).toBeVisible({ timeout: 15_000 });
}

test("register stream flow (wizard)", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await collectErrors(page);

  await page.goto("/register-stream");
  await expect(page.getByRole("heading", { name: /Streams & Signals/i })).toBeVisible();

  await ensureConnected(page);

  const streamId = `stream-e2e-${Date.now()}`;
  const name = `E2E Stream ${Date.now()}`;

  await page.getByPlaceholder("stream-id (e.g. stream-eth-price)").fill(streamId);
  await page.getByPlaceholder("Stream name").fill(name);
  await page.getByPlaceholder("Domain (e.g. pricing, crypto)").fill("e2e");
  await page.getByPlaceholder("Short description of your stream").fill("E2E stream registration test.");

  await page.getByRole("button", { name: /Next/i }).click();
  await expect(page.getByRole("heading", { name: /Subscription Tiers/i })).toBeVisible();

  await page.getByRole("button", { name: /Next/i }).click();
  await expect(page.getByRole("heading", { name: /Deploy Stream/i })).toBeVisible();

  await page.getByRole("button", { name: /Deploy Stream/i }).click();

  const status = page.locator(".step-content .subtext", {
    hasText: /Stream registered|Stream already on-chain|Listing published/i,
  });
  await expect(status).toBeVisible({ timeout: 60_000 });

  if (errors.length) {
    throw new Error(`UI errors detected:\n${errors.join("\n")}`);
  }
});
