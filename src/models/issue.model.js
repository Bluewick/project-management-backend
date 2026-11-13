import { query } from "../config/db.js";

const ISSUE_SELECT_WITH_RELATIONS = `
  SELECT
    i.id,
    i.project_id,
    i.issue_number,
    i.issue_key,
    i.title,
    i.description,
    i.reproduction_steps,
    i.type,
    i.status,
    i.priority,
    i.severity,
    i.story_points,
    i.due_date,
    i.position,
    i.reporter_id,
    i.assignee_id,
    i.created_at,
    i.updated_at,
    CASE WHEN rep.id IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'id', rep.id,
        'full_name', rep.full_name,
        'email', rep.email,
        'avatar_url', rep.avatar_url
      )
    ELSE NULL END AS reporter,
    CASE WHEN asg.id IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'id', asg.id,
        'full_name', asg.full_name,
        'email', asg.email,
        'avatar_url', asg.avatar_url
      )
    ELSE NULL END AS assignee,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', l.id,
          'name', l.name,
          'color_hex', l.color_hex
        )
        ORDER BY l.name ASC
      ) FILTER (WHERE l.id IS NOT NULL),
      '[]'::json
    ) AS labels
  FROM issues i
  LEFT JOIN users rep ON rep.id = i.reporter_id
  LEFT JOIN users asg ON asg.id = i.assignee_id
  LEFT JOIN issue_labels il ON il.issue_id = i.id
  LEFT JOIN labels l ON l.id = il.label_id
`;

const ISSUE_GROUP_BY = `
  GROUP BY
    i.id,
    rep.id, rep.full_name, rep.email, rep.avatar_url,
    asg.id, asg.full_name, asg.email, asg.avatar_url
`;

const escape_like_pattern = (value) => {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
};

const build_sort_clause = (sort_by, sort_order, search_param_idx) => {
  const direction = sort_order === "desc" ? "DESC" : "ASC";

  switch (sort_by) {
    case "created_at":
      return `ORDER BY i.created_at ${direction}, i.issue_number ${direction}`;
    case "updated_at":
      return `ORDER BY i.updated_at ${direction}, i.created_at DESC`;
    case "due_date":
      return `ORDER BY i.due_date ${direction} NULLS LAST, i.created_at DESC`;
    case "priority":
      return `
        ORDER BY
          CASE i.priority
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END ${direction},
          i.created_at DESC
      `;
    case "relevance":
      if (search_param_idx !== null) {
        return `
          ORDER BY
            ts_rank(i.search_vector, plainto_tsquery('english', $${search_param_idx})) DESC,
            i.updated_at DESC
        `;
      }
      return `ORDER BY i.updated_at DESC`;
    case "position":
    default:
      if (sort_by === undefined && search_param_idx !== null) {
        return `
          ORDER BY
            ts_rank(i.search_vector, plainto_tsquery('english', $${search_param_idx})) DESC,
            i.updated_at DESC
        `;
      }
      return `ORDER BY i.status ASC, i.position ${direction}, i.created_at ASC`;
  }
};

export const increment_project_issue_counter = async (project_id, db_client) => {
  const sql = `
    UPDATE projects
    SET issue_counter = issue_counter + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING issue_counter, key_prefix, is_archived
  `;
  const result = await db_client.query(sql, [project_id]);
  return result.rows[0] || null;
};

export const get_max_column_position = async (
  project_id,
  status,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    SELECT COALESCE(MAX(position), 0) AS max_position
    FROM issues
    WHERE project_id = $1 AND status = $2
  `;
  const result = await executor.query(sql, [project_id, status]);
  return Number(result.rows[0]?.max_position || 0);
};

export const create_issue = async (
  {
    project_id,
    issue_number,
    issue_key,
    title,
    description = null,
    reproduction_steps = null,
    type = "task",
    status = "todo",
    priority = "medium",
    severity = null,
    story_points = null,
    due_date = null,
    position,
    reporter_id,
    assignee_id = null,
  },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO issues (
      project_id,
      issue_number,
      issue_key,
      title,
      description,
      reproduction_steps,
      type,
      status,
      priority,
      severity,
      story_points,
      due_date,
      position,
      reporter_id,
      assignee_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id
  `;
  const result = await executor.query(sql, [
    project_id,
    issue_number,
    issue_key,
    title,
    description,
    reproduction_steps,
    type,
    status,
    priority,
    severity,
    story_points,
    due_date,
    position,
    reporter_id,
    assignee_id,
  ]);
  return result.rows[0];
};

