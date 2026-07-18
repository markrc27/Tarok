# Lessons Learned — Tarok v1.0.0 → v1.3.1

A retrospective on what could have been done better at each stage of development,
covering both how to write better agent/CLAUDE.md files and how to prompt more
efficiently during development sessions.

---

## Quick Reference — Principles to Apply Every Time

### Before Starting a Project
1. **Write the rules in the agent file first.** For any rules-based system, put the authoritative spec (win conditions, formulas, edge cases) in CLAUDE.md before writing a line of code. Re-deriving rules mid-session is the biggest time sink.
2. **List every feature and its edge cases upfront.** A table of "contracts and their unique behaviours" would have driven completeness from v1.0.0 instead of discovering gaps through live play across 13 versions.
3. **Document the build and release workflow once.** Version bump → test → commit → push → build → release. Write it down so it never needs to be re-explained.

### While Building
4. **Build one layer at a time, test before moving to the next.** Engine → tests → AI → tests → UI. Doing everything at once (as at v1.0.0) produces a batch of bugs that are invisible until play reveals them one by one.
5. **Write tests for every rule sentence.** "Unannounced bonus on a lost hand = +value" is one sentence in the rules and one test. If the rule is specific enough to implement, it's specific enough to test.
6. **For every contract with unique rules: one win test, one loss test.** The valat win condition bug and the colour valat engine bugs all lived from v1.0.0 to v1.3.1 because no test constructed those scenarios.
7. **When you fix AI behaviour for a contract, verify the engine for that contract too.** The `effectiveIsTrump` AI fix at v1.3.0 looked complete but the engine flag (`isColourValat`) was never set. Always check both layers.
8. **Activate every feature flag in a test.** If a boolean flag (like `isColourValat`) controls a major behaviour branch, at least one test must set it to `true` or the branch is untested dead code.

### When Reporting Bugs
9. **Paste the game log first, ask the question second.** The Copy Log button exists for this. Prose descriptions require a diagnostic round-trip; a log makes the bug immediately reproducible.
10. **When you find a bug in one contract, ask to audit all contracts.** Bugs in special contracts tend to cluster — checking colour valat, regular valat, beggar, and open-beggar in one pass would have caught all of v1.3.1's bugs during v1.3.0.
11. **Say whether it's a display bug or a logic bug.** "The score shown is wrong" vs "the score calculated is wrong" points to completely different files. State which you suspect.

### Each Session
12. **Decide the version number at the start.** Avoids mid-session confusion about what's been pushed and what the next release should be called.
13. **End with a "play all special contracts" check.** A 5-minute manual test of every non-standard contract (klop, beggar, open-beggar, colour valat, valat) after any engine change would have caught most of the bugs in this project before they reached a release.
14. **Add a UI resize check to every UI session.** Shrink the window and open every dialog. Status bar clip, talon scroll overflow, and bidding panel height were all caught late because this wasn't routine.

---

## General Principles (apply to every session)

### Agent File (CLAUDE.md)

**Put the game rules in the file.**
The single most costly omission across all sessions. Rules for flat vs. normal
contracts, win conditions, bonus eligibility, and the 35-point threshold were
re-derived from scratch in almost every session. A reference table like the one
below would have cut diagnostic time by ~30%:

```
CONTRACT TYPES
Flat (score = ±base, no bonuses, no threshold):
  beggar (70), open-beggar (90), solo-without (80),
  color-valat-without (125), valat-without (500)

Normal (score = ±(base + |diff|), bonuses apply):
  three (10), two (20), one (30),
  solo-three (40), solo-two (50), solo-one (60)

WIN CONDITIONS
  beggar / open-beggar:         declarer takes 0 tricks
  valat-without / color-valat-without: declarer wins ALL tricks
  color-valat-without:          taroks are a plain suit (isColourValat=true)
  all others:                   declarerPoints >= 36

SCORING FORMULA (normal contracts)
  gameValue = ±(contractBase + |roundToNearest5(declarerPts - 35)|) × kontra
  Unannounced achieved bonus: always +value (even on a loss)
  Opponent-won bonus: always -value from declarer
```

**Document the build and release workflow.**
Every session included some back-and-forth about whether to push, what version
to bump to, and how to build the installer. One section in CLAUDE.md would
eliminate all of it:

