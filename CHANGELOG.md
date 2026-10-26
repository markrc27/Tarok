# Changelog

## v1.6.13 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: bots bid beggar when holding 0 trumps and very low courts** — a hand with no trumps (can't ruff) and at most 2 HCP (no queens or kings, at most one knave) is ideal for beggar; the bot will now bid it instead of passing. A separate guard prevents the beggar-ceiling hand from falling back to a normal contract when 'beggar' isn't available in legal bids (it passes instead of bidding 'one' with a zero-trump hand).
- **6 new tests** (391 → 397): bidding fires on 0T+hcp=0, fires on hcp=2, skips on hcp=3, skips with 1 trump, easy mode unaffected, passes when 'beggar' not in legal bids.

## v1.6.12 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: opponent avoids leading called king's suit while partnership is hidden** — previously only the called king card itself was excluded from opponent leads; now the entire called suit is avoided until the partnership becomes public. Leading any card in that suit risks flushing out the partner's king early and gifting the declarer side a free high-point trick. Once the partnership is revealed (`knownPartner` is set), leading the called suit is no longer restricted.
- **3 new tests** (388 → 391): hard mode avoids called suit, easy mode unaffected, hard mode with revealed partnership leads normally.

## v1.6.11 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: void-suit distribution bonus in bidding** — when the bot is void in any suit (holds zero cards in it), it treats its effective trump count as +1 for partner-contract evaluation (capped at 7 so it stays in the partner range). A void suit allows immediate ruffing, equivalent in practice to holding an extra trump. A bot that would bid 'three' now bids 'two', a 'two' bids 'one', when void.
- **4 new tests** (384 → 388): void bonus fires in hard mode, no-void baseline unchanged, easy mode unaffected, 6T+void reaches 'one'.

## v1.6.10 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: opponent uses strongest beater on high-value tricks** — when an opponent bot can beat the current trick winner AND a declarer-side player (declarer or partner) is still to play after them AND the trick already holds ≥5 pts, the bot plays its strongest beater instead of the cheapest; this prevents the declarer side from trivially overtrumping a high-value trick by spending a marginally higher trump last.
- **4 new tests** (380 → 384): strongest beater fires correctly, EASY mode unaffected, cheap tricks still use cheapest beater, no-enemy-after case uses cheapest beater.

## v1.6.9 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: endgame trump squeeze** — when all regular trumps (T2-T20) are exhausted outside the bot's hand, the bot leads a trump even if suit cards are available; this forces the declarer side to spend their remaining trula cards (Pagat/Mond/Škis). Skips the squeeze when Škis is still unseen and the only available trump is Mond (to avoid handing the Mond to the Škis).
- **5 new tests** (375 → 380): squeeze fires correctly, skips when Škis unseen, EASY mode unaffected, no-fire when regular trumps remain.

## v1.6.8 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: partner saves Škis/Mond when ally still to play** — when a declarer-side ally (declarer or partner) is still to play after the current bot in the trick, the bot uses its cheapest beater instead of committing the Škis or Mond; the ally can overbear if needed, preserving the high trumps for future leads.
- **Hard mode: opponent prefers king-singleton lead** — when leading, if the opponent holds a king as its only card in that suit (singleton), it leads that king first; a king always wins a non-trump trick and simultaneously creates a void in one play, combining two benefits.
- **8 new tests** (367 → 375): 4 for ally-after-me cheapest beater, 4 for king-singleton lead preference.

## v1.6.7 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: valat opponent uses strongest beater** — in valat-without and colour-valat-without, opponents play their highest available beater to guarantee winning at least one trick, rather than saving a cheap beater that could be overtrumped.
- **Hard mode: klop avoids leading a lone king** — when the only card left in a suit is a King, the klop bot skips that suit and leads from a safer one; kings can't be beaten by same-suit cards and will win the trick.
- **6 new tests** (361 → 367): 2 for valat highest-beater, 4 for klop king-singleton avoidance.

## v1.6.6 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: endgame near-win threshold** — in the last 3 tricks opponents no longer fold on cheap tricks once the declarer has ≥23 pts (≤3 tricks left) or ≥26 pts (≤2 tricks left), preventing the declarer from coasting to 36.
- **Hard mode: opponent kontras pagat-ultimo when holding Škis** — a bot holding the Škis can definitively beat the Pagat on trick 12, so it now automatically kontras any announced pagat-ultimo before the announcing dialog opens.
- **7 new tests** (354 → 361): 4 for endgame threshold, 3 for pagat-ultimo kontra chain.

