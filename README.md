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
- Account-based check-in with password recovery and optional email verification.
- A host-approved production admin route with token and localhost fallbacks.
- Netlify Blob-backed tournaments, rosters, brackets, sponsor records, and daily snapshots.

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

1. Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build:web`.
2. Push the reviewed branch to the connected Netlify repository.
3. Wait for the Netlify production deploy, then run `npm run smoke:prod`.

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
- Use `Delete tournament` when an event should disappear from public and host lists. Seeded events receive an explicit hide tombstone so they do not reappear after deletion.
- Live schedule overrides are stored in the Netlify Blobs `tournament-settings` store and merged over the seeded `siteData.tournaments` records.
- The localhost allowlist server started with `npm run admin:server` and the browser-local passphrase remain fallback paths for draft editing.
- Put private draft tournament placeholders under `siteData.admin.draftTournaments` until a real remote auth layer exists.
- The server state file lives at `.data/admin-state.json`, which is ignored by git.

## Account Recovery And Verification

Player passwords are stored as salted scrypt hashes. Password reset and optional email
verification use six-digit, single-use codes that expire after 15 minutes. Account actions
are rate-limited by a hashed network/account fingerprint.

Configure these Netlify environment variables to enable email delivery:

```text
RESEND_API_KEY=<private Resend key>
TOURNAMENT_EMAIL_FROM=1v1 Tournaments <support@your-verified-domain.example>
```

Email verification remains opt-in for a staged rollout. Set this only after the sender domain
and recovery flow pass a live smoke test:

```text
REQUIRE_VERIFIED_PLAYER_EMAILS=true
```

Existing accounts without an `emailVerified` field remain treated as verified, so enabling the
flag does not lock out the current roster.

## Scheduled Operations

Netlify runs two scheduled functions from source configuration:

- `tournament-backup` runs daily and snapshots tournaments, settings, signups, brackets, and sponsor workflow records into the private `tournament-backups` Blob store. Player accounts, sessions, codes, and rate limits are deliberately excluded.
- `tournament-reminders` checks every five minutes for tournaments starting in 25 to 35 minutes. It uses provider idempotency keys and private delivery markers to avoid duplicate messages.

Reminder email is disabled by default. Enable it only after an approved live delivery test:

```text
TOURNAMENT_REMINDERS_ENABLED=true
TOURNAMENT_REMINDER_BATCH_SIZE=50
```

The batch size is optional and capped at 100 messages per scheduled run.

## Tournament Lifecycle

Public event status is derived from schedule and bracket state on every event API read:

- Future event without a bracket: `upcoming`
- Started event without a bracket: `expired`
- Published bracket: `live`
- Completed bracket: `complete`
- Host-archived or deleted event: stays archived or deleted

Expired, live, complete, archived, and deleted events close registration automatically. The
stored host record is left intact, so moving an expired event to a future date can reopen it.

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
HEALTH_ENDPOINT=https://1v1tournaments.org/.netlify/functions/health
TWITCH_COMMAND_REFRESH_MS=60000
TWITCH_COMMAND_COOLDOWN_MS=4000
TWITCH_BOT_HEARTBEAT_MS=30000
```

Set `HEALTH_MONITOR_TOKEN` to the same private value in both Netlify and Render.
The bot posts a heartbeat to `/.netlify/functions/health`, and `/live` displays
whether the hosted Twitch bot is online.

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
