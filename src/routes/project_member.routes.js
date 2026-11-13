import express from "express";
import { validate_request } from "../middleware/validate.middleware.js";
import {
  authorize_project_role,
  PROJECT_ROLES,
} from "../middleware/project_rbac.middleware.js";
import {
  invite_member,
  list_invites,
  cancel_invite,
  list_members,
  update_member_role,
  remove_member,
} from "../controllers/project_member.controller.js";

const router = express.Router({ mergeParams: true });

const project_param_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
};

const create_invite_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
  },
  body: {
    email: { required: false, type: "email", trim: true, max: 255 },
    role: { required: true, type: "string", enum: PROJECT_ROLES },
  },
};

const cancel_invite_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    inviteId: { required: true, type: "uuid" },
  },
};

const update_member_role_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    userId: { required: true, type: "uuid" },
  },
  body: {
    role: { required: true, type: "string", enum: PROJECT_ROLES },
  },
};

const remove_member_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    userId: { required: true, type: "uuid" },
  },
};

// Invites management (Admin only)
router.post(
  "/invites",
  validate_request(create_invite_schema),
  authorize_project_role("admin"),
  invite_member
);

router.get(
  "/invites",
  validate_request(project_param_schema),
  authorize_project_role("admin"),
  list_invites
);

router.delete(
  "/invites/:inviteId",
  validate_request(cancel_invite_schema),
  authorize_project_role("admin"),
  cancel_invite
);

// Team members management
router.get(
  "/members",
  validate_request(project_param_schema),
  authorize_project_role(),
  list_members
);

router.patch(
  "/members/:userId",
  validate_request(update_member_role_schema),
  authorize_project_role("admin"),
  update_member_role
);

router.delete(
  "/members/:userId",
  validate_request(remove_member_schema),
  authorize_project_role(),
  remove_member
);

export default router;