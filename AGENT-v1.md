# AGENT.md — Tarok (Slovenian Card Game)

## 1. Project Vision

Build a single-player desktop-style card game app where the human plays the
4-player Slovenian variant of **Tarok** against three AI opponents. The whole
experience — menus, table layout, dialogs, pacing, sound toggles — should feel
like it was lifted straight out of the **Microsoft Hearts** app that shipped
with old Windows: minimal chrome, a green felt table, simple seated avatars,
clean modal dialogs for decisions, and a no-nonsense scoreboard. Charm comes
from restraint, not flash.

Tarok is mechanically much deeper than Hearts (bidding, calling a hidden
partner, exchanging with a talon, bonus announcements, doubling chains), so
most of the engineering effort goes into a correct, well-tested rules engine.
The UI's job is to present that engine's decisions in the plainest possible
way.

## 2. Visual / UX Reference ("the Hearts feel")

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
- Card faces should be legible and simple: black-suit cards (Clubs, Spades)
  rank 7–King, red-suit cards (Hearts, Diamonds) rank 1–King, and 22 trump
  cards with bold roman numerals (I–XXI) plus the unnumbered top trump. Don't
  chase ornate historical tarot card art — clarity over flavor.

## 3. Recommended Tech Stack

Defaults below are a reasonable starting point — adjust freely if you'd
rather use something else, just keep the engine/UI separation in section 4.

- **TypeScript** throughout — the rules below are intricate enough that a
  type system earns its keep (e.g. a `Contract` discriminated union, a
  `Card` type with suit/rank/points baked in).
- **React + Vite** for the shell and dialogs.
- **HTML5 Canvas** (or absolutely-positioned DOM nodes, if simpler) for the
  table and card sprites — no need for a heavy game engine.
- **Vitest** for the rules engine — this is the part that *must* be
  trustworthy, so write it test-first where practical.
- State: a single store (Zustand or plain Context+reducer) holding the
  current `GameState`; the engine is otherwise pure functions that take a
  state and an action and return a new state.

## 4. Architecture

```
/src
  /engine        pure game logic, zero UI dependencies
    deck.ts        54-card deck, suits, trump ranking, point values
    deal.ts        dealing, talon formation, no-trump redeal check
    bidding.ts     auction priority rules, contract ladder, compulsory klop
    talon.ts       exchange groups per contract, discard legality
    play.ts        follow-suit/must-trump rules, trick resolution,
                   emperor trick, captured-mond check
    announce.ts    bonus announcements, kontra/rekontra/subkontra/mordkontra
    scoring.ts      difference calc, bonus scoring, radli, klop scoring
    pointcount.ts  the "groups of three, minus two" card-point counting rule
  /ai            bot decision modules (bidding heuristic, play heuristic)
  /ui            React components: Table, Hand, TrickArea, MenuBar,
                 BiddingDialog, CallKingDialog, TalonDialog,
                 AnnouncementDialog, ScoreDialog, StatusBar
  /state         store + reducer wiring UI actions to /engine calls
/tests           one suite per /engine module, with hand-worked examples
```

Keep `/engine` importable and testable without React or a DOM. If an AI or a
test needs to know "is this a legal play," it should call the same function
the UI calls — never duplicate rule logic in two places.

## 5. Domain Rules Reference

This is the spec the engine must implement. It covers the 4-player game,
which is the default mode; the 3-player variant is a stretch goal (diffs
noted at the end).

### 5.1 The deck

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
worth its point total minus 1 (so a single 1-point card scores 0, but two or
three 1-point cards together score 1). Write this as `countPoints(cards:
Card[]): number` with unit tests against hand-worked examples before
anything else depends on it — most of the scoring layer is downstream of it.

A positive contract is won by taking at least 36 of the 70 points.

### 5.2 Deal

Dealt anticlockwise in packets of six, starting with a packet to the
**talon** (6 cards, face down, untouched until exchange), then six-card
packets to each player until each has 16 cards. Turn to deal rotates
anticlockwise each hand.