## v1.6.5 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: bot rekontra** — after the human kontras (×2), a bot declarer or partner with ≥9 trumps, or ≥7 trumps and ≥12 HCP, now answers with a rekontra (×4).
- **Hard mode: secret partner cooperation** — the bot holding the called king privately knows it is the partner and silently cooperates before the king is publicly played: it sloughs its highest suit card onto the declarer's winning tricks and fights with its strongest beater when an enemy is winning. On its own leads it behaves like an opponent to avoid revealing itself early.
- **9 new tests** (345 → 354): 6 for `shouldBotRekontra`, 3 for secret partner following/leading.

## v1.6.4 — 2026-10-26

### AI / Bot Strategy
- **Hard mode: HCP-adjusted bidding** — bots now factor court-card strength (K=4, Q=3, Kn=2, J=1) into bid ceilings: ≥8 HCP boosts the ceiling one level; ≤1 HCP lowers it.
- **Hard mode: partner bot announces bonuses** — bot partners now independently announce trula, kings, pagat-ultimo, and king-ultimo before the dialog opens (was never announcing anything).
- **Hard mode: opponent bot kontra** — opponent bots with ≥8 trumps, or ≥6 trumps and ≥8 HCP, now kontra the game contract before the announcing dialog opens.
- **Hard mode: trump exhaustion switch** — declarer bots switch from drawing trumps to leading suit winners once ≤3 unseen opponent trumps remain.
- **Hard mode: shortest-suit lead (opponents + klop)** — opponent bots and klop players now lead from their shortest suit first to create voids for point-dumping.
- **Hard mode: Mond protection** — bots on both sides avoid leading the Mond when the Škis is still unseen.
- **Hard mode: beggar declarer longest-suit lead** — beggar declarer now leads the lowest card in their longest suit, maximising the chance an opponent holds a beater.
- **Hard mode: beggar opponent yields to fellow winner** — when a fellow opponent is already winning a beggar trick, the bot plays low rather than trying to take it (the must-beat rule then forces the declarer to self-defeatingly overbid).
- **Hard mode: declarer uses cheapest beater when last to play** — preserves high cards (Škis, Mond) for future leading tricks rather than spending them unnecessarily.
- **Klop following fix** — when forced to win a klop trick (all candidates beat the current leader), the bot plays the cheapest beater instead of the most expensive.
- **54 new tests** (290 → 344) covering all new heuristics.

## v1.6.3 — 2026-10-04

### Engine / Scoring
- **Mond left in the talon now costs the declarer 20 (ENG-008)**: per pagat.com, if the Mond is in the talon and the declarer takes a part that doesn't include it, the declarer takes the same individual −20 as losing it to the Škis (never doubled by radli or kontra). Exception: if the called king is also in the talon, in a different part, and the declarer takes the king and wins a trick with it, they win the rest of the talon including the Mond and there is no penalty. Solo Without is unaffected. The score breakdown and copied log show it as "Mond left in talon".
- **Talon window warns before you confirm**: highlighting a group that leaves the Mond behind shows the −20 warning (and mentions the called-king way out when it applies); highlighting a group that leaves your called king behind warns that you will play alone.
- **Bots avoid leaving the Mond**: a bot declarer now takes the talon group containing the Mond.
- **Help**: both Mond-penalty passages describe the talon rule and its exception.

### UI
- **Partner line names the declarer when they hold their own called king**: if the declarer takes the called king out of the talon, the status bar now shows the declarer's name as Partner straight away (the talon is exposed, so it's public) instead of "Hidden". If the called king is left in the unchosen talon it shows "None". A declarer who secretly called a king from their own dealt hand still shows "Hidden" until that king is played, then their name.
- **Talon selection needs a confirm**: clicking a talon group now only highlights it; a blue **Select** button takes it. A stray click can no longer lock you into a group.
- **Accidental double-click guard in play**: your hand ignores clicks while the finished trick is still on the table and for a moment (0.6 s) after it becomes your turn, so a double click can't play a second card into the next trick.
- **Score breakdown — "(opponents)"**: opponent-won bonuses no longer say "(opponents, unannounced)" — opponents can't announce bonuses. Same change in the copied game log.
- **Bidding window**: "Passed: Nobody Yet" capitalised.

