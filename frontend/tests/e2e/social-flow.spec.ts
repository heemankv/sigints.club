import { test, expect } from "@playwright/test";

test("social discovery flow (intents, slash, likes, comments, follow)", async ({ page }) => {
  const intentText = `Need alert when Amazon offers iPhone exchange ${Date.now()}`;
  const slashText = `Validator reports stale ETH price data ${Date.now()}`;
  const commentText = `Comment test ${Date.now()}`;
  const otherWallet = "5iHXYtPj4WqRi7L1UbBYZ7u8AUQKjAjkHGAPkmMhAQBG";
  const otherIntentText = `Other wallet request ${Date.now()}`;

  await page.request.post("http://127.0.0.1:3001/social/intents", {
    data: {
      wallet: otherWallet,
      content: otherIntentText,
      topic: "e2e",
      tags: ["other"],
    },
  });

  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: /Intents and Slashing Feed/i })).toBeVisible();

  const connectButton = page.getByRole("button", { name: /connect/i });
  if (await connectButton.isVisible()) {
    await connectButton.click();
    await expect(page.getByText(/Connect your wallet to post/i)).toBeHidden({ timeout: 5000 });
  }

  // Post intent
  await page
    .getByPlaceholder("Looking for: ETH price alert / HDFC credit card open / anime drop...")
    .fill(intentText);
  await page.getByRole("button", { name: "Post Intent" }).click();

  const intentCard = page.locator(".stream-item", { hasText: intentText }).first();
  await expect(intentCard).toBeVisible();

  // Like + load votes
  await intentCard.getByRole("button", { name: /^Vote$/ }).click();
  await expect(intentCard.getByRole("button", { name: /^Votes:/ })).toBeVisible();

  // Comment
  await intentCard.getByPlaceholder("Add a comment").fill(commentText);
  await intentCard.getByRole("button", { name: "Post Comment" }).click();
  await expect(intentCard.getByText(commentText)).toBeVisible();

  // Follow author
  const otherCard = page.locator(".stream-item", { hasText: otherIntentText }).first();
  await expect(otherCard).toBeVisible();
  await otherCard.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByText("Followed profile.")).toBeVisible();

  // Post slash report
  await page.getByPlaceholder("Describe why this maker should be slashed...").fill(slashText);
  await page.getByRole("button", { name: "Post Slash Report" }).click();

  // Filter to slashing
  await page.getByRole("button", { name: "Slashing" }).click();
  await expect(page.locator(".stream-item", { hasText: slashText })).toBeVisible();

  // Trending should still show intent
  await page.getByRole("button", { name: "Trending" }).click();
  await expect(page.locator(".stream-item").first()).toBeVisible();
});
