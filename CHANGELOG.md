# Changelog

## v1.5.8 — 2026-08-02

### Bot improvements
- **BOT-004**: Bot (as opponent) no longer folds when the Škis is its only beater — previously the low-value-trick fold condition could cause the bot to dump a cheap card instead of playing the Škis, leaving the trick open for a Mond to swoop in on the fourth play.
- **BOT-005**: Once Pagat Ultimo is announced, the bot now holds the Pagat until trick 12 (plays it only on the last trick, or if it is the sole legal card earlier).
- **BOT-006**: King-call heuristic now prefers the shortest suit in the declarer's hand (fewer cards = partner king has more room to come out cleanly). Previously the tiebreaker was effectively alphabetical.

### UI / Bidding
- **UI-004**: Bidding dialog helper text corrected — was "you may bid any contract or pass" (wrong: Klop and Three are never biddable in normal play). Now reads "bid Two or higher, or pass", or "Compulsory Klop — bid Solo Without or higher, or pass" when the floor is raised.

### UI / Scoring
- **UI-005**: Klop rounds now show a **Vitamins (tricks 1–6)** panel in the Round Result dialog listing each vitamin card and which player received it. The Copy Log gains a per-player point summary for klop hands.

### Rules / Help
- **UI-006**: Added a **Vitamins** subsection under Scoring in the Help dialog explaining the klop talon rule (one talon card gifted to each of the first 6 trick winners).
- Compulsory Klop explained in the Help dialog's Bidding section (both triggers: zero-tarok redeal and score-hits-zero).

### UI / Title & notifications
- **UI-007**: Title screen wording changed from "Slovenian card game — 4 players" to "4-Player Tarok — Play vs. Computer".
- In-game banner now appears at the start of a compulsory klop round triggered by a player's score hitting zero (the void-deal banner already existed; this covers the second trigger).

## v1.5.7 — 2026-07-29

### UI / UX
- **Smoother traditional-mode cards**: the traditional card art (54 PNGs plus the card back) is now preloaded into the browser cache as soon as traditional appearance is active, so a card's picture is ready before it's dealt. Previously each PNG was fetched lazily on its first render, which showed as a blank/flashing card — occasionally not resolving before the trick moved on. Image-URL logic is now shared between the sprite and the preloader so warmed URLs can't drift from rendered ones.
- **Failed ultimo attempts itemized in the score breakdown**: an unannounced King- or Pagat-Ultimo attempt (the called king / pagat played to the last trick by the declarer side but captured) deducts its base value (10 / 25). That deduction was already applied to the score but never shown, so the "Declarer net" line could look short by 10 or 25 with nothing to explain it. Both the on-screen breakdown and the Copy-Log now list the failed attempt explicitly.
- **Clearer bonus wording**: in the copy log, a declarer-side bonus now reads `Successful` / `Unsuccessful` instead of `ACHIEVED` / `NOT ACHIEVED`.
- **Build time in About**: the About dialog now shows the build/deploy timestamp next to the version (captured at build, which on Cloudflare Pages is the push time), rendered in the viewer's local timezone — makes it easy to confirm which build is live.

## v1.5.6 — 2026-07-28

### UI / UX
- **Two separate score logs**: the Round Result dialog now has independent "Show game log" (play record) and "Show point count" collapsibles, each with its own toggle bar and arrow.
- **Groups shown in capture order**: the card-point groups of three are listed in the order the cards were won (roughly chronological) rather than sorted by value, so the count is traceable against the trick list. Grouping order never changes the total.
- **Per-group arithmetic**: each group now spells out the math, e.g. `[J♦ 3♥ Škis] 2 + 1 + 5 − 2 = 6`, in both the on-screen breakdown and the Copy-Log — so beginners can follow exactly how each group's value is reached. Cards within a group are spaced out for readability.
- **Running "Declarer" gauge restored**: the status bar's Declarer chip shows the declaring side's progress toward the win threshold during point contracts, e.g. `Declarer: Petra · 28 / 36`. Hidden for klop/beggar/valat, which aren't decided by card points.
- **Rules tables centered**: numeric columns in the Rules tables are center-aligned instead of right-aligned for easier reading.

## v1.5.5 — 2026-07-28

### UI / UX
- **Game log — one group per line**: the "Card points (whole pile in threes)" section now prints each group of three on its own line (in both the Copy-Log text and the on-screen breakdown) instead of packing several per line, so it's easy to read.

