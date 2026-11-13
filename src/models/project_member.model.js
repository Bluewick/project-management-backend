import { query } from "../config/db.js";

export const add_project_member = async (
  { project_id, user_id, role },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO project_members (project_id, user_id, role)
    VALUES ($1, $2, $3)
    RETURNING id, project_id, user_id, role, joined_at
  `;
  const result = await executor.query(sql, [project_id, user_id, role]);
  return result.rows[0];
};

export const find_project_member = async (
  project_id,
  user_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    SELECT id, project_id, user_id, role, joined_at
    FROM project_members
    WHERE project_id = $1 AND user_id = $2
    LIMIT 1
  `;
  const result = await executor.query(sql, [project_id, user_id]);
  return result.rows[0] || null;
};

export const find_project_membership_with_project = async (
  project_id,
  user_id
) => {
  const sql = `
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.key_prefix,
      p.owner_id,
      p.is_archived,
      pm.id AS member_id,
      pm.role AS member_role,
      pm.joined_at
    FROM projects p
    LEFT JOIN project_members pm
      ON pm.project_id = p.id AND pm.user_id = $2
    WHERE p.id = $1
    LIMIT 1
  `;
  const result = await query(sql, [project_id, user_id]);
  return result.rows[0] || null;
};

export const list_project_members = async (project_id) => {
  const sql = `
    SELECT
      pm.id,
      pm.project_id,
      pm.user_id,
      pm.role,
      pm.joined_at,
      u.email,
      u.full_name,
      u.avatar_url,
      u.is_active
    FROM project_members pm
    INNER JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = $1
    ORDER BY
      CASE pm.role
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'developer' THEN 3
        ELSE 4
      END,
      pm.joined_at ASC
  `;
  const result = await query(sql, [project_id]);
  return result.rows;
};

export const lock_and_count_project_admins = async (
  project_id,
  db_client
) => {
  const sql = `
    SELECT id, user_id
    FROM project_members
    WHERE project_id = $1 AND role = 'admin'
    FOR UPDATE
  `;
  const result = await db_client.query(sql, [project_id]);
  return result.rows;
};

export const update_project_member_role = async (
  project_id,
  user_id,
  role,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE project_members
    SET role = $1
    WHERE project_id = $2 AND user_id = $3
    RETURNING id, project_id, user_id, role, joined_at
  `;
  const result = await executor.query(sql, [role, project_id, user_id]);
  return result.rows[0] || null;
};

export const remove_project_member = async (
  project_id,
  user_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    DELETE FROM project_members
    WHERE project_id = $1 AND user_id = $2
    RETURNING id, project_id, user_id, role
  `;
  const result = await executor.query(sql, [project_id, user_id]);
  return result.rows[0] || null;
};