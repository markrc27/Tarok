# AGENT.md — Tarok (Slovenian Card Game)

## What this is

A browser-based, single-player card game where the human plays the 4-player
Slovenian variant of **Tarok** against three AI opponents. It's a static
site — no backend, no accounts, no network calls — built as an SPA and
served from a flat `dist/` folder. Game state lives in memory; session
history persists to `localStorage`. The look and feel deliberately mimics
the **Microsoft Hearts** app that shipped with old Windows: minimal chrome,
green felt table, modal dialogs for decisions, plain scoreboard.

Tarok is mechanically much deeper than Hearts (bidding, calling a hidden
partner, exchanging with a talon, bonus announcements, doubling chains), so
most of the engineering effort goes into a correct, well-tested rules
engine. The UI's job is to present that engine's decisions in the plainest
possible way.

## Stack

Committed choices — don't substitute without updating this section first:

- **TypeScript** — strict mode, no implicit any
- **React** — UI shell and dialogs
- **Vite** — dev server and build
- **Vitest** — unit tests for the rules engine
- **Zustand** — single in-memory store for `GameState`
- **Node 20+** for tooling

Card sprites are rendered as absolutely-positioned DOM nodes with CSS
transforms — no Canvas, no game engine, no animation library beyond CSS
transitions.

See *Open decisions* at the end for things still up for grabs.

## File layout

```
/src
  /engine            # pure game logic, zero UI / React / DOM imports
    deck.ts          # 54-card deck, suits, trump ranking, point values
    deal.ts          # dealing, talon formation, no-trump redeal check
    bidding.ts       # auction priority rules, contract ladder, compulsory klop
    talon.ts         # exchange groups per contract, discard legality
    play.ts          # follow-suit/must-trump, trick resolution,
                     # emperor trick, captured-mond check
    announce.ts      # bonus announcements, kontra/rekontra/subkontra/mordkontra
    scoring.ts       # difference calc, bonus scoring, radli, klop scoring
    pointcount.ts    # the "groups of three, minus two" card-point counting rule
                     # — implement and test FIRST; everything downstream depends on it
  /ai                # bot decision modules (bidding heuristic, play heuristic)
                     # all decisions go through /engine for legality — no shortcuts
  /ui                # React components: Table, Hand, TrickArea, MenuBar,
                     # BiddingDialog, CallKingDialog, TalonDialog,
                     # AnnouncementDialog, ScoreDialog, StatusBar
  /state             # Zustand store + actions wiring UI to /engine
  /assets            # card face SVGs, table felt background
/tests               # one suite per /engine module, with hand-worked examples
                     # mirrors /src/engine structure
/public              # static files copied to dist/ as-is (favicon, etc.)
index.html
vite.config.ts
```

Imports flow one direction only: `ui` → `state` → `engine`. The `engine`
folder imports nothing from `ui`, `state`, or `ai`. If you find yourself
adding a React import inside `/engine`, stop — the rule belongs somewhere
else.

## Running locally

```
npm install
npm run dev      # Vite dev server at http://localhost:5173
npm test         # Vitest in watch mode
npm run test:ci  # single Vitest run, used in CI
npm run build    # produces dist/
npm run preview  # serves dist/ at http://localhost:4173 for smoke-testing the build
```

No env vars, no `.env` file, no secrets — if you're tempted to add one,
the answer is almost certainly that the feature doesn't belong here.

## Visual / UX reference ("the Hearts feel")

Match these conventions from the old Hearts app:

- **Table layout**: human seat at the bottom, three AI seats around the top
  (left, top, right). Each AI seat shows a simple name label and a small
  static avatar/icon — no animation, no chat bubbles.
- **Window chrome**: a single top menu bar — `Game` (New Game, Options,
  Statistics, Exit), `Help` (Rules, About). No toolbar, no sidebar.
- **Card movement**: a quick deal animation (cards fly out to each seat),
  then a simple slide+flip when a card is played to the trick area. No
  particle effects, no card "bounce," no skeuomorphic shadows.
- **Decisions surface as modal dialogs**, not inline UI: a Bidding dialog
  (radio buttons, ascending contract list, "Pass" button), a Call-a-King
  dialog, a Talon-exchange dialog (pick one of the exposed groups), an
  Announcements dialog (checkboxes for bonuses + Kontra button), and an
  end-of-hand Score dialog.
- **Status bar** at the bottom of the window: current contract, declarer,
  whose turn it is, card points counted so far.
- **Statistics screen**: a plain running score table, one column per player,
  reachable from the Game menu — this doubles as the persistent scoreboard
  described in the rules below (including the *radli* row).
