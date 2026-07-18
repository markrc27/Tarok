# CLAUDE.md — Tarok (Slovenian Card Game)

The authoritative agent file. Full rules prose: `AGENT.md`; ambiguous
rules: **pagat.com is authoritative**. Rationale for the process rules:
`LESSONS_LEARNED.md`. Deferred work: `BACKLOG.md`.

## What this is

Single-player 4-player Slovenian Tarok vs three AI bots. Vite SPA, no
backend; state in memory, session history in `localStorage`. Ships as a
browser app (`npm run dev`) and a Windows Electron installer
(`npm run electron:build` → `C:\TarokBuild\`). Look and feel mimics the
old Microsoft Hearts app: minimal chrome, green felt, modal dialogs for
decisions, status bar, plain Statistics scoreboard. In-game info panels
are floating dark panels — no full-screen dimming, no redundant close
buttons. Card backs: one stylized Lake Bled inline SVG; faces: plain suit
symbols / roman numerals. The rules engine is the real product; the UI just presents its decisions.

## Session workflow

1. **Decide the version at the start**: "next push is X.Y.Z, a
   patch/minor/major because ___." Patch bump (x.x.+1) before every push;
   minor/major are the user's call.
2. **Bug reports: get the game log first** (Copy Log button), and establish
   display bug (ScoreDialog/StatusBar) vs logic bug (engine).
3. **A bug in one contract → audit all special contracts** (klop, beggar,
   open-beggar, solo-without, colour valat, valat), in both engine and AI —
   an AI fix without verifying the engine flag is a half-fix.
4. **After engine changes**: play every special contract end-to-end or
   cover it with the per-contract tests below. **After UI changes**: resize
   to 800×600 and open every dialog.

## Release workflow

```
1. Bump version in package.json (patch = x.x.+1)
2. npm test && npm run build   (both must pass)
3. git add / commit / push origin master
4. npm run electron:build      → C:\TarokBuild\Tarok Setup x.x.x.exe
5. GitHub release: tag V{version}, target master, upload the .exe only
```

## Stack and layout

TypeScript (strict) · React 19 · Vite · Vitest · Zustand · Electron ·
Node 20+. Cards are absolutely-positioned DOM nodes with CSS transforms —
no Canvas, no animation library. No env vars, no secrets.

```
/src/engine   pure rules, zero UI/React/DOM imports:
              deck, deal, bidding, talon, play, announce, scoring,
              pointcount (implement/test FIRST — everything is downstream)
/src/ai       bot heuristics — legality always via /engine, no shortcuts
/src/ui       React components (Table, Hand, dialogs, StatusBar, MenuBar)
/src/state    Zustand store wiring UI → engine
/tests        one suite per engine module + integration tests
/electron     main.cjs
```

Imports flow one direction: `ui` → `state` → `engine`. No rule logic in
React components — extract to a pure function, test it, then wire it in.
Commands: `npm run dev` (5173) · `npm test` (single run, the CI gate) ·
`test:watch` · `build` · `preview` · `electron:dev` · `electron:build`.

## Contract quick reference

The completeness checklist: every row needs engine support, AI support, and win+loss tests. Fixing anything contract-specific → sweep the whole row.

| Contract | Base | Type | Win condition | Unique behaviour |
|---|---|---|---|---|
| klop | — | individual | see formulas | must-beat + Pagat restriction; AI avoids tricks |
| three / two / one | 10/20/30 | normal | ≥36 pts | calls king; talon 3/2/1; three+klop are Forehand-only all-pass |
| solo three/two/one | 40/50/60 | normal | ≥36 pts | alone; talon 3/2/1; may upgrade to colour valat after exchange |
| beggar | 70 | flat | 0 tricks | must-beat + Pagat restriction; declarer leads; AI: declarer lowest, opponents force wins |
| solo without | 80 | flat | ≥36 pts | no talon; **mond penalty still applies** |
| open beggar | 90 | flat | 0 tricks | declarer's hand exposed after trick 1; opponent AI uses it |
| colour valat without | 125 | flat | ALL tricks | `isColourValat=true`: taroks are a plain suit; declarer leads; AI `effectiveIsTrump`, never fold |
| valat without | 500 | flat | ALL tricks | declarer leads; opponents never fold |

Bug-proven distinctions: flat-scored ≠ no threshold (solo-without is flat
but won by ≥36 pts); mond penalty applies in solo-without only among flat
contracts; `isColourValat` must actually be set (it was hardcoded `false`
until v1.3.1).

## Scoring formulas

```
Normal:  ±(base + |roundToNearest5(declarerPts − 35)|) × kontra
         (magnitude uses |difference| on a loss too — never signed)
Flat:    ±base × kontra   (no difference, no bonuses)

Bonuses (normal contracts only; each has its own kontra multiplier):
  trula 10/20 · kings 10/20 · king ultimo 10/20 (King-holder announces)
  pagat ultimo 25/50 (Pagat-holder announces) · valat 250/500 (cancels others)
  Declarer's side, unannounced+achieved: +value — even on a lost hand
  Announced: ±2×value · Opponents achieve one: −value from declarer's side
  Ultimos fail negatively: pagat/called king played to the LAST trick but beaten → −value (−2× announced), even unannounced
Kontra chain: kontra ×2 → rekontra ×4 → subkontra ×8 → mordkontra ×16,
  tracked PER TARGET (game and each announced bonus independently); only
  allowed when public info proves the actor isn't kontra'ing their own side.
Radl:  declarer holds ≥1 uncancelled radl → whole hand score ×2 (win or
  loss); a win cancels one radl. All players gain a radl on klop, any
  beggar-or-higher contract, or any valat. Apply exactly once per hand.
  Session end: 100 pts per uncancelled radl.
Mond penalty: −20 to the individual whose Mond fell to the Škis (or was
  left in the unchosen talon). Never doubled. Own line in score breakdown.
Klop: per-individual — >35 pts → −70; 0 tricks → +70; else −round5(pts).
  No bonuses/kontra. Talon: one card exposed per trick T1–T6, taken by the
  trick winner ("vitamin") — NOT yet implemented, see ENG-001 in BACKLOG.
Declarer+partner otherwise share one fate (same credit/debit each).
```

Worked examples (encode as tests in `tests/scoring.test.ts`): solo two,
48 pts, unannounced trula, one radl → (50+15+10)×2 = **+150**, radl
cancelled. Two, 31 pts (loss), opponents take all kings → −(20+5)−10 =
**−35** each. Valat without, 60 pts, one trick lost → **−500**.

## Rules gotchas (full prose in AGENT.md)

- **Point counting** (`pointcount.ts`): groups of 3, sum minus 2 per group;
  leftover 1–2 cards = points minus 1. Grouped over the WHOLE pile, not
  per-trick. Pack total 70. Kings/trula 5, Q 4, Kn 3, J 2, rest 1.
- **Deck**: red suits rank 1–4 + courts (no 7–10 — `suit('hearts', 7)` is
  an invalid card; use type-safe test constructors). Trumps I–XXI + Škis.
- **Trump comparison is by ordinal** — never suit-card logic (`card.kind
  === 'suit'` is always false for trumps; caused first-tarok-always-wins).
- **Deal**: anticlockwise, packets of 6, talon (6) first, 12 cards each.
  Zero-trump hand → redeal by same dealer → compulsory klop.
- **Bidding**: Forehand (dealer's right) has highest priority and may match
  a bid rather than raise; three passes end the auction. All-pass →
  Forehand alone may pick klop or three. Compulsory klop (score exactly 0
  or no-trump redeal): ladder three–beggar removed; all pass solo-without →
  klop must be played.
- **Called king**: holder is a silent secret partner; calling your own king
  is legal (AI shouldn't). King in talon → declarer alone, unless the
  chosen group had it and declarer wins a trick with it (then talon
  remainder + discards go to declarer).
- **Talon**: never discard Kings or trula; trumps only if unavoidable and
  shown face-up. Discards go to declarer's pile; unchosen remainder to
  opponents (hidden until partnership revealed).
- **Play**: follow suit, else must trump. Emperor trick: Škis+Mond+Pagat in
  one trick → Pagat wins. Negative contracts (klop, beggars): must beat the
  current best card if able; Pagat only as forced last resort.
- Up through solo one, **Forehand leads trick 1**; beggar and above,
  declarer leads. Škis round (session end) and misdeal: see AGENT.md.
- StatusBar field semantics must be exact (radli shows "projected after
  this hand"). Version number appears in menu bar, start screen, About.

## AI opponents

Simple and inspectable, Hearts-style — no solver. Bidding: trump count +
high-card points → highest safe contract. Play: grab or starve points by
side; dump points in negative contracts. Legality always from
`/engine/play.ts`. Bots must not act on the partnership until the called
king has publicly appeared in a trick (`computeKnownPartner`). Contract-
specific AI per the quick-reference table. Difficulty is a config knob
(`difficultyBias`), not a separate architecture.

## Testing policy and invariants

`npm test` green before every push. Suites in `/tests`, one per engine
module plus integration. Rules that would have prevented most shipped bugs:

- **Every contract: one win test and one loss test** through
  `computeHandScore` (the valat ≥36-instead-of-all-tricks bug lived 13
  versions without this).
- **Every unique trick rule: a "correct card wins" test** (emperor trick,
  colour-valat demotion, tarok ordinals, must-beat).
- **Every boolean feature flag set `true` in at least one test** — an
  unactivated flag is untested dead code (`isColourValat`).
- **A test per rule sentence** — if it's specific enough to implement,
  it's specific enough to test.
- **Score display checklist**: every formula term (base, difference, each
  bonus + side, kontra, radl, mond penalty) maps to a line in ScoreDialog
  and the copy log — same commit as the formula change.

Hard invariants (must be automated tests before a feature is done):

- **Card conservation** (top priority), in `tests/integration.test.ts` for
  every hand variation: `countPoints(all capturedCards) +
  countPoints(talonRemainder) === 70`, and all hands empty after play. If
  it fails, the bug is in the pipeline, not the UI.
- **Talon → initPlay**: discards land in `capturedCards[declarer]` at t=0.
- **Talon remainder routing**: both `adjustCapturedForTalon` branches
  tested (normal → an opponent's pile; `kingInTalonCaptured` → declarer's).
- **Scoring zero-sum** (before mond penalty): declarerPts + opponentPts === 70.
- **Partner reveal** checks `currentTrick.cards` AND `completedTricks`
  (human's card sits in currentTrick for a render cycle) — do not simplify;
  covered in `tests/partner-visibility.test.ts`.
- **All scoring call sites** in `store.ts` and `ScoreDialog.tsx` use
  `effectiveCaptured`, never raw `capturedCards`.
- **Solo Two game-log regression test** in `tests/scoring.test.ts` guards
  the whole-pile grouping method.

## Out of scope / open decisions

Out of scope: 3-player variant (planned later — VAR-001 in `BACKLOG.md`;
own engine pass, don't parameterize preemptively), 5-player, networked
play, money-game scoring, pagat.com variant rules (piccolo, hirškontra…).
Open: test-coverage target; bot difficulty presets (Hard mode is BOT-003).
