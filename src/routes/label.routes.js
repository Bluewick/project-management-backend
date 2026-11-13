import express from "express";
import { validate_request } from "../middleware/validate.middleware.js";
import { authorize_project_role } from "../middleware/project_rbac.middleware.js";
import {
  create_label,
  list_labels,
  update_label,
  delete_label,
} from "../controllers/label.controller.js";

const router = express.Router({ mergeParams: true });

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const project_param_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
};

const create_label_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
  body: {
    name: { required: true, type: "string", trim: true, min: 1, max: 50 },
    color_hex: {
      required: false,
      type: "string",
      trim: true,
      pattern: HEX_COLOR_PATTERN,
      pattern_message: "color_hex must be a valid 6-digit hex color (e.g. #6366F1).",
    },
  },
};

const update_label_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    labelId: { required: true, type: "uuid" },
  },
  body: {
    name: { required: false, type: "string", trim: true, min: 1, max: 50 },
    color_hex: {
      required: false,
      type: "string",
      trim: true,
      pattern: HEX_COLOR_PATTERN,
      pattern_message: "color_hex must be a valid 6-digit hex color (e.g. #6366F1).",
    },
  },
};

const label_id_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    labelId: { required: true, type: "uuid" },
  },
};

router.get(
  "/",
  validate_request(project_param_schema),
  authorize_project_role(),
  list_labels
);

router.post(
  "/",
  validate_request(create_label_schema),
  authorize_project_role("admin", "manager", "developer"),
  create_label
);

router.patch(
  "/:labelId",
  validate_request(update_label_schema),
  authorize_project_role("admin", "manager", "developer"),
  update_label
);

router.delete(
  "/:labelId",
  validate_request(label_id_schema),
  authorize_project_role("admin", "manager"),
  delete_label
);

export default router;