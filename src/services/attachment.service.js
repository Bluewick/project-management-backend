import crypto from "node:crypto";
import path from "node:path";
import { env } from "../config/env.config.js";
import { with_transaction } from "../config/db.js";
import { ApiError } from "../utils/api_error.util.js";
import {
  generate_presigned_put_url,
  generate_presigned_get_url,
  head_s3_object,
  upload_buffer_to_s3,
  delete_s3_object,
} from "../config/s3.config.js";
import { find_issue_by_id } from "../models/issue.model.js";
import {
  create_attachment,
  find_attachment_by_id,
  mark_attachment_uploaded,
  list_issue_attachments,
  delete_attachment,
} from "../models/attachment.model.js";
import { log_issue_activity } from "./activity.service.js";

const sanitize_filename = (raw_name) => {
  const base = path.basename(raw_name).trim();
  const sanitized = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return sanitized.slice(0, 180) || "attachment";
};

const build_s3_key = (project_id, issue_id, attachment_id, file_name) => {
  const safe_name = sanitize_filename(file_name);
  return `projects/${project_id}/issues/${issue_id}/${attachment_id}-${safe_name}`;
};

const attach_signed_download_url = async (attachment) => {
  if (!attachment || attachment.status !== "uploaded") {
    return attachment;
  }
  const download_url = await generate_presigned_get_url(attachment.s3_key);
  return {
    ...attachment,
    download_url,
  };
};

export const request_presigned_upload = async (
  project,
  issue_id,
  user_id,
  { file_name, file_size, mime_type }
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot upload attachments to an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  if (file_size > env.max_attachment_size_bytes) {
    throw ApiError.bad_request(
      `Attachment size cannot exceed ${env.max_attachment_size_bytes} bytes.`,
      [],
      "FILE_TOO_LARGE"
    );
  }

  const issue = await find_issue_by_id(issue_id, project.id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const attachment_id = crypto.randomUUID();
  const s3_key = build_s3_key(project.id, issue_id, attachment_id, file_name);

  const upload_url = await generate_presigned_put_url({
    s3_key,
    mime_type,
    file_size,
  });

  const attachment = await create_attachment({
    id: attachment_id,
    issue_id,
    uploaded_by: user_id,
    file_name: sanitize_filename(file_name),
    file_size,
    mime_type,
    s3_key,
    status: "pending",
  });

  return {
    attachment,
    upload_url,
    expires_in_seconds: env.s3_presign_expires_seconds,
  };
};

export const confirm_presigned_upload = async (
  project,
  issue_id,
  attachment_id,
  user_id
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot confirm attachments in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const issue = await find_issue_by_id(issue_id, project.id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const existing = await find_attachment_by_id(attachment_id, issue_id);
  if (!existing) {
    throw ApiError.not_found("Attachment not found.", "ATTACHMENT_NOT_FOUND");
  }

  if (existing.uploaded_by && existing.uploaded_by !== user_id) {
    throw ApiError.forbidden(
      "Only the user who initiated this upload can confirm it.",
      "ATTACHMENT_CONFIRM_FORBIDDEN"
    );
  }

  if (existing.status === "uploaded") {
    return attach_signed_download_url(existing);
  }

  let s3_head;
  try {
    s3_head = await head_s3_object(existing.s3_key);
  } catch (error) {
    throw ApiError.bad_request(
      "File has not been uploaded to S3 yet.",
      [],
      "S3_OBJECT_NOT_FOUND"
    );
  }

  const verified_size = Number(s3_head.ContentLength || existing.file_size);
  if (verified_size <= 0 || verified_size > env.max_attachment_size_bytes) {
    throw ApiError.bad_request(
      "Uploaded S3 object has an invalid size.",
      [],
      "INVALID_S3_OBJECT_SIZE"
    );
  }

  const confirmed = await with_transaction(async (client) => {
    const updated = await mark_attachment_uploaded(
      attachment_id,
      issue_id,
      verified_size,
      client
    );

    if (!updated) {
      return find_attachment_by_id(attachment_id, issue_id, client);
    }

    await log_issue_activity(
      {
        issue_id,
        actor_id: user_id,
        action: "attachment_added",
        metadata: {
          attachment_id: updated.id,
          file_name: updated.file_name,
          mime_type: updated.mime_type,
          file_size: updated.file_size,
        },
      },
      client
    );

    return updated;
  });

  return attach_signed_download_url(confirmed);
};

export const direct_upload_issue_attachment = async (
  project,
  issue_id,
  user_id,
  file
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot upload attachments to an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const issue = await find_issue_by_id(issue_id, project.id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const attachment_id = crypto.randomUUID();
  const safe_name = sanitize_filename(file.originalname);
  const s3_key = build_s3_key(project.id, issue_id, attachment_id, safe_name);

  await upload_buffer_to_s3({
    s3_key,
    mime_type: file.mimetype,
    buffer: file.buffer,
  });

  try {
    const created = await with_transaction(async (client) => {
      const attachment = await create_attachment(
        {
          id: attachment_id,
          issue_id,
          uploaded_by: user_id,
          file_name: safe_name,
          file_size: file.size,
          mime_type: file.mimetype,
          s3_key,
          status: "uploaded",
        },
        client
      );

      await log_issue_activity(
        {
          issue_id,
          actor_id: user_id,
          action: "attachment_added",
          metadata: {
            attachment_id: attachment.id,
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            file_size: attachment.file_size,
          },
        },
        client
      );

      return attachment;
    });

    return attach_signed_download_url(created);
  } catch (error) {
    // Compensating cleanup if DB insert fails after S3 upload
    await delete_s3_object(s3_key).catch(() => {});
    throw error;
  }
};

export const get_issue_attachments = async (project_id, issue_id) => {
  const issue = await find_issue_by_id(issue_id, project_id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const attachments = await list_issue_attachments(issue_id);
  return Promise.all(attachments.map(attach_signed_download_url));
};

export const remove_issue_attachment = async (
  project,
  acting_member,
  issue_id,
  attachment_id
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot delete attachments from an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const issue = await find_issue_by_id(issue_id, project.id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const existing = await find_attachment_by_id(attachment_id, issue_id);
  if (!existing) {
    throw ApiError.not_found("Attachment not found.", "ATTACHMENT_NOT_FOUND");
  }

  const is_uploader = existing.uploaded_by === acting_member.user_id;
  const is_privileged = ["admin", "manager"].includes(acting_member.role);

  if (!is_uploader && !is_privileged) {
    throw ApiError.forbidden(
      "Only the uploader, a manager, or a project admin can delete this attachment.",
      "ATTACHMENT_DELETE_FORBIDDEN"
    );
  }

  await delete_s3_object(existing.s3_key);

  return with_transaction(async (client) => {
    const deleted = await delete_attachment(attachment_id, issue_id, client);

    if (deleted && existing.status === "uploaded") {
      await log_issue_activity(
        {
          issue_id,
          actor_id: acting_member.user_id,
          action: "attachment_removed",
          metadata: {
            attachment_id: existing.id,
            file_name: existing.file_name,
          },
        },
        client
      );
    }

    return deleted;
  });
};