```
RELEASE WORKFLOW
1. Bump version in package.json (patch = x.x.+1)
2. npm test (must pass)
3. git add / commit / push origin master
4. npm run electron:build  →  C:\TarokBuild\Tarok Setup x.x.x.exe
5. Create GitHub release targeting the new tag (not the branch)
```

**List what IS and ISN'T tested.**
Knowing which paths had unit tests and which only had manual testing would have
flagged fragile areas before bugs were reported from live play.

### Prompting

**Lead with the game log, not a prose description.**
Every bug reported in plain text ("the scoring looks wrong for open beggar")
required a follow-up to establish what actually happened. The Copy Log button
exists precisely for this — paste the log first, ask the question second.

**When you find a bug in one contract, audit all contracts.**
Multiple bugs were found one at a time across sessions because each was only
checked when a player happened to play that contract. A single "verify all
special contracts work end-to-end" prompt would have caught the isColourValat,
valat win condition, and tarok comparison bugs in one pass.

**Decide the version number at the start of the session.**
The 1.2.4 / 1.2.5 confusion burned a full exchange. Open each session with:
"next push will be X.Y.Z, and it's a [patch/minor/major] because ___."

**Distinguish display bugs from logic bugs explicitly.**
Several bugs were described by what was shown on screen. "Is the score actually
calculated wrong, or just displayed wrong?" is a faster starting point than
describing the symptom and waiting for diagnosis.

---

## Version-by-Version Lessons

### Initial Commit (v1.0.0)

**What was built:** Full 4-player game engine, bidding, talon, king call, play,
scoring, AI, score dialog, copy log, setup screen — all in one commit.

**What went wrong:** The next commit was a 5-bug critical fix. Implementing
everything at once with no incremental testing made all those bugs invisible
until play revealed them.

**What to do instead:**
- Build and test one subsystem at a time: engine first, then AI, then UI.
- Write tests for each layer before moving to the next.
- A "does a full hand complete without crashing?" smoke test would have caught
  the bot crash, talon discard bug, and radli double-apply in the first session.

---

### Critical Bug Fix (post-v1.0.0)

**What was fixed:** Talon discard not seeding capturedCards; radli applied
twice; partner display undefined for past rounds; bot crash on stale timer;
chooseCard returning undefined silently; StatusBar fields missing.

**Root cause:** No unit or integration tests existed. All bugs were found
through play.

**Lessons:**
- Write tests alongside code, not after bugs are reported.
- The bot crash (`chooseCard` returning undefined) would have been caught
  immediately by any test that exercised the AI. Guard clauses and throws
  belong in the initial implementation.
- At this point the team also wrote AGENT.md documenting test invariants —
  but writing it *after* the bugs is the wrong order. Write it *before*.

---

### UI Polish (card sizing, layout, game log)

**What was built:** Card scaling, layout tuning, game log in ScoreDialog,
copy log button, announcements dialog cleanup.

**Lesson:**
- UI responsiveness (wrapping, overflow, scroll) is hard to specify upfront
  but easy to verify with a "shrink the window as small as it goes and check
  every dialog" prompt. This exact check caught the status bar wrap issue and
  talon dialog overflow many versions later (v1.2.4) — it should have been
  standard practice from the first UI session.

---

### Klop and Beggar Bot AI (pre-v1.1.1)

**What was built:** Contract-specific AI for Klop and Beggar; contracts help
section updated.

**Lesson:**
- Special-contract AI was added reactively (someone played Klop and the bots
  played badly). All contract types and their AI requirements should have been
  listed upfront in the agent file. A table of "contracts with unique AI logic
  needed" at the start would have driven completeness:

  ```
  klop:               avoid winning tricks
  beggar:             declarer plays lowest; opponents try to force wins
  open-beggar:        opponents can see declarer's hand (add in v1.3.0!)
  color-valat-without: taroks are not trumps (added in v1.3.0, broken until v1.3.1)
  valat-without:      must win every trick (win condition bug until v1.3.1)
  ```

---

### Positive-Contract Bot AI and Partner Awareness (pre-v1.1.1)

**What was built:** Opponents lead high; ally-wins dump-low; enemy-wins
commit/efficient beater; point-counting fold; knownPartner only revealed once
called king appears in a trick.

