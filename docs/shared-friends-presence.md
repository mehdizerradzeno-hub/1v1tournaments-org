# Shared Friends presence (local-only)

The Hub contract is deliberately fail-closed: `HUB_FRIENDS_ENABLED`,
`SPADES_HUB_FRIENDS_ENABLED`, and `EUCHRE_HUB_FRIENDS_ENABLED` remain off by
default. Netlify Blobs are not used as a transactional Friends or presence
authority. Production needs an explicitly injected transactional authority
before either relationship or presence traffic can activate.

Presence is an accepted-friends-only projection. A game server derives the
actor from its validated server session, sends a bounded heartbeat for its own
game, and may clear only that game's state. The Hub returns one of
`online_spades`, `online_euchre`, or `offline`; it never returns timestamps,
rooms, matches, navigation links, host/table data, or ratings. A 90-second TTL
is the safe expiry backstop for disconnected, expired, or failed sign-out
requests.

Run the source-only supplied-worktree integration harness from Tournaments:

```sh
npm run test:friends-cross-worktrees
```

It uses Node's built-in TypeScript transform and the exact supplied sibling
worktrees, so it does not expect legacy `../../spades` or `../../euchre`
directories and does not install dependencies.
