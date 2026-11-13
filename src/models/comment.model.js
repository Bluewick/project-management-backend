import { query } from "../config/db.js";

const COMMENT_SELECT_WITH_AUTHOR = `
  SELECT
    c.id,
    c.issue_id,
    c.author_id,
    c.parent_comment_id,
    c.body,
    c.mentions,
    c.is_edited,
    c.created_at,
    c.updated_at,
    CASE WHEN u.id IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'id', u.id,
        'full_name', u.full_name,
        'email', u.email,
        'avatar_url', u.avatar_url
      )
    ELSE NULL END AS author,
    (
      SELECT COUNT(*)::INTEGER
      FROM issue_comments replies
      WHERE replies.parent_comment_id = c.id
    ) AS reply_count
  FROM issue_comments c
  LEFT JOIN users u ON u.id = c.author_id
`;

export const find_mentioned_project_members = async (
  project_id,
  user_ids = [],
  emails = [],
  db_client = null
) => {
  if (user_ids.length === 0 && emails.length === 0) {
    return [];
  }

  const executor = db_client || { query };
  const sql = `
    SELECT DISTINCT
      u.id,
      u.full_name,
      u.email
    FROM project_members pm
    INNER JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = $1
      AND u.is_active = true
      AND (
        (CARDINALITY($2::uuid[]) > 0 AND u.id = ANY($2::uuid[]))
        OR (CARDINALITY($3::text[]) > 0 AND LOWER(u.email) = ANY($3::text[]))
      )
  `;
  const result = await executor.query(sql, [project_id, user_ids, emails]);
  return result.rows;
};

export const create_comment = async (
  { issue_id, author_id, parent_comment_id = null, body, mentions = [] },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    INSERT INTO issue_comments (
      issue_id,
      author_id,
      parent_comment_id,
      body,
      mentions
    )
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING id
  `;
  const result = await executor.query(sql, [
    issue_id,
    author_id,
    parent_comment_id,
    body,
    JSON.stringify(mentions),
  ]);

  return find_comment_by_id(result.rows[0].id, issue_id, db_client);
};

export const find_comment_by_id = async (
  comment_id,
  issue_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    ${COMMENT_SELECT_WITH_AUTHOR}
    WHERE c.id = $1 AND c.issue_id = $2
    LIMIT 1
  `;
  const result = await executor.query(sql, [comment_id, issue_id]);
  return result.rows[0] || null;
};

export const list_issue_comments = async (
  issue_id,
  { parent_comment_id = undefined, limit = 50, offset = 0 }
) => {
  const conditions = ["c.issue_id = $1"];
  const params = [issue_id];
  let idx = 2;

  if (parent_comment_id === null) {
    conditions.push("c.parent_comment_id IS NULL");
  } else if (parent_comment_id !== undefined) {
    conditions.push(`c.parent_comment_id = $${idx++}`);
    params.push(parent_comment_id);
  }

  const where_clause = `WHERE ${conditions.join(" AND ")}`;

  const count_sql = `
    SELECT COUNT(*)::INTEGER AS total
    FROM issue_comments c
    ${where_clause}
  `;

  const data_sql = `
    ${COMMENT_SELECT_WITH_AUTHOR}
    ${where_clause}
    ORDER BY c.created_at ASC
    LIMIT $${idx++} OFFSET $${idx}
  `;

  const [count_result, data_result] = await Promise.all([
    query(count_sql, params),
    query(data_sql, [...params, limit, offset]),
  ]);

  return {
    comments: data_result.rows,
    total: count_result.rows[0]?.total || 0,
  };
};

export const update_comment = async (
  comment_id,
  issue_id,
  { body, mentions = [] },
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE issue_comments
    SET body = $1,
        mentions = $2::jsonb,
        is_edited = true,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3 AND issue_id = $4
    RETURNING id
  `;
  const result = await executor.query(sql, [
    body,
    JSON.stringify(mentions),
    comment_id,
    issue_id,
  ]);
  if (!result.rows[0]) {
    return null;
  }

  return find_comment_by_id(comment_id, issue_id, db_client);
};

export const delete_comment = async (
  comment_id,
  issue_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    DELETE FROM issue_comments
    WHERE id = $1 AND issue_id = $2
    RETURNING id
  `;
  const result = await executor.query(sql, [comment_id, issue_id]);
  return result.rows[0] || null;
};