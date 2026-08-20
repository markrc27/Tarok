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

### ENG-002 — Uncancelled-radli session-end penalty (−100 each) is never applied
**Added:** 2026-08-20
**Fixed:** —
**Version:** —

**Problem:** Per CLAUDE.md/AGENT.md, any radli still uncancelled when a
session ends should cost the holder −100 points each. The math exists —
`radliEndOfSession()` in `src/engine/scoring.ts` (correctly computes
`-(uncancelled × 100)` per seat) — and is unit-tested in isolation in
`tests/scoring.test.ts`. But nothing in the actual game flow ever calls it.

**Evidence:** Traced every session-ending path in `store.ts`:
- `endGameFromMenu` (the "New Game"/end-session action) builds
  `finalScores: { ...sessionScores }` — a flat copy, no radli deduction —
  before saving to history and posting to the leaderboard.
- The other `finalScores` computation (inside the per-hand completion path)
  is `sessionScores[seat] + delta[seat]`, also with no radli involvement.
- There is no Škis-round mechanic at all to even detect "the session has
  ended." `src/engine/session.ts` is an empty stub:
  `// Škis-round session-end logic is not yet implemented.` The CHANGELOG
  (CQ-004) shows the original session stubs (`initSession`, `initSkisRound`,
  `shouldEndSession`, `nextDealer`, `applyMisdeal`) were deliberately
  *removed* as dead code in a past cleanup and never rebuilt.

Net effect: any uncancelled radli a player is carrying when they click "New
Game" today just vanish — no penalty, no Škis-round prompt to determine
when the session should even end. The rule is documented in CLAUDE.md,
AGENT.md, and both in-app Rules/Score dialogs, but unenforced in play.

**Fix direction:** Two parts, and the first is the harder design question:
1. Implement the Škis-round session-end trigger (see AGENT.md *Ending a
   session*): when the player chooses to end, play one final hand, note who
   holds the Škis, and continue the session until that player's next turn
   to deal (redo the Škis round if the Škis was in the talon instead).
   `endGameFromMenu` currently ends immediately on click with no such
   mechanic — needs a decision on how this surfaces in the UI (a
   confirmation flow, most likely, since it changes when "New Game"
   actually finalizes the session).
2. Once session-end is detected, call `radliEndOfSession(radliState)` and
   fold its per-seat result into `finalScores` before `saveGameRecord`/
   `postGameToApi` — both call sites (`store.ts` `finalScores` blocks) need
   the same treatment, matching the "all scoring call sites" testing
   invariant in CLAUDE.md. Add an integration test asserting a session
   ending with N uncancelled radli on a seat reduces that seat's recorded
   `finalScores` by `N × 100`.

**Files to modify:** `src/engine/session.ts` (Škis-round detection —
currently an empty stub), `src/state/store.ts` (`endGameFromMenu` and the
other `finalScores` call site), `tests/integration.test.ts` (session-end
radli penalty test).

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

### UI-002 — Leaderboard difficulty tabs (Easy / Hard)
**Added:** 2026-07-22
**Fixed:** —
**Version:** —

**Problem:** Easy and Hard scores are mixed in the leaderboard, making it impossible to compare like-for-like. A player on Hard shouldn't be competing against Easy scores.

**Fix direction:** Add an Easy / Hard tab selector at the top of the Leaderboard dialog. Each tab filters the results to that difficulty only — the underlying `GET /api/games` endpoint already returns the `difficulty` field, so this is a client-side filter. Default to the tab that matches the player's current difficulty setting. Remove the difficulty column from the table (it's redundant once tabs separate the two lists).

---

### UI-001 — Show difficulty level in the top banner
**Added:** 2026-07-22
**Fixed:** —
**Version:** —

**Problem:** There is no visible indicator of the current difficulty setting during play. Players have to open the Options dialog to check.

**Fix direction:** Display the current difficulty ("Easy" / "Hard") in the menu bar or status bar area at the top of the screen, alongside the existing version/menu items. Should update immediately if the player changes difficulty mid-session via Options.

---

### UI-003 — Mobile responsive layout
**Added:** 2026-07-23
**Fixed:** —
**Version:** —

**Problem:** The game is unplayable on phone-sized screens. Cards are fixed at 90×135px, the human hand container is hardcoded to 640px, and the trick area is 480px wide — all overflow a 375px viewport. The menu bar (24px) is below the 44px touch-target floor.

**Scope:** CSS/layout pass only. No logic, state, or backend changes.

