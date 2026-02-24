"use strict";

import { Buffer } from "buffer";
import { test, expect } from "@playwright/test";
import { createUserPage } from "./helpers/wallet";
import { recordMetric } from "./helpers/metrics";
import { backendClient, createKeypair, decryptLatestSignal, waitForOnchainSubscription } from "./helpers/sdk";

test.describe.configure({ mode: "serial" });

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

async function fillStreamStep1(page: any, streamId: string, name: string, visibility: "public" | "private") {
  await page.getByPlaceholder("stream-id (e.g. stream-eth-price)").fill(streamId);
  await page.getByPlaceholder("Stream name").fill(name);
  await page.getByPlaceholder("Domain (e.g. pricing, crypto)").fill("e2e");
  await page.getByPlaceholder("Short description of your stream").fill("E2E stream registration test.");
  await page.getByLabel("Visibility").selectOption(visibility);
  await page.getByRole("button", { name: /Next/i }).click();
}

async function stepThroughTiers(page: any) {
  await page.getByRole("button", { name: /Next/i }).click();
}

async function deployStream(page: any) {
  await page.getByRole("button", { name: /Deploy Stream/i }).click();
  await expect(page.getByText(/Stream registered|Stream already on-chain/i)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("link", { name: /View Stream/i }).click();
}

test("private stream flow (key required + decrypt)", async ({ browser }) => {
  const maker = await createUserPage(browser, "user01");
  const listener = await createUserPage(browser, "user02");

  const streamId = uniqueId("stream-private");
  const streamName = `Private Stream ${Date.now()}`;
  const signalMessage = `private-signal-${Date.now()}`;
  const keys = createKeypair();

  const registerStart = Date.now();
  await maker.page.goto("/register-stream");
  await fillStreamStep1(maker.page, streamId, streamName, "private");
  await stepThroughTiers(maker.page);
  await deployStream(maker.page);
  recordMetric({ name: "register_private_stream", ms: Date.now() - registerStart, meta: { streamId } });

  await expect(maker.page.getByRole("heading", { name: streamName })).toBeVisible();

  await listener.page.goto(`/stream/${streamId}`);
  await expect(listener.page.getByText(/Stream key missing/i)).toBeVisible();
  const subscribeBtn = listener.page.getByRole("button", { name: /Subscribe on-chain/i });
  await expect(subscribeBtn).toBeDisabled();

  const keyStart = Date.now();
  const keyCard = listener.page.locator(".key-manager");
  await keyCard.getByRole("button", { name: /Register New Key/i }).click();
  await keyCard.getByLabel("Public Key (base64 DER)").fill(keys.publicKeyDerBase64);
  await keyCard.getByRole("button", { name: /Register Key On-chain/i }).click();
  await expect(keyCard.getByText(/Registered on-chain key/i)).toBeVisible({ timeout: 120_000 });
  await expect(keyCard.getByText(/Backend sync complete/i)).toBeVisible({ timeout: 120_000 });
  recordMetric({ name: "register_subscription_key", ms: Date.now() - keyStart, meta: { streamId } });

  await listener.page.goto(`/stream/${streamId}`);
  await expect(subscribeBtn).toBeEnabled({ timeout: 20_000 });
  const subscribeStart = Date.now();
  await subscribeBtn.click();
  await expect(listener.page.getByText(/Subscribed and registered/i)).toBeVisible({ timeout: 120_000 });
  recordMetric({ name: "subscribe_private_stream", ms: Date.now() - subscribeStart, meta: { streamId } });

  await waitForOnchainSubscription(streamId, "user02", 90_000);

  await listener.page.goto("/profile");
  await expect(listener.page.getByText(streamName)).toBeVisible({ timeout: 60_000 });

  await maker.page.goto("/profile?tab=streams");
  await expect(maker.page.getByText(streamName)).toBeVisible();
  await expect(maker.page.getByText(/1 subs/i)).toBeVisible({ timeout: 60_000 });

  await maker.page.goto(`/stream/${streamId}`);
  await maker.page.locator("textarea").first().fill(signalMessage);

  await maker.page.getByRole("button", { name: /Publish On-chain/i }).click();
  await expect(maker.page.getByText(/Prepare the signal first/i)).toBeVisible();

  const prepareStart = Date.now();
  await maker.page.getByRole("button", { name: /Prepare Signal/i }).click();
  await expect(maker.page.getByText(/Prepared signal/i)).toBeVisible({ timeout: 120_000 });
  recordMetric({ name: "prepare_private_signal", ms: Date.now() - prepareStart, meta: { streamId } });

  const publishStart = Date.now();
  await maker.page.getByRole("button", { name: /Publish On-chain/i }).click();
  await expect(maker.page.getByText(/On-chain publish/i)).toBeVisible({ timeout: 120_000 });
  recordMetric({ name: "publish_private_signal", ms: Date.now() - publishStart, meta: { streamId } });

  const plaintext = await decryptLatestSignal(streamId, "user02", keys);
  expect(plaintext).toContain(signalMessage);

  await maker.context.close();
  await listener.context.close();
});

test("public stream flow (free + plaintext fetch)", async ({ browser }) => {
  const maker = await createUserPage(browser, "user03");
  const listener = await createUserPage(browser, "user04");

  const streamId = uniqueId("stream-public");
  const streamName = `Public Stream ${Date.now()}`;
  const signalMessage = `public-signal-${Date.now()}`;

  await maker.page.goto("/register-stream");
  await fillStreamStep1(maker.page, streamId, streamName, "public");
  const priceInput = maker.page.getByPlaceholder("Base price (e.g. 0.05 SOL/mo)");
  await expect(priceInput).toBeDisabled();
  await expect(priceInput).toHaveValue("0 SOL/mo");
  await stepThroughTiers(maker.page);
  await deployStream(maker.page);
  await expect(maker.page.getByRole("heading", { name: streamName })).toBeVisible();

  await listener.page.goto(`/stream/${streamId}`);
  await expect(listener.page.getByText(/Public stream/i)).toBeVisible();
  const subscribeBtn = listener.page.getByRole("button", { name: /Subscribe on-chain/i });
  await expect(subscribeBtn).toBeEnabled();
  await subscribeBtn.click();
  await expect(listener.page.getByText(/Subscribed and registered/i)).toBeVisible({ timeout: 120_000 });

  await maker.page.goto(`/stream/${streamId}`);
  await maker.page.locator("textarea").first().fill(signalMessage);
  await maker.page.getByRole("button", { name: /Prepare Signal/i }).click();
  await expect(maker.page.getByText(/Prepared signal/i)).toBeVisible({ timeout: 120_000 });
  await maker.page.getByRole("button", { name: /Publish On-chain/i }).click();
  await expect(maker.page.getByText(/On-chain publish/i)).toBeVisible({ timeout: 120_000 });

  const latest = await backendClient.fetchLatestSignal<any>(streamId);
  const pointer = latest.signal.signalPointer as string;
  const sha = pointer.split("/").pop();
  expect(sha).toBeTruthy();
  const wallet = await backendClient.getTestWallet("user04");
  const message = Buffer.from(`sigints:public:${sha}`, "utf8");
  const signature = await backendClient.testWalletSignMessage(
    { messageBase64: message.toString("base64") },
    "user04"
  );
  const payload = await backendClient.fetchPublicPayload<any>(sha!, {
    wallet: wallet.wallet,
    signatureBase64: signature.signatureBase64,
  });
  const plaintext = Buffer.from(payload.payload.plaintext, "base64").toString("utf8");
  expect(plaintext).toContain(signalMessage);

  await maker.context.close();
  await listener.context.close();
});

test("register stream validation", async ({ browser }) => {
  const maker = await createUserPage(browser, "user05");
  await maker.page.goto("/register-stream");
  await maker.page.getByPlaceholder("stream-id (e.g. stream-eth-price)").fill("");
  await maker.page.getByPlaceholder("Stream name").fill("");
  await maker.page.getByRole("button", { name: /Next/i }).click();
  await expect(maker.page.getByText(/Stream ID and name are required/i)).toBeVisible();
  await maker.context.close();
});