**Lesson:**
- The knownPartner concept (bots don't know the partnership until the king is
  publicly played) is a subtle rule that required significant refactoring when
  added. It should have been in the initial AI spec — the rule is clearly stated
  in the pagat.com docs.
- General pattern: *the interesting edge cases in Tarok rules are always in
  pagat.com*. Any feature touching game rules should start with "what does
  pagat.com say about this?"

---

### Void-Deal Rule (pre-v1.1.1)

**What was built:** When any player is dealt no taroks, redeal with same
dealer; show notification; set compulsory klop floor.

**Lesson:**
- This was an entire game rule that was simply missing. It was caught because
  a player happened to get a no-tarok hand. A "rules completeness checklist"
  in the initial agent file — listing every named rule from pagat.com — would
  have flagged it before the first game was played.

---

### Tests Added (pre-v1.1.1)

**What was built:** 28 unit tests for play-heuristic; computeKnownPartner moved
to a testable module.

**Lesson:**
- Tests came after at least 3 sessions of bug-fixing. The correct order is:
  engine code → tests → AI code → tests → UI.
- The test helper `suit('hearts', 7)` caused a silent failure later (rank 7 is
  a black rank, not valid for red suits — suitStrength returned 0 making the
  test pass for the wrong reason). Type-safe test helpers that enforce valid
  card combinations should be established once and reused.

---

### v1.1.1 — Bot AI Improvements, Game Log, Radli Display

**What was fixed / added:** Best talon group selection; discard highest-value
cards; avoid calling a king in the talon; radli projected count; partner hidden
label; kontra multiplier on game line; called king reveal banner.

**Lessons:**
- The kontra multiplier on the game line being missing is a scoring display
  bug. The formula was in the code but not in the display. Having a "display
  checklist" for ScoreDialog that maps every component of the score formula to
  a line in the breakdown would catch this class of bug at implementation time.
- The radli display (showing pre-hand count instead of post-hand) was a UX
  confusion rather than a logic bug. Specifying *exactly* what each UI field
  represents ("projected after this hand" vs "current before this hand") in
  the agent file avoids this.

---

### v1.1.3 — Scrollable History Tables, Called King Suit Name

**What was built:** 4-row max history tables with scroll; suit symbol in king
call display; P1–P4 headers.

**Lesson:**
- Small UX improvements discovered through use. Hard to fully predict, but a
  "play 5 full rounds and note anything confusing in the UI" prompt at the
  end of any development session surfaces these systematically rather than
  one at a time.

---

### v1.2.3 — Scoring Sign/Bonus Bugs

**What was fixed:**
1. Unannounced bonuses were negated when the hand was lost (should always be +)
2. Game magnitude on a loss used signed difference instead of |difference|
3. Opponent-won bonuses didn't subtract from the declarer

**Root cause:** The scoring formula was implemented from a partial understanding
of the pagat.com rules. All three bugs are clearly stated in the rules.

**Lessons:**
- These three bugs lived in the codebase from the initial commit and weren't
  caught until much later because no test exercised a "lost hand with an
  unannounced bonus" or "opponent wins Trula" scenario.
- The fix required a medium-sized refactor (new `won` parameter, new
  `opponentBonusResults` computation, new `side` field on bonusBreakdown).
  Implementing the scoring engine correctly from the pagat.com spec the first
  time would have been easier than the refactor.
- **Key lesson:** For rules-based games, implement the scoring system from the
  authoritative rules document, not from intuition. Write a test for every
  rule sentence: "achieved bonus on a lost hand = +value" → test it.

---

### v1.2.4 — Version Display, Status Bar Wrap, Talon Scroll, Bidding Panel

**What was built:** Version number in menu bar, start screen, about dialog;
status bar wraps instead of clipping; talon dialog scrollable; all 12 contracts
shown (grayed if unavailable).

**Lessons:**
- Status bar clipping and talon dialog overflow were layout bugs that would
  have been caught by a "resize the window to 800×600 and play a round"
  prompt. Add this to any UI review session.
- Showing version number in multiple places was triggered by confusion between
  the browser version and the desktop installer version. If the release workflow
  had been documented (browser deploys from `npm run dev`; installer from
  `npm run electron:build`), this confusion wouldn't have arisen.

---

### v1.3.0 — AI Logic Gaps, Flat Contract Display