**Fix direction:** Introduce a `useCardLayout()` hook (continuous clamp math from viewport width) that returns fluid `cardW/cardH/handStep/aiStep` values, sets `--card-w`/`--card-h` CSS custom properties, and is wired through `Hand.tsx` and `App.tsx`. CSS-only fixes for: trick area width (`clamp`), card font scaling (derive from `--card-w`), menu bar height (44px on mobile), status bar (nowrap + horizontal scroll), bid panel (centered, max-height leaves hand visible), seat margins. Primary test device: iPhone 13 mini (375×812). Also verify on iPad (no change expected above 640px breakpoint).

---

## UI / About & Leaderboard

### UI-008 — Add Mark's name to About section credits
**Added:** 2026-08-04
**Fixed:** —
**Version:** —

**Problem:** The About section credits Claude but not Mark.

**Fix direction:** Add Mark's name alongside Claude in the About dialog credits.

---

### UI-009 — Silver/bronze medal icons for 2nd and 3rd place on leaderboard
**Added:** 2026-08-04
**Fixed:** —
**Version:** —

**Problem:** The leaderboard has gold/1st-place treatment but no visual distinction for 2nd and 3rd place.

**Fix direction:** Add silver and bronze medal icons (matching the existing gold/1st-place style) to the 2nd and 3rd place rows.

---

### UI-010 — Leaderboard: only count sessions where player finished 1st overall
**Added:** 2026-08-04
**Fixed:** —
**Version:** —

**Problem:** The leaderboard currently includes all games regardless of final session placement, which incentivises stacking Radli and coasting for one big double-score hand rather than actually winning the session.

**Fix direction:** Filter leaderboard entries so only sessions where the player finished 1st place overall (session-level, not per-round) count toward their score. Add a UI note near the leaderboard: "Must win the game for score to place on the leaderboard." The non-qualifying sessions remain visible in Game History.

---

## UI / Game History

### UI-011 — Add "player final rank" column to Game History
**Added:** 2026-08-04
**Fixed:** —
**Version:** —

**Problem:** After the leaderboard filter (UI-010) excludes non-1st-place sessions, those hands are no longer visible on the leaderboard. Game History should still expose top scores with visibility into where the player actually finished.

**Fix direction:** Add a "Final Rank" column (1st/2nd/3rd/4th) to the Game History window so non-qualifying sessions can still be reviewed in context.

---

### UI-012 — Game History: sortable columns
**Added:** 2026-08-04
**Fixed:** —
**Version:** —

**Problem:** Game History currently only supports sorting by date.

**Fix direction:** Make all columns sortable (score, contract, declarer/partner, final rank once UI-011 is added) using the same click-to-sort interaction as the existing date column.

---

## UI / Cross-Platform Bugs

### UI-013 — Scores section not expandable on mobile (touch/click handling)
**Added:** 2026-08-04
**Fixed:** —
**Version:** —

**Problem:** Expanding a previous round in the scores section requires clicking exactly on the "Round X" text — the hit target is too small, especially on mobile where precision tapping is harder.

**Fix direction:** Widen the clickable/tappable area for the round row (e.g. make the full row the click target, not just the text label). Ensure the touch target meets the 44px minimum on mobile.

---

## UI / Messaging

### UI-014 — Compulsory-klop forehand-choice message misstates the trigger
**Added:** 2026-08-20
**Fixed:** —
**Version:** —

**Problem:** When a compulsory klop reaches the human forehand's contract
choice (all three other seats passed), the dialog reads
"Compulsory klop — all others passed. Play Klop, or declare Solo Without or
higher." This conflates two independent facts and implies the *all-pass*
caused the compulsory klop, which is wrong. Per AGENT.md, compulsory klop is
triggered by **a player's cumulative score landing exactly on zero**, or by a
no-trump redeal (void deal). The all-pass is only why the *forehand* is the
one now choosing — it has nothing to do with why the hand is a compulsory
klop.

**Evidence:** Reported session (screenshot, Round 8): scores Mark +110,
Vesna +85, Katja −75, Matic **+0**. Matic went from −35 back to exactly 0 in
the previous round, which is what triggered the compulsory klop. The dialog
still said "Compulsory klop — all others passed," leading the player to think
the passing caused it.

**Fix direction:** Split the two messages in the forehand-choice dialog when
`isCompulsoryKlop`. State the real trigger first — "Compulsory klop: a
player's score hit zero" (or "…after a no-trump redeal" when `voidDealSeat`
is set) — then, separately, "All others passed — play Klop or declare Solo
Without or higher." Reuse the wording already used by the bidding-phase
banner in `App.tsx` (score-hit-zero vs. void-deal). While here, confirm the
forehand-choice list is actually restricted to the compulsory-klop floor
(klop + solo-without and above); today `App.tsx` passes the full contract
list to the forehand-choice `BiddingDialog` and does not forward
`isCompulsoryKlop`, so three–beggar are not greyed out as they should be.

