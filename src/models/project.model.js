import { query } from "../config/db.js";

const PROJECT_FIELDS = `
  id,
  name,
  key_prefix,
  description,
  issue_counter,
  owner_id,
  is_archived,
  created_at,
  updated_at
`;

export const create_project = async (
  { name, key_prefix, description = null, owner_id },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO projects (name, key_prefix, description, owner_id)
    VALUES ($1, $2, $3, $4)
    RETURNING ${PROJECT_FIELDS}
  `;
  const result = await executor.query(sql, [
    name,
    key_prefix,
    description,
    owner_id,
  ]);
  return result.rows[0];
};

export const find_project_by_id = async (project_id, db_client = null) => {
  const executor = db_client || { query };
  const sql = `
    SELECT
      p.id,
      p.name,
      p.key_prefix,
      p.description,
      p.issue_counter,
      p.owner_id,
      p.is_archived,
      p.created_at,
      p.updated_at,
      COUNT(pm.id)::INTEGER AS member_count
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id
    WHERE p.id = $1
    GROUP BY p.id
    LIMIT 1
  `;
  const result = await executor.query(sql, [project_id]);
  return result.rows[0] || null;
};

export const find_project_by_key_prefix = async (
  key_prefix,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    SELECT ${PROJECT_FIELDS}
    FROM projects
    WHERE key_prefix = $1
    LIMIT 1
  `;
  const result = await executor.query(sql, [key_prefix]);
  return result.rows[0] || null;
};

export const find_projects_for_user = async (
  user_id,
  { include_archived = false, limit = 20, offset = 0 }
) => {
  const archived_filter = include_archived ? "" : "AND p.is_archived = false";

  const count_sql = `
    SELECT COUNT(*)::INTEGER AS total
    FROM projects p
    INNER JOIN project_members pm ON pm.project_id = p.id
    WHERE pm.user_id = $1 ${archived_filter}
  `;

  const data_sql = `
    SELECT
      p.id,
      p.name,
      p.key_prefix,
      p.description,
      p.issue_counter,
      p.owner_id,
      p.is_archived,
      p.created_at,
      p.updated_at,
      pm.role AS my_role,
      (
        SELECT COUNT(*)::INTEGER
        FROM project_members pm2
        WHERE pm2.project_id = p.id
      ) AS member_count
    FROM projects p
    INNER JOIN project_members pm ON pm.project_id = p.id
    WHERE pm.user_id = $1 ${archived_filter}
    ORDER BY p.updated_at DESC
    LIMIT $2 OFFSET $3
  `;

  const [count_result, data_result] = await Promise.all([
    query(count_sql, [user_id]),
    query(data_sql, [user_id, limit, offset]),
  ]);

  return {
    projects: data_result.rows,
    total: count_result.rows[0]?.total || 0,
  };
};

export const update_project = async (project_id, updates, db_client = null) => {
  const executor = db_client || { query };
  const fields = [];
  const values = [];
  let param_index = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${param_index++}`);
    values.push(updates.name);
  }

  if (updates.key_prefix !== undefined) {
    fields.push(`key_prefix = $${param_index++}`);
    values.push(updates.key_prefix);
  }

  if (updates.description !== undefined) {
    fields.push(`description = $${param_index++}`);
    values.push(updates.description);
  }

  if (updates.is_archived !== undefined) {
    fields.push(`is_archived = $${param_index++}`);
    values.push(updates.is_archived);
  }

  if (fields.length === 0) {
    return find_project_by_id(project_id, db_client);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(project_id);

  const sql = `
    UPDATE projects
    SET ${fields.join(", ")}
    WHERE id = $${param_index}
    RETURNING ${PROJECT_FIELDS}
  `;

  const result = await executor.query(sql, values);
  return result.rows[0] || null;
};

export const delete_project = async (project_id, db_client = null) => {
  const executor = db_client || { query };
  const sql = `
    DELETE FROM projects
    WHERE id = $1
    RETURNING id
  `;
  const result = await executor.query(sql, [project_id]);
  return result.rows[0] || null;
};