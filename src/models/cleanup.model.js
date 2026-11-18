import { query } from "../config/db.js";

export const delete_expired_refresh_tokens = async () => {
  const sql = `
    DELETE FROM refresh_tokens
    WHERE expires_at < CURRENT_TIMESTAMP
       OR (revoked_at IS NOT NULL AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '7 days')
  `;
  const result = await query(sql);
  return result.rowCount || 0;
};

export const delete_expired_project_invites = async () => {
  const sql = `
    DELETE FROM project_invites
    WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
       OR (accepted_at IS NOT NULL AND accepted_at < CURRENT_TIMESTAMP - INTERVAL '30 days')
  `;
  const result = await query(sql);
  return result.rowCount || 0;
};

export const find_stale_pending_attachments = async (
  older_than_hours = 24,
  batch_size = 100
) => {
  const sql = `
    SELECT id, s3_key
    FROM issue_attachments
    WHERE status = 'pending'
      AND created_at < CURRENT_TIMESTAMP - ($1::text || ' hours')::INTERVAL
    ORDER BY created_at ASC
    LIMIT $2
  `;
  const result = await query(sql, [String(older_than_hours), batch_size]);
  return result.rows;
};

export const delete_attachments_by_ids = async (attachment_ids) => {
  if (!attachment_ids || attachment_ids.length === 0) {
    return 0;
  }
  const sql = `
    DELETE FROM issue_attachments
    WHERE id = ANY($1::uuid[])
  `;
  const result = await query(sql, [attachment_ids]);
  return result.rowCount || 0;
};