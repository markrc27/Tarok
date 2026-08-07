CREATE TABLE IF NOT EXISTS games (
  id          TEXT    PRIMARY KEY,
  played_at   INTEGER NOT NULL,
  player_name TEXT    NOT NULL,
  final_score INTEGER NOT NULL,
  rounds      INTEGER NOT NULL,
  difficulty  TEXT    NOT NULL DEFAULT 'easy',
  place       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_games_played_at ON games (played_at DESC);

-- Migration (already applied to production tarok-db):
-- ALTER TABLE games ADD COLUMN place INTEGER NOT NULL DEFAULT 1;