## v1.6.2 — 2026-10-03

### UI
- **Points gauge no longer gives away the hidden partner (UI-020)**: the status bar's "Declarer · N / 36" gauge counted the partner's captured cards from the first trick, so it ticked up whenever the still-secret partner won a trick — revealing who they were. A hidden partner's points are now left out and added in one go when the called king is played. (If you are the hidden partner yourself, your own tricks are still counted — you already know.)
- **Points gauge now includes the talon remainder won with the called king**: when the called king is in the talon and the declarer wins a trick with it, the rest of the talon goes to the declarer — the final score counted those cards but the live "N / 36" gauge didn't, so it could read e.g. 34 at the last trick and 37 on the score screen. The gauge now adds them the moment that trick is won.
- **Announcements show who called them**: the Announcements window now lists each bonus as "<player> announced: <bonus>" (previously just "Declarer announced"), and shows it to the declaring side too, not only opponents. The in-play ANNOUNCED panel also names who announced each bonus and who called kontra. Bonuses already announced by your side are no longer offered again as checkboxes.
- **Reloading during bidding no longer wipes the session**: the saved game stored the "who has passed" set in a form that couldn't be read back, so a page reload mid-auction crashed on load and the recovery screen cleared the whole saved session (scores included). The saved state now round-trips correctly.
- **Game → End Game uses an in-app confirmation**: replaces the browser's native confirm/alert box, which embedded browsers can block (making End Game silently do nothing), with a dialog matching the score screen's "Yes, End Game" prompt.
- **Bidding window shows who has passed**: a "Passed: …" line lists the players who have passed so far, in the order they passed ("nobody yet" if none) — useful for judging whether the hand is heading to klop.
- **Help — called king in the talon**: the Calling a King section now explains that winning a trick with a called king taken from the talon earns the declarer the unchosen talon cards.
- **Traditional cards are now the default**: a fresh start shows the traditional card art instead of the simple faces. Simple is still available under Options, and anyone who has already picked an appearance keeps their choice.

## v1.6.1 — 2026-09-26

### UI
- **Talon reveal label — readability pass**: the "Talon — X took the highlighted group" label (added in v1.6.0's UI-019) is now white instead of dim grey, "Talon" is bolded, and the font size matches the announcement bonus list (14px, up from 11px).

## v1.6.0 — 2026-09-26

### Bidding / Rules
- **King is now called before the talon is exchanged (ENG-006)**: for three/two/one, the declarer calls a king first, then the talon is dealt out and exchanged — matching pagat.com ("the declarer calls the king before seeing the talon"). Previously the talon exchange happened first, and the bot's king-call heuristic could even see the talon remainder before calling, which the real rule doesn't allow. Fixes both the human dialog order and the bot's decision order.
- **Bidding dialog text now matches the actual legal bids (TXT-002)**: "must bid X or higher" is derived from the real legal-bid list instead of a hardcoded contract name, and Forehand — who may *match* the current bid instead of strictly raising it — now sees "you may match it or bid higher" instead of a misleading "must bid higher."

### Engine / Scoring
- **Beggar / Open Beggar / Valat / Colour Valat end as soon as the outcome is decided (ENG-007)**: these are flat-scored with no mond penalty, so once the declarer takes a trick (failing a 0-tricks contract) or loses one (failing an all-tricks contract), the score can no longer change — the hand now ends immediately instead of playing out the rest of the tricks. Solo Without is deliberately excluded: mond penalty still applies to it, so it always plays out in full.

### UI
- **Called king shown on the Announcements screen (UI-018)**: the called suit is public knowledge the moment it's named (only the partner's identity stays secret) — previously it wasn't shown anywhere during announcements, to either side.
- **Talon groups shown on the Announcements screen (UI-019)**: per pagat.com the talon is exposed to everyone when the declarer takes a group, not just the declarer. Shown as its own compact panel to the left of Announcements (not scrolling inside it), with smaller cards laid out in a 2-column grid so all groups are visible at once, and a read-only highlight on the picked group with no stray hover effect on the others. Previously a bot declarer's talon exchange was invisible to the human entirely.

## v1.5.14 — 2026-08-22

