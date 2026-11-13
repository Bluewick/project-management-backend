import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  request_presigned_upload,
  confirm_presigned_upload,
  direct_upload_issue_attachment,
  get_issue_attachments,
  remove_issue_attachment,
} from "../services/attachment.service.js";

export const presign_upload = async_handler(async (req, res) => {
  const { file_name, file_size, mime_type } = req.body;
  const result = await request_presigned_upload(
    req.project,
    req.params.issueId,
    req.user.id,
    { file_name, file_size, mime_type }
  );

  return send_success(
    res,
    201,
    "Presigned upload URL generated successfully.",
    result
  );
});

export const confirm_upload = async_handler(async (req, res) => {
  const attachment = await confirm_presigned_upload(
    req.project,
    req.params.issueId,
    req.params.attachmentId,
    req.user.id
  );

  return send_success(
    res,
    200,
    "Attachment upload confirmed successfully.",
    attachment
  );
});

export const direct_upload = async_handler(async (req, res) => {
  const attachment = await direct_upload_issue_attachment(
    req.project,
    req.params.issueId,
    req.user.id,
    req.file
  );

  return send_success(
    res,
    201,
    "Attachment uploaded successfully.",
    attachment
  );
});

export const list_attachments = async_handler(async (req, res) => {
  const attachments = await get_issue_attachments(
    req.params.projectId,
    req.params.issueId
  );

  return send_success(
    res,
    200,
    "Attachments fetched successfully.",
    attachments
  );
});

export const delete_attachment = async_handler(async (req, res) => {
  await remove_issue_attachment(
    req.project,
    req.project_member,
    req.params.issueId,
    req.params.attachmentId
  );

  return send_success(res, 200, "Attachment deleted successfully.", null);
});