## v1.5.4 — 2026-07-25

### UI / UX
- **Mobile CSS pass (8 items)**: `viewport-fit=cover` added to index.html for safe-area support; status bar padded past `env(safe-area-inset-bottom)` so the Called King line isn't hidden by the iOS home indicator; menu bar raised to `z-index:300` and dropdowns to `301` so they render above bid panel and score dialogs; hover-lift on cards gated to `@media (hover: hover)` so touch devices don't get a card popping up on your turn; bid panel is now a flex column so the contract list scrolls internally while Pass/Bid stays pinned; all `.modal` dialogs capped to `calc(100vw - 16px)` / `calc(100dvh - 16px)` on mobile so nothing overflows; `RoundHistoryDialog` min-width made fluid; start screen condensed and scroll-safe on narrow viewports.
- **Status bar wraps on mobile**: instead of scrolling horizontally (which hid the Round-history button and session scores off-screen), the status bar now wraps onto tidy rows so every field is visible at once; each item keeps its own line so text never wraps mid-item. The `flex:1` spacer is hidden on mobile, and the bid-panel bottom reserve was raised to `calc(100dvh - 240px)` to keep the hand fully visible below the now-taller bar.
- **Help dialog**: score formula display corrected to show `round5(|pts − 35|)`.
- **Rules — card counting rewrite**: Point-counting section rewritten to match how the score log now breaks it down (the subtraction method). Single **Value** column with the face values (Škis/Mond/Pagat/Kings 5, Queens 4, Cavaliers 3, Jacks 2, everything else 1); the rule stated as "sort your captured cards into groups of three; each group scores its total minus 2"; a worked-examples table of five groups of three (Škis+King+empty = 9, King+Queen+empty = 8, three Cavaliers = 7, King+two empties = 5, three empties = 1); and a single "more detail" link to pagat.com. Added a note that this app plays one standard ruleset and the listed variations can be tried in person with a real deck.
- **Rules — American spelling**: British→American throughout the rules text (anticlockwise→counterclockwise, honours→honors, colour→color, centre→center, cancelled→canceled); fixed a `radlc` typo → `radl`.
- **Rules — suit rank display**: the high-to-low suit rankings now show the Cavalier as `C` (matching the card face) instead of `Kn`.
- **Score dialog & game log restructure**: Removed the misleading per-trick point tallies — each grouped a single 4-card trick on its own, so they never summed to the real card-point total. The round breakdown is now two parts: **Tricks played** (pure play record + a tricks-won tally) and **Card points (whole pile in threes)**, which lays each side's captured pile into groups of three (face values minus 2 per group) reaching the true totals and 70. Applies to both the on-screen breakdown and the Copy-Log text.
- **Removed the running `Points: X / 70` status-bar counter**: it ran the same groups-of-three count on a *partial* pile, which jumps around and invites the same bad mental arithmetic as the per-trick numbers.

### Fixes
- **Blank green page on mobile after idling**: a new `ErrorBoundary` wraps the app. When mobile Safari reloads a long-backgrounded tab and the persisted game state (`tarok-game-state`, added in v1.5.3) can't be rendered by the current build, the first render used to throw and leave a blank green `<body>` with no recovery. The boundary now catches any render crash, clears the saved game, and auto-reloads once per session (falling back to a manual "Restart" button so it can never loop). A successful mount clears the one-shot recovery flag.

## v1.5.3 — 2026-07-25

### UI / UX
- **State persistence**: Zustand store now wrapped in `persist` middleware (key `tarok-game-state`). A mobile tab reload mid-game rehydrates the full in-progress state from localStorage instead of resetting. `pendingTrick` is excluded (transient animation); a `resumeAfterReload` action re-triggers the bot if it was their turn at the time of reload.
- **Leaderboard**: Now shows top 10 by score (`?view=leaderboard`). Column headers for Date, Score, and Rounds are clickable to re-sort client-side. Defaults to score descending.
- **Game History (web)**: History dialog on the web build now fetches from D1 (`?view=history`) — all games from all players in chronological order, no cap. Electron build unchanged (shows local localStorage data with full 4-player breakdown).
- **`100dvh`**: Body and root use `100dvh` (dynamic viewport height) so the layout tracks the visible area on mobile when the browser toolbar is shown/hidden.

## v1.5.2 — 2026-07-23

