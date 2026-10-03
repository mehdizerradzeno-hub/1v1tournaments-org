# Tournament button and destination matrix

This is the source-of-truth audit for user-facing actions in the tournament hub. Every row has one of four destination types: an internal route, an external site, a state-changing API action, or a protected admin action.

| Surface | Button / control | Destination or handler | Type | Access contract | Expected result |
| --- | --- | --- | --- | --- | --- |
| Global navigation | Games, Tournaments, Watch, Rankings, Results, Profile | `/games`, `/tournaments`, `/stream`, `/leaderboard`, `/results`, `/account` | Internal route | Public | Route changes without a second click |
| Home | Spades game card | `https://1v1spades.com` | External site | Public | Opens Spades directly; card and keyboard activation use the same destination |
| Home | Euchre game card | `https://1v1euchre.com` | External site | Public | Opens Euchre directly |
| Home | Gin / Crib cards | Coming-soon state | State-only | Public | Announces unavailable game; no dead link |
| Tournament landing | Tournament card / Open event | `/tournaments/:slug` | Internal route | Public or guest-key protected | Opens the selected event once |
| Tournament detail | Join Tournament | `/check-in/:slug` | Internal route | Player account required on submit | Opens check-in; signup remains server-authenticated |
| Tournament detail | Sign in to Join | `/check-in/:slug?mode=signin#account-access` | Internal route | Public | Opens account access in context |
| Tournament detail | View Roster / Players tab | `#registered-players` | Internal anchor | Public or valid guest key for private events | Shows public-safe names only; no account IDs for guests |
| Tournament detail | View Bracket / Bracket tab | `#live-bracket` | Internal anchor | Public or valid guest key for private events | Shows bracket; private guest response omits account identifiers |
| Tournament detail | Open My Match | `#my-match` then match ticket | Protected action | Signed-in player + assigned match | Issues a match ticket; never granted by guest key |
| Tournament detail | Watch | `/stream` | Internal route | Public | Opens stream hub |
| Tournament detail | Rules | `/rules` | Internal route | Public | Opens competition rules |
| Guest access | Unlock event | `tournament-guest-access` exchange | State-changing API | Key, expiry, rate limit | Sets an HttpOnly, Secure, SameSite guest cookie; raw key is not persisted |
| Admin roster | Create / rotate guest key | `tournament-guest-access` create/rotate | Protected action | Host account or `TOURNAMENT_ADMIN_TOKEN` | Returns the raw key once with an 8-hour expiry |
| Admin roster | Copy key | Clipboard only | State-only | Host console | Copies the one-time displayed key; no server write |
| Admin roster | Revoke guest access | `tournament-guest-access` revoke | Protected action | Host account or `TOURNAMENT_ADMIN_TOKEN` | Invalidates the current key immediately |
| Admin roster | Refresh roster | `admin-roster` GET | Protected action | Host account or admin token | Loads private account-linked roster |
| Admin bracket | Generate bracket | `tournament-bracket` POST `generate` | Protected action | Host account or admin token | Creates bracket from roster |
| Admin bracket | Reset bracket | `tournament-bracket` POST `reset` | Destructive protected action | Host account or admin token | Resets bracket after confirmation |
| Admin bracket | Report winner | `tournament-bracket` POST `report-winner` | Protected action | Host account or result token | Advances the bracket |
| Admin events | Save / delete event | `tournament-events` POST | Protected / destructive | Host account or admin token | Persists or deletes hosted event; deletion is lifecycle-guarded |
| Stream tools | Load / save / reset commands | `stream-commands` GET/POST | Protected action | Host account or admin token for writes | Reads public commands; edits require host access |
| Live links | Twitch, Discord, YouTube, spectator room | Explicit external URLs in `LiveScreen` and `siteData` | External site | Public | Opens the exact configured destination; keyboard activation is supported |

Security invariants:

- `TOURNAMENT_ADMIN_TOKEN` is never accepted as a guest key and is never sent to guest clients.
- Guest access is view-only. Signup still requires a player account, and match tickets still require the signed-in player/match contract.
- Guest responses omit `accountId`, `canonicalAccountId`, emails, notes, and admin callback data.
- Guest keys are stored only as SHA-256 digests in the `tournament-guest-access` Blob store, are rate-limited, expire, and can be revoked or rotated.
- Raw guest keys must not appear in URLs, HTML, bundles, logs, screenshots, or committed files.
