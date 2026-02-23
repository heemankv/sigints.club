#!/usr/bin/env node

const API_KEY = (process.env.TAPESTRY_API_KEY || "").trim();
const WALLET = (process.env.WALLET_ADDRESS || "").trim();
const BASE_URL = (process.env.TAPESTRY_BASE_URL || "https://api.usetapestry.dev/v1/").replace(/\/$/, "");
const EXECUTION = (process.env.EXECUTION || "FAST_UNCONFIRMED").trim();
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 50);
const INCLUDE_EXTERNAL = process.env.INCLUDE_EXTERNAL_PROFILES === "true";
const INCLUDE_STREAMS = process.env.INCLUDE_STREAM_PROFILES !== "false";
const RESET_PROFILE = process.env.RESET_PROFILE === "true";
const DRY_RUN = process.env.DRY_RUN !== "false";
const CONFIRM = process.env.CONFIRM === "true";

if (!API_KEY) {
  console.error("Missing TAPESTRY_API_KEY.");
  process.exit(1);
}
if (!WALLET) {
  console.error("Missing WALLET_ADDRESS.");
  process.exit(1);
}

const canWrite = CONFIRM && !DRY_RUN;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(path, query = {}) {
  const url = new URL(`${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("apiKey", API_KEY);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request(path, { method = "GET", query, body } = {}) {
  const url = buildUrl(path, query);
  const options = { method, headers: { "content-type": "application/json" } };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`${method} ${url} failed (${res.status}): ${msg}`);
  }
  return data;
}

async function listProfilesByWallet() {
  const profiles = [];
  let offset = 0;
  while (true) {
    const payload = {
      walletAddress: WALLET,
      limit: PAGE_SIZE,
      offset,
    };
    const query = { shouldIncludeExternalProfiles: INCLUDE_EXTERNAL ? "true" : undefined };
    const res = await request("/profiles/search", { method: "POST", query, body: payload });
    const list = res?.profiles || [];
    profiles.push(...list);
    const pagination = res?.pagination;
    if (!pagination || !pagination.hasMore || list.length === 0) break;
    offset += PAGE_SIZE;
  }
  return profiles;
}

async function listContentsByProfile(profileId) {
  const contents = [];
  let offset = 0;
  while (true) {
    const res = await request(`/contents/profile/${encodeURIComponent(profileId)}`, {
      query: { limit: PAGE_SIZE, offset },
    });
    const list = res?.contents || [];
    contents.push(...list);
    const pagination = res?.pagination;
    if (!pagination || !pagination.hasMore || list.length === 0) break;
    offset += PAGE_SIZE;
  }
  return contents;
}

async function listCommentsByProfile(profileId) {
  const comments = [];
  let offset = 0;
  while (true) {
    const res = await request("/comments", { query: { profileId, limit: PAGE_SIZE, offset } });
    const list = res?.comments || [];
    comments.push(...list);
    const pagination = res?.pagination;
    if (!pagination || !pagination.hasMore || list.length === 0) break;
    offset += PAGE_SIZE;
  }
  return comments;
}

async function listLikesByProfile(profileId) {
  const likes = [];
  let offset = 0;
  while (true) {
    const res = await request(`/likes/profile/${encodeURIComponent(profileId)}`, {
      query: { limit: PAGE_SIZE, offset },
    });
    const list = res?.likes || [];
    likes.push(...list);
    const pagination = res?.pagination;
    if (!pagination || !pagination.hasMore || list.length === 0) break;
    offset += PAGE_SIZE;
  }
  return likes;
}

async function listFollowing(profileId) {
  const following = [];
  let offset = 0;
  while (true) {
    const res = await request(`/profiles/following/${encodeURIComponent(profileId)}`, {
      query: { limit: PAGE_SIZE, offset },
    });
    const list = res?.users || [];
    following.push(...list);
    const pagination = res?.pagination;
    if (!pagination || !pagination.hasMore || list.length === 0) break;
    offset += PAGE_SIZE;
  }
  return following;
}

async function deleteContent(contentId) {
  if (!canWrite) {
    console.log(`[dry-run] delete content ${contentId}`);
    return;
  }
  await request("/contents/delete", {
    method: "POST",
    body: { id: contentId, blockchain: "SOLANA", execution: EXECUTION },
  });
}

async function deleteComment(commentId) {
  if (!canWrite) {
    console.log(`[dry-run] delete comment ${commentId}`);
    return;
  }
  await request(`/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
    body: { blockchain: "SOLANA", execution: EXECUTION },
  });
}

