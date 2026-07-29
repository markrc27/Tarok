# Mobile "blank green page" fix — persisted-state crash resilience

## Symptom

On mobile (iOS Safari), leaving **tarok.pages.dev** open for a while and coming
back would load a **blank green page** — no menu, no table, nothing. The same
site kept working on desktop, and opening it in a **private/incognito** window
worked again immediately.

## Root cause

Two things combined:

1. **State persistence (added in v1.5.3).** The Zustand store is wrapped in the
   `persist` middleware, saving the full in-progress game to `localStorage`
   under the key `tarok-game-state`. This was intentional — it keeps a mid-game
   reload from dropping you back to the start screen.

2. **No error boundary.** `main.tsx` rendered `<App/>` bare, so *any* error
   thrown during the first render would unmount the whole React tree, leaving
   only the green `<body>` background visible.

The trigger is mobile-specific: **iOS Safari discards and reloads tabs that have
been in the background for a while** (memory pressure). When the tab reloads, the
store rehydrates the saved game from `localStorage`. If that saved state can't be
rendered by the **currently deployed build** — most commonly because a new
version was deployed in the meantime and the state shape changed — the first
render throws, and with no boundary to catch it the page goes blank.

Why the clues line up:

- **Desktop is fine** — desktop browsers keep the tab alive in memory, so no
  reload happens and the state is never re-read from storage.
- **Incognito is fine** — private windows have no saved `tarok-game-state`, so
  there's nothing stale to rehydrate; the app loads fresh.

## The fix (shipped)

A self-healing **`ErrorBoundary`** (`src/ui/ErrorBoundary.tsx`) now wraps the app
in `main.tsx`. On any render/lifecycle crash it:

1. **Clears the saved game** (`localStorage.removeItem('tarok-game-state')`), so
   the bad state can't crash the next load.
2. **Auto-reloads once per tab session**, guarded by a `sessionStorage` flag
   (`tarok-auto-recovered`). The reload comes up clean (no saved state to
   rehydrate).
3. **Falls back to a manual "Restart" button** if it somehow crashes again with
   the flag already set — so it can never get stuck in a reload loop.
4. **Logs the underlying error** to the console (`console.error`), so if it ever
   recurs we can capture the real cause via remote debugging.

A successful mount clears the one-shot recovery flag (in `App.tsx`), so the
boundary can auto-heal again on a future load.

**Net effect:** the worst case is now "the app briefly reloads and starts a fresh
game," never "a permanent blank page." The only thing lost is the specific
in-progress hand that couldn't be rendered — which was already unusable.

### Files touched
- `src/ui/ErrorBoundary.tsx` — new component.
- `src/main.tsx` — wraps `<App/>` in `<ErrorBoundary>`.
- `src/ui/App.tsx` — clears the recovery flag on successful mount.

## Longer-term hardening (not yet done)

The boundary is a reliable safety net, but it recovers *after* a crash. To make
the crash **rarer or impossible** in the first place, consider:

1. **Version the persisted state and bump it on shape changes.**
   The `persist` config already has `version: 1`. Whenever the persisted state
   shape changes, bump this number. With a mismatched version and no `migrate`
   function, zustand discards the incompatible saved state instead of trying to
   render it. This turns "crash after deploy" into "clean start after deploy."
   The catch: it's a manual discipline — easy to forget — which is why the error
   boundary exists as the automatic backstop.

2. **Narrow what gets persisted (recommended).**
   Today `partialize` persists almost the entire store, including the volatile
   engine state (`playState`, `dealResult`, `biddingState`, `talonExchange`,
   …). That live state is the fragile part. Persisting only **stable session
   data** — `sessionScores`, `playerNames`, `options`, `roundHistory`,
   `roundId` — would mean a reload always returns to a safe point (start screen
   or between rounds) instead of trying to reconstruct a half-played trick. You
   lose exact mid-hand resume, but the state can no longer cause a render crash.

3. **Validate on rehydration.**
   Add an `onRehydrateStorage` / `merge` step that sanity-checks the restored
   state (e.g. the current `phase` matches the data present) and resets to
   `setup` if it looks inconsistent, rather than rendering it and hoping.

4. **Add a migration path** (`migrate`) if we want to *preserve* in-progress
   games across state-shape changes rather than discard them. Higher effort;
   only worth it if resuming a specific hand across deploys is important.

### Suggested order
Ship the error boundary (done). If blank-page reports persist or we want to stop
losing games on reload, do **#2 (narrow persistence)** next — it removes the
entire class of "unrenderable saved state" with the least ongoing maintenance.