export const replace_issue_labels = async (
  issue_id,
  label_ids,
  db_client
) => {
  await db_client.query(`DELETE FROM issue_labels WHERE issue_id = $1`, [
    issue_id,
  ]);

  if (!label_ids || label_ids.length === 0) {
    return;
  }

  const sql = `
    INSERT INTO issue_labels (issue_id, label_id)
    SELECT $1, UNNEST($2::uuid[])
    ON CONFLICT (issue_id, label_id) DO NOTHING
  `;
  await db_client.query(sql, [issue_id, label_ids]);
};

export const attach_label_to_issue = async (issue_id, label_id) => {
  const sql = `
    INSERT INTO issue_labels (issue_id, label_id)
    VALUES ($1, $2)
    ON CONFLICT (issue_id, label_id) DO NOTHING
  `;
  await query(sql, [issue_id, label_id]);
};

export const detach_label_from_issue = async (issue_id, label_id) => {
  const sql = `
    DELETE FROM issue_labels
    WHERE issue_id = $1 AND label_id = $2
    RETURNING issue_id
  `;
  const result = await query(sql, [issue_id, label_id]);
  return result.rows[0] || null;
};

export const find_issue_by_id = async (
  issue_id,
  project_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    ${ISSUE_SELECT_WITH_RELATIONS}
    WHERE i.id = $1 AND i.project_id = $2
    ${ISSUE_GROUP_BY}
    LIMIT 1
  `;
  const result = await executor.query(sql, [issue_id, project_id]);
  return result.rows[0] || null;
};

export const find_issue_by_key = async (
  issue_key,
  project_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    ${ISSUE_SELECT_WITH_RELATIONS}
    WHERE i.issue_key = $1 AND i.project_id = $2
    ${ISSUE_GROUP_BY}
    LIMIT 1
  `;
  const result = await executor.query(sql, [issue_key, project_id]);
  return result.rows[0] || null;
};