### UI / UX
- **UI-003**: Mobile responsive layout. Cards scale fluidly from 90×135px (desktop) down to 52×78px (375px phone) via a `useCardLayout()` hook using continuous clamp math. Hand container width and all face-down hand arithmetic are now derived from the same values rather than hardcoded. Trick area scales with `clamp(240px, 85vw, 480px)`. Card symbol text scales with card width in both symbol and traditional modes. Menu bar raised to 44px touch target on mobile. Status bar scrolls horizontally on narrow screens instead of wrapping to multiple lines. Bid panel centres on mobile and is height-capped so the human hand stays visible. Breakpoint: ≤640px (phones); iPad and desktop are unaffected.

## v1.5.0 — 2026-07-18

### Engine fixes
- **ENG-001**: Klop talon vitamin rule implemented. For the first 6 tricks of a klop hand, the top card of the talon is exposed and given to the trick winner as a "vitamin". Vitamins are shown in the trick area during the post-trick pause, displayed in the game log (gold text), and point totals include them. Card conservation now holds with `countPoints(allCapturedCards) === 70` (talon fully consumed via vitamins).

### Bot improvements
- **BOT-003**: Hard difficulty mode added. Selected on the start screen (persists across sessions). Hard mode bots: apply a solo gate (no solo bid on trump length alone — require ≥2 trula cards or ≥1 king); create suit voids when discarding and avoid discarding Pagat; auto-announce Trula/Kings/Pagat Ultimo when holdings guarantee the bonus; protect Mond from being led when Škis is still unseen; slough highest-point suit card onto a winning partner's trick; play cheapest safe trump when forced to trump to prevent overruff.

### UI / UX
- Difficulty selector (Easy/Hard segmented control) added to the start screen. Difficulty is now set per-game, not mid-game via the Options menu.
- Game History table includes a Difficulty column (Hard in gold, Easy in grey).

## v1.4.0 — 2026-07-18

### Engine fixes
- **ENG-002**: Valat contracts (valat-without, color-valat-without) now use the correct all-tricks win condition for radli bookkeeping in both `acknowledgeScore` and `endGame`. Secondary gap also fixed: valat bonus achieved inside a normal contract now correctly grants radli to all players.
- **ENG-003**: Pagat-ultimo and king-ultimo bonuses now require the card itself to win the last trick (not merely be present). Unannounced failures — card played to the last trick by the declarer side but beaten — deduct the base value from the side score.
- **ENG-004**: Compulsory klop is now triggered when any player's cumulative score transitions to exactly zero (not just on a void-deal redeal). Players who start at zero without having scored do not trigger it.
- **ENG-005**: Mond penalty is now isolated from radli (no longer doubled by outstanding radli) and is no longer shared with the partner. Each seat's penalty applies individually after the side score is radli-doubled.

### Bot improvements
- **BOT-001/002**: Bot bidding now detects when it holds all four kings and floors the bid at the corresponding solo contract level (e.g., 6 trumps + all four kings → solo-two, not two).
- **BOT-004**: Secret partner bot no longer leads the called king from the leading position when it has other non-trump cards available, avoiding premature partnership reveal and ruff risk.

### UI / UX
- **UI-001**: Per-round log history added to the Statistics panel. Clicking a round number opens the full game log for that round in-panel; a Copy Log button is available.
- **UI-002**: Mond penalty display in ScoreDialog and copy log moved to below "Declarer net". The net line now shows the pure side score (without individual Mond penalty), so lines above the net always sum exactly to it. Mond penalty line is labeled "(individual)".

### Code quality
- **CQ-001**: Removed dead ternaries in `bidding.ts` (`legalBids` and `resolveBidding`).
- **CQ-002**: Removed dead `updatedHand` computation in `talon.ts:applyDiscard`; removed now-unused `hand` parameter.
- **CQ-003**: `BONUS_LABEL` and `SUIT_SYM` consolidated from three definitions to one export in `src/ui/labels.ts`.
- **CQ-004**: Removed dead `getKontraTarget` from `announce.ts`. Cleared dead session stubs (`initSession`, `initSkisRound`, `shouldEndSession`, `nextDealer`, `applyMisdeal`) from `session.ts`. Removed unused `'dealing'` and `'skis-round'` from `GamePhase`.
- **CQ-005**: Klop integration test now asserts `countPoints(captured) + countPoints(talon) === 70` in addition to card count.
