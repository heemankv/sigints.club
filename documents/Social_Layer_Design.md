# Social Layer Design (Tapestry-First)
Date: 2026-02-20

This design embeds a social layer into the app using **Tapestry as the canonical content graph**. The backend is a thin gateway over Tapestry (no local social storage or fallback index).

## Goals
- Let users post **intents** (what they want) and **slash reports** (validator challenges).
- Provide a **single feed-first UI** with reactions, comments, and follow graph.
- Maximize **legitimate Tapestry usage**: profiles, content, likes, comments, follows.

## Core Mapping (Tapestry)
- **Profiles**: every wallet has a Tapestry profile (auto-created on first action).
- **Content**:
  - Intents: `type=intent`, `text`, `wallet`, `streamId?`, `tags?`, `topic?`.
  - Slash reports: `type=slash`, `text`, `validatorWallet`, `streamId?`, `makerWallet?`, `challengeTx?`, `severity?`.
- **Votes**: Likes.
- **Comments**: Comments.
- **Follows**: Follow graph for “Following” feed and maker discovery.

## Backend Gateway Role
Tapestry is the only source of truth. The backend:
- Proxies Tapestry calls so the frontend never talks to Tapestry directly.
- Batches list queries and returns `likeCounts` + `commentCounts` from Tapestry responses.
- Centralizes app-level validation, rate limiting, and error shaping.

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
- If Tapestry is down or the API key is missing, social + discovery features fail hard (no fallback).
- Core signal delivery still works (backend + on-chain), but social feeds are unavailable.

## Future (Post‑MVP)
- On-chain slashing to be linked directly to slash posts.
- Fully Tapestry-based discovery rankings.
- Follow graph-based recommendations.
