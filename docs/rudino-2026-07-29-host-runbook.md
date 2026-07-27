# Rudino's 1v1 Spades Tournament — Host Runbook

Event: Wednesday, July 29, 2026 at 7:00 PM ET  
Format: Single elimination, up to 16 players  
Exact slug: `rudino-s-1v1-spades-tournament`

## Event links

- Host console: <https://1v1tournaments.org/admin>
- Player lobby: <https://1v1tournaments.org/tournaments/rudino-s-1v1-spades-tournament>
- Signup and account access: <https://1v1tournaments.org/check-in/rudino-s-1v1-spades-tournament>
- Promoted event page: <https://1v1tournaments.org/next>
- Full overlay: <https://1v1tournaments.org/overlay>
- Compact overlay: <https://1v1tournaments.org/overlay/compact>
- Bracket overlay: <https://1v1tournaments.org/overlay/bracket>
- Results archive: <https://1v1tournaments.org/results>

Before every production write, confirm the title and exact slug above. Label an
event-setting, roster, or bracket write as **[LIVE CHANGE]** and a seeding,
winner, no-show, or rules judgment as **[HOST DECISION]**.

## Readiness gate — complete before event day

1. Sign in with the host-approved tournament account, then open `/admin`.
2. Confirm the page says **Host control center**. If it instead says
   **Set up private access**, stop and resolve host-account access. Do not make a
   random browser-local passphrase for tournament night.
3. Load Rudino's roster and confirm the event title, slug, start time, mode, and
   expected player names. Do not save or generate anything during this check.
4. Copy the roster JSON to the private event log.
5. Open the player lobby, signup page, `/next`, and all three overlays. Confirm
   they show Rudino's event, July 29 at 7:00 PM ET, and the same player count.
6. Confirm the Twitch bot is online and its heartbeat is current before relying
   on chat commands.

Current audit note (July 27): `/next` and all three overlays show Rudino
correctly. `/live` still selects the old Spades Summer Series, `/stream` can
incorrectly say that no tournament is scheduled, and the Twitch bot heartbeat
was stale. Do not use `/live` for alerts or `/stream` as the event source until
those checks pass after a fix. An overlay opened or reloaded after the bracket
goes live must also be rechecked.

## 30–45 minutes before start

1. Open the host console, player lobby, and overlays in separate tabs.
2. Refresh the private roster and compare it with the signup page.
3. Confirm attendance outside the site. The current signup route records
   registration; it does not maintain a separate attended/not-attended state.
4. Confirm each player uses the same account they registered with.
5. Recheck the broadcast scene and bot heartbeat.
6. Keep registration open until Rudino makes the seeding decision.

Do not alter the schedule, mode, cap, roster, or event settings without
Rudino's explicit approval.

## Seed and start

1. **[HOST DECISION]** Confirm the final attendees and seeding order.
2. Refresh the private roster one last time and confirm the exact event slug.
3. **[LIVE CHANGE]** Select **Generate bracket** once. Open seats become byes;
   bracket generation closes signup.
4. Refresh the public lobby and bracket overlay. Confirm the correct players
   appear and the first ready matches are visible.
5. Direct players to **My Match** on the tournament page. A player with a ready
   match can use **Play My Match** to open the assigned Spades table.

Match tickets last about 30 minutes and can be reissued by reopening **My
Match**. Do not distribute a bare room link as a substitute for the assigned
player flow.

## During the bracket

1. Keep the admin bracket manager and public lobby visible.
2. Let the Spades result callback advance winners automatically.
3. After every result, refresh and confirm:
   - the completed match shows the correct winner;
   - the next match becomes ready; and
   - the public bracket agrees with the host console.
4. Only act on a ready match with two known players.
5. Use manual advancement only as a fallback:
   - **[HOST DECISION]** verify the winner with both players or accepted proof;
   - **[LIVE CHANGE]** click **Advance _player_** exactly once; and
   - refresh immediately and verify the next match.

The public bracket refreshes periodically, but the host console is the
operational source of truth after a verified refresh.

## Incident playbook

- **Player cannot open a match:** Confirm the player signed in with the
  registered account, the bracket is live, and their match is ready. Reopen
  **My Match** to reissue the ticket.
- **Result callback conflict or duplicate:** Refresh first, confirm the match
  state, then retry once only if the result is still missing.
- **Wrong winner or corrupted bracket:** Stop advancement and record the
  current roster/bracket JSON. There is no safe single-match undo.
- **No-show:** Pause that match for Rudino's decision. The site has no
  automatic no-show timer or individual attended-state control.
- **Roster or mode mismatch:** Stop. Do not change the mode, schedule, roster,
  or bracket to work around it without explicit approval.
- **Broadcast page or bot fails:** Keep the tournament running from the host
  console and direct players to the exact lobby/signup links above. Do not send
  an alert whose event link or copy points to the wrong tournament.

Never use **Reset bracket only**, **Clear roster only**, archive, or tournament
deletion during the live event.

## Closeout

1. Confirm the champion and every completed match in the host console.
2. Confirm the public bracket is complete and `/results` has the final result.
3. Copy the final roster and bracket JSON to the private event log.
4. Leave Rudino's completed event intact.
5. Archive, reset, clear, or delete only with Rudino's explicit approval after
   the event record has been verified.
