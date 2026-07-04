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
- The preferred production host flow is a signed-in player account on the Netlify allowlist.
- Set `TOURNAMENT_HOST_ACCOUNT_EMAILS` to one or more host account emails, separated by commas or spaces.
- You can also set `TOURNAMENT_HOST_ACCOUNT_IDS` when you want to allowlist immutable account IDs instead of emails.
- Keep `TOURNAMENT_ADMIN_TOKEN` as a fallback admin token for emergencies and setup.
- The localhost allowlist server started with `npm run admin:server` and the browser-local passphrase remain fallback paths for draft editing.
- Put private draft tournament placeholders under `siteData.admin.draftTournaments` until a real remote auth layer exists.
- The server state file lives at `.data/admin-state.json`, which is ignored by git.

## Check-In Placeholder Flow

- Public tournament pages link to `/check-in/[slug]` for a static signup/check-in preview.
- The route is read-only and does not submit any registrations yet.
- The allowlisted flow currently lives in the localhost admin server, with the browser fallback still available on `/admin`.

## Spades Match Result Callback

Players should enter Spades through a hub-issued match ticket, not a bare room link:

- Issue endpoint: `POST https://1v1tournaments.org/.netlify/functions/tournament-match-access`
- Issue body: `{ "action": "issue-ticket", "matchId": "spades-summer-series-r1-m1" }`
- Requires the signed-in `one_v_one_player_session` cookie on the tournament hub.
- Returns a short-lived `roomUrl` like `https://1v1spades.com/match/spades-summer-series-r1-m1?ticket=...`.

The Spades server verifies the ticket before seating a player:

- Verify endpoint: `POST https://1v1tournaments.org/.netlify/functions/tournament-match-access`
- Verify body: `{ "action": "verify-ticket", "matchId": "spades-summer-series-r1-m1", "ticket": "..." }`
- The response includes the assigned `seatIndex` and public player details. Spades should use those values instead of client-entered names.

The Spades app can load public match details directly from the tournament hub:

- Endpoint: `GET https://1v1tournaments.org/.netlify/functions/tournament-bracket?matchId=spades-summer-series-r1-m1`
- Response shape:

```json
{
  "ok": true,
  "match": {
    "tournamentSlug": "spades-summer-series",
    "bracketStatus": "published",
    "gameSlug": "spades",
    "round": {
      "index": 1,
      "title": "Semifinals"
    },
    "match": {
      "id": "spades-summer-series-r1-m1",
      "players": []
    },
    "resultCallback": {
      "endpoint": "https://1v1tournaments.org/.netlify/functions/tournament-bracket?slug=spades-summer-series",
      "method": "POST",
      "tokenEnv": "TOURNAMENT_MATCH_RESULT_TOKEN"
    }
  }
}
```

After the room completes, the Spades app should report the winner back to the tournament hub:

- Endpoint: `POST https://1v1tournaments.org/.netlify/functions/tournament-bracket?slug=spades-summer-series`
- Header: `Authorization: Bearer $TOURNAMENT_MATCH_RESULT_TOKEN`
- Header: `Content-Type: application/json`
- Body:

```json
{
  "action": "report-winner",
  "matchId": "spades-summer-series-r1-m1",
  "winnerId": "player-id-from-bracket"
}
```

The `matchId` is the final path segment from the room URL, for example
`https://1v1spades.com/match/spades-summer-series-r1-m1`.
The `winnerId` must match one of the two bracket player IDs for that match.

Successful responses return the updated bracket. The hub advances the winner into the next round and marks the tournament
complete when the final is reported. Concurrent winner reports use conditional Blob writes and retry before returning
`409`, so the Spades app can safely retry that response once.