### UI
- **Help dialog — section reorder**: Introduction → Cards → Deal → Bidding → Contracts → Talon Exchange → Calling a King → Announcements → Bonuses → The Play → Scoring → Radli → 3 Player → Variations. Point-counting explanation moved from Cards to the top of Scoring.
- **Leaderboard — Easy/Hard tabs**: difficulty filter replaces the Difficulty column; opens on the current game's difficulty.
- **Menu bar shows current difficulty**: right side now reads e.g. "Hard · v1.5.14".
- **Score breakdown — "Points" column header**: replaces the unclear "default / announced" label.
- **Compulsory klop dialog — specific reason**: shows which player triggered it and why ("Matic's score just reached 0" or "Matic just had no Tarok cards in the last deal").

### Engine / Scoring
- **Radli end-of-session penalty applied**: ending a game via "End Game" or the Game menu now deducts 100 pts per uncancelled radl before computing final rankings and posting to the leaderboard. Previously the penalty was shown in ScoreDialog but never actually applied to final scores.

## v1.5.13 — 2026-08-16

### Engine / Scoring
- **Pagat ultimo — opponent's failed attempt now scored**: if an opponent plays the Pagat to the last trick unannounced and is beaten, the opposition loses the bonus, so **+25 is now credited to the declarer's side** (previously nothing was scored). This completes the four unannounced cases: declarer wins (+25), declarer beaten (−25), opponent wins (−25), opponent beaten (**+25, new**). Aligns with pagat.com.
- **Announced ultimo — obligation to hold the card**: when Pagat ultimo or King ultimo is announced, `legalCards` now forbids the holder from playing the Pagat / called king while any other legal card remains (leading or following), so it is naturally saved for the last trick. It becomes legal only when forced (last card, only trump, etc.). Enforced via a new optional `PlayState.announcedUltimos` populated when play begins.

### UI
- **Score breakdown moved above the per-player table**: the round-result reads top-to-bottom as "how the points were earned/won" → "each player's resulting score".
- **Score breakdown — opponent attempted-and-beaten line**: an opponent's failed pagat-ultimo attempt now shows as a positive credit ("opponents … ✗ beaten +25") instead of being hidden; opponent-won bonuses still render as a negative.
- **Threshold line greyed to match**: the "N pts → rounds to … → over/under the 35 threshold" line now uses the same grey (`#aaa`) as the result header line above it.
- **"This round" zero is neutral**: a `+0` in the round-result table now renders white (like the Session total column) instead of green; only actual gains are green and losses red.

### UI (mobile)
- **Declarer outline survives night mode**: on a phone in Dark appearance, the OS dims/warms the whole screen, which washed the subtle translucent white declarer ring out entirely (the gold partner ring, being saturated, survived). Under `prefers-color-scheme: dark` the declarer ring is now opaque with a dark edge so it reads on the felt at low brightness. Light mode is left exactly as v1.5.12.
- **Human name no longer clipped on mobile**: the bottom-left player name was pinned to the left of the hand and ran off the screen edge on phones (showing e.g. "ark" instead of "Mark"). It now sits just above the hand on narrow screens; desktop placement is unchanged.

## v1.5.12 — 2026-08-15

### Engine / Scoring
- **Emperor trick — colour valat exception**: in a colour valat, when a non-trump is led and the other three cards are the trula (Škis/Mond/Pagat), the led suit now wins — taroks are demoted, so the emperor trick no longer fires. (When a trump is led in a colour valat, the emperor trick still applies and the Pagat wins.) Previously the Pagat won unconditionally, which could wrongly fail a valid colour valat.
- **King ultimo win condition corrected**: king ultimo now scores when the declarer's side *wins the last trick with the called king in it* — it no longer requires the king itself to be the winning card. Previously, winning that trick with a trump (e.g. the partner overtrumping the led king) was wrongly scored as a failure (−10 / −20 announced) instead of a success. Fixed both the bonus evaluation and the unannounced-attempt deduction. (Pagat ultimo is unchanged — the pagat must still actually win the trick, per pagat.com.)

### Bidding / Rules
- **Compulsory klop forehand choice fixed**: when all other players pass under compulsory klop, the forehand could still be offered the removed three-through-beggar ladder. Now the forehand may only choose Klop or Solo Without and above — enforced for the human dialog, the bot forehand pick, and with a defensive engine guard. Illegal contracts render greyed-out, and an explanatory banner is shown during the forehand choice.

