Security Update: CVE-2025-55182 (React Server Components / Next.js RCE)
================================================================

Summary
-------
- CVE-2025-55182 is a critical RCE vulnerability in React Server Components and some Next.js releases that unsafely deserializes payloads for Server Function endpoints.
- We have updated this project to use a patched Next.js release and added input validation and authentication checks for sensitive routes.

What changed
------------
- Updated `next` in `package.json` from `^15.3.5` to `^15.3.6` (now resolves to >=15.3.6 and installed 15.5.7) to ensure the runtime includes the fix.
- Added input validation in `src/app/api/admin/cache/route.ts` and `src/app/api/admin/flood-stages/route.ts` to restrict payloads to plain JSON and limit action and pattern values.
- Added auth checks to `src/app/api/cache/route.ts` DELETE endpoint to prevent unauthenticated removal of cache keys.
- Added `src/lib/auth.ts` and `src/lib/security.ts` helper utilities to centralize validation and auth logic.
- Added `scripts/check-next-version.js` and `npm run check-next` to check that Next.js is updated to a patched version.

What you should do
------------------
- If you deploy this application, re-install dependencies and rebuild to pick up the non-vulnerable Next.js version: `npm install && npm run build`.
- Run `npm run check-next` in your CI pipeline and locally to enforce a patched Next.js version.
- Rotate any admin credentials and secrets if they may have been exposed.

Notes
-----
- These changes are both a short-term hardening and an upgrade-based fix. Upgrading Next.js is the main mitigation.
- We also improved validation and authentication in several routes to reduce attack surface.
