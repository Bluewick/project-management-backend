import { query } from "../config/db.js";

const ATTACHMENT_SELECT_WITH_UPLOADER = `
  SELECT
    a.id,
    a.issue_id,
    a.uploaded_by,
    a.file_name,
    a.file_size,
    a.mime_type,
    a.s3_key,
    a.file_url,
    a.status,
    a.created_at,
    a.updated_at,
    CASE WHEN u.id IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'id', u.id,
        'full_name', u.full_name,
        'email', u.email,
        'avatar_url', u.avatar_url
      )
    ELSE NULL END AS uploader
  FROM issue_attachments a
  LEFT JOIN users u ON u.id = a.uploaded_by
`;

export const create_attachment = async (
  {
    id = undefined,
    issue_id,
    uploaded_by,
    file_name,
    file_size,
    mime_type,
    s3_key,
    file_url = null,
    status = "pending",
  },
  db_client = null
) => {
  const executor = db_client || { query };

  if (id) {
    const sql = `
      INSERT INTO issue_attachments (
        id,
        issue_id,
        uploaded_by,
        file_name,
        file_size,
        mime_type,
        s3_key,
        file_url,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;
    const result = await executor.query(sql, [
      id,
      issue_id,
      uploaded_by,
      file_name,
      file_size,
      mime_type,
      s3_key,
      file_url,
      status,
    ]);
    return find_attachment_by_id(result.rows[0].id, issue_id, db_client);
  }

  const sql = `
    INSERT INTO issue_attachments (
      issue_id,
      uploaded_by,
      file_name,
      file_size,
      mime_type,
      s3_key,
      file_url,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `;
  const result = await executor.query(sql, [
    issue_id,
    uploaded_by,
    file_name,
    file_size,
    mime_type,
    s3_key,
    file_url,
    status,
  ]);
  return find_attachment_by_id(result.rows[0].id, issue_id, db_client);
};

export const find_attachment_by_id = async (
  attachment_id,
  issue_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    ${ATTACHMENT_SELECT_WITH_UPLOADER}
    WHERE a.id = $1 AND a.issue_id = $2
    LIMIT 1
  `;
  const result = await executor.query(sql, [attachment_id, issue_id]);
  return result.rows[0] || null;
};

export const mark_attachment_uploaded = async (
  attachment_id,
  issue_id,
  file_size,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    UPDATE issue_attachments
    SET status = 'uploaded',
        file_size = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND issue_id = $3 AND status = 'pending'
    RETURNING id
  `;
  const result = await executor.query(sql, [
    file_size,
    attachment_id,
    issue_id,
  ]);
  if (!result.rows[0]) {
    return null;
  }
  return find_attachment_by_id(attachment_id, issue_id, db_client);
};

export const list_issue_attachments = async (issue_id) => {
  const sql = `
    ${ATTACHMENT_SELECT_WITH_UPLOADER}
    WHERE a.issue_id = $1 AND a.status = 'uploaded'
    ORDER BY a.created_at DESC
  `;
  const result = await query(sql, [issue_id]);
  return result.rows;
};

export const delete_attachment = async (
  attachment_id,
  issue_id,
  db_client = null
) => {
  const executor = db_client || { query };
  const sql = `
    DELETE FROM issue_attachments
    WHERE id = $1 AND issue_id = $2
    RETURNING id, s3_key, file_name
  `;
  const result = await executor.query(sql, [attachment_id, issue_id]);
  return result.rows[0] || null;
};