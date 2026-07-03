# 1v1 Tournaments

Standalone Expo Router project for `1v1tournaments.org`.

## What Is Included

- A mobile-first dark public organization website.
- A home page with the public organization snapshot and upcoming tournaments.
- A Spades landing page plus a reusable Euchre route that now stays marked as coming soon.
- About and contact pages for the organization.
- Tournament detail pages.
- A general rules page.
- A results archive page.
- A live / YouTube links page.
- A placeholder check-in route for future sign-up flow.
- A private admin route with a localhost allowlist server and browser-local fallback.
- Admin-editable placeholder data in `src/lib/siteData.js`.

## Project Structure

- `app/` route entry points
- `src/components/` shared tournament UI
- `src/screens/` page implementations
- `src/lib/` data, theme, and formatting helpers
- `server/` localhost admin server for the allowlist flow
- `app/check-in/` placeholder public check-in route
- `app/about.jsx` public organization overview
- `app/contact.jsx` public contact page
- `app/admin.jsx` private admin entry point

## Run Commands

From the `one-v-one-tournaments` folder:

- `npm run start`
- `npm run web`
- `npm run build:web`
- `npm run admin:server`
- `npm run lint`
- `npm run test`

These scripts point at the Expo and ESLint binaries already available in the workspace.

The production web export lands in `dist/` and can be deployed to any static host.

## Go Live

1. Run `npm run build:web`.
2. Upload the generated `dist/` folder to your static hosting provider.
3. Point `1v1tournaments.org` at that host.

## Adding Euchre Next

Euchre is already modeled in `src/lib/siteData.js`, but the public site keeps it as a coming-soon game lane for now.

Future edits:

1. Add the first public Euchre tournament when the format is ready.
2. Replace the placeholder Euchre copy with the final rules when the format is locked.
3. Add or update results entries once Euchre events are completed.
4. Keep using the existing `/games/[gameSlug]` route if another game is added later.

## Admin Access

- Keep public events in `siteData.tournaments`, `siteData.results`, and `siteData.streams`.
- The preferred private admin flow is the localhost allowlist server started with `npm run admin:server`.
- Treat your account ID as the allowlist entry on that server, not as a password.
- The browser-local passphrase stays in place as a fallback for when the server is not running yet.
- Put private draft tournament placeholders under `siteData.admin.draftTournaments` until a real remote auth layer exists.
- The server state file lives at `.data/admin-state.json`, which is ignored by git.

## Check-In Placeholder Flow

- Public tournament pages link to `/check-in/[slug]` for a static signup/check-in preview.
- The route is read-only and does not submit any registrations yet.
- The allowlisted flow currently lives in the localhost admin server, with the browser fallback still available on `/admin`.
