# Phase 2 local design previews

These screenshots show the **public marketing page** from a local Expo static export of this branch. They are design-review captures at 1440px desktop and 390px phone CSS viewports. They are not screenshots of the Spades organizer product or tournament results.

- `desktop-hero-1440.png`: public navigation, hero, access actions, and pilot facts.
- `desktop-pricing-1440.png`: process and approved pilot pricing card.
- `phone-hero-390.png`: mobile hero, actions, and Host dock.
- `phone-faq-390.png`: mobile FAQ and Host dock.

## Phase 4 product demonstration

`public/hosting/eight-player-test-bracket.png` (SHA-256 `f5d0422cc978c0833e2681ceb1d1dea29494dfc1b6d3944ae574bc48fc6ae4f6`) is a privacy-edited image based on the completed local eight-player Spades test bracket at `owner-hosting/evidence/rc2/screenshots/pilot-champion.png` (source SHA-256 `b4e4fbf8ca080f67b5a43372494918b1269ff7d71818140d854bc7a8b1fe4503`). The seven recorded results are in `owner-hosting/evidence/rc2/pilot-after-restart-results.json`; this is local test evidence, not a customer event or proof of a hosted production release.

The built-in image editor replaced the eight test account handles with `Player 1` through `Player 8`, removed the event code and signed-in header, and labeled the image as a completed **test tournament**. The original bracket rounds, seven match outcomes, scores, and champion were compared visually with the source screenshot and result record. The edited image was reviewed in full for remaining account identifiers, codes, secrets, and owner controls. None were visible. The image is an edited demonstration, not an untouched screenshot.

| Match | Displayed result |
| --- | --- |
| Quarterfinal 1 | Player 1 −197 over Player 2 −286 |
| Quarterfinal 2 | Player 4 −2 over Player 3 −274 |
| Quarterfinal 3 | Player 5 −117 over Player 6 −297 |
| Quarterfinal 4 | Player 7 −196 over Player 8 −287 |
| Semifinal 1 | Player 1 −84 over Player 4 −261 |
| Semifinal 2 | Player 5 −161 over Player 7 −253 |
| Final | Player 5 −161 over Player 1 −253; champion Player 5 |

The built-in image editor used this prompt:

> Use case: text-localization. Edit target: the attached genuine screenshot of a completed local eight-player Spades test bracket. Create a privacy-safe marketing copy, preserving the actual UI and actual tournament results. Replace all account handles ending p01 through p08 consistently with generic labels Player 1 through Player 8, including winner lines and champion. Remove the event code, signed-in account information, and navigation controls at top. Remove the lower Spectate section and any account or administrative details. Add a neutral top label 'Completed eight-player test tournament' so it cannot be mistaken for a customer event. Preserve the original bracket layout, dark-and-gold visual style, all seven match outcomes and numeric scores exactly: quarterfinals Player 1 -197 over Player 2 -286; Player 4 -2 over Player 3 -274; Player 5 -117 over Player 6 -297; Player 7 -196 over Player 8 -287; semifinals Player 1 -84 over Player 4 -261 and Player 5 -161 over Player 7 -253; final Player 5 -161 over Player 1 -253; champion Player 5. Change nothing else about the competition or match status. No invented customer names, results, keys, codes, or UI features.