async function deleteLike(profileId, contentId) {
  if (!canWrite) {
    console.log(`[dry-run] delete like profile=${profileId} content=${contentId}`);
    return;
  }
  await request("/likes", {
    method: "DELETE",
    body: { profileId, contentId, blockchain: "SOLANA", execution: EXECUTION },
  });
}

async function deleteFollow(startId, endId) {
  if (!canWrite) {
    console.log(`[dry-run] unfollow start=${startId} end=${endId}`);
    return;
  }
  await request("/followers", {
    method: "DELETE",
    body: { startId, endId, blockchain: "SOLANA", execution: EXECUTION },
  });
}

async function resetProfile(profileId) {
  if (!RESET_PROFILE) return;
  if (!canWrite) {
    console.log(`[dry-run] reset profile ${profileId} (bio/profileImage cleared)`);
    return;
  }
  await request("/profiles/update", {
    method: "PUT",
    body: {
      profileId,
      customProperties: [
        { key: "bio", value: "" },
        { key: "profileImage", value: "" },
      ],
      blockchain: "SOLANA",
      execution: EXECUTION,
    },
  });
}

function getProfileId(entry) {
  return entry?.id || entry?.profile?.id;
}

function getCommentId(entry) {
  return entry?.comment?.id || entry?.id;
}

function getLikeContentId(entry) {
  return entry?.content?.id || entry?.contentId || entry?.like?.contentId;
}

function getFollowingProfileId(entry) {
  return entry?.profile?.id || entry?.id;
}

function isStreamProfile(entry) {
  const custom = entry?.customProperties;
  if (custom && typeof custom === "object") {
    const type = custom.type;
    if (type === "stream") return true;
  }
  return entry?.username?.startsWith?.("stream-") || entry?.id?.startsWith?.("stream-");
}

async function main() {
  console.log("Tapestry cleanup starting.");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Wallet: ${WALLET}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Confirm: ${CONFIRM}`);
  console.log(`Include external profiles: ${INCLUDE_EXTERNAL}`);
  console.log(`Include stream profiles: ${INCLUDE_STREAMS}`);
  console.log(`Reset profile metadata: ${RESET_PROFILE}`);

  const profiles = await listProfilesByWallet();
  if (!profiles.length) {
    console.log("No profiles found for wallet.");
    return;
  }

  const filtered = profiles.filter((p) => (INCLUDE_STREAMS ? true : !isStreamProfile(p)));
  console.log(`Found ${profiles.length} profiles; operating on ${filtered.length}.`);

  for (const profile of filtered) {
    const profileId = getProfileId(profile);
    if (!profileId) continue;
    console.log(`\nProfile: ${profileId}`);

    const contents = await listContentsByProfile(profileId);
    console.log(`Contents: ${contents.length}`);
    for (const content of contents) {
      const contentId = content?.content?.id || content?.id;
      if (!contentId) continue;
      await deleteContent(contentId);
      await sleep(120);
    }

    const comments = await listCommentsByProfile(profileId);
    console.log(`Comments: ${comments.length}`);
    for (const comment of comments) {
      const commentId = getCommentId(comment);
      if (!commentId) continue;
      await deleteComment(commentId);
      await sleep(120);
    }

    const likes = await listLikesByProfile(profileId);
    console.log(`Likes: ${likes.length}`);
    for (const like of likes) {
      const contentId = getLikeContentId(like);
      if (!contentId) continue;
      await deleteLike(profileId, contentId);
      await sleep(120);
    }

    const following = await listFollowing(profileId);
    console.log(`Following: ${following.length}`);
    for (const follow of following) {
      const targetId = getFollowingProfileId(follow);
      if (!targetId) continue;
      await deleteFollow(profileId, targetId);
      await sleep(120);
    }

    await resetProfile(profileId);
  }

  console.log("\nCleanup complete.");
  if (!canWrite) {
    console.log("No changes were made (dry-run). To execute deletions, set CONFIRM=true DRY_RUN=false.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
