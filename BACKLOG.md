# Tarok Backlog

Items tracked here are confirmed gaps — not speculative. Each entry includes the game log or reasoning that surfaced it.

---

## Engine Rules

### ENG-001 — Klop talon "vitamin" rule not implemented
**Added:** 2026-07-01  
**Fixed:** 2026-07-18  
**Version:** 1.3.3

**Problem:** In klop, the engine ignores the talon entirely. Per pagat.com
(authoritative): "in each of the first six tricks a card is turned up from
the top of the talon and added to the trick as a 'gift' to the player who
won the trick, usually called a 'vitamin'."

**Evidence:** Klop game log (2026-07-01 session): all 12 tricks contain only
the 4 played cards; the talon's 6 cards (13 raw / 9 counted points) were
credited to no one. Counted player totals were Špela 26, Mark 17, Ana 9,
Blaž 9 = 61, with the missing 9 being the untouched talon. Winners of T1–T6
(Špela ×3, Mark ×2, Ana ×1) should each have received a vitamin card,
changing every player's score.

**Fix direction:** In klop play, expose talon[trickIndex] for tricks 1–6 and
append it to the winner's `capturedCards` on trick resolution; show it in the
trick UI and game log. After the fix, klop satisfies full conservation with
zero talon remainder: `countPoints(all capturedCards) === 70`. Add a klop
integration test asserting the T1–T6 winners' piles include the vitamins and
that scores reflect them.

---

### ENG-006 — King must be called before the talon is exchanged
**Added:** 2026-09-26
**Fixed:** 2026-09-26
**Version:** 1.6.0

**Problem:** For three/two/one, the engine let the declarer take the talon
and discard *before* calling a king. Per pagat.com (authoritative): "the
declarer calls the king before seeing the talon." The old order also let the
bot's `recommendKingCall` see `talonRemainder` (what went to opponents) before
calling — info the real rule doesn't allow it to have yet.

**Evidence:** `gameState.ts` phase order was `talon → king-call`; `store.ts`
`afterBidResolved`/`applyDiscard` set `phase: 'talon'` first, then `'king-call'`
only after discard. `botTalon` resolved the king call at the end using
`updated.talonRemainder` as a 3rd argument to `recommendKingCall`.

