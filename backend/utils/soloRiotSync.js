import { pool } from "./db.js";

/**
 * After a user changes Riot ID, keep solo/TFT registration display in sync
 * without requiring unregister + re-register.
 *
 * Solo slots use teams.short_name = S{userId} and teams.created_by = userId.
 * Participant Riot ID on tournament pages is read live from users.riot_account;
 * this updates the solo team display name to match the new Riot game name.
 */
export const syncSoloRegistrationsForUser = async (userId, riotAccount) => {
  const uid = Number(userId);
  const riot = String(riotAccount ?? "").trim();

  if (!Number.isFinite(uid) || !riot) {
    return { updatedTeams: 0, displayName: null, riotAccount: riot || null };
  }

  const displayName = (riot.split("#")[0] || `Player ${uid}`).slice(0, 64);
  const shortName = `S${uid}`.slice(0, 16);

  const { rowCount: shellUpdated } = await pool.query(
    `
    UPDATE teams
    SET name = $1
    WHERE created_by = $2
      AND short_name = $3
    `,
    [displayName, uid, shortName],
  );

  // Catch older/odd solo rows linked via individual tournament registration.
  const { rowCount: registeredUpdated } = await pool.query(
    `
    UPDATE teams t
    SET name = $1
    FROM tournament_teams tt
    JOIN tournaments tr ON tr.id = tt.tournament_id
    JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
    WHERE t.id = tt.team_id
      AND t.created_by = $2
      AND ttp.user_id = $2
      AND COALESCE(
        NULLIF(TRIM(to_jsonb(tr)->>'registration_mode'), ''),
        'org'
      ) = 'individual'
    `,
    [displayName, uid],
  );

  return {
    updatedTeams: Math.max(shellUpdated ?? 0, registeredUpdated ?? 0),
    displayName,
    riotAccount: riot,
  };
};

/**
 * Sync only the solo team for one individual tournament registration.
 */
export const syncSoloRegistrationForTournament = async (
  tournamentId,
  userId,
  riotAccount,
) => {
  const tid = Number(tournamentId);
  const uid = Number(userId);
  const riot = String(riotAccount ?? "").trim();

  if (!Number.isFinite(tid) || !Number.isFinite(uid) || !riot) {
    return null;
  }

  const displayName = (riot.split("#")[0] || `Player ${uid}`).slice(0, 64);

  const { rows } = await pool.query(
    `
    UPDATE teams t
    SET name = $1
    FROM tournament_teams tt
    JOIN tournaments tr ON tr.id = tt.tournament_id
    JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
    WHERE t.id = tt.team_id
      AND tt.tournament_id = $2
      AND ttp.user_id = $3
      AND COALESCE(
        NULLIF(TRIM(to_jsonb(tr)->>'registration_mode'), ''),
        'org'
      ) = 'individual'
    RETURNING t.id, t.name, tt.id AS tournament_team_id
    `,
    [displayName, tid, uid],
  );

  if (!rows.length) return null;

  return {
    team_id: Number(rows[0].id),
    tournament_team_id: Number(rows[0].tournament_team_id),
    display_name: rows[0].name,
    riot_account: riot,
  };
};
