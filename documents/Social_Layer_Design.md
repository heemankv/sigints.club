# Social Layer Design (Tapestry-First)
Date: 2026-02-15

This design embeds a social layer into the app using Tapestry as the canonical content system. Backend only indexes and helps query the feed.

## Goals
- Let users post **intents** (what they want) and **slash reports** (validator challenges).
- Provide a unified **social feed** with reactions (votes) and comments.
- Maximize **legitimate Tapestry usage** (profiles, content, likes, comments, follows).

## Core Mapping (Tapestry)
- **Profiles**: every user wallet has a Tapestry profile.
- **Content**:
  - `contentType = "text"`
  - Intents: `customProperties` include `type=intent`, `personaId`, `tags`, `wallet`, `topic`.
  - Slash reports: `customProperties` include `type=slash`, `personaId`, `validatorWallet`, `makerWallet?`, `challengeTx?`, `severity?`.
  - Signals already post as `type=signal` (existing implementation).
- **Votes**: Tapestry Likes act as votes.
- **Comments**: Tapestry Comments act as discussion + evidence.
- **Follows**: optional in UI to follow makers/validators.
- **Trending**: computed by like counts (backend aggregates likes per contentId).

## Why a Backend Index?
Tapestry does not expose a single “global feed” endpoint that is scoped by our app namespace.  
So we store a lightweight index of every intent/slash content ID we create.

The **index** is not a source of truth; it only holds:
- `contentId`
- `profileId`
- `type` (`intent` | `slash`)
- `authorWallet`
- `contentPreview`
- `createdAt`
- `customProperties` (copied for quick filtering)

## Feed UX
1. **Intent feed**: all intents (questions / requests) from all users.
2. **Slash feed**: all slashing reports from validators.
3. **Trending**: likes-ranked posts across intents + slash reports.
3. Each item shows:
   - content text
   - author wallet / profile
   - vote count (likes)
   - comments list

## Backend API (MVP)
- `POST /social/intents`
- `POST /social/slash`
- `GET /social/feed?type=`
- `GET /social/feed/trending?limit=`
- `POST /social/follow`
- `POST /social/likes`
- `DELETE /social/likes`
- `GET /social/likes?contentId=`
- `POST /social/comments`
- `GET /social/comments?contentId=`

## Fallback if Tapestry is Down
- Intents/slash posts return a clear error (no silent fallback).
- The app still works for signal feed + on-chain data.

## Future (Not Required for MVP)
- Follow graph in UI (Tapestry followers API).
- “Trending” via like counts.
- Slash post linking to on-chain challenge PDA.
