import express from "express";
import { validate_request } from "../middleware/validate.middleware.js";
import { authorize_project_role } from "../middleware/project_rbac.middleware.js";
import {
  ISSUE_TYPES,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_SEVERITIES,
  ISSUE_SORT_FIELDS,
  SORT_ORDERS,
  LABEL_MATCH_MODES,
} from "../services/issue.service.js";
import {
  create_issue,
  list_issues,
  get_issue,
  get_issue_by_key,
  update_issue,
  move_issue,
  delete_issue,
  attach_label,
  detach_label,
} from "../controllers/issue.controller.js";
import comment_routes from "./comment.routes.js";
import activity_routes from "./activity.routes.js";
import attachment_routes from "./attachment.routes.js";

const router = express.Router({ mergeParams: true });

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISSUE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/;

const validate_uuid_array = (items) => {
  if (!Array.isArray(items)) return null;
  if (items.length > 20) return "Cannot attach more than 20 labels at once.";
  for (const id of items) {
    if (typeof id !== "string" || !UUID_REGEX.test(id)) {
      return "All label_ids must be valid UUIDs.";
    }
  }
  return null;
};

const validate_iso_date = (value) => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return "Must be a valid ISO 8601 date string.";
  }
  return null;
};

const validate_csv_enum = (allowed_values, field_name) => {
  return (value) => {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      return `${field_name} cannot be empty.`;
    }
    for (const item of items) {
      if (!allowed_values.includes(item)) {
        return `${field_name} values must be among: ${allowed_values.join(", ")}.`;
      }
    }
    return null;
  };
};

const validate_user_filter = (field_name, allow_unassigned) => {
  return (value) => {
    if (value === "me") return null;
    if (allow_unassigned && value === "unassigned") return null;
    if (UUID_REGEX.test(value)) return null;
    return allow_unassigned
      ? `${field_name} must be a valid UUID, 'me', or 'unassigned'.`
      : `${field_name} must be a valid UUID or 'me'.`;
  };
};

const validate_csv_uuids = (value) => {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    return "label_ids cannot be empty.";
  }
  if (items.length > 20) {
    return "Cannot filter by more than 20 labels at once.";
  }
  for (const id of items) {
    if (!UUID_REGEX.test(id)) {
      return "All label_ids must be valid UUIDs.";
    }
  }
  return null;
};

const list_issues_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
  query: {
    status: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_csv_enum(ISSUE_STATUSES, "status"),
    },
    priority: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_csv_enum(ISSUE_PRIORITIES, "priority"),
    },
    type: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_csv_enum(ISSUE_TYPES, "type"),
    },
    severity: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_csv_enum(ISSUE_SEVERITIES, "severity"),
    },
    assignee_id: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_user_filter("assignee_id", true),
    },
    reporter_id: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_user_filter("reporter_id", false),
    },
    label_ids: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_csv_uuids,
    },
    label_match: {
      required: false,
      type: "string",
      enum: LABEL_MATCH_MODES,
    },
    due_before: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_iso_date,
    },
    due_after: {
      required: false,
      type: "string",
      trim: true,
      custom: validate_iso_date,
    },
    overdue: { required: false, type: "boolean" },
    q: { required: false, type: "string", trim: true, min: 1, max: 200 },
    sort_by: { required: false, type: "string", enum: ISSUE_SORT_FIELDS },
    sort_order: { required: false, type: "string", enum: SORT_ORDERS },
    page: { required: false, type: "number", min: 1 },
    limit: { required: false, type: "number", min: 1, max: 200 },
  },
};

const create_issue_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
  body: {
    title: { required: true, type: "string", trim: true, min: 2, max: 255 },
    description: { required: false, type: "string", trim: true, max: 20000 },
    reproduction_steps: {
      required: false,
      type: "string",
      trim: true,
      max: 10000,
    },
    type: { required: false, type: "string", enum: ISSUE_TYPES },
    status: { required: false, type: "string", enum: ISSUE_STATUSES },
    priority: { required: false, type: "string", enum: ISSUE_PRIORITIES },
    severity: { required: false, type: "string", enum: ISSUE_SEVERITIES },
    story_points: { required: false, type: "number", min: 0, max: 100 },
    due_date: {
      required: false,
      type: "string",
      custom: validate_iso_date,
    },
    assignee_id: { required: false, type: "uuid" },
    label_ids: {
      required: false,
      type: "array",
      custom: validate_uuid_array,
    },
  },
};

const issue_id_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
};

const issue_key_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueKey: {
      required: true,
      type: "string",
      trim: true,
      pattern: ISSUE_KEY_PATTERN,
      pattern_message: "issueKey must follow the format PREFIX-123.",
    },
  },
};

const update_issue_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
  body: {
    title: { required: false, type: "string", trim: true, min: 2, max: 255 },
    description: { required: false, type: "string", trim: true, max: 20000 },
    reproduction_steps: {
      required: false,
      type: "string",
      trim: true,
      max: 10000,
    },
    type: { required: false, type: "string", enum: ISSUE_TYPES },
    status: { required: false, type: "string", enum: ISSUE_STATUSES },
    priority: { required: false, type: "string", enum: ISSUE_PRIORITIES },
    severity: { required: false, type: "string", enum: ISSUE_SEVERITIES },
    story_points: { required: false, type: "number", min: 0, max: 100 },
    due_date: {
      required: false,
      type: "string",
      custom: validate_iso_date,
    },
    assignee_id: { required: false, type: "uuid" },
    label_ids: {
      required: false,
      type: "array",
      custom: validate_uuid_array,
    },
  },
};

const move_issue_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
  body: {
    status: { required: true, type: "string", enum: ISSUE_STATUSES },
    prev_position: { required: false, type: "number" },
    next_position: { required: false, type: "number" },
  },
};

const issue_label_param_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
    labelId: { required: true, type: "uuid" },
  },
};

router.get(
  "/",
  validate_request(list_issues_schema),
  authorize_project_role(),
  list_issues
);

router.post(
  "/",
  validate_request(create_issue_schema),
  authorize_project_role("admin", "manager", "developer"),
  create_issue
);

// Registered before /:issueId to avoid route shadowing
router.get(
  "/key/:issueKey",
  validate_request(issue_key_schema),
  authorize_project_role(),
  get_issue_by_key
);

router.get(
  "/:issueId",
  validate_request(issue_id_schema),
  authorize_project_role(),
  get_issue
);

router.patch(
  "/:issueId",
  validate_request(update_issue_schema),
  authorize_project_role("admin", "manager", "developer"),
  update_issue
);

router.patch(
  "/:issueId/move",
  validate_request(move_issue_schema),
  authorize_project_role("admin", "manager", "developer"),
  move_issue
);

router.delete(
  "/:issueId",
  validate_request(issue_id_schema),
  authorize_project_role("admin", "manager", "developer"),
  delete_issue
);

router.post(
  "/:issueId/labels/:labelId",
  validate_request(issue_label_param_schema),
  authorize_project_role("admin", "manager", "developer"),
  attach_label
);

router.delete(
  "/:issueId/labels/:labelId",
  validate_request(issue_label_param_schema),
  authorize_project_role("admin", "manager", "developer"),
  detach_label
);

// Nested issue comments, activity logs & attachments
router.use("/:issueId/comments", comment_routes);
router.use("/:issueId/activity", activity_routes);
router.use("/:issueId/attachments", attachment_routes);

export default router;