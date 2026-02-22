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

  await page.goto("/feed");
  await expect(page.getByRole("link", { name: "Feed" })).toBeVisible();

  await page.getByRole("link", { name: "Streams" }).click();
  const streamsView = page.locator(".data-card, .x-empty-state");
  await expect(streamsView.first()).toBeVisible();

  await page.getByRole("link", { name: "Intents" }).click();
  await expect(page.locator(".x-composer")).toBeVisible();

  await page.getByRole("link", { name: "Slashings" }).click();
  await expect(page.locator(".x-composer")).toBeVisible();

  if (errors.length) {
    throw new Error(`UI errors detected:\n${errors.join("\n")}`);
  }
});
