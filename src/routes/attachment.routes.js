import express from "express";
import { env } from "../config/env.config.js";
import { validate_request } from "../middleware/validate.middleware.js";
import { authorize_project_role } from "../middleware/project_rbac.middleware.js";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  handle_single_file_upload,
} from "../middleware/upload.middleware.js";
import {
  presign_upload,
  confirm_upload,
  direct_upload,
  list_attachments,
  delete_attachment,
} from "../controllers/attachment.controller.js";

const router = express.Router({ mergeParams: true });

const issue_param_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
};

const presign_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
  body: {
    file_name: { required: true, type: "string", trim: true, min: 1, max: 255 },
    file_size: {
      required: true,
      type: "number",
      min: 1,
      max: env.max_attachment_size_bytes,
    },
    mime_type: {
      required: true,
      type: "string",
      trim: true,
      enum: ALLOWED_ATTACHMENT_MIME_TYPES,
    },
  },
};

const attachment_id_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
    attachmentId: { required: true, type: "uuid" },
  },
};

router.get(
  "/",
  validate_request(issue_param_schema),
  authorize_project_role(),
  list_attachments
);

router.post(
  "/presign",
  validate_request(presign_schema),
  authorize_project_role("admin", "manager", "developer"),
  presign_upload
);

router.post(
  "/:attachmentId/confirm",
  validate_request(attachment_id_schema),
  authorize_project_role("admin", "manager", "developer"),
  confirm_upload
);

// Optional server-proxied fallback using Multer memory storage
router.post(
  "/upload",
  validate_request(issue_param_schema),
  authorize_project_role("admin", "manager", "developer"),
  handle_single_file_upload,
  direct_upload
);

router.delete(
  "/:attachmentId",
  validate_request(attachment_id_schema),
  authorize_project_role("admin", "manager", "developer"),
  delete_attachment
);

export default router;