import { query } from "../config/db.js";

export const create_label = async (
  { project_id, name, color_hex },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO labels (project_id, name, color_hex)
    VALUES ($1, $2, $3)
    RETURNING id, project_id, name, color_hex, created_at, updated_at
  `;
  const result = await executor.query(sql, [project_id, name, color_hex]);
  return result.rows[0];
};

export const list_project_labels = async (project_id) => {
  const sql = `
    SELECT id, project_id, name, color_hex, created_at, updated_at
    FROM labels
    WHERE project_id = $1
    ORDER BY name ASC
  `;
  const result = await query(sql, [project_id]);
  return result.rows;
};

export const find_label_by_id = async (
  label_id,
  project_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    SELECT id, project_id, name, color_hex, created_at, updated_at
    FROM labels
    WHERE id = $1 AND project_id = $2
    LIMIT 1
  `;
  const result = await executor.query(sql, [label_id, project_id]);
  return result.rows[0] || null;
};

export const find_labels_by_ids = async (
  project_id,
  label_ids,
  db_client = null
) => {
  if (!label_ids || label_ids.length === 0) {
    return [];
  }
  const executor = db_client || { query };
  const sql = `
    SELECT id, project_id, name, color_hex
    FROM labels
    WHERE project_id = $1 AND id = ANY($2::uuid[])
  `;
  const result = await executor.query(sql, [project_id, label_ids]);
  return result.rows;
};

export const update_label = async (label_id, project_id, updates) => {
  const fields = [];
  const values = [];
  let param_index = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${param_index++}`);
    values.push(updates.name);
  }

  if (updates.color_hex !== undefined) {
    fields.push(`color_hex = $${param_index++}`);
    values.push(updates.color_hex);
  }

  if (fields.length === 0) {
    return find_label_by_id(label_id, project_id);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(label_id, project_id);

  const sql = `
    UPDATE labels
    SET ${fields.join(", ")}
    WHERE id = $${param_index++} AND project_id = $${param_index}
    RETURNING id, project_id, name, color_hex, created_at, updated_at
  `;
  const result = await query(sql, values);
  return result.rows[0] || null;
};

export const delete_label = async (label_id, project_id) => {
  const sql = `
    DELETE FROM labels
    WHERE id = $1 AND project_id = $2
    RETURNING id
  `;
  const result = await query(sql, [label_id, project_id]);
  return result.rows[0] || null;
};