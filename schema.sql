CREATE TABLE IF NOT EXISTS games (
  id           TEXT    PRIMARY KEY,
  played_at    INTEGER NOT NULL,
  player_name  TEXT    NOT NULL,
  final_score  INTEGER NOT NULL,
  rounds       INTEGER NOT NULL,
  difficulty   TEXT    NOT NULL DEFAULT 'easy',
  player_count INTEGER NOT NULL DEFAULT 4
);

-- Migration for existing tables (run once; safe to re-run on a fresh DB where the column
-- is already in the CREATE TABLE above — D1 returns an error which can be ignored):
--   npx wrangler d1 execute tarok-db --command "ALTER TABLE games ADD COLUMN player_count INTEGER NOT NULL DEFAULT 4"

CREATE INDEX IF NOT EXISTS idx_games_played_at ON games (played_at DESC);