- **Sound**: a couple of short, optional sound effects (deal, card play,
  hand-won chime), toggled in Options. Off by default is fine.
- **Card faces** (the side showing rank/suit) should be legible and simple:
  suit symbol (♣ ♠ ♥ ♦) with rank in the corners for suit cards; bold roman
  numerals (I–XXI) plus "ŠKIS" for the top trump for trump cards. Clarity
  over flavor — don't chase ornate art on the face side.
- **Card backs** use a single uniform **stylized Lake Bled** design —
  iconic Bled scenery reinterpreted as flat vector SVG (think travel-poster
  illustration, not a photo): the island church, Bled Castle on the cliff,
  the pletna boats, the Julian Alps. One design for all card backs. Custom
  inline SVG only — no image files shipped in `dist/`.

## Domain rules reference

This is the spec the engine must implement. It covers the 4-player game,
which is the default mode; the 3-player variant is **out of scope for
phase 1** — see *Roadmap* below.

### The deck

54 cards: four 8-card suits, plus 22 trumps ("taroks").

- **Black suits** (Clubs, Spades), high to low: King, Queen, Knight, Jack,
  10, 9, 8, 7.
- **Red suits** (Hearts, Diamonds), high to low: King, Queen, Knight, Jack,
  4, 3, 2, 1.
- **Trumps**, ranked I (lowest) through XXI, plus an unnumbered top trump
  called the **Škis**. So strength order is: Škis > XXI ("Mond") > XX > ...
  > II > I ("Pagat").

Card point values:

| Cards | Points |
|---|---|
| Kings | 5 |
| Škis, XXI (Mond), I (Pagat) | 5 |
| Queens | 4 |
| Knights | 3 |
| Jacks | 2 |
| Everything else | 1 |

Total pack value: 70 points. **Counting method is non-obvious — implement
carefully**: count a pile of cards in groups of 3, summing each group's
points and subtracting 2 per group; a leftover group of 1 or 2 cards is
worth its point total minus 1 (so a single 1-point card scores 0, but two
or three 1-point cards together score 1). Write this as
`countPoints(cards: Card[]): number` with unit tests against hand-worked
examples before anything else depends on it — most of the scoring layer
is downstream of it.

A positive contract is won by taking at least 36 of the 70 points.

### Deal

Dealt anticlockwise in packets of six, starting with a packet to the
**talon** (6 cards, face down, untouched until exchange), then six-card
packets to each player until each has 12 cards. Turn to deal rotates
anticlockwise each hand. (16 cards each is the 3-player variant, not this
game — 48 played cards / 4 players = 12, hence 12 tricks per hand.)

Special case: if a player is dealt **zero trumps**, they must show their
hand; the deal is voided, reshuffled, redealt by the same dealer, and the
new hand is forced into **compulsory klop** (see *Bidding*).

### Bidding

Player to dealer's right is **Forehand** and speaks last in priority order
(Forehand has highest priority, then anticlockwise down to the dealer who
has lowest). Players bid contracts from this ladder (ascending):

| Contract | Base score | Notes |
|---|---|---|
| klop | −(points taken), or 70 | Forehand-only, all-pass case; no bonuses |
| three | 10 + difference | Forehand-only, all-pass case; calls a king, takes 3 from talon |
| two | 20 + difference | calls a king, takes 2 from talon |
| one | 30 + difference | calls a king, takes 1 from talon |
| solo three | 40 + difference | plays alone, takes 3 from talon |
| solo two | 50 + difference | plays alone, takes 2 from talon |
| solo one | 60 + difference | plays alone, takes 1 from talon |
| beggar | 70 | plays alone, must take zero tricks |
| solo without | 80 | plays alone, no talon exchange |
| open beggar | 90 | beggar, but declarer's hand is exposed after trick 1 |
| colour valat without | 125 | plays alone, no talon, trumps demoted to a plain suit, must win every trick |
| valat without | 500 | plays alone, no talon, must win every trick |

"Difference" = (card points won − 35), rounded to the nearest 5.

Bidding rule: each player in turn either names a contract higher than (or,
if they outrank the previous bidder in priority, equal to) the last bid, or
passes. Once passed, a player is out for the rest of the auction. Auction
ends after three consecutive passes; the last bidder is **declarer**.

If the three non-Forehand players all pass without bidding, Forehand alone
may choose **klop** or **three** (these two contracts are otherwise
unavailable) or name anything higher.