### Bot play
- **Cutthroat Mond capture (Hard mode)**: bots already take an opponent's Mond with the Škis; on Hard, a bot will now also capture a *teammate's* Mond with the Škis when it has no better use for it (the last two tricks, or when it's the bot's only trump). Because the −20 Mond penalty is individual, this is a free relative gain in the individually-scored game. Easy mode stays "loyal" and never captures its own side's Mond.

### UI
- **Open beggar exposes a bot declarer's hand**: when a bot declares open beggar, its cards are now revealed face-up after the first trick (as the rules require), not just when the human is declarer.
- **Declarer / partner highlighted**: the declarer's name block gets a soft white outline and the partner's the called-king gold — the partner only once the partnership becomes public.
- **Trick cards no longer overlap vertically**: the top and bottom players' played cards are offset by half a card height so their rank/numeral stays readable at any screen size.
- **Game log trick numbers**: trick labels changed from `T1` to `#1` so they no longer collide with trump/tarok card labels (`T16`, `T20`, …) in the log.

### Internal
- Added regression tests: king-ultimo win/loss scoring, compulsory-klop forehand choice list, and the Mond/Škis capture rules (opponent's Mond always taken; teammate's taken only on Hard, late-hand).

## v1.5.11 — 2026-08-06

### Engine / Scoring
- **Valat bonus replaces all other scoring**: in a normal contract where valat is achieved, only the valat bonus value (250 unannounced / 500 announced) counts — base score, difference, and all other bonuses are zeroed. Previously the valat bonus was incorrectly added on top.
- **Bug fix — announcements skipped for solo contracts**: `applyDiscard` was calling `advanceToPlay()` instead of `advanceToAnnouncing()` for the non-king-call path, causing solo-three / solo-two / solo-one to skip the announcement phase entirely.

### UI / Scoring
- **Kontra label in score breakdown**: multiplier now reads "kontra ×2", "rekontra ×4", "subkontra ×8", "mordkontra ×16" instead of a bare "×N".
- **Opponent announcement visibility (UI-014)**: when a bot on the declaring side announces a bonus (e.g. Pagat Ultimo), opponents now see the list of declared bonuses in their Kontra dialog before deciding to kontra or pass.

### Leaderboard
- **Medals**: 🥇 1st, 🥈 2nd, 🥉 3rd medals shown on the leaderboard when sorted by score descending.
- **1st-place only gate**: only 1st-place finishes are posted to the shared leaderboard and shown there; 2nd–4th are saved to local history only.
- **D1 `place` column**: API and schema updated to store and filter by finishing position.

### About
- **Credits updated**: About dialog now reads "Built by Mark Cochrane with Claude Code".

## v1.5.10 — 2026-08-04

### Engine / Scoring
- **Valat bonus in normal contracts**: the 250-pt unannounced valat bonus is now added on top of the game score instead of replacing it (e.g. Two won with 65 pts + radl now scores (50 + 250) × 2 = **+600**, not the previous 500). Other bonuses (trula, kings, etc.) are correctly cancelled by valat and no longer appear in the breakdown.
- **Mond penalty exempted from beggar and open-beggar**: the −20 penalty for losing Mond to Škis now correctly applies only in normal contracts and solo-without, not in beggar, open-beggar, colour-valat-without, or valat-without.
- **Copy log**: "need 35" corrected to "need 36" in the card-points summary line.

## v1.5.9 — 2026-08-03

### UI / Scoring
- **Klop round result now mirrors the normal layout**: two separate collapsibles — **Show game log** (tricks played) and **Show score log** (point breakdown) — instead of everything packed into one dropdown.
- **Klop score log shows groups-of-3 per player**: each player's captured pile is broken into groups of three with the arithmetic shown (e.g. `[K♣  Q♣  Kn♣] 5 + 4 + 3 − 2 = 8`), then the total with an explicit rounding step when applicable (e.g. `26 pts → rounds to 25 → −25`). Matches the format used in normal-contract point counts. Copy log updated to the same format.
- **Section renamed** to "Klop Point Summary (Rounded to Nearest 5 Points)" throughout.

### Rules / Help
- **Klop scoring section expanded**: table of the three outcomes (0 tricks → +70, >35 pts → −70, 1–35 pts → −round5), plain-English explanation of the rounding with worked examples, and a pointer to the in-app score log for the step-by-step breakdown.

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
