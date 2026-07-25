# Changelog

## v1.5.4 — 2026-07-25

### UI / UX
- **Mobile CSS pass (8 items)**: `viewport-fit=cover` added to index.html for safe-area support; status bar padded past `env(safe-area-inset-bottom)` so the Called King line isn't hidden by the iOS home indicator; menu bar raised to `z-index:300` and dropdowns to `301` so they render above bid panel and score dialogs; hover-lift on cards gated to `@media (hover: hover)` so touch devices don't get a card popping up on your turn; bid panel is now a flex column so the contract list scrolls internally while Pass/Bid stays pinned; all `.modal` dialogs capped to `calc(100vw - 16px)` / `calc(100dvh - 16px)` on mobile so nothing overflows; `RoundHistoryDialog` min-width made fluid; start screen condensed and scroll-safe on narrow viewports.
- **Help dialog**: Improved card-point-counting explanation with worked example; score formula corrected to show `round5(|pts − 35|)`; clarification that small taroks score almost nothing individually.

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
