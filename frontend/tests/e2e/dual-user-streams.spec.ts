import { test, expect, type Browser, type Page } from "@playwright/test";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";

async function createUser(browser: Browser, account: "maker" | "taker") {
  const context = await browser.newContext();
  await context.addInitScript((acct) => {
    localStorage.setItem("testWalletAccount", acct);
    localStorage.setItem("walletName", JSON.stringify("TestWallet"));
  }, account);
  const page = await context.newPage();
  return { context, page };
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
    }
  }
  await expect(addressBtn).toBeVisible({ timeout: 15_000 });
}

async function registerStream(
  page: Page,
  streamId: string,
  name: string,
  visibility: "public" | "private"
) {
  await page.goto("/register-stream");
  await ensureConnected(page);
  await expect(page.getByRole("heading", { name: /Streams & Signals/i })).toBeVisible();

  await page.getByPlaceholder("stream-id (e.g. stream-eth-price)").fill(streamId);
  await page.getByPlaceholder("Stream name").fill(name);
  await page.getByPlaceholder("Domain (e.g. pricing, crypto)").fill("e2e");
  await page.getByPlaceholder("Short description of your stream").fill("E2E stream registration test.");
  await page.getByRole("combobox", { name: /Visibility/i }).selectOption(visibility);

  await page.getByRole("button", { name: /Next/i }).click();
  await expect(page.getByRole("heading", { name: /Subscription Tiers/i })).toBeVisible();
  await page.getByRole("button", { name: /Next/i }).click();
  await expect(page.getByRole("heading", { name: /Deploy Stream/i })).toBeVisible();

  await page.getByRole("button", { name: /Deploy Stream/i }).click();

  const status = page.locator(".step-content .subtext", {
    hasText: /Stream registered|Stream already on-chain|Listing published/i,
  });
  await expect(status).toBeVisible({ timeout: 90_000 });
}

async function waitForStreamAvailable(streamId: string, request: Page["request"], timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`${BACKEND_URL}/streams/${streamId}`);
    if (res.ok()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Stream ${streamId} not available via backend within ${timeoutMs}ms`);
}

test.describe.serial("dual-user stream flows", () => {
  test.setTimeout(180_000);

  test("private stream: key registration, subscription, private signal", async ({ browser, request }) => {
    const makerUser = await createUser(browser, "maker");
    const takerUser = await createUser(browser, "taker");

    const streamId = `stream-private-${Date.now()}`;
    const streamName = `Private Stream ${Date.now()}`;

    await registerStream(makerUser.page, streamId, streamName, "private");
    await waitForStreamAvailable(streamId, request, 90_000);

    await takerUser.page.goto(`/profile?tab=actions`);
    await ensureConnected(takerUser.page);

    const keyCard = takerUser.page.locator(".card", { hasText: "Wallet Key Manager" });
    await expect(keyCard).toBeVisible({ timeout: 30_000 });
    const { publicKey } = await (await import("node:crypto")).generateKeyPairSync("x25519");
    const pubKeyValue = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    await keyCard.locator("textarea").first().fill(pubKeyValue);
    await keyCard.getByRole("button", { name: /Register Key On-chain/i }).click();
    await expect(keyCard.getByText(/Registered on-chain key/i)).toBeVisible({ timeout: 30_000 });
    await expect(keyCard.getByText(/Backend sync complete/i)).toBeVisible({ timeout: 30_000 });

    await takerUser.page.goto(`/stream/${streamId}`);
    await ensureConnected(takerUser.page);
    const subscribeOnchainBtn = takerUser.page.getByRole("button", { name: /Subscribe on-chain/i });
    await expect(subscribeOnchainBtn).toBeEnabled();
    await subscribeOnchainBtn.click();
    await expect(takerUser.page.getByText(/Subscribed and registered/i)).toBeVisible({ timeout: 60_000 });

    await makerUser.page.goto("/profile?tab=streams");
    await ensureConnected(makerUser.page);
    const streamCard = makerUser.page.locator(".stream-card", { hasText: streamName });
    await expect(streamCard.getByText(/subs/i)).toContainText("1", { timeout: 60_000 });

    await makerUser.page.goto(`/stream/${streamId}`);
    const makerOps = makerUser.page.locator(".stream-detail-section", { hasText: "Publish Signal" });
    const message = `private-signal-${Date.now()}`;
    await makerOps.locator("textarea").fill(message);
    await makerOps.getByRole("button", { name: /Prepare Signal/i }).click();
    await expect(makerOps.getByText(/Prepared signal/i)).toBeVisible({ timeout: 30_000 });
    await makerOps.getByRole("button", { name: /Publish On-chain/i }).click();
    await expect(makerOps.getByText(/On-chain publish/i)).toBeVisible({ timeout: 60_000 });

    const latestRes = await request.get(`${BACKEND_URL}/signals/latest?streamId=${streamId}`);
    expect(latestRes.ok()).toBeTruthy();
    const latest = await latestRes.json();
    expect(latest.signal?.visibility).toBe("private");
    expect(latest.signal?.keyboxPointer).toBeTruthy();
    expect(latest.signal?.signalPointer).toBeTruthy();

    await makerUser.context.close();
    await takerUser.context.close();
  });

  test("public stream: subscription + public signal", async ({ browser, request }) => {
    const makerUser = await createUser(browser, "maker");
    const takerUser = await createUser(browser, "taker");

    const streamId = `stream-public-${Date.now()}`;
    const streamName = `Public Stream ${Date.now()}`;

    await registerStream(makerUser.page, streamId, streamName, "public");
    await waitForStreamAvailable(streamId, request, 90_000);

    await takerUser.page.goto(`/stream/${streamId}`);
    await ensureConnected(takerUser.page);

    const subscribeOnchainBtn = takerUser.page.getByRole("button", { name: /Subscribe on-chain/i });
    await expect(subscribeOnchainBtn).toBeEnabled();
    await subscribeOnchainBtn.click();
    await expect(takerUser.page.getByText(/Subscribed and registered/i)).toBeVisible({ timeout: 60_000 });

    await makerUser.page.goto(`/stream/${streamId}`);
    const makerOps = makerUser.page.locator(".stream-detail-section", { hasText: "Publish Signal" });
    const message = `public-signal-${Date.now()}`;
    await makerOps.locator("textarea").fill(message);
    await makerOps.getByRole("button", { name: /Prepare Signal/i }).click();
    await expect(makerOps.getByText(/Prepared signal/i)).toBeVisible({ timeout: 30_000 });
    await makerOps.getByRole("button", { name: /Publish On-chain/i }).click();
    await expect(makerOps.getByText(/On-chain publish/i)).toBeVisible({ timeout: 60_000 });

    const latestRes = await request.get(`${BACKEND_URL}/signals/latest?streamId=${streamId}`);
    expect(latestRes.ok()).toBeTruthy();
    const latest = await latestRes.json();
    expect(latest.signal?.visibility).toBe("public");
    expect(latest.signal?.keyboxPointer ?? null).toBeNull();
    expect(latest.signal?.signalPointer).toBeTruthy();

    await makerUser.context.close();
    await takerUser.context.close();
  });
});