export const list_project_issues = async (
  project_id,
  {
    statuses = null,
    priorities = null,
    types = null,
    severities = null,
    assignee_id = null,
    unassigned_only = false,
    reporter_id = null,
    label_ids = null,
    label_match = "any",
    due_before = null,
    due_after = null,
    overdue = false,
    search_query = null,
    sort_by = undefined,
    sort_order = "asc",
    limit = 50,
    offset = 0,
  }
) => {
  const conditions = ["i.project_id = $1"];
  const params = [project_id];
  let idx = 2;
  let search_param_idx = null;

  if (statuses && statuses.length > 0) {
    conditions.push(`i.status = ANY($${idx++}::varchar[])`);
    params.push(statuses);
  }

  if (priorities && priorities.length > 0) {
    conditions.push(`i.priority = ANY($${idx++}::varchar[])`);
    params.push(priorities);
  }

  if (types && types.length > 0) {
    conditions.push(`i.type = ANY($${idx++}::varchar[])`);
    params.push(types);
  }

  if (severities && severities.length > 0) {
    conditions.push(`i.severity = ANY($${idx++}::varchar[])`);
    params.push(severities);
  }

  if (unassigned_only) {
    conditions.push(`i.assignee_id IS NULL`);
  } else if (assignee_id) {
    conditions.push(`i.assignee_id = $${idx++}`);
    params.push(assignee_id);
  }

  if (reporter_id) {
    conditions.push(`i.reporter_id = $${idx++}`);
    params.push(reporter_id);
  }

  if (label_ids && label_ids.length > 0) {
    const label_param = idx++;
    params.push(label_ids);

    if (label_match === "all") {
      const count_param = idx++;
      params.push(label_ids.length);
      conditions.push(`
        (
          SELECT COUNT(DISTINCT il2.label_id)
          FROM issue_labels il2
          WHERE il2.issue_id = i.id AND il2.label_id = ANY($${label_param}::uuid[])
        ) = $${count_param}
      `);
    } else {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM issue_labels il2
          WHERE il2.issue_id = i.id AND il2.label_id = ANY($${label_param}::uuid[])
        )
      `);
    }
  }

  if (due_after) {
    conditions.push(`i.due_date >= $${idx++}`);
    params.push(due_after);
  }

  if (due_before) {
    conditions.push(`i.due_date <= $${idx++}`);
    params.push(due_before);
  }

  if (overdue) {
    conditions.push(
      `i.due_date IS NOT NULL AND i.due_date < CURRENT_TIMESTAMP AND i.status <> 'done'`
    );
  }

  if (search_query) {
    search_param_idx = idx++;
    const like_param_idx = idx++;
    params.push(search_query);
    params.push(`%${escape_like_pattern(search_query)}%`);

    conditions.push(`
      (
        i.search_vector @@ plainto_tsquery('english', $${search_param_idx})
        OR i.issue_key ILIKE $${like_param_idx} ESCAPE '\\'
        OR i.title ILIKE $${like_param_idx} ESCAPE '\\'
      )
    `);
  }

  const where_clause = `WHERE ${conditions.join(" AND ")}`;
  const order_clause = build_sort_clause(sort_by, sort_order, search_param_idx);

  const count_sql = `
    SELECT COUNT(*)::INTEGER AS total
    FROM issues i
    ${where_clause}
  `;

  const limit_param_idx = idx++;
  const offset_param_idx = idx++;

  const data_sql = `
    ${ISSUE_SELECT_WITH_RELATIONS}
    ${where_clause}
    ${ISSUE_GROUP_BY}
    ${order_clause}
    LIMIT $${limit_param_idx} OFFSET $${offset_param_idx}
  `;

  const [count_result, data_result] = await Promise.all([
    query(count_sql, params),
    query(data_sql, [...params, limit, offset]),
  ]);

  return {
    issues: data_result.rows,
    total: count_result.rows[0]?.total || 0,
  };
};

export const update_issue = async (
  issue_id,
  project_id,
  updates,
  db_client = null
) => {
  const executor = db_client || { query };
  const fields = [];
  const values = [];
  let param_index = 1;

  const allowed_columns = [
    "title",
    "description",
    "reproduction_steps",
    "type",
    "status",
    "priority",
    "severity",
    "story_points",
    "due_date",
    "position",
    "assignee_id",
  ];

  for (const column of allowed_columns) {
    if (updates[column] !== undefined) {
      fields.push(`${column} = $${param_index++}`);
      values.push(updates[column]);
    }
  }

  if (fields.length === 0) {
    return find_issue_by_id(issue_id, project_id, db_client);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(issue_id, project_id);

  const sql = `
    UPDATE issues
    SET ${fields.join(", ")}
    WHERE id = $${param_index++} AND project_id = $${param_index}
    RETURNING id
  `;
  const result = await executor.query(sql, values);
  if (!result.rows[0]) {
    return null;
  }

  return find_issue_by_id(issue_id, project_id, db_client);
};

export const rebalance_column_positions = async (
  project_id,
  status,
  db_client
) => {
  const sql = `
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY position ASC, created_at ASC) AS rn
      FROM issues
      WHERE project_id = $1 AND status = $2
    )
    UPDATE issues i
    SET position = ranked.rn * 1024.0,
        updated_at = CURRENT_TIMESTAMP
    FROM ranked
    WHERE i.id = ranked.id
  `;
  await db_client.query(sql, [project_id, status]);
};

export const list_column_issue_positions = async (
  project_id,
  status,
  exclude_issue_id,
  db_client
) => {
  const sql = `
    SELECT id, position
    FROM issues
    WHERE project_id = $1
      AND status = $2
      AND id <> $3
    ORDER BY position ASC, created_at ASC
  `;
  const result = await db_client.query(sql, [
    project_id,
    status,
    exclude_issue_id,
  ]);
  return result.rows;
};

export const delete_issue = async (issue_id, project_id, db_client = null) => {
  const executor = db_client || { query };
  const sql = `
    DELETE FROM issues
    WHERE id = $1 AND project_id = $2
    RETURNING id, issue_key
  `;
  const result = await executor.query(sql, [issue_id, project_id]);
  return result.rows[0] || null;
};