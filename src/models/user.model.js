import { query } from "../config/db.js";

const PUBLIC_USER_FIELDS = `
  id,
  email,
  full_name,
  avatar_url,
  role,
  is_active,
  last_login_at,
  created_at,
  updated_at
`;

export const create_user = async (
  { email, password_hash, full_name, avatar_url = null, role = "user" },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO users (email, password_hash, full_name, avatar_url, role)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${PUBLIC_USER_FIELDS}
  `;
  const result = await executor.query(sql, [
    email,
    password_hash,
    full_name,
    avatar_url,
    role,
  ]);
  return result.rows[0];
};

export const find_user_by_email = async (email) => {
  const sql = `
    SELECT
      id,
      email,
      password_hash,
      full_name,
      avatar_url,
      role,
      is_active,
      last_login_at,
      created_at,
      updated_at
    FROM users
    WHERE email = $1
    LIMIT 1
  `;
  const result = await query(sql, [email]);
  return result.rows[0] || null;
};

export const find_user_by_id = async (user_id) => {
  const sql = `
    SELECT ${PUBLIC_USER_FIELDS}
    FROM users
    WHERE id = $1
    LIMIT 1
  `;
  const result = await query(sql, [user_id]);
  return result.rows[0] || null;
};

export const find_user_auth_by_id = async (user_id, db_client = null) => {
  const executor = db_client || { query };
  const sql = `
    SELECT id, email, password_hash, role, is_active
    FROM users
    WHERE id = $1
    LIMIT 1
  `;
  const result = await executor.query(sql, [user_id]);
  return result.rows[0] || null;
};

export const update_last_login = async (user_id, db_client = null) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE users
    SET last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING ${PUBLIC_USER_FIELDS}
  `;
  const result = await executor.query(sql, [user_id]);
  return result.rows[0] || null;
};

export const update_user_profile = async (user_id, updates) => {
  const fields = [];
  const values = [];
  let param_index = 1;

  if (updates.full_name !== undefined) {
    fields.push(`full_name = $${param_index++}`);
    values.push(updates.full_name);
  }

  if (updates.avatar_url !== undefined) {
    fields.push(`avatar_url = $${param_index++}`);
    values.push(updates.avatar_url);
  }

  if (fields.length === 0) {
    return find_user_by_id(user_id);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(user_id);

  const sql = `
    UPDATE users
    SET ${fields.join(", ")}
    WHERE id = $${param_index}
    RETURNING ${PUBLIC_USER_FIELDS}
  `;

  const result = await query(sql, values);
  return result.rows[0] || null;
};

export const update_user_password = async (
  user_id,
  password_hash,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE users
    SET password_hash = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id
  `;
  const result = await executor.query(sql, [password_hash, user_id]);
  return result.rows[0] || null;
};