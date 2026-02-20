# Social Layer Design (Tapestry-First)
Date: 2026-02-20

This design embeds a social layer into the app using **Tapestry as the canonical content graph**. The backend only orchestrates queries and caches a lightweight index for resilience.

## Goals
- Let users post **intents** (what they want) and **slash reports** (validator challenges).
- Provide a **single feed-first UI** with reactions, comments, and follow graph.
- Maximize **legitimate Tapestry usage**: profiles, content, likes, comments, follows.

## Core Mapping (Tapestry)
- **Profiles**: every wallet has a Tapestry profile (auto-created on first action).
- **Content**:
  - Intents: `type=intent`, `text`, `wallet`, `personaId?`, `tags?`, `topic?`.
  - Slash reports: `type=slash`, `text`, `validatorWallet`, `personaId?`, `makerWallet?`, `challengeTx?`, `severity?`.
- **Votes**: Likes.
- **Comments**: Comments.
- **Follows**: Follow graph for “Following” feed and maker discovery.

## Why a Backend Index Still Exists
Tapestry does not provide a scoped “global feed” by app namespace. The backend:
- Queries Tapestry via `listContents`.
- Merges recent locally indexed posts for resilience (5-minute window).
- Adds cached `likeCounts` + `commentCounts` to each response.

The index is **not** source-of-truth. It only stores:
- `contentId`, `profileId`, `authorWallet`, `type`, `createdAt`, and `customProperties`.

## Feed UX (Feed‑First)
- **Composer**: Intent / Slash toggle.
- **Filters**:
  - Scope: `All` or `Following`.
  - Type: `All` / `Intents` / `Slash`.
- **Engagement**: Like, Comment, Follow, Subscribe.
- **Trending rail**: posts sorted by like count.

## Backend API (Current)
- `POST /social/intents`
- `POST /social/slash`
- `GET /social/feed?type=&scope=following&wallet=`  
  Returns `{ posts, likeCounts, commentCounts }`.
- `GET /social/feed/trending?limit=`  
  Returns `{ posts, likeCounts, commentCounts }`.
- `POST /social/likes` / `DELETE /social/likes`
- `POST /social/comments` / `GET /social/comments?contentId=&page=&pageSize=`
- `POST /social/follow`

## Following Feed (New)
- Backend calls `listFollowing(profileId)` on Tapestry.
- Fetches recent posts for each followed profile via `listContents(profileId)`.
- Merges + sorts by recency.

## Comment Pagination
- Backend supports `page` + `pageSize`.
- Frontend drawer supports “Load more.”

## Failure Behavior
- If Tapestry is down or API key is missing, social features are disabled.
- Core signal delivery still works (backend + on-chain).

## Future (Post‑MVP)
- On-chain slashing to be linked directly to slash posts.
- Fully Tapestry-based discovery rankings.
- Follow graph-based recommendations.