**Fix:** Reordered to `king-call → talon` for three/two/one, both for the
human path (`callKing` now leads into the talon phase instead of straight to
announcements) and the bot path (new `botCallKing` helper calls the king from
the bot's original hand only, then runs `botTalon`). Solo-three/two/one
(no king) and flat contracts (no talon, no king) are unaffected.

**Files changed:** `src/state/store.ts`.

---

### ENG-007 — End beggar/open-beggar/valat/colour-valat as soon as the outcome is decided
**Added:** 2026-09-26
**Fixed:** 2026-09-26
**Version:** 1.6.0

**Problem:** These four contracts are flat-scored (no point magnitude, no
bonuses) and have no mond penalty. Their win condition — 0 tricks or all
tricks for the declarer — can only get worse once broken: taking one trick
permanently fails a "0 tricks" contract; losing one trick permanently fails
an "all tricks" contract. Playing out the remaining tricks after that can
no longer change the score, so the hand doesn't need to continue.

**Explicitly excluded — solo-without:** also flat, but mond penalty *does*
still apply to it (the one exception among flat contracts), and where the
Mond ends up depends on the rest of the play. Crossing/missing the 36-point
threshold early does not settle the final score, so solo-without always
plays out in full. Klop and the normal contracts (three/two/one and solo
variants) were never in scope — their scores depend on point magnitude and
last-trick bonuses.

**Fix:** New pure `isOutcomeDecided(state)` in `play.ts`, returned from
`playCard()` as `PlayResult.outcomeDecided`. `store.ts` treats it the same as
`handComplete` (jumps straight to `phase: 'scoring'`), including in the
reload-recovery path (`resumeAfterReload`). `ScoreDialog`'s game log and
point-count sections already keyed off `completedTricks.length` dynamically
and already excluded these 4 contracts from the point-count breakdown, so no
UI changes were needed there. 9 new engine tests in `tests/play.test.ts`
cover all four eligible contracts plus the solo-without/normal/klop
exclusions. Verified live: leading Mond as Beggar declarer (an instant loss)
now ends the hand after 1 trick instead of 12, with a correct −70 score and
radli awarded to all four players.

**Files changed:** `src/engine/types.ts`, `src/engine/play.ts`,
`src/state/store.ts`, `tests/play.test.ts`.

---

## Bot Difficulty System

### BOT-003 — Add Hard difficulty mode with meaningfully smarter bot logic
**Added:** 2026-07-01  
**Fixed:** 2026-07-18  
**Version:** 1.4.0

**Problem:** Current bot is "Easy" only. All three bots share the same simple heuristics with no difficulty setting. A "Hard" mode would make the game more challenging.

**Full implementation plan saved at:** `C:\Users\markr\.claude\plans\robust-prancing-hare.md`

**Scope of hard bot improvements:**

_Bidding:_
- Use HCP (currently computed but never read) to fine-tune contract ceiling within trump-count bands
- All-4-kings detection → floor bid at Solo level (fixes BOT-001)
- `trulaPotential === 3` → raise ceiling by 1 level (can announce Trula)
- **Solo gate: never bid solo-three/two/one on trump length alone** — require
  ≥2 trula cards or at least one king alongside a long trump suit. A solo
  declarer with no side winners can only score by ruffing, and ruffs get
  overruffed. Evidence (2026-07-01 log): Ana bid Solo Three with 8 trumps but
  only Mond, zero kings, zero courts — ceiling ~25-30 pts, lost −100 (radl
  doubled). With no kings in hand, a king-call contract (One/Two) is strictly
  better: 3 of 4 possible calls that round recruited the strongest opponent
  hand as partner. Same root cause as the earlier overbids: trump count
  over-weighted, HCP ignored.

_Talon / Discard:_
- Never discard Pagat
- Prefer discarding to create suit voids (enables sloughing in play)
- Prefer court cards in suits where bot doesn't hold the king

_Announcements (new — bots currently never announce):_
- Announce Trula if holding Škis + Mond + Pagat
- Announce Kings if holding all 4 kings
- Announce Pagat Ultimo if holding Pagat + 9+ trumps

_Card Play:_
- Track played trump ordinals → know when Škis/Mond/Pagat have appeared
- Count remaining opponent trumps → stop drawing trumps when they're exhausted
- Declarer leading: skip Mond if Škis still unseen and bot doesn't hold Škis
  — apply to ANY bot lead, not just the declarer. Evidence (2026-07-04 log,
  Two): partner Luka led Mond at T6 with Škis unseen; Steve took it with the
  Škis — −20 Mond penalty to Luka plus ~10 card points handed over.
- Declarer following: use minimum sufficient beater (not always highest); preserve Mond/Škis
- **Opponent following (partner winning): slough highest-point suit card onto partner's trick** — biggest improvement over easy, which wrongly dumps lowest
- Opponent following (enemy winning): same fold logic as easy + extended end-game fold
- **Protect partner's points when forced to trump: ruff high enough to hold the trick.** When a bot is void and must trump a trick where its own side's points are sitting (e.g. partner's king), it should NOT auto-play its lowest trump — its trump takes over the trick, so a small one just hands the points to whoever overtrumps. Correct choice: the cheapest trump that the players still to act cannot beat (considering played trumps and what remains unseen); if no trump can hold, then lowest. Evidence (2026-07-03 log, Two): Mark led the called K♣ into Luka's known club void; Luka was forced to trump and chose T3 — Petra overtrumped with T14 and took the king. Nina had already followed suit, so Luka's T18 would have won the trick outright (only T14/T16 were left behind him). Note: "cheapest that holds," not "highest" — burning Mond/Škis when T18 suffices wastes top trumps needed later.

_Settings:_
- `botDifficulty: 'easy' | 'hard'` added to `GameState.options`
- Toggle in Options dialog
- Threaded through all bot call sites in `store.ts`

**Files to modify:** `src/state/gameState.ts`, `src/ui/dialogs/OptionsDialog.tsx`, `src/state/store.ts`, `src/ai/bidding-heuristic.ts`, `src/ai/play-heuristic.ts`

---

## AI Coach

### AI-001 — In-game AI coach chat panel
**Added:** 2026-07-22
**Fixed:** —
**Version:** —

**Problem:** New players have no way to get contextual help during a hand. The rules are complex and the right move often depends on the exact current state (hand, contract, tricks so far). A static help dialog can't answer "what should I do right now?"

**Design:**
- A persistent **"Coach"** button in the menu bar, always visible.
- Clicking it opens a floating dark chat panel (consistent with existing panel style — no full-screen overlay, no dimming).
- Player types free-form questions: "what card should I play?", "should I have bid higher?", "what is a radl?", "why did I lose the Mond?", etc.
- The AI has full awareness of the current game state and answers in plain language, explaining the reasoning.
- Conversation is multi-turn within a hand; it resets at the start of each new hand.
- No proactive hints — the AI only speaks when asked.

**Architecture:**

_Model — Cloudflare Workers AI (free tier):_
- Use a capable open-source model available on Cloudflare Workers AI (e.g. Llama 3 8B Instruct or Meta Llama 3.1 8B). No separate API key or billing — covered by the Workers AI free tier (daily neuron budget).
- If quality proves insufficient, the endpoint can swap to Claude (Anthropic API key stored as a Worker secret) with no frontend changes.

_Backend — new `/api/hint` Worker endpoint (`functions/api/hint.ts`):_
- Accepts `POST /api/hint` with `{ messages: ChatMessage[], gameState: GameSnapshot }`.
- Loads `coach-context.md` as the static system prompt (rules + strategy — see below).
- Appends the current `gameState` as a second system block so it's always fresh.
- Calls Cloudflare Workers AI with the full message history (capped at last 10 exchanges).
- Returns the assistant reply as plain text.
- Rate limit: max 20 messages per hand per IP (WAF rule).

_Frontend — chat panel component (`src/ui/dialogs/CoachPanel.tsx`):_
- Floating dark panel, positioned bottom-right.
- Conversation history in local React state; cleared on `newHand` in store.
- `GameSnapshot` selector reads from Zustand: serialised as human-readable text (e.g. `"Your hand: Škis, Mond, K♥, Q♠, 7♣, …"`) so the model can reason about it naturally.
- Shows a loading indicator while awaiting response.
- "Coach" button in `MenuBar.tsx` toggles panel open/closed.

_`coach-context.md` — dedicated AI rules file (project root):_
Written specifically for AI reasoning, not player reading. Target ~1,000 tokens. Should cover:
- **Pack & card values**: 54 cards; Škis/Mond/Pagat/Kings=5, Q=4, Kn=3, J=2, all others=1; pack total=70; point counting in groups of 3 (sum−2 per group).
- **Contracts quick-ref**: each contract's talon size, partner/solo, win condition (≥36 pts / 0 tricks / all tricks), and base score.
- **Bidding**: forehand priority, when to hold vs. raise, klop/three forehand-only, all-pass rule.
- **Talon & discard**: never discard kings or trula; trumps only if unavoidable and declared.
- **Play rules**: follow suit, must trump if void, must beat in negative contracts (klop/beggar), emperor trick (Škis+Mond+Pagat → Pagat wins).
- **Scoring formula**: base + round5(|pts−35|) for normal; flat ±base for beggar/valat/etc.; bonuses (trula 10, kings 10, pagat-ultimo 25, valat 250); mond penalty −20 to the individual; radli double the hand score.
- **Key beginner mistakes to flag**: leading Mond when Škis unseen; playing Pagat early; discarding into a trick partner is winning; overbidding without kings; ignoring radli risk.
- **Klop**: avoid taking tricks; vitamins (T1–T6 talon card goes to trick winner); scoring formula.
- **Beggar/Open Beggar**: must take zero tricks; lead your lowest; opponents try to force wins.

_Prompt structure per request:_
1. System: contents of `coach-context.md`
2. System: current game state snapshot (phase, hand, contract, called king, partner if revealed, current trick, last 3 completed tricks, score, radli count)
3. Messages: conversation history (last 10 exchanges)
4. User: player's latest message

**Files to create/modify:**
- `coach-context.md` — new AI rules/strategy file
- `functions/api/hint.ts` — new Worker endpoint (Cloudflare Workers AI)
- `src/ui/dialogs/CoachPanel.tsx` — new chat panel component
- `src/ui/MenuBar.tsx` — add Coach toggle button
- `src/state/store.ts` — add `clearCoachHistory` on new hand

**Out of scope for first pass:**
- Persisting chat history across hands or sessions
- Voice / text-to-speech
- The coach playing cards on behalf of the player
- Any proactive / unsolicited advice

---

## UI

### UI-016 — Reorder HelpDialog sections and move point-counting into Scoring
**Added:** 2026-08-20
**Fixed:** 2026-08-22
**Version:** v1.5.14

**Problem:** The section order in `src/ui/dialogs/HelpDialog.tsx` does not follow the logical flow of a game. Contracts appear before the deal and bidding, Bonuses appears before play begins, and the point-counting explanation lives in the Cards section rather than with Scoring where it is needed.

**Current order:** Introduction → Cards → Contracts → Bonuses → Deal → Bidding → Calling a King → Announcements → Talon Exchange → Play → Scoring → Radli → Variations

**Desired order:** Introduction → Cards → Deal → Bidding → Contracts → Talon Exchange → Calling a King → Announcements → Bonuses → Play → Scoring → Radli → 3 Player → Variations

**Also:** Move the "How points are counted" subsection (including the worked-examples table and the pagat.com link at the bottom of the Cards section) out of Cards and into the top of the Scoring section, above the existing Scoring content. Do not change any text — reorder only.

Note: "3 Player" is a placeholder heading for VAR-001; add a stub entry that links to that backlog item.

**Files to modify:** `src/ui/dialogs/HelpDialog.tsx`

---

### UI-002 — Leaderboard difficulty tabs (Easy / Hard)
**Added:** 2026-07-22
**Fixed:** 2026-08-22
**Version:** v1.5.14

**Problem:** Easy and Hard scores are mixed in the leaderboard, making it impossible to compare like-for-like. A player on Hard shouldn't be competing against Easy scores.

**Fix direction:** Add an Easy / Hard tab selector at the top of the Leaderboard dialog. Each tab filters the results to that difficulty only — the underlying `GET /api/games` endpoint already returns the `difficulty` field, so this is a client-side filter. Default to the tab that matches the player's current difficulty setting. Remove the difficulty column from the table (it's redundant once tabs separate the two lists).

---

### UI-001 — Show difficulty level in the top banner
**Added:** 2026-07-22
**Fixed:** 2026-08-22
**Version:** v1.5.14

**Problem:** There is no visible indicator of the current difficulty setting during play. Players have to open the Options dialog to check.

**Fix direction:** Display the current difficulty ("Easy" / "Hard") in the menu bar or status bar area at the top of the screen, alongside the existing version/menu items. Should update immediately if the player changes difficulty mid-session via Options.

---

### UI-017 — Game history should show player's finishing rank
**Added:** 2026-08-22
**Fixed:** —
**Version:** —

**Problem:** The game history list (Game → History) shows past games but gives no indication of how the player finished — 1st, 2nd, 3rd, or 4th place. A player can't tell at a glance whether a game was a win or a loss.

**Fix direction:** Add a finishing rank to each history row. Could be a numeric place ("1st", "2nd", etc.) or a medal icon for top 3 (matching the leaderboard style), or both. Rank is determinable from the final score snapshot already stored in history — compute it by sorting all four players' final scores at game-end and recording the human's position.

---

### UI-015 — Trick area cards overlap too much on desktop
**Added:** 2026-08-06
**Fixed:** —
**Version:** —

**Problem:** When 4 cards are played to the current trick, cards overlap heavily in the centre-table area, making it hard to read all 4 cards at once — particularly the top bot and bottom player positions.

**Fix direction:** Increase the spacing between cards in the trick area so all 4 played cards are at least mostly visible. The trick area is sized via `clamp` in CSS; review the card offsets/positions in `App.tsx` or `TrickArea` so that each of the 4 played-card slots has enough separation that face symbols and values are legible without requiring a hover.

---

### UI-003 — Mobile responsive layout
**Added:** 2026-07-23
**Fixed:** —
**Version:** —

**Problem:** The game is unplayable on phone-sized screens. Cards are fixed at 90×135px, the human hand container is hardcoded to 640px, and the trick area is 480px wide — all overflow a 375px viewport. The menu bar (24px) is below the 44px touch-target floor.

**Scope:** CSS/layout pass only. No logic, state, or backend changes.

**Fix direction:** Introduce a `useCardLayout()` hook (continuous clamp math from viewport width) that returns fluid `cardW/cardH/handStep/aiStep` values, sets `--card-w`/`--card-h` CSS custom properties, and is wired through `Hand.tsx` and `App.tsx`. CSS-only fixes for: trick area width (`clamp`), card font scaling (derive from `--card-w`), menu bar height (44px on mobile), status bar (nowrap + horizontal scroll), bid panel (centered, max-height leaves hand visible), seat margins. Primary test device: iPhone 13 mini (375×812). Also verify on iPad (no change expected above 640px breakpoint).

---

### UI-018 — Show the called king's suit on the Announcements screen, both sides
**Added:** 2026-09-26
**Fixed:** 2026-09-26
**Version:** 1.6.0

**Problem:** Per pagat.com, the called suit is public the moment it's named —
only the partner's identity stays secret. The Announcements dialog showed
neither: it never received `kingCall` as a prop, and `StatusBar`'s existing
"Called King" line only reads from `playState`, which doesn't exist yet
during the `announcing` phase (it's created in `advanceToPlay`, after
announcements finish). So nobody — declaring side or opponents — could see
the called suit during announcements.

**Fix:** `AnnouncementsDialog.tsx` now accepts `kingCall` and renders "Called
King: <suit>" unconditionally, before the declarer-side/opponent-side
branch. Deliberately does *not* surface `kingInDeclarerHand`/`kingInTalon`
("playing alone") here — that stays hidden exactly as it already is via
`StatusBar`'s partner-reveal logic; only the suit itself is public.

**Files changed:** `src/ui/dialogs/AnnouncementsDialog.tsx`, `src/ui/App.tsx`.

---

### UI-019 — Show the talon groups and the declarer's pick to all players
**Added:** 2026-09-26
**Fixed:** 2026-09-26
**Version:** 1.6.0

**Problem:** Per pagat.com, the talon is "exposed" in sets (two of three
cards, three of two, or six single cards depending on contract) and the
declarer's pick is visible to everyone at the table — not private. The old
`TalonDialog` only ever rendered for the human when the human itself was
declarer; when a bot was declarer, the human saw nothing about the talon
exchange at all (the bot resolves it synchronously in `botTalon`, with no
intermediate phase for the human to observe).

**Fix:** Rather than adding a second, read-only talon UI for the `talon`
phase (bots never pause there), the talon groups are shown on the
Announcements screen instead — `talonExchange` persists in the store through
announcing regardless of who was declarer, so no new state plumbing was
needed. `AnnouncementsDialog.tsx` now accepts `talonExchange` and
`playerNames`, and renders all groups (reusing the existing `.talon-group`/
`.selected` styling from `TalonDialog`) with the declarer's chosen group
highlighted. Scope is deliberately limited to which *group* was picked, not
the subsequent discard-from-hand step, which the user didn't ask to change
and which pagat.com treats differently (discards are face-down unless
they're trump). Verified live for both a human-declarer and a bot-declarer
hand — the human opponent could see the called king and the exact talon
groups (all 3, correct one highlighted) in the latter case.

**Files changed:** `src/ui/dialogs/AnnouncementsDialog.tsx`, `src/ui/App.tsx`.

---

### UI-020 — Status bar points gauge revealed the hidden partner
**Added:** 2026-10-03
**Fixed:** 2026-10-03
**Version:** 1.6.2

**Problem:** The "Declarer · N / 36" gauge in `StatusBar.tsx` summed
`capturedCards` for the declarer *and* `playState.partner` regardless of
whether the partnership was public yet. Whenever the still-hidden partner won
a trick the gauge went up, so the human could identify the partner long before
the called king was played.

**Fix:** New pure `revealedPartner(state)` and `visibleDeclarerPoints(state,
viewer)` in `play.ts`. The gauge counts the declarer's pile only until the
called king appears in `currentTrick` or `completedTricks`, then adds the
partner's pile in one go. A viewer who is the hidden partner still sees their
own pile counted (they know their own role, so nothing leaks). 6 new tests in
`tests/play.test.ts`. End-of-hand scoring (`store.ts`, `ScoreDialog`) is
unchanged — it runs after all cards are played, when the partner is public.

**Files changed:** `src/engine/play.ts`, `src/ui/StatusBar.tsx`,
`tests/play.test.ts`.

---

## UI Text

### TXT-001 — Compulsory Klop bidding dialog shows incorrect trigger description
**Added:** 2026-08-20
**Fixed:** 2026-08-22
**Version:** v1.5.14

**Problem:** There are three compulsory-klop strings in the UI; two are accurate and one is not.

**Accurate (no change needed):**
- `App.tsx:292` — score-hits-zero banner: *"A player's score hit zero — compulsory klop: bidding starts at Solo Without."*
- `App.tsx:306–307` — void-deal banner: *"[Name] had no taroks — cards were redealt. Compulsory klop: bidding starts at Solo Without."*

**Inaccurate (needs fixing):**
- `BiddingDialog.tsx:42` — forehand-choice subtitle: *"Compulsory klop — all others passed. Play Klop, or declare Solo Without or higher."* The "all others passed" clause is wrong; it describes the forehand-choice situation, not the compulsory-klop trigger.

**Fix direction:** Replace the string at `BiddingDialog.tsx:42` with: *"Compulsory Klop — either a player's score reached exactly 0, or a player was dealt no tarok cards. Play Klop, or declare Solo Without or higher."* No logic changes required.

---

### TXT-002 — Bidding dialog's "must bid X or higher" text didn't match the actual legal bids
**Added:** 2026-09-26
**Fixed:** 2026-09-26
**Version:** 1.6.0

**Problem:** `BiddingDialog.tsx` had hardcoded strings ("bid Two or higher, or
pass", "Bid Solo Without or higher, or pass") that assumed the non-forehand,
must-strictly-raise case. They ignored that Forehand may *match* the current
bid rather than raise it (`bidding.ts` `legalBids`: forehand gets
`contractStrength(c) >= currentStrength`, everyone else gets `>`) — so when
Forehand had priority to match, the text still said "must bid higher" even
though the current bid itself remained selectable.

**Fix:** Copy is now derived from the `legalBids` prop instead of hardcoded:
`legalBids[0]` (lowest legal contract, since the array preserves ladder
order) drives the "bid X or higher" wording, and
`legalBids.includes(currentHighBid)` — true only for Forehand — switches the
message to "you may match it (X) or bid higher" instead of "you must bid
higher." This can't drift out of sync with the radio buttons again since
both are driven by the same `legalBids` array. Verified live: with the
message reading "you must bid higher: Solo Three or above, or pass," `Solo
Three` was exactly the lowest enabled radio option. Also covered by the
existing engine test `bidding.test.ts` — "Forehand can match current highest
bid."

**Files changed:** `src/ui/dialogs/BiddingDialog.tsx`.

---

## Scoring

### SCO-001 — Uncancelled radli not deducted at session end
**Added:** 2026-08-20
**Fixed:** 2026-08-22
**Version:** v1.5.14

**Problem:** The Rules dialog states "Uncancelled radli at the end of the session cost 100 points each," and CLAUDE.md documents the same rule. However, the end-of-session flow does not actually apply the −100 penalty per outstanding radl to each player's final score.

**Fix direction:** In the session-end path (wherever final scores are tallied and the session is closed out), iterate over each player's `radli` count and subtract 100 × radli from their score. Display the deduction in the final score breakdown so players can see why their total changed. Add a test asserting that a player with 2 outstanding radli at session end loses 200 points.

---

## Game Variants

### VAR-001 — 3-player variant
**Added:** 2026-07-01  
**Fixed:** —  
**Version:** —

**Problem:** Only the 4-player game exists. The 3-player Slovenian variant is a planned future mode (deliberately deferred until the 4-player game is solid — see CLAUDE.md *Out of scope*).

**Rule differences from the 4-player game (per pagat.com):**
- 16 cards dealt to each of 3 players, in packets of 8 (talon still 6)
- No calling a king — declarer always plays alone
- Contracts `three`/`two`/`one` are solo by definition; no king-ultimo bonus
- Klop only playable if all three players pass
- Captured-mond penalty is a flat 21 instead of 20

**Fix direction:** Give it its own engine pass rather than parameterizing the 4-player engine preemptively (per CLAUDE.md). Needs a player-count setting at game setup, its own bidding ladder handling, AI adjustments (no partner logic), and the full per-contract win/loss test coverage required by the testing policy.

---
