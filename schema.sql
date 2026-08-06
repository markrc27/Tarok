CREATE TABLE IF NOT EXISTS games (
  id           TEXT    PRIMARY KEY,
  played_at    INTEGER NOT NULL,
  player_name  TEXT    NOT NULL,
  final_score  INTEGER NOT NULL,
  rounds       INTEGER NOT NULL,
  difficulty   TEXT    NOT NULL DEFAULT 'easy',
  player_count INTEGER NOT NULL DEFAULT 4,
  place        INTEGER NOT NULL DEFAULT 1
);

-- Migrations for existing tables (run once each; D1 returns ignorable error if column already exists):
--   npx wrangler d1 execute tarok-db --remote --command "ALTER TABLE games ADD COLUMN player_count INTEGER NOT NULL DEFAULT 4"
--   npx wrangler d1 execute tarok-db --remote --command "ALTER TABLE games ADD COLUMN place INTEGER NOT NULL DEFAULT 1"

CREATE INDEX IF NOT EXISTS idx_games_played_at ON games (played_at DESC);
