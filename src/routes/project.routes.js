import express from "express";
import { authenticate_user } from "../middleware/auth.middleware.js";
import { validate_request } from "../middleware/validate.middleware.js";
import { authorize_project_role } from "../middleware/project_rbac.middleware.js";
import {
  create_project,
  get_my_projects,
  get_project_by_id,
  update_project,
  delete_project,
} from "../controllers/project.controller.js";
import { accept_invite } from "../controllers/project_member.controller.js";
import project_member_routes from "./project_member.routes.js";
import issue_routes from "./issue.routes.js";
import label_routes from "./label.routes.js";

const router = express.Router();

const KEY_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,9}$/;

const create_project_schema = {
  body: {
    name: { required: true, type: "string", trim: true, min: 2, max: 120 },
    key_prefix: {
      required: true,
      type: "string",
      trim: true,
      min: 2,
      max: 10,
      pattern: KEY_PREFIX_PATTERN,
      pattern_message:
        "key_prefix must be 2-10 alphanumeric characters and start with a letter.",
    },
    description: { required: false, type: "string", trim: true, max: 2000 },
  },
};

const list_projects_schema = {
  query: {
    include_archived: { required: false, type: "boolean" },
    page: { required: false, type: "number", min: 1 },
    limit: { required: false, type: "number", min: 1, max: 100 },
  },
};

const project_id_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
};

const update_project_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
  body: {
    name: { required: false, type: "string", trim: true, min: 2, max: 120 },
    key_prefix: {
      required: false,
      type: "string",
      trim: true,
      min: 2,
      max: 10,
      pattern: KEY_PREFIX_PATTERN,
      pattern_message:
        "key_prefix must be 2-10 alphanumeric characters and start with a letter.",
    },
    description: { required: false, type: "string", trim: true, max: 2000 },
    is_archived: { required: false, type: "boolean" },
  },
};

const accept_invite_schema = {
  params: {
    token: { required: true, type: "string", trim: true, min: 20, max: 128 },
  },
};

// All project routes require an authenticated user
router.use(authenticate_user);

// Registered before /:projectId to avoid route shadowing
router.post(
  "/invites/:token/accept",
  validate_request(accept_invite_schema),
  accept_invite
);

// Project CRUD
router.post("/", validate_request(create_project_schema), create_project);
router.get("/", validate_request(list_projects_schema), get_my_projects);

router.get(
  "/:projectId",
  validate_request(project_id_schema),
  authorize_project_role(),
  get_project_by_id
);

router.patch(
  "/:projectId",
  validate_request(update_project_schema),
  authorize_project_role("admin"),
  update_project
);

router.delete(
  "/:projectId",
  validate_request(project_id_schema),
  authorize_project_role("admin"),
  delete_project
);

// Nested project resources
router.use("/:projectId/issues", issue_routes);
router.use("/:projectId/labels", label_routes);
router.use("/:projectId", project_member_routes);

export default router;