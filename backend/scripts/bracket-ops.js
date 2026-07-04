#!/usr/bin/env bun
/**
 * Bracket DB ops — chạy online, không cần tắt PostgreSQL.
 *
 * Usage:
 *   bun run scripts/bracket-ops.js diagnose --bracket-id=123
 *   bun run scripts/bracket-ops.js repropagate --bracket-id=123
 *   bun run scripts/bracket-ops.js reset --bracket-id=123
 *   bun run scripts/bracket-ops.js delete --bracket-id=123
 *   bun run scripts/bracket-ops.js ghost-brackets --tournament-id=456
 */

import { pool } from "../utils/db.js";
import {
  deleteBracketData,
  repropagateDoubleElimLosers,
  resetBracketProgression,
} from "../utils/bracketProgression.js";

const parseArgs = () => {
  const [command, ...rest] = process.argv.slice(2);
  const flags = {};

  for (const arg of rest) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) {
      flags[match[1]] = match[2] ?? true;
    }
  }

  return { command, flags };
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const diagnoseBracket = async (bracketId) => {
  const { rows: bracketRows } = await pool.query(
    `
    SELECT b.id, b.name, b.stage, b.tournament_id, b.format_id,
           f.name AS format_name, f.type AS format_type, f.has_losers_bracket
    FROM brackets b
    JOIN formats f ON f.id = b.format_id
    WHERE b.id = $1
    LIMIT 1
    `,
    [bracketId],
  );

  if (!bracketRows.length) {
    throw new Error(`Bracket #${bracketId} không tồn tại`);
  }

  const bracket = bracketRows[0];

  const { rows: shapeRows } = await pool.query(
    `
    SELECT round_number, COUNT(*)::int AS matches
    FROM matches
    WHERE bracket_id = $1
    GROUP BY round_number
    ORDER BY round_number ASC
    `,
    [bracketId],
  );

  const { rows: ghostRows } = await pool.query(
    `
    SELECT id, name, stage
    FROM brackets
    WHERE tournament_id = $1
      AND format_id = $2
      AND LOWER(stage) = 'losers'
    ORDER BY id ASC
    `,
    [bracket.tournament_id, bracket.format_id],
  );

  const { rows: upperCompleted } = await pool.query(
    `
    SELECT id, round_number, match_no, team_a_id, team_b_id, winner_team_id, status
    FROM matches
    WHERE bracket_id = $1
      AND winner_team_id IS NOT NULL
    ORDER BY round_number ASC, match_no ASC
    `,
    [bracketId],
  );

  return {
    bracket,
    round_shape: shapeRows
      .map((row) => `${row.round_number}:${row.matches}`)
      .join(","),
    ghost_losers_brackets: ghostRows,
    completed_matches: upperCompleted,
  };
};

const listGhostBrackets = async (tournamentId) => {
  const { rows } = await pool.query(
    `
    SELECT b.id, b.name, b.stage, b.format_id,
           COUNT(m.id)::int AS match_count
    FROM brackets b
    LEFT JOIN matches m ON m.bracket_id = b.id
    WHERE b.tournament_id = $1
      AND LOWER(b.stage) = 'losers'
    GROUP BY b.id
    ORDER BY b.id ASC
    `,
    [tournamentId],
  );

  return rows;
};

const main = async () => {
  const { command, flags } = parseArgs();

  if (!command || command === "help") {
    console.log(`Commands:
  diagnose --bracket-id=N
  repropagate --bracket-id=N
  reset --bracket-id=N
  delete --bracket-id=N
  ghost-brackets --tournament-id=N`);
    return;
  }

  const bracketId = toNumber(flags["bracket-id"]);
  const tournamentId = toNumber(flags["tournament-id"]);

  switch (command) {
    case "diagnose": {
      if (!bracketId) throw new Error("Cần --bracket-id");
      const result = await diagnoseBracket(bracketId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "repropagate": {
      if (!bracketId) throw new Error("Cần --bracket-id");
      const result = await repropagateDoubleElimLosers(bracketId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "reset": {
      if (!bracketId) throw new Error("Cần --bracket-id");
      const result = await resetBracketProgression(bracketId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "delete": {
      if (!bracketId) throw new Error("Cần --bracket-id");
      const result = await deleteBracketData(bracketId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "ghost-brackets": {
      if (!tournamentId) throw new Error("Cần --tournament-id");
      const rows = await listGhostBrackets(tournamentId);
      console.log(JSON.stringify(rows, null, 2));
      break;
    }

    default:
      throw new Error(`Command không hỗ trợ: ${command}`);
  }
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.close();
  });
