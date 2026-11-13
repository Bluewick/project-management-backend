import { query } from "../config/db.js";

export const create_refresh_token = async (
  { user_id, token_hash, expires_at },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, user_id, expires_at, created_at
  `;
  const result = await executor.query(sql, [user_id, token_hash, expires_at]);
  return result.rows[0];
};

export const find_refresh_token_by_hash = async (
  token_hash,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
    FROM refresh_tokens
    WHERE token_hash = $1
    LIMIT 1
  `;
  const result = await executor.query(sql, [token_hash]);
  return result.rows[0] || null;
};

export const revoke_refresh_token_by_hash = async (
  token_hash,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE refresh_tokens
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE token_hash = $1 AND revoked_at IS NULL
    RETURNING id
  `;
  const result = await executor.query(sql, [token_hash]);
  return result.rows[0] || null;
};

export const revoke_all_user_refresh_tokens = async (
  user_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE refresh_tokens
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND revoked_at IS NULL
  `;
  await executor.query(sql, [user_id]);
};