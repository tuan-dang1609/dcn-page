CREATE TABLE IF NOT EXISTS team_invites (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  inviter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_invites_team_id_status_idx
  ON team_invites (team_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS team_invites_invitee_id_status_idx
  ON team_invites (invitee_id, status, created_at DESC);