**Files to modify:** `src/ui/App.tsx` (forehand-choice `BiddingDialog` props:
forward `isCompulsoryKlop` and restrict `legalBids`),
`src/ui/dialogs/BiddingDialog.tsx` (forehand-choice message text for the
compulsory-klop case).

---

## Documentation

### DOC-001 — AGENT.md: "Calling a king" subsection is out of order relative to "Talon exchange"
**Added:** 2026-08-20
**Fixed:** —
**Version:** —

**Problem:** In AGENT.md's "Domain rules reference," under Bidding, the
`### Calling a king` subsection is written *before* the `### Talon exchange`
subsection. That's backwards from both actual play order and the engine's
implementation: in `store.ts`, both the human flow
(`chooseTalonGroup`/`applyDiscard` → `phase: 'king-call'`) and the bot flow
(`botTalon`) resolve the talon exchange first, then call the king against
the post-discard hand — you can't sensibly call a king before seeing/
exchanging the talon. AGENT.md's own Roadmap section (item 3:
"`engine/talon.ts`, calling a king") already lists them in the correct
order, so the Domain rules section currently contradicts the Roadmap
section within the same file.

**Fix direction:** Swap the two subsections so the section reads
Bidding → Talon exchange → Calling a king → Announcements, matching actual
gameplay, the code, and the Roadmap section's existing ordering.

---

### DOC-002 — In-app Rules dialog section order doesn't follow gameplay order, hurting learnability
**Added:** 2026-08-20
**Fixed:** —
**Version:** —

**Goal:** A newcomer opening Help → Rules should be able to read top to
bottom and end up with the sections landing in the order they'll actually
encounter them at the table. Right now the order actively works against
that.

**Problem:** `HelpDialog.tsx`'s `SECTIONS` array is currently ordered:
Introduction → Cards → **Contracts** → **Bonuses** → Deal → **Bidding** →
**Calling a King** → **Announcements** → **Talon Exchange** → Play →
Scoring → Radli → 3-Player → Variations.

Three problems, in order of how confusing they are to a first-time reader:

1. **Contracts is stranded before Bidding** (position 3 vs. 6) — a
   newcomer reads a list of contract names and base scores before being
   told what bidding even is or how a contract gets chosen.
2. **Bonuses is stranded before Announcements** (position 4 vs. 8) — same
   problem: bonus values are presented before the announcement mechanic
   that makes them relevant (unannounced vs. announced/doubled, kontra).
3. **Calling a King (7) comes before Talon Exchange (9), with
   Announcements (8) sandwiched between them.** This is the same ordering
   bug as DOC-001, but worse here because it implies Announcements happens
   between king-calling and the talon exchange. Actual gameplay order,
   confirmed in `store.ts` (`chooseTalonGroup`/`applyDiscard` →
   `phase: 'king-call'` → `advanceToAnnouncing`), is: Talon Exchange →
   Calling a King → Announcements.

**Fix direction:** Reorder `SECTIONS` to: Introduction → Cards → Deal →
Bidding → Contracts → Talon Exchange → Calling a King → Announcements →
Bonuses → Play → Scoring → Radli → 3-Player → Variations. Pure reorder of
existing section content — no copy changes needed. Covers the same
gameplay-order principle as DOC-001, applied to player-facing content
instead of the agent spec; do both in the same pass since they're the same
underlying fix (talon-before-king-call) plus the contracts/bonuses
placement.

**Files to modify:** `src/ui/dialogs/HelpDialog.tsx` (`SECTIONS` array
order only).

---

## Game Variants

### VAR-001 — 3-player variant
**Added:** 2026-07-01  
**Fixed:** 2026-08-05  
**Version:** v1.6.0

**Problem:** Only the 4-player game exists. The 3-player Slovenian variant is a planned future mode (deliberately deferred until the 4-player game is solid — see CLAUDE.md *Out of scope*).

**Rule differences from the 4-player game (per pagat.com):**
- 16 cards dealt to each of 3 players, in packets of 8 (talon still 6)
- No calling a king — declarer always plays alone
- Contracts `three`/`two`/`one` are solo by definition; no king-ultimo bonus
- Klop only playable if all three players pass
- Captured-mond penalty is a flat 21 instead of 20

**Fix direction:** Give it its own engine pass rather than parameterizing the 4-player engine preemptively (per CLAUDE.md). Needs a player-count setting at game setup, its own bidding ladder handling, AI adjustments (no partner logic), and the full per-contract win/loss test coverage required by the testing policy.

---
