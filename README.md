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
- Use the host dashboard `Schedule and registration` controls to update event date, time zone, check-in lead time, and registration status without editing code.
- Use the host dashboard `Clear test data` control to wipe one tournament's roster and bracket during smoke tests while keeping player accounts intact.
- Live schedule overrides are stored in the Netlify Blobs `tournament-settings` store and merged over the seeded `siteData.tournaments` records.
- The localhost allowlist server started with `npm run admin:server` and the browser-local passphrase remain fallback paths for draft editing.
- Put private draft tournament placeholders under `siteData.admin.draftTournaments` until a real remote auth layer exists.
- The server state file lives at `.data/admin-state.json`, which is ignored by git.

## Discord Live Alerts

The `/live` page includes a host-only **Send live alert** button. It posts through
`netlify/functions/discord-alert.mjs` and never stores the Discord webhook in source control.

Required Netlify environment variable:

```bash
npx --yes netlify-cli env:set DISCORD_WEBHOOK_URL "https://discord.com/api/webhooks/..."
```

Project:

- Netlify project: `1v1tournaments-org`
- Project URL: `https://1v1tournaments.org`
- Dashboard: `https://app.netlify.com/projects/1v1tournaments-org`

The function also requires normal host access:

- Signed-in host-approved account, or
- `TOURNAMENT_ADMIN_TOKEN` as a bearer token

After setting `DISCORD_WEBHOOK_URL`, redeploy or trigger a new Netlify deploy, then open `/live` and press **Send live alert**.

## Twitch Chat Bot

The site publishes editable stream commands at:

```text
https://1v1tournaments.org/.netlify/functions/stream-commands
```

Hosts can edit those commands from `/admin` under **Stream commands**. The `/live`
page and bot runner both read the same endpoint.

Create a private local env file:

```bash
cp .env.twitch-bot.example .env.twitch-bot
```

Then paste the bot account username and Twitch chat OAuth token into `.env.twitch-bot`.
That file is ignored by git.

Check the setup without joining chat:

```bash
npm run bot:twitch:check
```

Start the bot:

```bash
npm run bot:twitch
```

Install it as a Mac background service:

```bash
npm run bot:twitch:install
```

Manage the background service:

```bash
npm run bot:twitch:status
npm run bot:twitch:logs
npm run bot:twitch:restart
npm run bot:twitch:stop
```

Notes:

- `TWITCH_BOT_USERNAME` can be the main channel account or a separate bot account.
- `TWITCH_OAUTH_TOKEN` must be a Twitch chat OAuth token for that account.
- `TWITCH_CHANNEL` should be `1v1compspades` for the current channel.
- `STREAM_COMMAND_ENDPOINT` is optional; it defaults to the production command endpoint.
- The bot refreshes command text every 60 seconds and rate-limits repeated command responses.
- The Mac service writes logs to `/tmp/1v1tournaments-twitch-bot.log` and errors to `/tmp/1v1tournaments-twitch-bot.err.log`.

Default commands include `!next`, `!join`, `!signup`, `!match`, `!bracket`, `!format`,
`!rules`, `!results`, `!discord`, and `!live`.

### Production Twitch Bot Worker

Long term, run the Twitch chat bot as an always-on Render worker instead of relying on
the Mac staying awake. The repository includes `render.yaml` for a Render Blueprint
service named `1v1tournaments-twitch-bot`.

Create the worker in Render:

1. Open Render and choose **New > Blueprint**.
2. Connect the GitHub repo for `1v1tournaments-org`.
3. Select the `render.yaml` blueprint.
4. Add the private environment variables when Render prompts for them:

```bash
TWITCH_BOT_USERNAME=1v1compspades
TWITCH_OAUTH_TOKEN=oauth:your_private_twitch_chat_token
```

The blueprint sets these non-secret values automatically:

```bash
TWITCH_CHANNEL=1v1compspades
STREAM_COMMAND_ENDPOINT=https://1v1tournaments.org/.netlify/functions/stream-commands
TWITCH_COMMAND_REFRESH_MS=60000
TWITCH_COMMAND_COOLDOWN_MS=4000
```

After the worker deploys, check the Render logs for:

```text
Loaded 10 stream commands
Connected to Twitch chat
```

Once Render is responding to commands in Twitch chat, stop the Mac backup service:

```bash
npm run bot:twitch:stop
```

## Check-In Placeholder Flow

- Public tournament pages link to `/check-in/[slug]` for account-based tournament signup.
- The route reads live signup counts and schedule settings from Netlify Functions.
- Host-controlled registration status is enforced server-side before a signup is saved.

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
