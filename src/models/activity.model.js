import { query } from "../config/db.js";

export const create_activity = async (
  { issue_id, actor_id = null, action, metadata = {} },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO issue_activities (issue_id, actor_id, action, metadata)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING id, issue_id, actor_id, action, metadata, created_at
  `;
  const result = await executor.query(sql, [
    issue_id,
    actor_id,
    action,
    JSON.stringify(metadata),
  ]);
  return result.rows[0];
};

export const create_activities_bulk = async (activities, db_client = null) => {
  if (!activities || activities.length === 0) {
    return [];
  }

  const executor = db_client || { query };
  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const item of activities) {
    placeholders.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}::jsonb)`
    );
    values.push(
      item.issue_id,
      item.actor_id || null,
      item.action,
      JSON.stringify(item.metadata || {})
    );
  }

  const sql = `
    INSERT INTO issue_activities (issue_id, actor_id, action, metadata)
    VALUES ${placeholders.join(", ")}
    RETURNING id, issue_id, actor_id, action, metadata, created_at
  `;
  const result = await executor.query(sql, values);
  return result.rows;
};

export const list_issue_activities = async (
  issue_id,
  { sort_order = "desc", limit = 50, offset = 0 }
) => {
  const direction = sort_order === "asc" ? "ASC" : "DESC";

  const count_sql = `
    SELECT COUNT(*)::INTEGER AS total
    FROM issue_activities
    WHERE issue_id = $1
  `;

  const data_sql = `
    SELECT
      a.id,
      a.issue_id,
      a.actor_id,
      a.action,
      a.metadata,
      a.created_at,
      CASE WHEN u.id IS NOT NULL THEN
        JSON_BUILD_OBJECT(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'avatar_url', u.avatar_url
        )
      ELSE NULL END AS actor
    FROM issue_activities a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.issue_id = $1
    ORDER BY a.created_at ${direction}
    LIMIT $2 OFFSET $3
  `;

  const [count_result, data_result] = await Promise.all([
    query(count_sql, [issue_id]),
    query(data_sql, [issue_id, limit, offset]),
  ]);

  return {
    activities: data_result.rows,
    total: count_result.rows[0]?.total || 0,
  };
};