import { test, expect, Page } from "@playwright/test";

async function collectErrors(page: Page) {
  const errors: string[] = [];
  const ignoredPatterns = [
    /Text content did not match/i,
    /hydration/i,
    /There was an error while hydrating/i,
  ];
  page.on("pageerror", (err) => {
    const message = err.message ?? String(err);
    if (ignoredPatterns.some((pattern) => pattern.test(message))) {
      return;
    }
    errors.push(`pageerror: ${message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (ignoredPatterns.some((pattern) => pattern.test(text))) {
        return;
      }
      errors.push(`console:${text}`);
    }
  });
  return errors;
}

test("full UI click-through with error reporting", async ({ page }) => {
  const errors = await collectErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Find the strongest signal makers/i })).toBeVisible();

  await page.locator("header").getByRole("link", { name: "Feed", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Network Feed/i })).toBeVisible();

  await page.locator("header").getByRole("link", { name: "Social", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Intents and Slashing Feed/i })).toBeVisible();
  const offerButtons = page.getByRole("button", { name: /Offer Stream/i });
  if (await offerButtons.count()) {
    await offerButtons.first().click();
  }

  await page.locator("header").getByRole("link", { name: "Signals", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Signals Feed/i })).toBeVisible();
  const actionButtons = page.getByRole("button", { name: /Open Action/i });
  if (await actionButtons.count()) {
    await actionButtons.first().click();
  }

  await page.locator("header").getByRole("link", { name: "Discovery", exact: true }).click();
  await expect(page.getByRole("heading", { name: /All Streams/i })).toBeVisible();
  const viewButtons = page.getByRole("link", { name: /View Stream/i });
  await viewButtons.first().click();
  await expect(page).toHaveURL(/stream/);
  await expect(page.getByRole("heading", { name: /Maker Tiers/i })).toBeVisible();

  // Maker operations
  const publishButton = page.getByRole("button", { name: /Publish/i }).first();
  if (await publishButton.isVisible()) {
    await publishButton.click();
  }

  // Listener tools
  const generateButton = page.getByRole("button", { name: /Generate Keypair/i }).first();
  if (await generateButton.isVisible()) {
    await generateButton.click();
  }

  // Subscribe form
  const pubKeyInput = page.getByPlaceholder("Base64 X25519 public key").first();
  await pubKeyInput.fill("AA==");
  const subscribeButton = page.getByRole("button", { name: /^Subscribe$/i }).first();
  if (await subscribeButton.isVisible() && !(await subscribeButton.isDisabled())) {
    await subscribeButton.click();
  }

  const onchainButton = page.getByRole("button", { name: /Subscribe on-chain/i }).first();
  if (await onchainButton.isVisible() && !(await onchainButton.isDisabled())) {
    await onchainButton.click();
  }

  await page.locator("header").getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Your Profile/i })).toBeVisible();

  await page.waitForTimeout(500);

  if (errors.length) {
    throw new Error(`UI errors detected:\n${errors.join("\n")}`);
  }
});