Special case: if a player is dealt **zero trumps**, they must show their
hand; the deal is voided, reshuffled, redealt by the same dealer, and the
new hand is forced into **compulsory klop** (see 5.4).

### 5.3 Bidding

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
exactly zero, or after a no-trump redeal (5.2). During compulsory klop, the
contract ladder from `three` through `beggar` is removed — the floor is
`solo without`, and if everyone passes that, **klop must be played**.

### 5.4 Calling a king (three / two / one contracts only)

Declarer names a suit; whoever holds that suit's King becomes declarer's
secret partner and says nothing. Partnerships can stay hidden well into the
play. A declarer may legally call a king they hold themselves (plays alone,
no one realizes it's a "solo" until late) — engine should allow it but the
AI shouldn't choose it, since a real solo contract scores more.

If the called King is sitting in the talon instead of in a hand, declarer
plays alone — unless declarer's chosen talon group contains that King and
declarer later wins a trick with it, in which case the rest of the talon
(plus the discard pile) goes to declarer's side when that trick is taken.

### 5.5 Talon exchange

For contracts that take cards from the talon, expose it in groups sized to
the contract (two groups of 3, three groups of 2, or six individual cards
for contracts three/two/one respectively). Declarer picks one group, adds it
to hand, then discards the same number of cards face-down into their own
trick pile. Kings and the three **trula** cards (Škis, Mond, Pagat) can
never be discarded; other trumps may only be discarded if no non-trump
option exists, and must be shown face-up when discarded. Unselected talon
cards form a separate pile, eventually credited to the opponents — kept
hidden until partnerships are revealed if a king was called.

After exchanging, a `solo three/two/one` declarer may upgrade the contract
to **colour valat** (125 pts, no talon discard takebacks, no
difference/bonus scoring).

### 5.6 Announcements

Starting with declarer, going around, each player may pass or commit their
side to one or more bonuses (a promise, not a guarantee) before play starts.
Announcing doubles a bonus's value if achieved, but it's also still won if
*not* announced — announcing is pure risk/reward, not a requirement.

| Bonus | Unannounced | Announced | Condition |
|---|---|---|---|
| trula | 10 | 20 | declarer's side takes Škis, Mond, and Pagat in tricks |
| kings | 10 | 20 | declarer's side takes all 4 Kings in tricks |
| king ultimo | 10 | 20 | the called King wins the last trick (only the King-holder may announce) |
| pagat ultimo | 25 | 50 | the Pagat itself wins the last trick (only the Pagat-holder may announce) |
| valat | 250 | 500 | declarer's side takes every trick — overrides/cancels all other bonuses for the hand |

**Kontra chain**: any opponent may "kontra" the game value (or a specific
announced bonus) to double it; declarer's side may "rekontra" (×4 total);
opponents may "subkontra" (×8); declarer's side may "mordkontra" (×16). Game
value and each bonus are doubled independently — track multipliers per
target, not one global multiplier. A player may never kontra their own
partner, but partnerships may still be secret at this point, so the engine
should only allow a kontra when the actor can prove (from public info) they
aren't kontra'ing their own side.

### 5.7 Play

- Up through `solo one`, **Forehand** leads the first trick regardless of
  who's declarer. From `beggar` upward (and in colour valat), **declarer**
  leads first.
- Must follow suit if possible; if not, must play a trump (no discarding a
  random off-suit card while holding the led suit's cards or a trump).
  Highest trump in the trick wins, unless no trump was played, in which case
  highest card of the suit led wins.
- **Emperor trick**: if Škis, Mond, and Pagat are all played to the same
  trick, the Pagat is treated as the highest trump and wins the trick,
  regardless of other cards present.
- **Captured Mond penalty**: in the "normal" contracts (three/two/one/solo
  three/solo two/solo one) and in solo-without, if Škis and Mond land in the
  same trick, whoever played the Mond personally loses 20 points — an
  individual penalty, not shared with a partner, and not affected by
  doubling. Same penalty applies if declarer leaves the Mond in an unchosen
  talon group.
- **Negative contracts** (klop, beggar, open beggar) add: must beat the
  highest card currently on the trick if able to; the Pagat can only be
  played if it's the player's only legal card (last trump, only card that
  can win, or literally their last card).

### 5.8 Scoring

- Normal contracts: score = base contract value + difference (± from 35,
  rounded to nearest 5) ± bonuses won/lost, then doubled per outstanding
  *radl* (5.9) if declarer has one.
- `beggar`/`solo without`/`open beggar`/valat-family: flat win/lose of the
  listed value, no difference, no bonuses (captured-mond penalty still
  applies in solo-without).
- `klop`: every player scores individually. A player taking >35 points
  scores −70; a player taking zero tricks scores +70. If neither extreme
  occurs, each player's actual points (rounded to nearest 5) are simply
  subtracted from their score.
- Declarer's side shares one fate: a win credits both partners the same
  amount, a loss debits both the same amount (klop and the mond penalty are
  the exceptions — those are scored per-individual).

### 5.9 Radli ("little wheels")

All four players gain a new uncancelled *radl* whenever a klop is played, a
beggar-or-higher contract is played, or any valat is won or lost. When a
declarer next wins or loses a contract while holding at least one
uncancelled radl, that hand's score is doubled, and on a **win** one radl is
cancelled (a loss doubles the score too, but doesn't cancel a radl). Any
radli still uncancelled when the session ends cost 100 points each.

### 5.10 Ending a session — the Škis round

When players want to stop, they play a final "Škis round": deal and play a
hand as normal, then note who held the Škis. The session continues until
that player's next turn to deal — after that hand, the session ends. (If the
Škis was in the talon instead, repeat the Škis round.) Whatever uncancelled
radli remain are then charged at 100 points each, and the highest cumulative
score wins.

### 5.11 Misdeal

A misdealing dealer loses 20 points and gets a strike; repeat misdeals by
the same dealer double the penalty each time (20, 40, 80, 160…) and the same
dealer redeals.

### 5.12 Three-player variant (stretch goal)

Differences from the 4-player game: 16 cards dealt to each of 3 players in
packets of 8, no calling a king (declarer always solo), klop only playable
if all three pass, no king-ultimo bonus, and the captured-mond penalty is a
flat 21 instead of 20.

## 6. AI Opponents

Keep the bots simple and inspectable, not "smart" in a black-box way —
match the spirit of the old Hearts AI rather than building a solver:

- **Bidding heuristic**: score the hand by trump count + high-card points,
  bid the highest contract the heuristic thinks is safely makeable, fall
  back to pass/klop.
- **Play heuristic**: in positive contracts, lead/discard to either grab or
  starve points depending on whether the bot is on declarer's side; in
  negative contracts (klop/beggar), dump points; always obey legality from
  `/engine/play.ts` — the bot never gets a shortcut around the rules engine.
- Make difficulty a config knob later (e.g. heuristic weights), not a
  separate AI architecture, so it stays easy to tune.

## 7. Suggested Build Order

1. `engine/deck.ts`, `engine/pointcount.ts` — get the point-counting rule
   bullet-proof with tests before anything else.
2. `engine/deal.ts`, `engine/bidding.ts` — deal, auction, compulsory klop.
3. `engine/talon.ts`, calling a king.
4. `engine/play.ts` — legality, trick resolution, emperor trick, captured
   mond.
5. `engine/scoring.ts`, `engine/announce.ts` — difference/bonus scoring,
   kontra chain, radli.
6. Wire a bare-bones bot so two engine instances can play a full hand
   headlessly in a test — this is your best regression net.
7. Then, and only then, build the Hearts-style UI shell around the
   already-correct engine.

## 8. Definition of Done (per milestone)

- Every `/engine` module has unit tests with at least one hand-worked
  example matching the numbers in the rules above (the worked scoring
  example in section 5.8/5.9 is a good regression case to encode literally).
- No UI component contains rule logic — if you find yourself writing an
  `if` about suits or trumps inside a React component, it belongs in
  `/engine`.
- A full hand can be played end-to-end headlessly (no UI) via the engine +
  a trivial bot, for use in tests.