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
