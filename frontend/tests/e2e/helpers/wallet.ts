import { expect, type Browser, type Page } from "@playwright/test";

export async function createUserPage(browser: Browser, walletName: string) {
  const context = await browser.newContext();
  await context.addInitScript((name) => {
    localStorage.setItem("walletName", JSON.stringify("TestWallet"));
    localStorage.setItem("testWalletAccount", name);
  }, walletName);
  const page = await context.newPage();
  await page.goto("/feed");
  await expect(page.locator(".wallet-address-btn")).toBeVisible({ timeout: 20_000 });
  return { context, page };
}

export async function switchUser(page: Page, walletName: string) {
  await page.addInitScript((name) => {
    localStorage.setItem("walletName", JSON.stringify("TestWallet"));
    localStorage.setItem("testWalletAccount", name);
  }, walletName);
}