**What was built:**
- Open Beggar: opponents use smart lead strategy with visible declarer hand
- Colour Valat: `effectiveIsTrump` helper in AI
- Valat: opponents never fold
- Flat contracts: score breakdown shows base only, no bonus lines

**Lessons:**
- All three AI gaps (Open Beggar, Colour Valat, Valat fold) were discovered by
  the user asking "do bots handle X?" — not by any test. The contract AI
  completeness table mentioned above would have driven all of these at the same
  time.
- The `effectiveIsTrump` fix in the AI heuristic was correct but didn't reveal
  that `isColourValat` was never *set* in the game engine. Fixing AI behaviour
  for a contract without verifying the contract's engine state is a half-fix.
  Any AI fix should be followed by "now actually play a hand of this contract
  and verify the engine behaves correctly."
- Flat contract display was broken from the initial scoring implementation
  because the display code didn't distinguish flat from normal contracts. A
  "what does the score dialog show for a beggar?" prompt after v1.0.0 would
  have caught this immediately.

---

### v1.3.1 — Colour Valat and Valat Engine Bugs

**What was fixed:**
1. `isColourValat` hardcoded to `false` — colour valat rules never applied
2. Tarok-vs-tarok comparison used `card.kind === 'suit'` (always false for
   trumps), so the first tarok played always won regardless of ordinal
3. Valat win condition was `declarerPoints >= 36` instead of all-tricks

**Root cause for all three:** No integration test or end-to-end verification
for special contracts. The bugs were present from the initial commit and only
surfaced when the user played those contracts live.

**Lessons:**
- `isColourValat = false` is the canonical example of a feature flag that was
  wired through the entire engine but never activated. A one-line test —
  "play a colour valat hand and verify a trump cannot win a suit trick" — would
  have caught it at v1.0.0.
- The tarok comparison bug is exactly the kind of thing that looks correct on
  code review (the `isColourValat` branch exists, it handles the demoted suit
  case) but is wrong in subtle type-level detail. Tests beat code review for
  this class of bug.
- The valat win condition would have been caught by any test that constructed
  "declarer lost one trick but has 50+ points" and asserted the score is -500.
- **Pattern:** For every contract with unique rules, write at least one test
  that exercises the "win" path and one that exercises the "loss" path before
  shipping.

---

## Recommended CLAUDE.md Additions for Future Sessions

```markdown
## Game Rules Reference

### Contract Types
| Contract          | Base | Type   | Win Condition          | Bonuses |
|-------------------|------|--------|------------------------|---------|
| klop              | —    | klop   | individual card pts    | no      |
| three/two/one     | 10/20/30 | normal | ≥36 card pts       | yes     |
| solo-three/two/one| 40/50/60 | normal | ≥36 card pts       | yes     |
| beggar            | 70   | flat   | 0 tricks taken         | no      |
| solo-without      | 80   | flat   | ≥36 card pts           | no      |
| open-beggar       | 90   | flat   | 0 tricks taken         | no      |
| color-valat-without| 125 | flat   | ALL tricks won         | no      |
| valat-without     | 500  | flat   | ALL tricks won         | no      |

### Scoring Formulas
Normal: ±(base + |roundToNearest5(declarerPts − 35)|) × kontra
Flat:   ±base  (no threshold, no bonuses)

Unannounced achieved bonus: always +value (even on a loss)
Opponent-won unannounced bonus: −value from declarer

### Special Engine Flags
color-valat-without → isColourValat=true (taroks are a plain suit, not trumps)

### Release Workflow
1. Bump version in package.json
2. npm test (must all pass)
3. git commit + push origin master
4. npm run electron:build → C:\TarokBuild\Tarok Setup x.x.x.exe
5. GitHub release → create tag V{version}, target master, upload .exe only

### Contract AI Requirements
- klop: avoid winning tricks
- beggar (declarer): always play lowest
- beggar (opponent): lead high; follow low if declarer winning
- open-beggar (opponent): can see declarerHand; lead suits that force wins
- color-valat-without: taroks are not trumps in AI logic (effectiveIsTrump)
- valat-without / color-valat-without: opponents never fold

### Test Coverage Requirements
For every contract: one "declarer wins" test and one "declarer loses" test
through computeHandScore. For every contract with unique trick rules: one test
that the correct card wins the trick.
```
