---
name: Auth system
description: Email/password JWT auth added to My Digital Closet — architecture decisions and security constraints.
---

## Stack
- **JWT**: `jose` (ESM-native), signed HS256 with `SESSION_SECRET` env var
- **Passwords**: `bcryptjs` with cost 12
- **Token storage**: `localStorage` key `closet-auth-token`, 90-day expiry
- **API auth header**: `Authorization: Bearer <token>`

## Critical rule: no secret fallback
Both `artifacts/api-server/src/middleware/requireAuth.ts` and `artifacts/api-server/src/routes/auth.ts` throw on startup if `SESSION_SECRET` is absent. Never add a fallback default.

## React state sharing
`useAuth` hook in `artifacts/outfit-generator/src/hooks/useAuth.ts` — **single instance rule**: always consume via `useAuthContext()` from `AuthContext.tsx`, never call `useAuth()` directly in components. Multiple `useAuth()` calls create independent state instances that diverge after login.

## Ownership-before-delete pattern
All DELETE routes must: (1) fetch + verify ownership, (2) return 404 if not found, THEN (3) delete related join-table rows, THEN (4) delete the entity. Never delete join rows before ownership is confirmed — that causes cross-user side effects.

## React Query cache on logout
`logout()` in `useAuth.ts` calls `queryClient.clear()` (lazy import) to prevent cached wardrobe data from leaking to the next user on a shared device.

## Outfit save: item ownership
`POST /outfits` verifies the caller owns all referenced clothing item IDs before inserting. Returns 403 if any item belongs to another user.

## DB schema
`users` table: `id`, `email` (unique, lowercase), `passwordHash`, `createdAt`
`clothing_items` and `saved_outfits` both have nullable `user_id` FK (cascade delete) — nullable to allow migration without breaking existing rows.
