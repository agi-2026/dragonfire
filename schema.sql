CREATE TABLE IF NOT EXISTS roster_contributions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  model_version text NOT NULL,
  consent_version text NOT NULL,
  roster jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS roster_contributions_created_at_idx
  ON roster_contributions (created_at DESC);

CREATE INDEX IF NOT EXISTS roster_contributions_roster_gin_idx
  ON roster_contributions USING gin (roster);

COMMENT ON TABLE roster_contributions IS
  'Explicitly consented anonymous roster snapshots. Do not add IP, email, guild, username, or request-header columns.';