**Compulsory klop** triggers when a player's cumulative score lands on
exactly zero, or after a no-trump redeal (see *Deal*). During compulsory
klop, the contract ladder from `three` through `beggar` is removed — the
floor is `solo without`, and if everyone passes that, **klop must be
played**.

### Calling a king (three / two / one contracts only)

Declarer names a suit; whoever holds that suit's King becomes declarer's
secret partner and says nothing. Partnerships can stay hidden well into the
play. A declarer may legally call a king they hold themselves (plays alone,
no one realizes it's a "solo" until late) — engine should allow it but the
AI shouldn't choose it, since a real solo contract scores more.

If the called King is sitting in the talon instead of in a hand, declarer
plays alone — unless declarer's chosen talon group contains that King and
declarer later wins a trick with it, in which case the rest of the talon
(plus the discard pile) goes to declarer's side when that trick is taken.

### Talon exchange

For contracts that take cards from the talon, expose it in groups sized to
the contract (two groups of 3, three groups of 2, or six individual cards
for contracts three/two/one respectively). Declarer picks one group, adds
it to hand, then discards the same number of cards face-down into their
own trick pile. Kings and the three **trula** cards (Škis, Mond, Pagat)
can never be discarded; other trumps may only be discarded if no non-trump
option exists, and must be shown face-up when discarded. Unselected talon
cards form a separate pile, eventually credited to the opponents — kept
hidden until partnerships are revealed if a king was called.

After exchanging, a `solo three/two/one` declarer may upgrade the contract
to **colour valat** (125 pts, no talon discard takebacks, no
difference/bonus scoring).

### Announcements

Starting with declarer, going around, each player may pass or commit their
side to one or more bonuses (a promise, not a guarantee) before play
starts. Announcing doubles a bonus's value if achieved, but it's also
still won if *not* announced — announcing is pure risk/reward, not a
requirement.

| Bonus | Unannounced | Announced | Condition |
|---|---|---|---|
| trula | 10 | 20 | declarer's side takes Škis, Mond, and Pagat in tricks |
| kings | 10 | 20 | declarer's side takes all 4 Kings in tricks |
| king ultimo | 10 | 20 | the called King wins the last trick (only the King-holder may announce) |
| pagat ultimo | 25 | 50 | the Pagat itself wins the last trick (only the Pagat-holder may announce) |
| valat | 250 | 500 | declarer's side takes every trick — overrides/cancels all other bonuses for the hand |

**Kontra chain**: any opponent may "kontra" the game value (or a specific
announced bonus) to double it; declarer's side may "rekontra" (×4 total);
opponents may "subkontra" (×8); declarer's side may "mordkontra" (×16).
Game value and each bonus are doubled independently — track multipliers
per target, not one global multiplier. A player may never kontra their own
partner, but partnerships may still be secret at this point, so the engine
should only allow a kontra when the actor can prove (from public info)
they aren't kontra'ing their own side.

### Play

- Up through `solo one`, **Forehand** leads the first trick regardless of
  who's declarer. From `beggar` upward (and in colour valat),
  **declarer** leads first.
- Must follow suit if possible; if not, must play a trump (no discarding a
  random off-suit card while holding the led suit's cards or a trump).
  Highest trump in the trick wins, unless no trump was played, in which
  case highest card of the suit led wins.
- **Emperor trick**: if Škis, Mond, and Pagat are all played to the same
  trick, the Pagat is treated as the highest trump and wins the trick,
  regardless of other cards present.
- **Captured Mond penalty**: in the "normal" contracts (three/two/one/solo
  three/solo two/solo one) and in solo-without, if Škis and Mond land in
  the same trick, whoever played the Mond personally loses 20 points — an
  individual penalty, not shared with a partner, and not affected by
  doubling. Same penalty applies if declarer leaves the Mond in an
  unchosen talon group.
- **Negative contracts** (klop, beggar, open beggar) add: must beat the
  highest card currently on the trick if able to; the Pagat can only be
  played if it's the player's only legal card (last trump, only card that
  can win, or literally their last card).

### Scoring

- Normal contracts: score = base contract value + difference (± from 35,
  rounded to nearest 5) ± bonuses won/lost, then doubled per outstanding
  *radl* (see below) if declarer has one.
- `beggar`/`solo without`/`open beggar`/valat-family: flat win/lose of the
  listed value, no difference, no bonuses (captured-mond penalty still
  applies in solo-without).
- `klop`: every player scores individually. A player taking >35 points
  scores −70; a player taking zero tricks scores +70. If neither extreme
  occurs, each player's actual points (rounded to nearest 5) are simply
  subtracted from their score. During klop play, one talon card is turned
  face up before each of the first six tricks and is taken by that trick's
  winner (the "vitamin") — so in klop all 70 points end up in players'
  piles with no talon remainder.
- Declarer's side shares one fate: a win credits both partners the same
  amount, a loss debits both the same amount (klop and the mond penalty
  are the exceptions — those are scored per-individual).

### Radli ("little wheels")

All four players gain a new uncancelled *radl* whenever a klop is played,
a beggar-or-higher contract is played, or any valat is won or lost. When
a declarer next wins or loses a contract while holding at least one
uncancelled radl, that hand's score is doubled, and on a **win** one radl
is cancelled (a loss doubles the score too, but doesn't cancel a radl).
Any radli still uncancelled when the session ends cost 100 points each.

### Ending a session — the Škis round

When players want to stop, they play a final "Škis round": deal and play a
hand as normal, then note who held the Škis. The session continues until
that player's next turn to deal — after that hand, the session ends. (If
the Škis was in the talon instead, repeat the Škis round.) Whatever
uncancelled radli remain are then charged at 100 points each, and the
highest cumulative score wins.

### Misdeal

A misdealing dealer loses 20 points and gets a strike; repeat misdeals by
the same dealer double the penalty each time (20, 40, 80, 160…) and the
same dealer redeals.

## AI opponents

Keep the bots simple and inspectable, not "smart" in a black-box way —
match the spirit of the old Hearts AI rather than building a solver:

- **Bidding heuristic**: score the hand by trump count + high-card points,
  bid the highest contract the heuristic thinks is safely makeable, fall
  back to pass/klop.
- **Play heuristic**: in positive contracts, lead/discard to either grab
  or starve points depending on whether the bot is on declarer's side; in
  negative contracts (klop/beggar), dump points; always obey legality from
  `/engine/play.ts` — the bot never gets a shortcut around the rules
  engine.
- Difficulty is a config knob (heuristic weights), not a separate AI
  architecture, so it stays easy to tune.

## Roadmap

The work is phased — earlier phases should be complete and tested before
later ones start. If you're tempted to build something from a later phase
because "it's just a small addition," check the *out of scope* notes at
the end first.

### Phase 1 — Engine foundation (headless, no UI)

1. `engine/deck.ts`, `engine/pointcount.ts` — get the point-counting rule
   bullet-proof with tests before anything else.
2. `engine/deal.ts`, `engine/bidding.ts` — deal, auction, compulsory klop.
3. `engine/talon.ts`, calling a king.
4. `engine/play.ts` — legality, trick resolution, emperor trick, captured
   mond.
5. `engine/scoring.ts`, `engine/announce.ts` — difference/bonus scoring,
   kontra chain, radli.
6. A trivial bot in `/ai` that lets two engine instances play a full hand
   end-to-end in a Vitest test. This is your regression net for everything
   after.

**Done when**: a 4-player game can be played from deal to score
headlessly, the worked scoring example in *Scoring*/*Radli* matches the
numbers in this doc when encoded as a test, and every `/engine` module
has its own unit suite.

### Phase 2 — UI shell

7. Static table layout, hand rendering, no interaction.
8. Wire up the modal dialogs (Bidding, Call King, Talon, Announcements,
   Score) one at a time, each one calling the engine and reading from the
   Zustand store.
9. Status bar, menu bar, sound toggle, options screen.

**Done when**: a human can play a full hand against three bots via the UI,
and no React component contains an `if` about suits or trumps.

### Phase 3 — Persistence and polish

10. `localStorage` for session scoreboard and radli; Statistics screen.
11. Deal animation, card-play transitions, sound effects.
12. Rules screen under Help menu.

### Phase 4 — AI personality

13. Add a `bluffProbability` knob (0–1) to the difficulty config. When a bot's
    `handCeiling()` is, say, `two`, there is a small chance it bids one step
    higher than its ceiling — making it occasionally over-commit and
    occasionally making opponents unsure whether a high bid is real or a bluff.
    Keep bluffing separate from the legality layer; the bot must still only bid
    legal contracts. Wire the knob into the existing `difficultyBias` config so
    Easy/Normal/Hard presets just set different values.

### Out of scope for now

- **3-player variant.** Rules differ enough (no calling a king, klop only
  on all-pass, 21-point mond penalty, 16 cards each in packets of 8) that
  it deserves its own engine pass once 4-player is solid. Don't try to
  parameterize the 4-player engine for it preemptively.
- **5-player variant** (dealer sits out).
- **Networked multiplayer.**
- **Money-game scoring** (per-hand settlements instead of cumulative).
- **Variant rules** mentioned in the source rules but not in this doc
  (piccolo, hirškontra, "Vogel frei," etc.). Default rules only.

## Definition of done (per milestone)

- Every `/engine` module has unit tests with at least one hand-worked
  example matching the numbers in the rules above (the worked scoring
  example in *Scoring*/*Radli* is a good regression case to encode
  literally).
- No UI component contains rule logic — if you find yourself writing an
  `if` about suits or trumps inside a React component, it belongs in
  `/engine`.
- A full hand can be played end-to-end headlessly (no UI) via the engine
  plus a trivial bot, for use in tests.
- `npm run test:ci` and `npm run build` both pass with no warnings.

## Required invariants and test gates

These invariants were derived from bugs found during gameplay that were not
caught by the engine unit tests. Every item here must be an **automated
test** before the feature it covers is considered done.

### Card conservation (highest priority)

After every complete hand — regardless of contract, exchange, or king-call
outcome — the following must hold:

```
countPoints(all capturedCards across all seats) + countPoints(talonRemainder) === 70
```

This single assertion catches two classes of bug simultaneously: discard
cards lost during talon exchange, and talon remainder cards not attributed
to any pile. It must appear in **`tests/integration.test.ts`** for every
hand variation tested (klop, partner contract, solo, talon exchange present,
no talon exchange). If this assertion ever fails, do not look at the UI —
find where the cards leaked out of the pipeline.

A secondary conservation check:
```
sum(hand sizes after play) === 0   // every card was played
```

### Talon exchange → initPlay pipeline

`initPlay` receives a `TalonExchange` result. The discarded cards must land
in `capturedCards[declarer]` at t=0 — before any trick is played. Write a
test that:

1. Creates a deal and runs a talon exchange.
2. Calls `initPlay` with the exchange result.
3. Asserts `countPoints(playState.capturedCards[declarer]) === countPoints(exchange.discard)`.

Absence of this test is what allowed the discard-vanishes bug to ship.

### Talon remainder routing

`adjustCapturedForTalon` has two branches. Both must have dedicated tests:

- **Normal branch**: talonRemainder is credited to an opponent seat (not
  declarer, not partner). Verify the opponent's pile grows.
- **King-in-talon branch** (`kingInTalonCaptured === true`): talonRemainder
  is credited to the declarer seat instead. Verify the declarer's pile grows.

### Scoring zero-sum check (before mond penalty)

For normal contracts, before individual mond penalties are applied:
```
declarerPts + sum(opponentPts) === 70
```

This is a weaker version of card conservation at the scoring layer. It
catches bugs where `effectiveCaptured` wasn't built correctly before calling
`countDeclarerPoints`.

### Partner reveal in currentTrick

The partner-visibility logic in `StatusBar` checks both `completedTricks`
and `currentTrick.cards`. This matters because the human's card sits in
`currentTrick` for the duration of the render cycle before the trick
resolves — bots resolve fast enough that their cards often skip straight to
`completedTricks` by the time the UI re-renders. The test in
`tests/partner-visibility.test.ts` covers this case. Do not simplify the
check to only `completedTricks`.

### Scoring display must use effectiveCaptured

Every call to `countDeclarerPoints` and `computeHandScore` in both
`store.ts` and `ScoreDialog.tsx` must use `effectiveCaptured` (the output
of `adjustCapturedForTalon`), never the raw `capturedCards`. If you add a
new scoring call site, add it to both places simultaneously and add the card
conservation test to cover the new code path.

### Worked scoring example as a regression test

The game log reviewed in this session (Solo Two, human declarer) produced a
verified final score. Encode it as a literal test in `tests/scoring.test.ts`
with hardcoded card lists and an expected declarer net. This is the ground
truth that prevents the grouping-method (per-trick vs. all-together) from
regressing silently.

### UI logic extraction rule

Any logic in a React component that touches card suits, ranks, or trumps
should be extracted to a pure function and tested there before wiring into
the component. The partner-reveal check is the canonical example: it was
inline in `StatusBar` and the bug (`currentTrick` not checked) wasn't caught
until a human noticed it during a real game. Extract → test → wire is the
correct order.

## Open decisions

These are flagged so an agent can ask before deciding, rather than
silently picking:

- **Test coverage target.** Currently aspirational ("hand-worked examples
  per module"); could be tightened to a coverage percentage if the
  project grows.
- **Bot difficulty levels.** Single tunable bot for phase 1; whether to
  ship multiple presets (Easy/Normal/Hard) in phase 3 is undecided.