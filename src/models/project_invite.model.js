import { query } from "../config/db.js";

export const create_project_invite = async (
  { project_id, email = null, role, token_hash, invited_by, expires_at },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO project_invites (
      project_id,
      email,
      role,
      token_hash,
      invited_by,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, project_id, email, role, invited_by, expires_at, accepted_at, created_at
  `;
  const result = await executor.query(sql, [
    project_id,
    email,
    role,
    token_hash,
    invited_by,
    expires_at,
  ]);
  return result.rows[0];
};

export const find_invite_by_token_hash = async (
  token_hash,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    SELECT
      pi.id,
      pi.project_id,
      pi.email,
      pi.role,
      pi.token_hash,
      pi.invited_by,
      pi.expires_at,
      pi.accepted_at,
      pi.created_at,
      p.name AS project_name,
      p.key_prefix,
      p.is_archived
    FROM project_invites pi
    INNER JOIN projects p ON p.id = pi.project_id
    WHERE pi.token_hash = $1
    LIMIT 1
  `;
  const result = await executor.query(sql, [token_hash]);
  return result.rows[0] || null;
};

export const list_pending_invites = async (project_id) => {
  const sql = `
    SELECT
      pi.id,
      pi.project_id,
      pi.email,
      pi.role,
      pi.invited_by,
      u.full_name AS invited_by_name,
      pi.expires_at,
      pi.created_at
    FROM project_invites pi
    LEFT JOIN users u ON u.id = pi.invited_by
    WHERE pi.project_id = $1
      AND pi.accepted_at IS NULL
      AND pi.expires_at > CURRENT_TIMESTAMP
    ORDER BY pi.created_at DESC
  `;
  const result = await query(sql, [project_id]);
  return result.rows;
};

export const mark_invite_accepted = async (invite_id, db_client = null) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE project_invites
    SET accepted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND accepted_at IS NULL
    RETURNING id, accepted_at
  `;
  const result = await executor.query(sql, [invite_id]);
  return result.rows[0] || null;
};

export const delete_invite = async (invite_id, project_id) => {
  const sql = `
    DELETE FROM project_invites
    WHERE id = $1 AND project_id = $2 AND accepted_at IS NULL
    RETURNING id
  `;
  const result = await query(sql, [invite_id, project_id]);
  return result.rows[0] || null;
};