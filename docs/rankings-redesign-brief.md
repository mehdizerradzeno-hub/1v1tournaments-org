# Rankings redesign brief

## Outcome

Make Rankings feel like a credible competitive destination when it contains real event history, while keeping the honest empty state for launch. The page should answer three questions immediately:

1. Who leads the circuit?
2. Where do I rank?
3. Why am I ranked there?

## Audit finding

The existing page is responsive and data-safe, but a populated 32-player, 18-event fixture exposes too much repeated card structure. The single leader card and the standings repeat the same information, result counts in the filters do not describe the ranked population, and the ranking method is explained only in one sentence.

Subjective product score before redesign: **7.8/10**. The target is **9+/10** for clarity, competitive energy, mobile scanning, transparency, and honest states.

## Information architecture

1. Compact Rankings hero with Results and ranking-method actions.
2. Game filters whose counts represent ranked players.
3. Circuit snapshot: ranked players, completed events, current leader.
4. Top-three podium with distinct first, second, and third-place treatment.
5. Searchable full standings. Search filters the list without changing rank numbers.
6. Ranking method with an explicit priority order.
7. Per-game circuit cards for discovery and cross-game growth.

## Ranking method

Tournament performance remains separate from any in-game Spades or Euchre rating. Standings use an achievement hierarchy instead of presenting an opaque rating:

1. Tournament championships
2. Finals made
3. Bracket match wins
4. Fewer bracket match losses
5. Events played
6. Player name as a deterministic final tie-break

No Elo, MMR, skill tier, or unique player identity should be claimed until results carry stable account IDs and enough match history exists to support that system.

## Populated-state requirements

- 32+ ranked players and 18+ events remain deterministic.
- Long, international, and punctuation-heavy display names wrap without horizontal overflow.
- Casing and whitespace variants merge into one row.
- Duplicate placement variants cannot double-count an event.
- Search can produce a useful no-match state without changing the underlying rank.
- Result placement keys remain unique even if two records share a placement number.

## Honest states

- No posted results: explain exactly how the first standings appear and route to the next tournament.
- Filter with no results: name the selected game and route to active competition.
- Search with no match: preserve the game filter and offer a clear reset.
- Coming-soon game: show `TBD` and zero players without invented activity.

## Visual direction

- Keep the black, cream, and restrained gold system.
- Use gold as competitive hierarchy, not decoration.
- Make the podium visually distinct but compact enough to keep standings above the fold on desktop.
- Preserve card boundaries on mobile; use denser rows and wrapped stat blocks rather than a wide table.
- Avoid tier badges that imply an unimplemented skill-rating system.

## Deferred follow-up

After enough account-linked results exist, design named rank tiers and movement indicators using a versioned rating contract. That phase needs stable account IDs, season boundaries, minimum-match rules, inactivity behavior, tie policy, and migration notes before visual tier names are introduced.
