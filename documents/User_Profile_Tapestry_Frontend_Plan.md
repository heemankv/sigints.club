# Plan: Frontend Profile Editing (Username + Bio) via Tapestry

## Goal
Add UI to view and update `username` + `bio` for the connected wallet. The flow must be:
`frontend -> SDK -> backend -> Tapestry`.

## Current State (Relevant Code)
- Profile view (self): `/Users/heemankverma/Work/graveyard/frontend/app/profile/page.tsx`
- Public profile view: `/Users/heemankverma/Work/graveyard/frontend/app/profile/[wallet]/page.tsx`
- Frontend SDK wrapper: `/Users/heemankverma/Work/graveyard/frontend/app/lib/sdkBackend.ts`
- SDK backend client: `/Users/heemankverma/Work/graveyard/sdk/src/backend.ts`
- Backend user routes: `/Users/heemankverma/Work/graveyard/backend/src/routes.ts`
- Tapestry client: `/Users/heemankverma/Work/graveyard/backend/src/tapestry/TapestryClient.ts`
- SocialService profile creation uses Tapestry: `/Users/heemankverma/Work/graveyard/backend/src/services/SocialService.ts`

## Desired Behavior
- User can edit username + bio on `/profile`.
- Changes are persisted in Tapestry.
- UI displays username/bio wherever relevant (profile header, public profile, feed/post if available).

## Plan (Backend)
1. **Add/update Tapestry client support for profile updates**
   - Add a method in `/Users/heemankverma/Work/graveyard/backend/src/tapestry/TapestryClient.ts` such as:
     - `updateProfile(profileId, { username?, bio? })` (exact API needs confirmation).
   - If Tapestry requires a different endpoint (e.g., update by wallet), add the appropriate wrapper.

2. **Add backend route to update profile**
   - Extend `PATCH /users/:wallet` in `/Users/heemankverma/Work/graveyard/backend/src/routes.ts` to:
     - Resolve the user’s Tapestry `profileId`.
     - Call the Tapestry update method with `username` and/or `bio`.
     - Return the updated profile fields to the frontend.

3. **Resolve wallet -> profileId**
   - Preferred: add a Tapestry lookup by wallet in `TapestryClient`.
   - Fallback: keep a minimal cache table (`wallet -> profileId`) if Tapestry lookup is not available.

4. **Return username/bio consistently**
   - Update `GET /users/:wallet` to return data from Tapestry instead of local file store.
   - If we keep a cache, treat it as read-through only (not the source of truth).

## Plan (SDK)
1. **Add an SDK function**
   - `updateUserProfile(wallet, { username?, bio? })` in `/Users/heemankverma/Work/graveyard/sdk/src/backend.ts`.
   - Expose it in `/Users/heemankverma/Work/graveyard/frontend/app/lib/sdkBackend.ts`.

## Plan (Frontend)
1. **Profile editor UI (self profile)**
   - Add an “Edit Profile” section on `/Users/heemankverma/Work/graveyard/frontend/app/profile/page.tsx`.
   - Form fields: `username`, `bio`.
   - Save button triggers SDK call -> backend -> Tapestry.
   - On success, refresh local profile state.

2. **Display profile fields everywhere relevant**
   - Self profile header: already uses `profile.displayName` + `profile.bio`.
   - Public profile header: already uses `profile.displayName` + `profile.bio`.
   - Feed and post view (optional but recommended):
     - Extend SocialService mapping to include `authorUsername` and `authorBio` if available from Tapestry content responses.
     - Frontend shows `authorUsername` with fallback to `shortWallet`.

3. **Comment display (optional)**
   - If Tapestry comment API includes author profile data, map it and display username.
   - If not, defer and keep wallet fallback.

## Open Questions / Validation
1. Does Tapestry provide a **profile update** endpoint (username/bio)?
2. Does Tapestry provide a **lookup by wallet address** to resolve `profileId`?
3. Do we allow username changes freely or enforce immutability after set?

## Acceptance Criteria
- A connected wallet can update username + bio from `/profile`.
- Data persists in Tapestry and is reflected in `/profile` and `/profile/[wallet]`.
- The update flow is strictly `frontend -> SDK -> backend -> Tapestry`.
